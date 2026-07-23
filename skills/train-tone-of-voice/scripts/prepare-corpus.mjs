#!/usr/bin/env node

import {
  constants as fsConstants,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CORPUS_FIELDS = Object.freeze([
  'id',
  'platform',
  'context',
  'group',
  'text',
  'timestamp',
]);

export const CASE_FIELDS = Object.freeze([
  'id',
  'platform',
  'context',
  'scenario',
  'facts',
  'constraints',
]);

export const REFERENCE_FIELDS = Object.freeze(['id', 'reference']);

export const REQUIRED_PROFILE_HEADINGS = Object.freeze([
  'Register',
  'Contexts',
  'Message shapes',
  'Language',
  'Anti-patterns',
  'Redacted excerpts',
  'Provenance',
]);

// Large enough for substantial personal exports, small enough to avoid accidentally
// reading an unfiltered mailbox archive into memory.
const MAX_INPUT_BYTES = 25 * 1024 * 1024;

// Individual messages and profiles above these limits are more likely to be raw
// document dumps than intentional tone evidence.
const MAX_TEXT_CHARACTERS = 20_000;
const MAX_PROFILE_BYTES = 128 * 1024;
const MAX_EXCERPT_CHARACTERS = 280;
const HELDOUT_FRACTION = 0.2;
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class UserInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserInputError';
  }
}

export class TransactionError extends Error {
  constructor(message, details = {}, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = 'TransactionError';
    this.details = details;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function location(source, lineNumber) {
  return lineNumber ? `${source}:${lineNumber}` : source;
}

function rejectUnknownFields(record, allowedFields, source, lineNumber) {
  const unknown = Object.keys(record).filter((key) => !allowedFields.includes(key));
  if (unknown.length > 0) {
    throw new UserInputError(
      `${location(source, lineNumber)}: unknown field${unknown.length === 1 ? '' : 's'} ${unknown.map((key) => JSON.stringify(key)).join(', ')}`,
    );
  }
}

function requireString(record, field, source, lineNumber, { max = 20_000 } = {}) {
  const value = record[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UserInputError(`${location(source, lineNumber)}: ${field} must be a non-empty string`);
  }
  if (value.includes('\0')) {
    throw new UserInputError(`${location(source, lineNumber)}: ${field} must not contain a NUL byte`);
  }
  if (value.length > max) {
    throw new UserInputError(`${location(source, lineNumber)}: ${field} exceeds ${max} characters`);
  }
  return value;
}

function validateIdentifier(value, field, source, lineNumber) {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new UserInputError(
      `${location(source, lineNumber)}: ${field} must use only letters, numbers, dot, underscore, colon, or hyphen (maximum 128 characters)`,
    );
  }
}

export function validatePlatform(value, source = 'platform', lineNumber) {
  if (typeof value !== 'string' || !SAFE_SLUG.test(value) || value.length > 64) {
    throw new UserInputError(
      `${location(source, lineNumber)}: platform must be a lowercase kebab-case slug of at most 64 characters`,
    );
  }
}

function validateContext(value, source, lineNumber) {
  if (!SAFE_SLUG.test(value) || value.length > 64) {
    throw new UserInputError(
      `${location(source, lineNumber)}: context must be a lowercase kebab-case slug of at most 64 characters`,
    );
  }
}

export function validateRecord(record, { source = 'input', lineNumber } = {}) {
  if (!isPlainObject(record)) {
    throw new UserInputError(`${location(source, lineNumber)}: expected a JSON object`);
  }
  rejectUnknownFields(record, CORPUS_FIELDS, source, lineNumber);

  const id = requireString(record, 'id', source, lineNumber, { max: 128 });
  const platform = requireString(record, 'platform', source, lineNumber, { max: 64 });
  const context = requireString(record, 'context', source, lineNumber, { max: 64 });
  const group = requireString(record, 'group', source, lineNumber, { max: 128 });
  const text = requireString(record, 'text', source, lineNumber, { max: MAX_TEXT_CHARACTERS });

  validateIdentifier(id, 'id', source, lineNumber);
  validateIdentifier(group, 'group', source, lineNumber);
  validatePlatform(platform, source, lineNumber);
  validateContext(context, source, lineNumber);

  let timestamp;
  if (record.timestamp !== undefined) {
    timestamp = requireString(record, 'timestamp', source, lineNumber, { max: 64 });
    if (!ISO_TIMESTAMP.test(timestamp) || Number.isNaN(Date.parse(timestamp))) {
      throw new UserInputError(
        `${location(source, lineNumber)}: timestamp must be ISO 8601 and include a timezone`,
      );
    }
  }

  return timestamp === undefined
    ? { id, platform, context, group, text }
    : { id, platform, context, group, text, timestamp };
}

export function parseJsonl(content, { source = 'input', validate = validateRecord } = {}) {
  if (typeof content !== 'string' || content.length === 0) {
    throw new UserInputError(`${source}: expected non-empty UTF-8 JSONL`);
  }

  const lines = content.replace(/^\uFEFF/, '').split('\n');
  const records = [];
  const seenIds = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index].endsWith('\r') ? lines[index].slice(0, -1) : lines[index];
    if (line.trim() === '') {
      if (index === lines.length - 1) continue;
      throw new UserInputError(`${source}:${lineNumber}: blank lines are not allowed in JSONL`);
    }

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new UserInputError(`${source}:${lineNumber}: invalid JSON (${error.message})`);
    }

    const record = validate(parsed, { source, lineNumber });
    if (seenIds.has(record.id)) {
      throw new UserInputError(`${source}:${lineNumber}: duplicate id ${JSON.stringify(record.id)}`);
    }
    seenIds.add(record.id);
    records.push(record);
  }

  if (records.length === 0) {
    throw new UserInputError(`${source}: expected at least one record`);
  }
  return records;
}

