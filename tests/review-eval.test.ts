import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  choiceToOutcome,
  renderReport,
  reviewEvaluation,
  summarizeLabels,
  type BlindRow,
  type Label,
} from "../skills/evaluate-ghostwriter/scripts/review-eval.ts";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(TEST_DIR, "fixtures/evaluation");
const REFERENCES = join(FIXTURE_DIR, "references.jsonl");
const CHOICES = join(FIXTURE_DIR, "choices.jsonl");

const BLIND_ROWS: BlindRow[] = [
  {
    id: "slack-001",
    platform: "slack",
    context: "direct-message",
    scenario: "Ask a collaborator to move a planning call",
    facts: ["The current call is Thursday", "Friday afternoon is available"],
    constraints: ["Ask rather than assume"],
    candidateA: "Candidate A one",
    candidateB: "Candidate B one",
  },
  {
    id: "email-001",
    platform: "email",
    context: "project-update",
    scenario: "Confirm that revised drawings are ready",
    facts: ["The revised drawings are attached", "Comments are due Monday"],
    constraints: ["End with a clear next step"],
    candidateA: "Candidate A two",
    candidateB: "Candidate B two",
  },
];

async function createRun(root: string): Promise<string> {
  const runDir = join(root, "run");
  await mkdir(runDir);
  const manifest = {
    schemaVersion: 1,
    runId: "review-test",
    status: "generated",
    config: { seed: "review-seed-0" },
    blindMapping: {
      "slack-001": { a: "treatment", b: "baseline" },
      "email-001": { a: "treatment", b: "baseline" },
    },
    artifacts: { candidates: "candidates.jsonl", blindReview: "blind-review.jsonl" },
  };
  await writeFile(join(runDir, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await writeFile(join(runDir, "blind-review.jsonl"), `${BLIND_ROWS.map((row) => JSON.stringify(row)).join("\n")}\n`);
  return runDir;
}

async function readJsonl<T>(path: string): Promise<T[]> {
  const source = await readFile(path, "utf8");
  return source.trim().split("\n").map((line) => JSON.parse(line) as T);
}

test("maps blind choices only after review", () => {
  const mapping = { a: "treatment", b: "baseline" } as const;
  assert.equal(choiceToOutcome("a", mapping), "treatment-win");
  assert.equal(choiceToOutcome("b", mapping), "baseline-win");
  assert.equal(choiceToOutcome("tie", mapping), "tie");
  assert.equal(choiceToOutcome("invalid", mapping), "invalid");
  assert.throws(() => choiceToOutcome("treatment", mapping), /choice must be/);
});

test("records human choices and renders exact overall and platform counts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tone-review-"));
  try {
    const runDir = await createRun(root);
    const result = await reviewEvaluation({
      runDir,
      referencesPath: REFERENCES,
      labelsInputPath: CHOICES,
      interactive: false,
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.labels.map(({ id, platform, choice, outcome }) => ({ id, platform, choice, outcome })), [
      { id: "slack-001", platform: "slack", choice: "a", outcome: "treatment-win" },
      { id: "email-001", platform: "email", choice: "b", outcome: "baseline-win" },
    ]);
    assert.match(result.report, /\| Treatment win \| 1 \| 50\.0% \|/);
    assert.match(result.report, /\| Baseline win \| 1 \| 50\.0% \|/);
    assert.match(result.report, /\| email \| 0 \| 0\.0% \| 1 \| 100\.0% \| 0 \| 0\.0% \| 0 \| 0\.0% \| 1 \| 1 \|/);
    assert.match(result.report, /\| slack \| 1 \| 100\.0% \| 0 \| 0\.0% \| 0 \| 0\.0% \| 0 \| 0\.0% \| 1 \| 1 \|/);
    const manifest = JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8"));
    assert.equal(manifest.status, "reviewed");
    assert.deepEqual(manifest.review, { labeled: 2, total: 2, complete: true });
    assert.match(manifest.reviewInputs.blindReviewHash, /^[a-f0-9]{64}$/);
    assert.match(manifest.reviewInputs.referencesHash, /^[a-f0-9]{64}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("persists each label and resumes an interrupted review", async () => {
  const root = await mkdtemp(join(tmpdir(), "tone-review-resume-"));
  try {
    const runDir = await createRun(root);
    const firstChoice = join(root, "first.jsonl");
    await writeFile(firstChoice, '{"id":"slack-001","choice":"tie"}\n');
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: REFERENCES, labelsInputPath: firstChoice, interactive: false }),
      /no label supplied for case "email-001"/,
    );
    const persisted = await readJsonl<Label>(join(runDir, "labels.jsonl"));
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].outcome, "tie");

    const secondChoice = join(root, "second.jsonl");
    await writeFile(secondChoice, '{"id":"email-001","choice":"invalid"}\n');
    const result = await reviewEvaluation({ runDir, referencesPath: REFERENCES, labelsInputPath: secondChoice, interactive: false });
    assert.equal(result.complete, true);
    assert.deepEqual(summarizeLabels(result.labels).overall, {
      reviewed: 2,
      valid: 1,
      "treatment-win": 0,
      "baseline-win": 0,
      tie: 1,
      invalid: 1,
    });
    assert.match(result.report, /\| Tie \| 1 \| 100\.0% \|/);
    assert.match(result.report, /\| Invalid \| 1 \| 50\.0% \|/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("report arithmetic includes every outcome and sorts platforms", () => {
  const labels: Pick<Label, "id" | "platform" | "outcome">[] = [
    { id: "1", platform: "slack", outcome: "treatment-win" },
    { id: "2", platform: "email", outcome: "baseline-win" },
    { id: "3", platform: "slack", outcome: "tie" },
    { id: "4", platform: "email", outcome: "invalid" },
  ];
  const report = renderReport(labels, { runId: "fixed", generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.match(report, /\| Treatment win \| 1 \| 33\.3% \|/);
  assert.match(report, /\| Baseline win \| 1 \| 33\.3% \|/);
  assert.match(report, /\| Tie \| 1 \| 33\.3% \|/);
  assert.match(report, /\| Invalid \| 1 \| 25\.0% \|/);
  assert.ok(report.indexOf("| email |") < report.indexOf("| slack |"));
});

test("platform summaries handle names inherited by ordinary objects", () => {
  const summary = summarizeLabels([
    { id: "prototype-safe", platform: "constructor", outcome: "treatment-win" },
  ]);
  assert.deepEqual(summary.byPlatform.constructor, {
    reviewed: 1,
    valid: 1,
    "treatment-win": 1,
    "baseline-win": 0,
    tie: 0,
    invalid: 0,
  });
});

test("rejects missing references and malformed label choices", async () => {
  const root = await mkdtemp(join(tmpdir(), "tone-review-invalid-"));
  try {
    const runDir = await createRun(root);
    const incompleteReferences = join(root, "references.jsonl");
    await writeFile(incompleteReferences, '{"id":"slack-001","reference":"Only one"}\n');
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: incompleteReferences, labelsInputPath: CHOICES, interactive: false }),
      /missing case "email-001"/,
    );
    const badChoices = join(root, "choices.jsonl");
    await writeFile(badChoices, '{"id":"slack-001","choice":"treatment"}\n');
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: REFERENCES, labelsInputPath: badChoices, interactive: false }),
      /choice must be a, b, tie, or invalid/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pins blind and reference bytes when review starts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tone-review-pins-"));
  try {
    const runDir = await createRun(root);
    const references = join(root, "references.jsonl");
    await writeFile(references, await readFile(REFERENCES, "utf8"));
    const firstChoice = join(root, "first.jsonl");
    await writeFile(firstChoice, '{"id":"slack-001","choice":"a"}\n');
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: references, labelsInputPath: firstChoice, interactive: false }),
      /no label supplied/,
    );
    await writeFile(references, (await readFile(references, "utf8")).replace("No stress", "Changed"));
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: references, labelsInputPath: CHOICES, interactive: false }),
      /review inputs changed/,
    );

    await writeFile(references, await readFile(REFERENCES, "utf8"));
    const blindPath = join(runDir, "blind-review.jsonl");
    await writeFile(blindPath, (await readFile(blindPath, "utf8")).replace("Candidate A one", "Changed candidate"));
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: references, labelsInputPath: CHOICES, interactive: false }),
      /review inputs changed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects tampered stored label metadata and blind mappings", async () => {
  const root = await mkdtemp(join(tmpdir(), "tone-review-tamper-"));
  try {
    const runDir = await createRun(root);
    await reviewEvaluation({ runDir, referencesPath: REFERENCES, labelsInputPath: CHOICES, interactive: false });
    const labelsPath = join(runDir, "labels.jsonl");
    const labels = await readJsonl<Label>(labelsPath);
    labels[0].outcome = "baseline-win";
    await writeFile(labelsPath, `${labels.map((label) => JSON.stringify(label)).join("\n")}\n`);
    await assert.rejects(
      reviewEvaluation({ runDir, referencesPath: REFERENCES, labelsInputPath: CHOICES, interactive: false }),
      /outcome does not match/,
    );

    const secondRoot = join(root, "second");
    await mkdir(secondRoot);
    const secondRun = await createRun(secondRoot);
    const manifestPath = join(secondRun, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.blindMapping["slack-001"] = { a: "baseline", b: "treatment" };
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await assert.rejects(
      reviewEvaluation({ runDir: secondRun, referencesPath: REFERENCES, labelsInputPath: CHOICES, interactive: false }),
      /does not match its recorded seed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects symlinked run directories and run artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tone-review-symlink-"));
  try {
    const realRun = await createRun(root);
    const linkedRun = join(root, "linked-run");
    await symlink(realRun, linkedRun);
    await assert.rejects(
      reviewEvaluation({ runDir: linkedRun, referencesPath: REFERENCES, labelsInputPath: CHOICES, interactive: false }),
      /run path must be a real directory, not a symlink/,
    );

    const manifestPath = join(realRun, "manifest.json");
    const outsideManifest = join(root, "outside-manifest.json");
    await writeFile(outsideManifest, await readFile(manifestPath, "utf8"));
    await rm(manifestPath);
    await symlink(outsideManifest, manifestPath);
    await assert.rejects(
      reviewEvaluation({ runDir: realRun, referencesPath: REFERENCES, labelsInputPath: CHOICES, interactive: false }),
      /manifest must be a real file/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
