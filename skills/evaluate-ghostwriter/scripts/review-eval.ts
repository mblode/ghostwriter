import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { lstat, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// BlindRow and Branch describe blind-review.jsonl, which run-eval.ts writes and
// this script reads. Import the types rather than restating them so the two
// halves of that on-disk contract cannot drift apart. Type-only, so nothing of
// run-eval.ts reaches the runtime of this script.
import type { BlindRow, Branch } from "./run-eval.ts";

export type { BlindRow, Branch };

export type Choice = "a" | "b" | "tie" | "invalid";
export type Outcome = "treatment-win" | "baseline-win" | "tie" | "invalid";

const CHOICES = ["a", "b", "tie", "invalid"] as const;
const OUTCOMES = new Set<string>(["treatment-win", "baseline-win", "tie", "invalid"]);
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

function isChoice(value: unknown): value is Choice {
  return typeof value === "string" && (CHOICES as readonly string[]).includes(value);
}

export interface Label {
  id: string;
  platform: string;
  choice: Choice;
  outcome: Outcome;
  labeledAt: string;
}

export type BlindMapping = Record<string, { a: Branch; b: Branch }>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeChild(parent: string, name: string): string {
  if (name === "" || isAbsolute(name)) {
    throw new Error(`unsafe child path ${JSON.stringify(name)}`);
  }
  const root = resolve(parent);
  const child = resolve(root, name);
  if (child !== root && !child.startsWith(`${root}${sep}`)) {
    throw new Error(`path escapes ${root}: ${name}`);
  }
  return child;
}

async function writeAtomically(path: string, contents: string): Promise<void> {
  const temporary = safeChild(dirname(path), `.${basename(path)}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  await writeFile(temporary, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  await rename(temporary, path);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeAtomically(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeJsonl(path: string, values: unknown[]): Promise<void> {
  const body = values.length === 0 ? "" : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`;
  await writeAtomically(path, body);
}

function assertCanonicalWithin(root: string, child: string, label: string): void {
  if (child !== root && !child.startsWith(`${root}${sep}`)) {
    throw new Error(`${label} escapes the run directory`);
  }
}

async function readRunFile(
  runDir: string,
  name: string,
  label: string,
  { optional = false }: { optional?: boolean } = {},
): Promise<string | undefined> {
  const path = safeChild(runDir, name);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      if (optional) return undefined;
      throw new Error(`${label} not found: ${path}`);
    }
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

async function requireRunFile(runDir: string, name: string, label: string): Promise<string> {
  const source = await readRunFile(runDir, name, label);
  if (source === undefined) throw new Error(`${label} not found in ${runDir}`);
  return source;
}

export function parseJsonl(source: string, label = "JSONL"): unknown[] {
  const records: unknown[] = [];
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      throw new Error(`${label}:${index + 1}: invalid JSON (${errorMessage(error)})`);
    }
  }
  return records;
}

