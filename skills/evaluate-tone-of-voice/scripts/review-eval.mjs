#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CHOICES = new Set(["a", "b", "tie", "invalid"]);
const OUTCOMES = new Set(["treatment-win", "baseline-win", "tie", "invalid"]);
const BLIND_FIELDS = new Set([
  "id",
  "platform",
  "context",
  "scenario",
  "facts",
  "constraints",
  "candidateA",
  "candidateB",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function safeChild(parent, name) {
  if (typeof name !== "string" || name === "" || isAbsolute(name)) {
    throw new Error(`unsafe child path ${JSON.stringify(name)}`);
  }
  const root = resolve(parent);
  const child = resolve(root, name);
  if (child !== root && !child.startsWith(`${root}${sep}`)) {
    throw new Error(`path escapes ${root}: ${name}`);
  }
  return child;
}

async function writeAtomically(path, contents) {
  const temporary = safeChild(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function writeJson(path, value) {
  await writeAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path, values) {
  const body = values.length === 0 ? "" : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
  await writeAtomically(path, body);
}

function assertCanonicalWithin(root, child, label) {
  if (child !== root && !child.startsWith(`${root}${sep}`)) {
    throw new Error(`${label} escapes the run directory`);
  }
}

async function readRunFile(runDir, name, label, { optional = false } = {}) {
  const path = safeChild(runDir, name);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (optional && error.code === "ENOENT") return undefined;
    if (error.code === "ENOENT") throw new Error(`${label} not found: ${path}`);
    throw error;
  }
  if (info.isSymbolicLink() || !info.isFile()) {
    throw new Error(`${label} must be a real file inside the run directory`);
  }
  const canonicalRun = await realpath(runDir);
  const canonicalPath = await realpath(path);
  assertCanonicalWithin(canonicalRun, canonicalPath, label);
  return readFile(canonicalPath, "utf8");
}

export function parseJsonl(source, label = "JSONL") {
  const records = [];
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${label}:${index + 1}: invalid JSON (${error.message})`);
    }
  }
  return records;
}

function assertNonEmptyString(value, field, location) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${location}: ${field} must be a non-empty string`);
  }
}

export function validateBlindRows(records) {
  if (records.length === 0) throw new Error("blind-review: expected at least one record");
  const ids = new Set();
  return records.map((record, index) => {
    const location = `blind-review:${index + 1}`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${location}: expected an object`);
    }
    for (const field of Object.keys(record)) {
      if (!BLIND_FIELDS.has(field)) throw new Error(`${location}: unexpected field ${JSON.stringify(field)}`);
    }
    for (const field of ["id", "platform", "context", "scenario", "candidateA", "candidateB"]) {
      assertNonEmptyString(record[field], field, location);
    }
    for (const field of ["facts", "constraints"]) {
      if (!Array.isArray(record[field]) || record[field].some((item) => typeof item !== "string" || item.trim() === "")) {
        throw new Error(`${location}: ${field} must be an array of non-empty strings`);
      }
    }
    if (ids.has(record.id)) throw new Error(`${location}: duplicate id ${JSON.stringify(record.id)}`);
    ids.add(record.id);
    return record;
  });
}

export function validateReferences(records, caseIds) {
  const references = new Map();
  for (const [index, record] of records.entries()) {
    const location = `references:${index + 1}`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`${location}: expected an object`);
    }
    const fields = Object.keys(record);
    if (fields.length !== 2 || !fields.includes("id") || !fields.includes("reference")) {
      throw new Error(`${location}: expected only id and reference`);
    }
    assertNonEmptyString(record.id, "id", location);
    assertNonEmptyString(record.reference, "reference", location);
    if (references.has(record.id)) throw new Error(`${location}: duplicate id ${JSON.stringify(record.id)}`);
    references.set(record.id, record.reference);
  }
  for (const id of caseIds) {
    if (!references.has(id)) throw new Error(`references: missing case ${JSON.stringify(id)}`);
  }
  return references;
}

export function choiceToOutcome(choice, mapping, caseId = "case") {
  if (!CHOICES.has(choice)) {
    throw new Error(`${caseId}: choice must be a, b, tie, or invalid`);
  }
  if (choice === "tie" || choice === "invalid") return choice;
  const branch = mapping?.[choice];
  if (branch !== "baseline" && branch !== "treatment") {
    throw new Error(`${caseId}: manifest has an invalid blind mapping`);
  }
  return `${branch}-win`;
}

function expectedBlindAssignment(seed, caseId) {
  const treatmentIsA = Number.parseInt(sha256(`${seed}\0${caseId}`).slice(0, 2), 16) % 2 === 0;
  return treatmentIsA ? { a: "treatment", b: "baseline" } : { a: "baseline", b: "treatment" };
}

function validateBlindMapping(mapping, blindRows, seed) {
  if (typeof seed !== "string" || seed === "") {
    throw new Error("manifest config must contain a non-empty blind seed");
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error("manifest blindMapping must be an object");
  }
  const expectedIds = blindRows.map((row) => row.id).sort();
  const actualIds = Object.keys(mapping).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error("manifest blindMapping IDs do not match blind-review IDs");
  }
  for (const id of expectedIds) {
    const entry = mapping[id];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} is invalid`);
    }
    const fields = Object.keys(entry).sort();
    if (JSON.stringify(fields) !== JSON.stringify(["a", "b"])) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} must contain only a and b`);
    }
    if (!new Set([entry.a, entry.b]).has("baseline") || !new Set([entry.a, entry.b]).has("treatment") || entry.a === entry.b) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} must assign baseline and treatment once each`);
    }
    if (JSON.stringify(entry) !== JSON.stringify(expectedBlindAssignment(seed, id))) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} does not match its recorded seed`);
    }
  }
}

export function summarizeLabels(labels) {
  const makeBucket = () => ({
    reviewed: 0,
    valid: 0,
    "treatment-win": 0,
    "baseline-win": 0,
    tie: 0,
    invalid: 0,
  });
  const overall = makeBucket();
  const byPlatform = new Map();
  for (const label of labels) {
    if (!OUTCOMES.has(label.outcome)) throw new Error(`label ${label.id}: invalid outcome ${JSON.stringify(label.outcome)}`);
    if (!byPlatform.has(label.platform)) byPlatform.set(label.platform, makeBucket());
    for (const bucket of [overall, byPlatform.get(label.platform)]) {
      bucket.reviewed += 1;
      bucket[label.outcome] += 1;
      if (label.outcome !== "invalid") bucket.valid += 1;
    }
  }
  return {
    overall,
    byPlatform: Object.fromEntries([...byPlatform.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function percentage(count, denominator) {
  return denominator === 0 ? "n/a" : `${((count / denominator) * 100).toFixed(1)}%`;
}

export function renderReport(labels, { runId, generatedAt = new Date().toISOString() } = {}) {
  const summary = summarizeLabels(labels);
  const lines = [
    "# Tone of voice evaluation report",
    "",
    `Run: ${runId || "unknown"}`,
    `Generated: ${generatedAt}`,
    "",
    "These are descriptive human judgments. Win and tie rates use valid labels as the denominator; the invalid rate uses all reviewed cases.",
    "",
    "## Overall",
    "",
    "| Outcome | Count | Rate |",
    "|---|---:|---:|",
    `| Treatment win | ${summary.overall["treatment-win"]} | ${percentage(summary.overall["treatment-win"], summary.overall.valid)} |`,
    `| Baseline win | ${summary.overall["baseline-win"]} | ${percentage(summary.overall["baseline-win"], summary.overall.valid)} |`,
    `| Tie | ${summary.overall.tie} | ${percentage(summary.overall.tie, summary.overall.valid)} |`,
    `| Invalid | ${summary.overall.invalid} | ${percentage(summary.overall.invalid, summary.overall.reviewed)} |`,
    `| Total reviewed | ${summary.overall.reviewed} | 100.0% |`,
    "",
    "## By platform",
    "",
    "| Platform | Treatment wins | Treatment rate | Baseline wins | Baseline rate | Ties | Tie rate | Invalid | Invalid rate | Valid | Reviewed |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const [platform, bucket] of Object.entries(summary.byPlatform)) {
    lines.push([
      `| ${platform}`,
      bucket["treatment-win"],
      percentage(bucket["treatment-win"], bucket.valid),
      bucket["baseline-win"],
      percentage(bucket["baseline-win"], bucket.valid),
      bucket.tie,
      percentage(bucket.tie, bucket.valid),
      bucket.invalid,
      percentage(bucket.invalid, bucket.reviewed),
      bucket.valid,
      `${bucket.reviewed} |`,
    ].join(" | "));
  }
  lines.push("", "No automated judge was used. Inspect invalid cases and losses before changing the skill or profile.", "");
  return lines.join("\n");
}

function parseLabelInputs(records, validIds) {
  const choices = new Map();
  for (const [index, record] of records.entries()) {
    const location = `labels-input:${index + 1}`;
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${location}: expected an object`);
    const fields = Object.keys(record);
    if (fields.length !== 2 || !fields.includes("id") || !fields.includes("choice")) {
      throw new Error(`${location}: expected only id and choice`);
    }
    if (!validIds.has(record.id)) throw new Error(`${location}: unknown case ${JSON.stringify(record.id)}`);
    if (!CHOICES.has(record.choice)) throw new Error(`${location}: choice must be a, b, tie, or invalid`);
    if (choices.has(record.id)) throw new Error(`${location}: duplicate id ${JSON.stringify(record.id)}`);
    choices.set(record.id, record.choice);
  }
  return choices;
}