function splitHash(seed, platform, group) {
  return createHash('sha256')
    .update(seed)
    .update('\0')
    .update(platform)
    .update('\0')
    .update(group)
    .digest('hex');
}

function groupKey(record) {
  return `${record.platform}\0${record.group}`;
}

export function assertDisjoint(train, heldout) {
  const trainIds = new Set(train.map((record) => record.id));
  const trainGroups = new Set(train.map(groupKey));

  for (const record of heldout) {
    if (trainIds.has(record.id)) {
      throw new UserInputError(`split invariant failed: id ${JSON.stringify(record.id)} appears on both sides`);
    }
    if (trainGroups.has(groupKey(record))) {
      throw new UserInputError(
        `split invariant failed: group ${JSON.stringify(record.group)} on ${record.platform} appears on both sides`,
      );
    }
  }
}

export function splitByGroup(records, seed) {
  if (typeof seed !== 'string' || seed.trim() === '') {
    throw new UserInputError('seed must be a non-empty string');
  }

  const platformGroups = new Map();
  for (const record of records) {
    if (!platformGroups.has(record.platform)) platformGroups.set(record.platform, new Set());
    platformGroups.get(record.platform).add(record.group);
  }

  const heldoutGroups = new Set();
  const platforms = {};
  for (const platform of [...platformGroups.keys()].sort()) {
    const groups = [...platformGroups.get(platform)];
    if (groups.length < 2) {
      throw new UserInputError(
        `platform ${JSON.stringify(platform)} has ${groups.length} group; at least 2 are required for a disjoint split`,
      );
    }

    groups.sort((left, right) => {
      const byHash = splitHash(seed, platform, left).localeCompare(splitHash(seed, platform, right));
      return byHash || left.localeCompare(right);
    });

    // Twenty percent is conventional holdout coverage. Clamping preserves at least
    // one independent group for both profile derivation and evaluation.
    const heldoutCount = Math.min(
      groups.length - 1,
      Math.max(1, Math.round(groups.length * HELDOUT_FRACTION)),
    );
    for (const group of groups.slice(0, heldoutCount)) {
      heldoutGroups.add(`${platform}\0${group}`);
    }

    platforms[platform] = {
      records: records.filter((record) => record.platform === platform).length,
      groups: groups.length,
      trainGroups: groups.length - heldoutCount,
      heldoutGroups: heldoutCount,
      contexts: [...new Set(
        records.filter((record) => record.platform === platform).map((record) => record.context),
      )].sort(),
    };
  }

  const train = records.filter((record) => !heldoutGroups.has(groupKey(record)));
  const heldout = records.filter((record) => heldoutGroups.has(groupKey(record)));
  assertDisjoint(train, heldout);

  for (const [platform, counts] of Object.entries(platforms)) {
    counts.trainRecords = train.filter((record) => record.platform === platform).length;
    counts.heldoutRecords = heldout.filter((record) => record.platform === platform).length;
  }

  return { train, heldout, platforms };
}