function requireText(record: Record<string, unknown>, field: string, location: string): string {
  const value = record[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${location}: ${field} must be a non-empty string`);
  }
  return value;
}

function requireStringArray(
  record: Record<string, unknown>,
  field: string,
  location: string,
): string[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`${location}: ${field} must be an array of non-empty strings`);
  }
  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw new Error(`${location}: ${field} must be an array of non-empty strings`);
    }
    return item;
  });
}

export function validateBlindRows(records: unknown[]): BlindRow[] {
  if (records.length === 0) throw new Error("blind-review: expected at least one record");
  const ids = new Set<string>();
  return records.map((value, index) => {
    const location = `blind-review:${index + 1}`;
    const record = asObject(value);
    if (!record) throw new Error(`${location}: expected an object`);
    for (const field of Object.keys(record)) {
      if (!BLIND_FIELDS.has(field)) throw new Error(`${location}: unexpected field ${JSON.stringify(field)}`);
    }
    const row: BlindRow = {
      id: requireText(record, "id", location),
      platform: requireText(record, "platform", location),
      context: requireText(record, "context", location),
      scenario: requireText(record, "scenario", location),
      candidateA: requireText(record, "candidateA", location),
      candidateB: requireText(record, "candidateB", location),
      facts: requireStringArray(record, "facts", location),
      constraints: requireStringArray(record, "constraints", location),
    };
    if (ids.has(row.id)) throw new Error(`${location}: duplicate id ${JSON.stringify(row.id)}`);
    ids.add(row.id);
    return row;
  });
}

export function validateReferences(records: unknown[], caseIds: Set<string>): Map<string, string> {
  const references = new Map<string, string>();
  for (const [index, value] of records.entries()) {
    const location = `references:${index + 1}`;
    const record = asObject(value);
    if (!record) throw new Error(`${location}: expected an object`);
    const fields = Object.keys(record);
    if (fields.length !== 2 || !fields.includes("id") || !fields.includes("reference")) {
      throw new Error(`${location}: expected only id and reference`);
    }
    const id = requireText(record, "id", location);
    const reference = requireText(record, "reference", location);
    if (references.has(id)) throw new Error(`${location}: duplicate id ${JSON.stringify(id)}`);
    references.set(id, reference);
  }
  for (const id of caseIds) {
    if (!references.has(id)) throw new Error(`references: missing case ${JSON.stringify(id)}`);
  }
  return references;
}

export function choiceToOutcome(
  choice: string,
  mapping: { a: Branch; b: Branch } | undefined,
  caseId = "case",
): Outcome {
  if (!isChoice(choice)) {
    throw new Error(`${caseId}: choice must be a, b, tie, or invalid`);
  }
  if (choice === "tie" || choice === "invalid") return choice;
  const branch = mapping?.[choice];
  if (branch !== "baseline" && branch !== "treatment") {
    throw new Error(`${caseId}: manifest has an invalid blind mapping`);
  }
  return `${branch}-win`;
}

function expectedBlindAssignment(seed: string, caseId: string): { a: Branch; b: Branch } {
  const treatmentIsA = Number.parseInt(sha256(`${seed}\0${caseId}`).slice(0, 2), 16) % 2 === 0;
  return treatmentIsA ? { a: "treatment", b: "baseline" } : { a: "baseline", b: "treatment" };
}

function isBranch(value: unknown): value is Branch {
  return value === "baseline" || value === "treatment";
}

function validateBlindMapping(mapping: unknown, blindRows: BlindRow[], seed: unknown): BlindMapping {
  if (typeof seed !== "string" || seed === "") {
    throw new Error("manifest config must contain a non-empty blind seed");
  }
  const mappings = asObject(mapping);
  if (!mappings) throw new Error("manifest blindMapping must be an object");
  const expectedIds = blindRows.map((row) => row.id).sort();
  const actualIds = Object.keys(mappings).sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error("manifest blindMapping IDs do not match blind-review IDs");
  }
  const validated: BlindMapping = {};
  for (const id of expectedIds) {
    const entry = asObject(mappings[id]);
    if (!entry) throw new Error(`manifest blindMapping for ${JSON.stringify(id)} is invalid`);
    const fields = Object.keys(entry).sort();
    if (JSON.stringify(fields) !== JSON.stringify(["a", "b"])) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} must contain only a and b`);
    }
    const { a, b } = entry;
    if (!isBranch(a) || !isBranch(b) || a === b) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} must assign baseline and treatment once each`);
    }
    if (JSON.stringify(entry) !== JSON.stringify(expectedBlindAssignment(seed, id))) {
      throw new Error(`manifest blindMapping for ${JSON.stringify(id)} does not match its recorded seed`);
    }
    validated[id] = { a, b };
  }
  return validated;
}

export interface Bucket {
  reviewed: number;
  valid: number;
  "treatment-win": number;
  "baseline-win": number;
  tie: number;
  invalid: number;
}

export function summarizeLabels(labels: Pick<Label, "id" | "platform" | "outcome">[]) {
  const makeBucket = (): Bucket => ({
    reviewed: 0,
    valid: 0,
    "treatment-win": 0,
    "baseline-win": 0,
    tie: 0,
    invalid: 0,
  });
  const overall = makeBucket();
  const byPlatform = new Map<string, Bucket>();
  for (const label of labels) {
    if (!OUTCOMES.has(label.outcome)) throw new Error(`label ${label.id}: invalid outcome ${JSON.stringify(label.outcome)}`);
    if (!byPlatform.has(label.platform)) byPlatform.set(label.platform, makeBucket());
    for (const bucket of [overall, byPlatform.get(label.platform)!]) {
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

function percentage(count: number, denominator: number): string {
  return denominator === 0 ? "n/a" : `${((count / denominator) * 100).toFixed(1)}%`;
}

// z = 1.96 is the standard normal critical value for a two-sided 95% interval
// (the 97.5th percentile). Hardcoded because the report only ever quotes 95%;
// no other confidence level is offered.
const WILSON_Z = 1.96;

// Wilson score interval for a binomial proportion. Preferred over the normal
// approximation because it stays sensible at the small samples these reviews
// produce. Returns null when there is nothing to bound.
function wilsonInterval(successes: number, n: number): { lower: number; upper: number } | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = WILSON_Z * WILSON_Z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const margin = (WILSON_Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denominator;
  // Clamp to [0, 1]: the interval is already contained there in exact math, but
  // floating point can nudge a bound a hair past the edge.
  return { lower: Math.max(0, center - margin), upper: Math.min(1, center + margin) };
}

export function renderReport(
  labels: Pick<Label, "id" | "platform" | "choice" | "outcome">[],
  { runId, generatedAt = new Date().toISOString() }: { runId?: string; generatedAt?: string } = {},
): string {
  const summary = summarizeLabels(labels);
  const lines = [
    "# Ghostwriter evaluation report",
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
  const valid = summary.overall.valid;
  const interval = wilsonInterval(summary.overall["treatment-win"], valid);
  let positionA = 0;
  let positionB = 0;
  for (const label of labels) {
    if (label.choice === "a") positionA += 1;
    else if (label.choice === "b") positionB += 1;
  }
  lines.push(
    "",
    "## Uncertainty and position diagnostic",
    "",
    interval
      ? `Treatment win rate 95% Wilson score interval, over ${valid} valid labels (wins and ties, invalid excluded): ${(interval.lower * 100).toFixed(1)}% to ${(interval.upper * 100).toFixed(1)}%.`
      : "Treatment win rate 95% Wilson score interval: n/a (no valid labels).",
    "These bounds describe uncertainty in the human labels, not an automated quality judgment; a small win rate is still not proof.",
    `Position choices before blind mapping: a chosen ${positionA}, b chosen ${positionB}. A lopsided split points to position bias rather than a voice difference.`,
  );
  lines.push(
    "",
    "No automated judge was used. Inspect invalid cases and losses before changing the skill or profile.",
    "This measures the whole ghostwriter skill (anti-AI-prose pass plus strategy layer) and profile bundle against a raw-model baseline with no style guidance; it does not isolate the profile's own marginal effect.",
    "",
  );
  return lines.join("\n");
}

function parseLabelInputs(records: unknown[], validIds: Set<string>): Map<string, Choice> {
  const choices = new Map<string, Choice>();
  for (const [index, value] of records.entries()) {
    const location = `labels-input:${index + 1}`;
    const record = asObject(value);
    if (!record) throw new Error(`${location}: expected an object`);
    const fields = Object.keys(record);
    if (fields.length !== 2 || !fields.includes("id") || !fields.includes("choice")) {
      throw new Error(`${location}: expected only id and choice`);
    }
    const id = record.id;
    if (typeof id !== "string" || !validIds.has(id)) {
      throw new Error(`${location}: unknown case ${JSON.stringify(id)}`);
    }
    if (!isChoice(record.choice)) {
      throw new Error(`${location}: choice must be a, b, tie, or invalid`);
    }
    if (choices.has(id)) throw new Error(`${location}: duplicate id ${JSON.stringify(id)}`);
    choices.set(id, record.choice);
  }
  return choices;
}

async function loadExistingLabels(
  runDir: string,
  rowsById: Map<string, BlindRow>,
  mapping: BlindMapping,
): Promise<Map<string, Label>> {
  const source = await readRunFile(runDir, "labels.jsonl", "labels", { optional: true });
  if (source === undefined) return new Map();
  const records = parseJsonl(source, "labels");
  const labels = new Map<string, Label>();
  for (const [index, value] of records.entries()) {
    const location = `labels:${index + 1}`;
    const record = asObject(value);
    if (!record) throw new Error(`${location}: expected an object`);
    const fields = Object.keys(record).sort();
    if (JSON.stringify(fields) !== JSON.stringify(["choice", "id", "labeledAt", "outcome", "platform"])) {
      throw new Error(`${location}: stored label fields were changed`);
    }
    const row = typeof record.id === "string" ? rowsById.get(record.id) : undefined;
    if (!row) throw new Error(`${location}: unknown case ${JSON.stringify(record.id)}`);
    if (!isChoice(record.choice)) {
      throw new Error(`${location}: invalid choice`);
    }
    if (record.platform !== row.platform) throw new Error(`${location}: platform does not match blind review`);
    const outcome = choiceToOutcome(record.choice, mapping[row.id], row.id);
    if (record.outcome !== outcome) {
      throw new Error(`${location}: outcome does not match choice and blind mapping`);
    }
    if (typeof record.labeledAt !== "string" || Number.isNaN(Date.parse(record.labeledAt))) {
      throw new Error(`${location}: labeledAt is invalid`);
    }
    if (labels.has(row.id)) throw new Error(`${location}: duplicate id ${JSON.stringify(row.id)}`);
    labels.set(row.id, {
      id: row.id,
      platform: row.platform,
      choice: record.choice,
      outcome,
      labeledAt: record.labeledAt,
    });
  }
  return labels;
}

function formatCaseForReview(row: BlindRow, reference: string, position: number, total: number): string {
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

async function askForChoice(
  reader: { question: (query: string) => Promise<string> },
  row: BlindRow,
  reference: string,
  position: number,
  total: number,
): Promise<Choice> {
  output.write(`${formatCaseForReview(row, reference, position, total)}\n`);
  while (true) {
    const answer = (await reader.question("Choice [a/b/tie/invalid]: ")).trim().toLowerCase();
    if (isChoice(answer)) return answer;
    output.write("Enter a, b, tie, or invalid.\n");
  }
}

export async function reviewEvaluation(
  { runDir, referencesPath, labelsInputPath, interactive = true }: {
    runDir: string;
    referencesPath: string;
    labelsInputPath?: string;
    interactive?: boolean;
  },
) {
  const resolvedRunDir = resolve(runDir);
  const info = await lstat(resolvedRunDir).catch((error: unknown) => {
    if (errorCode(error) === "ENOENT") throw new Error(`run directory not found: ${resolvedRunDir}`);
    throw error;
  });
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`run path must be a real directory, not a symlink: ${resolvedRunDir}`);
  const manifestPath = safeChild(resolvedRunDir, "manifest.json");
  const labelsPath = safeChild(resolvedRunDir, "labels.jsonl");
  const reportPath = safeChild(resolvedRunDir, "report.md");
  const manifest = JSON.parse(
    await requireRunFile(resolvedRunDir, "manifest.json", "manifest"),
  ) as Record<string, unknown>;
  if (manifest.status !== "generated" && manifest.status !== "reviewed") {
    throw new Error(`run is not ready for review (status: ${manifest.status || "unknown"})`);
  }
  const blindSource = await requireRunFile(resolvedRunDir, "blind-review.jsonl", "blind-review");
  const blindRows = validateBlindRows(parseJsonl(blindSource, "blind-review"));
  const validIds = new Set(blindRows.map((row) => row.id));
  const rowsById = new Map(blindRows.map((row) => [row.id, row]));
  const config = asObject(manifest.config);
  const blindMapping = validateBlindMapping(manifest.blindMapping, blindRows, config?.seed);
  const referencesSource = await readFile(resolve(referencesPath), "utf8");
  const references = validateReferences(parseJsonl(referencesSource, "references"), validIds);
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
  const labels = await loadExistingLabels(resolvedRunDir, rowsById, blindMapping);
  const suppliedChoices = labelsInputPath
    ? parseLabelInputs(parseJsonl(await readFile(resolve(labelsInputPath), "utf8"), "labels-input"), validIds)
    : new Map<string, Choice>();
  let reader;
  try {
    if (interactive && !labelsInputPath) reader = createInterface({ input, output });
    for (const [index, row] of blindRows.entries()) {
      const existing = labels.get(row.id);
      if (existing) {
        const supplied = suppliedChoices.get(row.id);
        if (supplied && supplied !== existing.choice) {
          throw new Error(`refusing to replace existing label for case ${JSON.stringify(row.id)}`);
        }
        continue;
      }
      let choice = suppliedChoices.get(row.id);
      if (!choice) {
        if (!reader) throw new Error(`no label supplied for case ${JSON.stringify(row.id)}`);
        choice = await askForChoice(reader, row, references.get(row.id)!, index + 1, blindRows.length);
      }
      labels.set(row.id, {
        id: row.id,
        platform: row.platform,
        choice,
        outcome: choiceToOutcome(choice, blindMapping[row.id], row.id),
        labeledAt: new Date().toISOString(),
      });
      await writeJsonl(labelsPath, orderLabels(blindRows, labels));
    }
  } finally {
    reader?.close();
  }

  const orderedLabels = orderLabels(blindRows, labels);
  const complete = orderedLabels.length === blindRows.length;
  const report = renderReport(orderedLabels, { runId: manifest.runId as string | undefined });
  await writeAtomically(reportPath, report);
  manifest.status = complete ? "reviewed" : "generated";
  manifest.updatedAt = new Date().toISOString();
  manifest.review = { labeled: orderedLabels.length, total: blindRows.length, complete };
  manifest.artifacts = {
    ...(asObject(manifest.artifacts) || {}),
    labels: "labels.jsonl",
    report: "report.md",
  };
  await writeJson(manifestPath, manifest);
  return { labels: orderedLabels, report, complete, labelsPath, reportPath };
}

function orderLabels(blindRows: BlindRow[], labels: Map<string, Label>): Label[] {
  return blindRows.flatMap((row) => {
    const label = labels.get(row.id);
    return label ? [label] : [];
  });
}

function parseCli(argv: string[]) {
  const options: Record<string, string> = {};
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

function usage(): string {
  return [
    "Usage:",
    "  node scripts/review-eval.ts --run-dir <run> --references <references.jsonl>",
    "  node scripts/review-eval.ts --run-dir <run> --references <references.jsonl> --labels-file <choices.jsonl>",
    "",
    "A choices file contains one {\"id\":\"...\",\"choice\":\"a|b|tie|invalid\"} record per line.",
  ].join("\n");
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = await reviewEvaluation(parseCli(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify({ labels: result.labels.length, complete: result.complete, report: result.reportPath })}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`review-eval: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  });
}