async function loadExistingLabels(runDir, rowsById, mapping) {
  const source = await readRunFile(runDir, "labels.jsonl", "labels", { optional: true });
  if (source === undefined) return new Map();
  const records = parseJsonl(source, "labels");
  const labels = new Map();
  for (const [index, record] of records.entries()) {
    const location = `labels:${index + 1}`;
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`${location}: expected an object`);
    const fields = Object.keys(record).sort();
    if (JSON.stringify(fields) !== JSON.stringify(["choice", "id", "labeledAt", "outcome", "platform"])) {
      throw new Error(`${location}: stored label fields were changed`);
    }
    const row = rowsById.get(record.id);
    if (!row) throw new Error(`${location}: unknown case ${JSON.stringify(record.id)}`);
    if (!CHOICES.has(record.choice)) throw new Error(`${location}: invalid choice`);
    if (record.platform !== row.platform) throw new Error(`${location}: platform does not match blind review`);
    const expectedOutcome = choiceToOutcome(record.choice, mapping[record.id], record.id);
    if (record.outcome !== expectedOutcome) throw new Error(`${location}: outcome does not match choice and blind mapping`);
    if (typeof record.labeledAt !== "string" || Number.isNaN(Date.parse(record.labeledAt))) {
      throw new Error(`${location}: labeledAt is invalid`);
    }
    if (labels.has(record.id)) throw new Error(`${location}: duplicate id ${JSON.stringify(record.id)}`);
    labels.set(record.id, record);
  }
  return labels;
}