export function serializeJsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function resolveDataHome(explicitHome) {
  const candidate = explicitHome || process.env.TONE_OF_VOICE_HOME || join(homedir(), '.config', 'tone-of-voice');
  return resolve(candidate);
}

export function confinedPath(home, ...parts) {
  const root = resolve(home);
  const target = resolve(root, ...parts);
  const fromRoot = relative(root, target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new UserInputError(`refusing path outside TONE_OF_VOICE_HOME: ${target}`);
  }
  return target;
}

async function pathExists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function assertPhysicalConfinement(home, target, { createRoot = false } = {}) {
  const lexical = confinedPath(home, relative(resolve(home), resolve(target)));
  if (createRoot) await mkdir(home, { recursive: true, mode: 0o700 });
  if (!(await pathExists(home))) {
    throw new UserInputError(`required data root not found: ${resolve(home)}`);
  }
  const physicalHome = await realpath(home);

  let existing = lexical;
  while (!(await pathExists(existing))) {
    const parent = dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  const physicalExisting = await realpath(existing);
  const fromHome = relative(physicalHome, physicalExisting);
  if (fromHome === '..' || fromHome.startsWith(`..${sep}`) || isAbsolute(fromHome)) {
    throw new UserInputError(`refusing symlink escape outside intended root: ${target}`);
  }
}

function backupStamp(now = new Date()) {
  return `${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
}

export async function backupIfPresent(home, target, stamp = backupStamp()) {
  const root = resolve(home);
  const resolvedTarget = confinedPath(root, relative(root, resolve(target)));
  await assertPhysicalConfinement(root, resolvedTarget, { createRoot: true });
  if (!(await pathExists(resolvedTarget))) return null;

  const details = await lstat(resolvedTarget);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new UserInputError(`refusing to back up non-file destination: ${resolvedTarget}`);
  }

  const backup = confinedPath(root, 'backups', stamp, relative(root, resolvedTarget));
  await assertPhysicalConfinement(root, backup, { createRoot: true });
  await mkdir(dirname(backup), { recursive: true, mode: 0o700 });
  await copyFile(resolvedTarget, backup, fsConstants.COPYFILE_EXCL);
  return backup;
}

export async function writeAtomically(
  home,
  target,
  content,
  { renameImpl = rename } = {},
) {
  const root = resolve(home);
  const resolvedTarget = confinedPath(root, relative(root, resolve(target)));
  await assertPhysicalConfinement(root, resolvedTarget, { createRoot: true });
  await mkdir(dirname(resolvedTarget), { recursive: true, mode: 0o700 });

  const temporary = join(
    dirname(resolvedTarget),
    `.${basename(resolvedTarget)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await renameImpl(temporary, resolvedTarget);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function stageWrite(home, target, content) {
  const root = resolve(home);
  const resolvedTarget = confinedPath(root, relative(root, resolve(target)));
  await assertPhysicalConfinement(root, resolvedTarget, { createRoot: true });
  await mkdir(dirname(resolvedTarget), { recursive: true, mode: 0o700 });
  const temporary = join(
    dirname(resolvedTarget),
    `.${basename(resolvedTarget)}.${process.pid}.${randomUUID()}.stage`,
  );
  await writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });

  // Verify staged bytes before any backup or destination rename. This makes an
  // incomplete disk write a pre-commit failure instead of a mixed generation.
  const stagedContent = await readFile(temporary, 'utf8');
  if (sha256(stagedContent) !== sha256(content)) {
    await rm(temporary, { force: true });
    throw new TransactionError(`staged content verification failed for ${resolvedTarget}`);
  }
  return { target: resolvedTarget, temporary };
}

async function restoreFromBackup(target, backup, rollbackRenameImpl) {
  const restoreTemporary = join(
    dirname(target),
    `.${basename(target)}.${process.pid}.${randomUUID()}.restore`,
  );
  try {
    await copyFile(backup, restoreTemporary, fsConstants.COPYFILE_EXCL);
    await rollbackRenameImpl(restoreTemporary, target);
  } finally {
    await rm(restoreTemporary, { force: true }).catch(() => {});
  }
}

export async function writeSetTransactionally(
  home,
  entries,
  {
    now = new Date(),
    renameImpl = rename,
    rollbackRenameImpl = rename,
  } = {},
) {
  if (!Array.isArray(entries) || entries.length < 2) {
    throw new UserInputError('transaction requires at least two destination entries');
  }
  const root = resolve(home);
  const names = new Set();
  const targets = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry.name !== 'string' || entry.name === '') {
      throw new UserInputError('every transaction entry requires a name');
    }
    if (names.has(entry.name)) throw new UserInputError(`duplicate transaction name ${JSON.stringify(entry.name)}`);
    names.add(entry.name);
    const target = confinedPath(root, relative(root, resolve(entry.target)));
    if (targets.has(target)) throw new UserInputError(`duplicate transaction target ${target}`);
    targets.add(target);
    if (typeof entry.content !== 'string') {
      throw new UserInputError(`transaction content for ${entry.name} must be a string`);
    }
  }

  const staged = [];
  const backups = {};
  const existed = {};
  const committed = [];
  const rollback = { restored: [], removed: [], failures: [] };

  try {
    for (const entry of entries) {
      staged.push({ entry, ...(await stageWrite(root, entry.target, entry.content)) });
    }

    const stamp = backupStamp(now);
    for (const item of staged) {
      existed[item.entry.name] = await pathExists(item.target);
      backups[item.entry.name] = await backupIfPresent(root, item.target, stamp);
    }

    for (const item of staged) {
      await renameImpl(item.temporary, item.target);
      committed.push(item);
    }
    return { backups };
  } catch (error) {
    for (const item of [...committed].reverse()) {
      try {
        if (existed[item.entry.name]) {
          await restoreFromBackup(item.target, backups[item.entry.name], rollbackRenameImpl);
          rollback.restored.push(item.entry.name);
        } else {
          await rm(item.target, { force: true });
          rollback.removed.push(item.entry.name);
        }
      } catch (rollbackError) {
        rollback.failures.push({ name: item.entry.name, message: rollbackError.message });
      }
    }
    const suffix = rollback.failures.length
      ? `; rollback failed for ${rollback.failures.map((item) => item.name).join(', ')}`
      : '; prior generation restored';
    throw new TransactionError(
      `transactional write failed: ${error.message}${suffix}`,
      { backups, rollback },
      error,
    );
  } finally {
    await Promise.all(staged.map((item) => rm(item.temporary, { force: true }).catch(() => {})));
  }
}

