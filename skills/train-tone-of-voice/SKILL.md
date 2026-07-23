---
name: train-tone-of-voice
description: Trains private, platform-specific tone profiles from local writing samples with deterministic held-out splits, clean Codex or Claude Code sessions, previews, backups, and atomic writes. Use when asked to "learn my tone", "build my voice profile", "train a writing style", import writing samples, refresh a tone profile, or prepare tone-of-voice evaluation cases.
---

# Train Tone of Voice

Turn explicitly selected local writing into a private profile and uncontaminated evaluation set.

- **IS:** the only tone-of-voice workflow that creates corpus files, profiles, cases, or references.
- **IS NOT:** a live connector, scraper, drafting skill, evaluator, continuous learner, or hosted data service. Use `tone-of-voice` to draft and `evaluate-tone-of-voice` to evaluate.

## Reference files

| File | Read when |
|---|---|
| [references/corpus-contract.md](references/corpus-contract.md) | Always, before normalizing or validating samples. |
| [references/training-method.md](references/training-method.md) | Always, before splitting, invoking a model, or replacing a profile. |
| [assets/profile-template.md](assets/profile-template.md) | The runner reads this during profile generation; read it when reviewing profile output. |

## Workflow

Copy and tick this checklist as work progresses:

```text
Training progress:
- [ ] Confirm private data root, platform mapping, and explicit source files
- [ ] Normalize only the user's authored text to strict JSONL
- [ ] Preview the validated conversation-level split
- [ ] Confirm and write train/heldout corpus files
- [ ] Preview provider transmission for each profile
- [ ] Confirm and generate each profile from train only
- [ ] Validate, preview, back up, and install each profile
- [ ] Generate held-out cases one record at a time
- [ ] Validate, preview, back up, and install cases/references
- [ ] Verify manifests, disjointness, and output paths
```

### 1. Establish the boundary

Resolve the data root from non-empty `TONE_OF_VOICE_HOME`, otherwise use `~/.config/tone-of-voice`. Ask for explicit source paths and a platform for each source. Do not search mailboxes, chats, home directories, or cloud services.

Resolve the absolute directory containing this `SKILL.md` once as the task-specific shell variable `TRAIN_TONE_SKILL_DIR`. Invoke bundled scripts through that directory so the workflow works from an individual skill install or a repository checkout.

Explain before model use: source files remain on disk, but the writing included in a generation prompt is sent by the selected local CLI to its model provider. The repository adds no telemetry or network client.

Codex disables shell, apps, multi-agent, image generation, web search, and ambient skill instructions. It still registers `update_plan`, `request_user_input`, `apply_patch`, and `view_image`. Read-only mode blocks patch writes, the prompt prohibits every tool and local-file read, and local image paths are rejected before generation. Claude Code runs with no tools.

### 2. Normalize samples

Read [references/corpus-contract.md](references/corpus-contract.md). Interpret the selected export format and create one normalized JSONL staging file. Include only the six allowed fields. Exclude received messages, forwards, signatures, bot output, generated text, secrets, local image paths, and messages the user did not author.

The agent interprets exports; do not invent a connector or parser framework. Ask when authorship or conversation grouping is ambiguous.

### 3. Prepare the corpus

Execute the deterministic script, do not reproduce its validation or split logic:

```bash
node "$TRAIN_TONE_SKILL_DIR/scripts/prepare-corpus.mjs" corpus \
  --input /explicit/path/normalized.jsonl --seed v1 --mode dry-run
```

Show the preview and stop on every validation error. After the user confirms the destinations and split counts, execute:

```bash
node "$TRAIN_TONE_SKILL_DIR/scripts/prepare-corpus.mjs" corpus \
  --input /explicit/path/normalized.jsonl --seed v1 \
  --mode execute --confirm-write
```

### 4. Generate and install profiles

Read [references/training-method.md](references/training-method.md). For each platform, preview the exact local files and provider boundary:

```bash
node "$TRAIN_TONE_SKILL_DIR/scripts/run-agent.mjs" profile \
  --platform slack --runner codex --mode dry-run
```

After explicit confirmation, repeat with `--mode execute --confirm-send`. The command mechanically reads only `corpus/train.jsonl` and the bundled template. It has no option for a held-out input path.

