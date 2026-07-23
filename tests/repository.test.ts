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

const SKIPPED_DIRECTORIES = new Set([".git", "node_modules"]);

async function filesBelow(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : filesBelow(path);
    }
    return [path];
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
    assert.match(source, new RegExp(`^---\\nname: ${name}\\n`, "u"));
    assert.match(source, /^description: .+Use when.+$/mu);
    assert.ok(source.split("\n").length < 500, `${name}/SKILL.md must stay under 500 lines`);
  }
});

test("every bundled skill support file is linked from its SKILL.md", async () => {
  for (const name of EXPECTED_SKILLS) {
    const skillRoot = join(SKILLS_ROOT, name);
    const source = await readFile(join(skillRoot, "SKILL.md"), "utf8");

    for (const path of await filesBelow(skillRoot)) {
      const pathFromSkill = relative(skillRoot, path);
      if (pathFromSkill === "SKILL.md") continue;
      assert.ok(
        source.includes(pathFromSkill),
        `${name}/SKILL.md does not link ${pathFromSkill}`,
      );
    }
  }
});

test("private-data ignore rules stay root-anchored and do not hide fixtures", () => {
  // .gitignore lists /corpus/, /evals/, /profiles/ and /data/ so a private data
  // root at the repository root is ignored. Dropping a leading slash would also
  // match these fixture paths, and `git add` would silently skip them.
  for (const path of [
    "tests/fixtures/evaluation/profiles/slack.md",
    "tests/fixtures/evaluation/cases.jsonl",
    "tests/fixtures/training/corpus-valid.jsonl",
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
    assert.equal(ignored, false, `${path} is unexpectedly ignored`);
  }
});

test("public Markdown contains no em dash or local machine path", async () => {
  const files = (await filesBelow(REPOSITORY_ROOT)).filter((path) => path.endsWith(".md"));

  for (const path of files) {
    const source = await readFile(path, "utf8");
    const pathFromRoot = relative(REPOSITORY_ROOT, path);
    assert.equal(source.includes("—"), false, `${pathFromRoot} contains an em dash`);
    assert.equal(source.includes("/Users/"), false, `${pathFromRoot} contains a local absolute path`);
  }
});