async function readLimited(path, maximum = MAX_INPUT_BYTES) {
  let details;
  try {
    details = await stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new UserInputError(`input file not found: ${path}`);
    }
    throw error;
  }
  if (!details.isFile()) throw new UserInputError(`input must be a regular file: ${path}`);
  if (details.size > maximum) {
    throw new UserInputError(`input exceeds ${maximum} bytes: ${path}`);
  }
  return readFile(path, 'utf8');
}

export async function buildCorpusPlan({ input, home, seed = 'v1' }) {
  if (!input) throw new UserInputError('corpus requires --input');
  const sourcePath = resolve(input);
  const dataHome = resolveDataHome(home);
  const content = await readLimited(sourcePath);
  const records = parseJsonl(content, { source: sourcePath });
  const split = splitByGroup(records, seed);
  const trainText = serializeJsonl(split.train);
  const heldoutText = serializeJsonl(split.heldout);
  const destinations = {
    train: confinedPath(dataHome, 'corpus', 'train.jsonl'),
    heldout: confinedPath(dataHome, 'corpus', 'heldout.jsonl'),
    manifest: confinedPath(dataHome, 'corpus', 'manifest.json'),
  };

  return {
    home: dataHome,
    sourcePath,
    trainText,
    heldoutText,
    destinations,
    preview: {
      kind: 'corpus',
      seed,
      source: { path: sourcePath, sha256: sha256(content), records: records.length },
      destinations,
      split: {
        algorithm: 'sha256(seed\\0platform\\0group), 20% rounded and clamped to retain one group on each side',
        trainRecords: split.train.length,
        heldoutRecords: split.heldout.length,
        platforms: split.platforms,
        trainSha256: sha256(trainText),
        heldoutSha256: sha256(heldoutText),
      },
    },
  };
}