function formatCaseForReview(row, reference, position, total) {
  return [
    "",
    `Case ${position}/${total}: ${row.id} (${row.platform}, ${row.context})`,
    `Scenario: ${row.scenario}`,
    "Facts:",
    ...row.facts.map((item) => `- ${item}`),
    "Constraints:",
    ...(row.constraints.length > 0 ? row.constraints.map((item) => `- ${item}`) : ["- None"]),
    "",
    "Candidate A:",
    row.candidateA,
    "",
    "Candidate B:",
    row.candidateB,
    "",
    "Real held-out response:",
    reference,
    "",
    "Choose which candidate sounds more like the real response while preserving every fact.",
  ].join("\n");
}

async function askForChoice(reader, row, reference, position, total) {
  output.write(`${formatCaseForReview(row, reference, position, total)}\n`);
  while (true) {
    const answer = (await reader.question("Choice [a/b/tie/invalid]: ")).trim().toLowerCase();
    if (CHOICES.has(answer)) return answer;
    output.write("Enter a, b, tie, or invalid.\n");
  }
}

export async function reviewEvaluation({ runDir, referencesPath, labelsInputPath, interactive = true }) {
  const resolvedRunDir = resolve(runDir);
  const info = await lstat(resolvedRunDir).catch((error) => {
    if (error.code === "ENOENT") throw new Error(`run directory not found: ${resolvedRunDir}`);
    throw error;
  });
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`run path must be a real directory, not a symlink: ${resolvedRunDir}`);
  const manifestPath = safeChild(resolvedRunDir, "manifest.json");
  const blindPath = safeChild(resolvedRunDir, "blind-review.jsonl");
  const labelsPath = safeChild(resolvedRunDir, "labels.jsonl");
  const reportPath = safeChild(resolvedRunDir, "report.md");
  const manifest = JSON.parse(await readRunFile(resolvedRunDir, "manifest.json", "manifest"));
  if (manifest.status !== "generated" && manifest.status !== "reviewed") {
    throw new Error(`run is not ready for review (status: ${manifest.status || "unknown"})`);
  }
  const blindSource = await readRunFile(resolvedRunDir, "blind-review.jsonl", "blind-review");
  const blindRows = validateBlindRows(parseJsonl(blindSource, "blind-review"));
  const validIds = new Set(blindRows.map((row) => row.id));
  const rowsById = new Map(blindRows.map((row) => [row.id, row]));
  validateBlindMapping(manifest.blindMapping, blindRows, manifest.config?.seed);
  const referencesSource = await readFile(resolve(referencesPath), "utf8");
  const references = validateReferences(
    parseJsonl(referencesSource, "references"),
    validIds,
  );
  const reviewInputs = {
    version: 1,
    blindReviewHash: sha256(blindSource),
    referencesHash: sha256(referencesSource),
  };
  if (manifest.reviewInputs && JSON.stringify(manifest.reviewInputs) !== JSON.stringify(reviewInputs)) {
    throw new Error("review inputs changed after labeling began; restore them or start a new run");
  }
  if (!manifest.reviewInputs) {
    manifest.reviewInputs = reviewInputs;
    manifest.updatedAt = new Date().toISOString();
    await writeJson(manifestPath, manifest);
  }
  const labels = await loadExistingLabels(resolvedRunDir, rowsById, manifest.blindMapping);
  const suppliedChoices = labelsInputPath
    ? parseLabelInputs(parseJsonl(await readFile(resolve(labelsInputPath), "utf8"), "labels-input"), validIds)
    : new Map();
  let reader;
  try {
    if (interactive && !labelsInputPath) reader = createInterface({ input, output });
    for (const [index, row] of blindRows.entries()) {
      if (labels.has(row.id)) {
        const supplied = suppliedChoices.get(row.id);
        if (supplied && supplied !== labels.get(row.id).choice) {
          throw new Error(`refusing to replace existing label for case ${JSON.stringify(row.id)}`);
        }
        continue;
      }
      let choice = suppliedChoices.get(row.id);
      if (!choice) {
        if (!reader) throw new Error(`no label supplied for case ${JSON.stringify(row.id)}`);
        choice = await askForChoice(reader, row, references.get(row.id), index + 1, blindRows.length);
      }
      const mapping = manifest.blindMapping?.[row.id];
      const label = {
        id: row.id,
        platform: row.platform,
        choice,
        outcome: choiceToOutcome(choice, mapping, row.id),
        labeledAt: new Date().toISOString(),
      };
      labels.set(row.id, label);
      await writeJsonl(labelsPath, blindRows.flatMap((item) => labels.has(item.id) ? [labels.get(item.id)] : []));
    }
  } finally {
    reader?.close();
  }

  const orderedLabels = blindRows.flatMap((row) => labels.has(row.id) ? [labels.get(row.id)] : []);
  const complete = orderedLabels.length === blindRows.length;
  const report = renderReport(orderedLabels, { runId: manifest.runId });
  await writeAtomically(reportPath, report);
  manifest.status = complete ? "reviewed" : "generated";
  manifest.updatedAt = new Date().toISOString();
  manifest.review = { labeled: orderedLabels.length, total: blindRows.length, complete };
  manifest.artifacts = {
    ...(manifest.artifacts || {}),
    labels: "labels.jsonl",
    report: "report.md",
  };
  await writeJson(manifestPath, manifest);
  return { labels: orderedLabels, report, complete, labelsPath, reportPath };
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${JSON.stringify(token)}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`${token} requires a value`);
    if (Object.hasOwn(options, key)) throw new Error(`${token} was provided more than once`);
    options[key] = value;
    index += 1;
  }
  const known = new Set(["run-dir", "references", "labels-file"]);
  for (const key of Object.keys(options)) {
    if (!known.has(key)) throw new Error(`unknown option --${key}`);
  }
  if (!options["run-dir"]) throw new Error("--run-dir is required");
  if (!options.references) throw new Error("--references is required");
  return {
    runDir: options["run-dir"],
    referencesPath: options.references,
    labelsInputPath: options["labels-file"],
    interactive: !options["labels-file"],
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/review-eval.mjs --run-dir <run> --references <references.jsonl>",
    "  node scripts/review-eval.mjs --run-dir <run> --references <references.jsonl> --labels-file <choices.jsonl>",
    "",
    "A choices file contains one {\"id\":\"...\",\"choice\":\"a|b|tie|invalid\"} record per line.",
  ].join("\n");
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await reviewEvaluation(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ labels: result.labels.length, complete: result.complete, report: result.reportPath })}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`review-eval: ${error.message}\n`);
    process.exitCode = 1;
  });
}
