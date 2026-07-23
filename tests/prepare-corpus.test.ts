import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename as renameFile, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  TransactionError,
  assertDisjoint,
  buildCorpusPlan,
  buildEvalPlan,
  buildProfilePlan,
  confinedPath,
  executeCorpusPlan,
  executeEvalPlan,
  executeProfilePlan,
  parseJsonl,
  serializeJsonl,
  splitByGroup,
  validateCase,
  validateProfile,
  writeAtomically,
  type CorpusRecord,
} from '../skills/train-ghostwriter/scripts/prepare-corpus.ts';

const fixtures = new URL('./fixtures/training/', import.meta.url);
const prepareScript = new URL('../skills/train-ghostwriter/scripts/prepare-corpus.ts', import.meta.url);

async function temporaryDirectory(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'ghostwriter-test-'));
}

async function fixture(name: string): Promise<string> {
  return readFile(new URL(name, fixtures), 'utf8');
}

function validRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'sample-1',
    platform: 'slack',
    context: 'direct-message',
    group: 'thread-a',
    text: 'A fictional message.',
    ...overrides,
  };
}

async function writeEvalHeldout(home: string): Promise<void> {
  await mkdir(join(home, 'corpus'), { recursive: true });
  await writeFile(join(home, 'corpus', 'heldout.jsonl'), serializeJsonl([
    validRecord({
      id: 'slack-5',
      context: 'group-chat',
      group: 'thread-eval',
      text: 'Small update: the paper model is ready for comments.',
    }),
    validRecord({
      id: 'email-2',
      platform: 'email',
      context: 'project-update',
      group: 'letter-eval',
      text: 'Hello,\n\nI have incorporated the notes and marked the open question.\n\nThank you.',
    }),
  ]));
}

test('strict JSONL parsing preserves allowed fields and reports source lines', async () => {
  const records = parseJsonl(await fixture('corpus-valid.jsonl'), { source: 'fictional.jsonl' });
  assert.equal(records.length, 8);
  assert.deepEqual(Object.keys(records[0]), ['id', 'platform', 'context', 'group', 'text', 'timestamp']);

  assert.throws(
    () => parseJsonl(`${JSON.stringify(validRecord())}\n{not-json}\n`, { source: 'bad.jsonl' }),
    /bad\.jsonl:2: invalid JSON/,
  );
  assert.throws(
    () => parseJsonl(`${JSON.stringify(validRecord())}\n\n`, { source: 'bad.jsonl' }),
    /bad\.jsonl:2: blank lines are not allowed/,
  );
});

test('strict corpus validation rejects dangerous or ambiguous records', () => {
  const invalidRecords: [Record<string, unknown>, RegExp][] = [
    [validRecord({ recipient: 'someone' }), /unknown field "recipient"/],
    [validRecord({ group: undefined }), /unknown field "group"|group must be a non-empty string/],
    [validRecord({ text: '   ' }), /text must be a non-empty string/],
    [validRecord({ platform: 'Discord/Guild' }), /platform must be a lowercase kebab-case slug/],
    [validRecord({ context: 'Direct Message' }), /context must be a lowercase kebab-case slug/],
    [validRecord({ timestamp: '2026-07-01' }), /timestamp must be ISO 8601 and include a timezone/],
  ];

  for (const [record, pattern] of invalidRecords) {
    assert.throws(() => parseJsonl(`${JSON.stringify(record)}\n`), pattern);
  }

  const duplicate = `${JSON.stringify(validRecord())}\n${JSON.stringify(validRecord({ text: 'Another.' }))}\n`;
  assert.throws(() => parseJsonl(duplicate), /duplicate id "sample-1"/);

  assert.equal(
    parseJsonl(`${JSON.stringify(validRecord({ platform: 'discord' }))}\n`)[0].platform,
    'discord',
  );
});

test('split is seeded, deterministic, platform-stratified, and group-disjoint', async () => {
  const records = parseJsonl(await fixture('corpus-valid.jsonl'));
  const first = splitByGroup(records, 'fixed-seed');
  const second = splitByGroup(records, 'fixed-seed');

  assert.deepEqual(first, second);
  assert.equal(first.platforms.slack.heldoutGroups, 1);
  assert.equal(first.platforms.slack.trainGroups, 4);
  assert.equal(first.platforms.email.heldoutGroups, 1);
  assert.equal(first.platforms.email.trainGroups, 1);
  assert.doesNotThrow(() => assertDisjoint(first.train, first.heldout));

  const trainGroups = new Set(first.train.map((record) => `${record.platform}:${record.group}`));
  for (const record of first.heldout) {
    assert.equal(trainGroups.has(`${record.platform}:${record.group}`), false);
  }
});