export async function executeCorpusPlan(
  plan,
  { now = new Date(), renameImpl = rename, rollbackRenameImpl = rename } = {},
) {
  const manifest = {
    version: 1,
    createdAt: now.toISOString(),
    seed: plan.preview.seed,
    source: plan.preview.source,
    split: plan.preview.split,
  };

  const transaction = await writeSetTransactionally(plan.home, [
    { name: 'train', target: plan.destinations.train, content: plan.trainText },
    { name: 'heldout', target: plan.destinations.heldout, content: plan.heldoutText },
    {
      name: 'manifest',
      target: plan.destinations.manifest,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    },
  ], { now, renameImpl, rollbackRenameImpl });
  return { ...plan.preview, status: 'executed', backups: transaction.backups };
}

function extractSection(markdown, heading) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (start < 0) return '';
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = endOffset < 0 ? lines.length : start + 1 + endOffset;
  return lines.slice(start + 1, end).join('\n').trim();
}

export function validateProfile(markdown, { source = 'profile', heldout = [] } = {}) {
  if (typeof markdown !== 'string' || markdown.trim() === '') {
    throw new UserInputError(`${source}: profile must be non-empty Markdown`);
  }
  if (Buffer.byteLength(markdown) > MAX_PROFILE_BYTES) {
    throw new UserInputError(`${source}: profile exceeds ${MAX_PROFILE_BYTES} bytes`);
  }

  for (const heading of REQUIRED_PROFILE_HEADINGS) {
    if (!new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'm').test(markdown)) {
      throw new UserInputError(`${source}: missing required heading "## ${heading}"`);
    }
  }

  const email = markdown.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  if (email) throw new UserInputError(`${source}: possible email address must be redacted`);
  const phone = markdown.match(/(?:\+?\d[\d ()-]{8,}\d)/);
  if (phone) throw new UserInputError(`${source}: possible phone number must be redacted`);

  const excerpts = extractSection(markdown, 'Redacted excerpts')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line));
  for (const excerpt of excerpts) {
    if (excerpt.replace(/^[-*]\s+/, '').length > MAX_EXCERPT_CHARACTERS) {
      throw new UserInputError(
        `${source}: redacted excerpt exceeds ${MAX_EXCERPT_CHARACTERS} characters`,
      );
    }
  }

  for (const record of heldout) {
    if (record.text.length >= 20 && markdown.includes(record.text)) {
      throw new UserInputError(
        `${source}: profile contains complete held-out text from id ${JSON.stringify(record.id)}`,
      );
    }
  }
  return markdown;
}

export async function buildProfilePlan({ input, platform, home }) {
  if (!input) throw new UserInputError('profile requires --input');
  validatePlatform(platform, 'profile', undefined);
  const sourcePath = resolve(input);
  const dataHome = resolveDataHome(home);
  const markdown = await readLimited(sourcePath, MAX_PROFILE_BYTES);
  const heldoutPath = confinedPath(dataHome, 'corpus', 'heldout.jsonl');
  const heldout = (await pathExists(heldoutPath))
    ? parseJsonl(await readLimited(heldoutPath), { source: heldoutPath })
      .filter((record) => record.platform === platform)
    : [];
  validateProfile(markdown, { source: sourcePath, heldout });
  const destination = confinedPath(dataHome, `${platform}.md`);
  return {
    home: dataHome,
    markdown,
    destination,
    preview: {
      kind: 'profile',
      platform,
      source: { path: sourcePath, sha256: sha256(markdown) },
      destination,
      heldoutRecordsChecked: heldout.length,
      requiredHeadings: REQUIRED_PROFILE_HEADINGS,
    },
  };
}

