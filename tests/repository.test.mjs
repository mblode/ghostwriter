import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS_ROOT = join(REPOSITORY_ROOT, "skills");
const EXPECTED_SKILLS = [
  "tone-of-voice",
  "train-tone-of-voice",
  "evaluate-tone-of-voice",
];

async function filesBelow(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  }));
  return nested.flat();
}

test("the repository ships exactly the three public skill entrypoints", async () => {
  const entries = await readdir(SKILLS_ROOT, { withFileTypes: true });
  const actual = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(actual, [...EXPECTED_SKILLS].sort());

  for (const name of EXPECTED_SKILLS) {
    const source = await readFile(join(SKILLS_ROOT, name, "SKILL.md"), "utf8");
    assert.match(source, new RegExp("^---\\nname: " + name + "\\n", "u"));
    assert.match(source, /^description: .+Use when.+$/mu);
    assert.ok(source.split("\n").length < 500, name + "/SKILL.md must stay under 500 lines");
  }
});

test("every bundled skill support file is linked from its SKILL.md", async () => {
  for (const name of EXPECTED_SKILLS) {
    const skillRoot = join(SKILLS_ROOT, name);
    const source = await readFile(join(skillRoot, "SKILL.md"), "utf8");
    const files = await filesBelow(skillRoot);

    for (const path of files) {
      const pathFromSkill = relative(skillRoot, path);
      if (pathFromSkill === "SKILL.md") continue;
      assert.ok(
        source.includes(pathFromSkill),
        name + "/SKILL.md does not link " + pathFromSkill,
      );
    }
  }
});

test("public Markdown follows the skill format and contains no local machine paths", async () => {
  const files = (await filesBelow(REPOSITORY_ROOT))
    .filter((path) => !path.includes(join(REPOSITORY_ROOT, ".git") + "/"))
    .filter((path) => path.endsWith(".md"));

  for (const path of files) {
    const source = await readFile(path, "utf8");
    const pathFromRoot = relative(REPOSITORY_ROOT, path);
    assert.equal(source.includes("—"), false, pathFromRoot + " contains an em dash");
    assert.equal(source.includes("/Users/"), false, pathFromRoot + " contains a local absolute path");
  }
});

test("private-data ignore rules do not hide fictional examples or fixtures", () => {
  for (const path of [
    "examples/fictional/corpus/sample.jsonl",
    "examples/fictional/evals/cases.jsonl",
    "tests/fixtures/profiles/slack.md",
  ]) {
    let ignored = false;
    try {
      execFileSync("git", ["check-ignore", "--quiet", "--no-index", path], {
        cwd: REPOSITORY_ROOT,
        stdio: "ignore",
      });
      ignored = true;
    } catch {
      ignored = false;
    }
    assert.equal(ignored, false, path + " is unexpectedly ignored");
  }
});

test("runtime examples document at least three representative scenarios", async () => {
  const source = await readFile(
    join(REPOSITORY_ROOT, "examples/fictional/runtime/scenarios.jsonl"),
    "utf8",
  );
  const scenarios = source.trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(scenarios.length >= 3);
  assert.deepEqual(
    new Set(scenarios.map(({ mode }) => mode)),
    new Set(["draft", "rewrite", "review"]),
  );
  assert.ok(scenarios.some(({ id }) => id === "missing-profile-stops"));
});