The preview records the capability policy. It must list the Codex residual capabilities above instead of claiming `tools: false`. All samples and templates are encoded into one JSON payload, followed by an explicit prohibition on tool calls and local-file reads.

Write only `result.profile` from the command output to a temporary Markdown file. Validate and preview installation, then ask before replacement:

```bash
node "$TRAIN_TONE_SKILL_DIR/scripts/prepare-corpus.mjs" profile \
  --input /path/to/generated-profile.md --platform slack --mode dry-run
node "$TRAIN_TONE_SKILL_DIR/scripts/prepare-corpus.mjs" profile \
  --input /path/to/generated-profile.md --platform slack \
  --mode execute --confirm-write
```

### 5. Prepare held-out evaluation cases

List IDs in `corpus/heldout.jsonl`. Run one clean case-generation session per selected ID, previewing once before the first provider call:

```bash
node "$TRAIN_TONE_SKILL_DIR/scripts/run-agent.mjs" case \
  --id fictional-slack-8 --runner claude --mode dry-run
node "$TRAIN_TONE_SKILL_DIR/scripts/run-agent.mjs" case \
  --id fictional-slack-8 --runner claude --mode execute --confirm-send
```

Append `result.case` to staging `cases.jsonl`. Append `result.reference` to a separate staging `references.jsonl`. Never place `reference` in a case. Fewer than ten cases is allowed but must be reported as low support.

Validate and install the pair together:

```bash
node "$TRAIN_TONE_SKILL_DIR/scripts/prepare-corpus.mjs" eval \
  --cases /path/to/cases.jsonl --references /path/to/references.jsonl \
  --mode dry-run
node "$TRAIN_TONE_SKILL_DIR/scripts/prepare-corpus.mjs" eval \
  --cases /path/to/cases.jsonl --references /path/to/references.jsonl \
  --mode execute --confirm-write
```

### 6. Verify

Require successful JSON output from every script. Confirm:

- `manifest.json` records the seed, source hash, algorithm, and per-platform counts.
- No `(platform, group)` pair or ID occurs in both corpus files.
- Profile generation lists `train.jsonl` and the template as the only files sent.
- Every replaced file has a timestamped backup path in the execution result.
- Case and reference ID sets match, while their content remains physically separate.

## Gotchas

- Never derive a profile before the split. A later split cannot undo held-out contamination.
- Never pass `heldout.jsonl` to the `profile` command. The command deliberately has no such flag.
- Do not use `claude --bare`; it bypasses subscription authentication. The adapter uses print mode, safe mode, no persistence, and no tools.
- Do not accept a Claude result unless it is a successful result wrapper with `structured_output`. Error wrappers and unstructured result text fail closed.
- Do not invoke either runner through a shell string. `run-agent.mjs` uses argument arrays and standard input so sample text cannot become shell syntax.
- Never remove Codex's `--disable shell_tool` or `-c skills.include_instructions=false`; read-only mode alone permits private reads and ambient skill descriptions can contaminate training.
- Codex retains `update_plan`, `request_user_input`, `apply_patch`, and `view_image`. Do not claim all tools are disabled. Keep the post-data no-tool instruction and local image-path rejection.
- Do not install generated Markdown directly. The `profile` command validates headings, obvious personal identifiers, held-out copying, confinement, backup, and atomic replacement.
- Do not treat fewer than ten held-out cases as proof. Report observations and collect more independent writing.

## Anti-rationalizations

| Excuse | Rebuttal |
|---|---|
| "I already have a profile, so the old corpus is fine." | Use it for drafting only. Rebuild from a pre-split corpus before claiming an unbiased evaluation. |
| "The sample is harmless, so preview is unnecessary." | Preview is also the provider-transmission and destination check. Run it every time. |
| "A message is almost certainly mine." | Ambiguous authorship contaminates the profile. Ask or exclude it. |
| "One combined eval file is easier." | The physical cases/references split is what keeps real answers away from candidate generation. |

## Related skills

- `tone-of-voice` drafts or rewrites with an installed profile.
- `evaluate-tone-of-voice` runs blind baseline-versus-profile evaluation without modifying training data.