test('split blocks a platform that cannot retain one group on each side', () => {
  assert.throws(
    () => splitByGroup([validRecord() as unknown as CorpusRecord], 'seed'),
    /at least 2 are required for a disjoint split/,
  );
});

test('corpus plan is read-only until execute, then backs up and atomically writes', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const input = join(root, 'normalized.jsonl');
  await writeFile(input, await fixture('corpus-valid.jsonl'));

  const firstPlan = await buildCorpusPlan({ input, home, seed: 'fixed-seed' });
  assert.equal(firstPlan.preview.split.trainRecords + firstPlan.preview.split.heldoutRecords, 8);
  await assert.rejects(readFile(firstPlan.destinations.train), /ENOENT/);

  const firstResult = await executeCorpusPlan(firstPlan, { now: new Date('2026-07-23T00:00:00Z') });
  assert.equal(firstResult.status, 'executed');
  const train = parseJsonl(await readFile(firstPlan.destinations.train, 'utf8'));
  const heldout = parseJsonl(await readFile(firstPlan.destinations.heldout, 'utf8'));
  assert.doesNotThrow(() => assertDisjoint(train, heldout));

  await writeFile(firstPlan.destinations.train, 'previous train contents\n');
  const secondPlan = await buildCorpusPlan({ input, home, seed: 'fixed-seed' });
  const secondResult = await executeCorpusPlan(secondPlan, { now: new Date('2026-07-23T00:01:00Z') });
  assert.ok(secondResult.backups.train);
  assert.equal(await readFile(secondResult.backups.train, 'utf8'), 'previous train contents\n');
});

test('CLI dry run validates without writing and execute requires explicit confirmation', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const input = join(root, 'normalized.jsonl');
  await writeFile(input, await fixture('corpus-valid.jsonl'));
  const common = [
    prepareScript.pathname,
    'corpus',
    '--input',
    input,
    '--home',
    home,
    '--seed',
    'fixed-seed',
  ];

  const dryRun = spawnSync(process.execPath, [...common, '--mode', 'dry-run'], { encoding: 'utf8' });
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal(JSON.parse(dryRun.stdout).status, 'dry-run');
  await assert.rejects(readFile(join(home, 'corpus', 'train.jsonl')), /ENOENT/);

  const unconfirmed = spawnSync(process.execPath, [...common, '--mode', 'execute'], { encoding: 'utf8' });
  assert.equal(unconfirmed.status, 1);
  assert.match(unconfirmed.stderr, /execute mode requires --confirm-write/);
  await assert.rejects(readFile(join(home, 'corpus', 'train.jsonl')), /ENOENT/);
});

test('corpus transaction rolls back the complete prior generation when a commit rename fails', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const input = join(root, 'normalized.jsonl');
  const originalInput = await fixture('corpus-valid.jsonl');
  await writeFile(input, originalInput);
  const originalPlan = await buildCorpusPlan({ input, home, seed: 'fixed-seed' });
  await executeCorpusPlan(originalPlan, { now: new Date('2026-07-23T00:04:00Z') });
  const before = await Promise.all([
    readFile(originalPlan.destinations.train, 'utf8'),
    readFile(originalPlan.destinations.heldout, 'utf8'),
    readFile(originalPlan.destinations.manifest, 'utf8'),
  ]);

  await writeFile(input, originalInput.replace('orange folder', 'violet folder'));
  const replacementPlan = await buildCorpusPlan({ input, home, seed: 'fixed-seed' });
  let commitRenames = 0;
  let transactionError: unknown;
  try {
    await executeCorpusPlan(replacementPlan, {
      now: new Date('2026-07-23T00:05:00Z'),
      renameImpl: async (from, to) => {
        commitRenames += 1;
        if (commitRenames === 2) throw new Error('injected second commit failure');
        await renameFile(from, to);
      },
    });
    assert.fail('expected transactional commit failure');
  } catch (error) {
    transactionError = error;
  }

  assert.ok(transactionError instanceof TransactionError);
  assert.match(transactionError.message, /injected second commit failure; prior generation restored/);
  assert.ok(transactionError.details.backups?.train);
  assert.ok(transactionError.details.backups?.heldout);
  assert.deepEqual(transactionError.details.rollback?.restored, ['train']);
  assert.deepEqual(await Promise.all([
    readFile(originalPlan.destinations.train, 'utf8'),
    readFile(originalPlan.destinations.heldout, 'utf8'),
    readFile(originalPlan.destinations.manifest, 'utf8'),
  ]), before);
});