export async function executeProfilePlan(plan, { now = new Date() } = {}) {
  const backup = await backupIfPresent(plan.home, plan.destination, backupStamp(now));
  await writeAtomically(plan.home, plan.destination, plan.markdown);
  return { ...plan.preview, status: 'executed', backup };
}

function validateStringArray(record, field, source, lineNumber, { allowEmpty = false } = {}) {
  if (!Array.isArray(record[field]) || (!allowEmpty && record[field].length === 0)) {
    const requirement = allowEmpty ? 'a string array' : 'a non-empty string array';
    throw new UserInputError(`${location(source, lineNumber)}: ${field} must be ${requirement}`);
  }
  return record[field].map((value, index) => {
    if (typeof value !== 'string' || value.trim() === '') {
      throw new UserInputError(
        `${location(source, lineNumber)}: ${field}[${index}] must be a non-empty string`,
      );
    }
    return value;
  });
}

export function validateCase(record, { source = 'cases', lineNumber } = {}) {
  if (!isPlainObject(record)) throw new UserInputError(`${location(source, lineNumber)}: expected a JSON object`);
  rejectUnknownFields(record, CASE_FIELDS, source, lineNumber);
  const id = requireString(record, 'id', source, lineNumber, { max: 128 });
  const platform = requireString(record, 'platform', source, lineNumber, { max: 64 });
  const context = requireString(record, 'context', source, lineNumber, { max: 64 });
  const scenario = requireString(record, 'scenario', source, lineNumber, { max: 4_000 });
  validateIdentifier(id, 'id', source, lineNumber);
  validatePlatform(platform, source, lineNumber);
  validateContext(context, source, lineNumber);
  return {
    id,
    platform,
    context,
    scenario,
    facts: validateStringArray(record, 'facts', source, lineNumber),
    constraints: validateStringArray(record, 'constraints', source, lineNumber, { allowEmpty: true }),
  };
}

export function validateReference(record, { source = 'references', lineNumber } = {}) {
  if (!isPlainObject(record)) throw new UserInputError(`${location(source, lineNumber)}: expected a JSON object`);
  rejectUnknownFields(record, REFERENCE_FIELDS, source, lineNumber);
  const id = requireString(record, 'id', source, lineNumber, { max: 128 });
  const reference = requireString(record, 'reference', source, lineNumber, { max: MAX_TEXT_CHARACTERS });
  validateIdentifier(id, 'id', source, lineNumber);
  return { id, reference };
}