test('failed atomic rename leaves the previous destination unchanged', async () => {
  const home = await temporaryDirectory();
  const target = join(home, 'slack.md');
  await writeFile(target, 'previous profile');

  await assert.rejects(
    writeAtomically(home, target, 'replacement profile', {
      renameImpl: async () => {
        throw new Error('simulated rename failure');
      },
    }),
    /simulated rename failure/,
  );
  assert.equal(await readFile(target, 'utf8'), 'previous profile');
});

test('confined writes reject lexical and physical path escapes', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  await mkdir(home);
  assert.throws(() => confinedPath(home, '..', 'escape.jsonl'), /outside GHOSTWRITER_HOME/);

  const outside = join(root, 'outside');
  await mkdir(outside);
  await symlink(outside, join(home, 'corpus'));
  await assert.rejects(
    writeAtomically(home, join(home, 'corpus', 'train.jsonl'), 'secret'),
    /symlink escape outside intended root/,
  );
});

test('trained profiles require the contract and reject held-out copying', async () => {
  const valid = await fixture('profile-valid.md');
  assert.equal(validateProfile(valid), valid);
  assert.throws(
    () => validateProfile(valid.replace('## Provenance', '## Notes')),
    /missing required heading "## Provenance"/,
  );
  assert.throws(
    () => validateProfile(valid.replace('Warm, direct, and concise.', 'Contact writer@example.test.')),
    /possible email address must be redacted/,
  );
  assert.throws(
    () => validateProfile(valid.replace(
      '- "The garden route is clear now."',
      `- ${'x'.repeat(281)}`,
    )),
    /redacted excerpt exceeds 280 characters/,
  );
  assert.throws(
    () => validateProfile(`${valid}\nComplete held-out response is copied here.`, {
      heldout: [{ id: 'heldout-1', text: 'Complete held-out response is copied here.' }],
    }),
    /contains complete held-out text from id "heldout-1"/,
  );
});

test('profile installation validates heldout, backs up, and replaces only the platform file', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const input = join(root, 'profile.md');
  await mkdir(join(home, 'corpus'), { recursive: true });
  await writeFile(input, await fixture('profile-valid.md'));
  await writeFile(join(home, 'corpus', 'heldout.jsonl'), `${JSON.stringify(validRecord({
    id: 'heldout-1',
    group: 'heldout-a',
    text: 'A held-out phrase that does not occur in the profile.',
  }))}\n`);
  await writeFile(join(home, 'slack.md'), 'previous profile');

  const plan = await buildProfilePlan({ input, platform: 'slack', home });
  const result = await executeProfilePlan(plan, { now: new Date('2026-07-23T00:02:00Z') });
  assert.equal(await readFile(join(home, 'slack.md'), 'utf8'), await fixture('profile-valid.md'));
  assert.equal(await readFile(result.backup!, 'utf8'), 'previous profile');
});

test('eval installation enforces strict, separate, matching case and reference records', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const cases = join(root, 'cases.jsonl');
  const references = join(root, 'references.jsonl');
  await writeFile(cases, await fixture('eval-cases.jsonl'));
  await writeFile(references, await fixture('eval-references.jsonl'));
  await writeEvalHeldout(home);

  const plan = await buildEvalPlan({ cases, references, home });
  assert.equal(plan.preview.warnings.length, 1);
  await executeEvalPlan(plan, { now: new Date('2026-07-23T00:03:00Z') });
  assert.equal(await readFile(plan.destinations.cases, 'utf8'), await fixture('eval-cases.jsonl'));
  assert.equal(await readFile(plan.destinations.references, 'utf8'), await fixture('eval-references.jsonl'));

  const badCases = join(root, 'bad-cases.jsonl');
  await writeFile(badCases, serializeJsonl([{
    id: 'slack-5',
    platform: 'slack',
    context: 'group-chat',
    scenario: 'A fictional scenario.',
    facts: ['One fact'],
    constraints: ['One constraint'],
    reference: 'This must never be here.',
  }]));
  await assert.rejects(
    buildEvalPlan({ cases: badCases, references, home }),
    /unknown field "reference"/,
  );

  const mismatchedReferences = join(root, 'mismatched-references.jsonl');
  await writeFile(mismatchedReferences, '{"id":"different-id","reference":"Fictional reference."}\n');
  await assert.rejects(
    buildEvalPlan({ cases, references: mismatchedReferences, home }),
    /case\/reference ID mismatch/,
  );
});