export async function buildEvalPlan({ cases, references, home }) {
  if (!cases || !references) throw new UserInputError('eval requires --cases and --references');
  const casePath = resolve(cases);
  const referencePath = resolve(references);
  const dataHome = resolveDataHome(home);
  const heldoutPath = confinedPath(dataHome, 'corpus', 'heldout.jsonl');
  await assertPhysicalConfinement(dataHome, heldoutPath);
  const heldoutContent = await readLimited(heldoutPath);
  const heldoutRecords = parseJsonl(heldoutContent, { source: heldoutPath });
  const caseRecords = parseJsonl(await readLimited(casePath), { source: casePath, validate: validateCase });
  const referenceRecords = parseJsonl(await readLimited(referencePath), {
    source: referencePath,
    validate: validateReference,
  });
  const caseIds = new Set(caseRecords.map((record) => record.id));
  const referenceIds = new Set(referenceRecords.map((record) => record.id));
  const missingReferences = [...caseIds].filter((id) => !referenceIds.has(id));
  const missingCases = [...referenceIds].filter((id) => !caseIds.has(id));
  if (missingReferences.length || missingCases.length) {
    throw new UserInputError(
      `case/reference ID mismatch; missing references: ${missingReferences.join(', ') || 'none'}; missing cases: ${missingCases.join(', ') || 'none'}`,
    );
  }

  const heldoutById = new Map(heldoutRecords.map((record) => [record.id, record]));
  const referenceById = new Map(referenceRecords.map((record) => [record.id, record]));
  for (const caseRecord of caseRecords) {
    const heldoutRecord = heldoutById.get(caseRecord.id);
    if (!heldoutRecord) {
      throw new UserInputError(
        `case ${JSON.stringify(caseRecord.id)} does not exist in corpus/heldout.jsonl`,
      );
    }
    if (caseRecord.platform !== heldoutRecord.platform || caseRecord.context !== heldoutRecord.context) {
      throw new UserInputError(
        `case ${JSON.stringify(caseRecord.id)} platform/context does not match corpus/heldout.jsonl`,
      );
    }
    if (referenceById.get(caseRecord.id).reference !== heldoutRecord.text) {
      throw new UserInputError(
        `reference ${JSON.stringify(caseRecord.id)} does not exactly match corpus/heldout.jsonl`,
      );
    }
  }

  const caseText = serializeJsonl(caseRecords);
  const referenceText = serializeJsonl(referenceRecords);
  const destinations = {
    cases: confinedPath(dataHome, 'evals', 'cases.jsonl'),
    references: confinedPath(dataHome, 'evals', 'references.jsonl'),
  };
  return {
    home: dataHome,
    caseText,
    referenceText,
    destinations,
    preview: {
      kind: 'eval',
      cases: { path: casePath, records: caseRecords.length, sha256: sha256(caseText) },
      references: { path: referencePath, records: referenceRecords.length, sha256: sha256(referenceText) },
      heldout: { path: heldoutPath, records: heldoutRecords.length, sha256: sha256(heldoutContent) },
      destinations,
      warnings: caseRecords.length < 10
        ? ['Low support: fewer than 10 held-out cases. Report observations without significance claims.']
        : [],
    },
  };
}

export async function executeEvalPlan(
  plan,
  { now = new Date(), renameImpl = rename, rollbackRenameImpl = rename } = {},
) {
  const transaction = await writeSetTransactionally(plan.home, [
    { name: 'cases', target: plan.destinations.cases, content: plan.caseText },
    { name: 'references', target: plan.destinations.references, content: plan.referenceText },
  ], { now, renameImpl, rollbackRenameImpl });
  return { ...plan.preview, status: 'executed', backups: transaction.backups };
}

function parseArguments(argv) {
  const [command = 'corpus', ...rest] = argv;
  if (!['corpus', 'profile', 'eval'].includes(command)) {
    throw new UserInputError(`unknown command ${JSON.stringify(command)}; expected corpus, profile, or eval`);
  }
  const values = { command, mode: 'dry-run', confirmWrite: false };
  const valueFlags = new Set([
    '--input', '--home', '--seed', '--mode', '--platform', '--cases', '--references',
  ]);
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === '--confirm-write') {
      values.confirmWrite = true;
      continue;
    }
    if (!valueFlags.has(flag)) throw new UserInputError(`unknown option ${JSON.stringify(flag)}`);
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new UserInputError(`${flag} requires a value`);
    index += 1;
    const key = flag.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    values[key] = value;
  }
  if (!['dry-run', 'execute'].includes(values.mode)) {
    throw new UserInputError('--mode must be dry-run or execute');
  }
  if (values.mode === 'execute' && !values.confirmWrite) {
    throw new UserInputError('execute mode requires --confirm-write after reviewing a dry run');
  }
  return values;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  let plan;
  let execute;
  if (options.command === 'corpus') {
    plan = await buildCorpusPlan(options);
    execute = executeCorpusPlan;
  } else if (options.command === 'profile') {
    plan = await buildProfilePlan(options);
    execute = executeProfilePlan;
  } else {
    plan = await buildEvalPlan(options);
    execute = executeEvalPlan;
  }

  const result = options.mode === 'execute'
    ? await execute(plan)
    : { ...plan.preview, status: 'dry-run' };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    const prefix = error instanceof UserInputError ? 'prepare-corpus' : 'prepare-corpus: unexpected error';
    process.stderr.write(`${prefix}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