test('eval plan requires exact heldout provenance and permits empty constraints', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const cases = join(root, 'cases.jsonl');
  const references = join(root, 'references.jsonl');
  const caseRecords = parseJsonl(await fixture('eval-cases.jsonl'), {
    validate: (record, options) => {
      const candidate = record as Record<string, unknown>;
      if (candidate.id === 'slack-5') candidate.constraints = [];
      return validateCase(candidate, options);
    },
  });
  await writeFile(cases, serializeJsonl(caseRecords));
  await writeFile(references, await fixture('eval-references.jsonl'));
  await mkdir(home, { recursive: true });

  await assert.rejects(
    buildEvalPlan({ cases, references, home }),
    /input file not found: .*corpus\/heldout\.jsonl/,
  );

  await writeEvalHeldout(home);
  const validPlan = await buildEvalPlan({ cases, references, home });
  assert.equal(JSON.parse(validPlan.caseText.split('\n')[0]).constraints.length, 0);

  const wrongReference = join(root, 'wrong-reference.jsonl');
  const referenceRecords = parseJsonl(await fixture('eval-references.jsonl'), {
    validate: (record) => record as { id: string; reference: string },
  });
  referenceRecords[0].reference = 'A different response that is not held out.';
  await writeFile(wrongReference, serializeJsonl(referenceRecords));
  await assert.rejects(
    buildEvalPlan({ cases, references: wrongReference, home }),
    /reference "slack-5" does not exactly match corpus\/heldout\.jsonl/,
  );

  const wrongContext = join(root, 'wrong-context.jsonl');
  caseRecords[0].context = 'direct-message';
  await writeFile(wrongContext, serializeJsonl(caseRecords));
  await assert.rejects(
    buildEvalPlan({ cases: wrongContext, references, home }),
    /case "slack-5" platform\/context does not match corpus\/heldout\.jsonl/,
  );
});

test('eval transaction never leaves mixed cases and references after a commit failure', async () => {
  const root = await temporaryDirectory();
  const home = join(root, 'private');
  const cases = join(root, 'cases.jsonl');
  const references = join(root, 'references.jsonl');
  await writeFile(cases, await fixture('eval-cases.jsonl'));
  await writeFile(references, await fixture('eval-references.jsonl'));
  await writeEvalHeldout(home);
  const originalPlan = await buildEvalPlan({ cases, references, home });
  await executeEvalPlan(originalPlan, { now: new Date('2026-07-23T00:06:00Z') });
  const before = await Promise.all([
    readFile(originalPlan.destinations.cases, 'utf8'),
    readFile(originalPlan.destinations.references, 'utf8'),
  ]);

  const changedCases = (await fixture('eval-cases.jsonl')).replace(
    'Share that a paper model is available for review.',
    'Tell the group that a paper model is available for review.',
  );
  await writeFile(cases, changedCases);
  const replacementPlan = await buildEvalPlan({ cases, references, home });
  let commitRenames = 0;
  await assert.rejects(
    executeEvalPlan(replacementPlan, {
      now: new Date('2026-07-23T00:07:00Z'),
      renameImpl: async (from, to) => {
        commitRenames += 1;
        if (commitRenames === 2) throw new Error('injected reference commit failure');
        await renameFile(from, to);
      },
    }),
    (error: unknown) => error instanceof TransactionError
      && Boolean(error.details.rollback?.restored.includes('cases'))
      && Boolean(error.details.backups?.references),
  );
  assert.deepEqual(await Promise.all([
    readFile(originalPlan.destinations.cases, 'utf8'),
    readFile(originalPlan.destinations.references, 'utf8'),
  ]), before);
});
