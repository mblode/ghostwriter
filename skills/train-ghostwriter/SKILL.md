---
name: train-ghostwriter
description: Trains private, platform-specific tone profiles from local writing samples with deterministic held-out splits, clean Codex or Claude Code sessions, previews, backups, and atomic writes. Use when asked to "learn my tone", "build my voice profile", "train a writing style", import writing samples, refresh a tone profile, or prepare ghostwriter evaluation cases.
---

# Train Ghostwriter

Turn explicitly selected local writing into a private profile and uncontaminated evaluation set.

- **IS:** the only ghostwriter workflow that creates corpus files, profiles, cases, or references.
- **IS NOT:** a live connector, scraper, drafting skill, evaluator, continuous learner, or hosted data service. Use `ghostwriter` to draft and `evaluate-ghostwriter` to evaluate.

## Reference files

| File | Read when |
|---|---|
| [references/corpus-contract.md](references/corpus-contract.md) | Always, before normalizing or validating samples. |
| [assets/profile-template.md](assets/profile-template.md) | The runner reads this during profile generation; read it when reviewing profile output. |

## Workflow

Copy this checklist and track progress:

- [ ] 1. Establish the data root, sources, and platforms; explain the provider boundary.
- [ ] 2. Normalize samples into one JSONL staging file per the corpus contract.
- [ ] 3. Prepare the corpus: dry-run, review the split, then execute.
- [ ] 4. Generate and install one profile per platform through a clean session.
- [ ] 5. Prepare held-out evaluation cases, one clean session per ID.
- [ ] 6. Verify every script printed successful JSON with destinations, counts, and backups.

## 1. Establish the boundary

Resolve the data root from non-empty `GHOSTWRITER_HOME`, otherwise use `~/.config/ghostwriter`. Ask for explicit source paths and a platform for each source. Do not search mailboxes, chats, home directories, or cloud services.

Resolve the absolute directory containing this `SKILL.md` once as the task-specific shell variable `TRAIN_GHOSTWRITER_DIR`. Invoke bundled scripts through that directory so the workflow works from an individual skill install or a repository checkout.

Explain before model use: source files remain on disk, but the writing included in a generation prompt is sent by the selected local CLI to its model provider. The repository adds no telemetry or network client.

Codex disables shell, apps, multi-agent, image generation, web search, and ambient skill instructions. It still registers `update_plan`, `request_user_input`, `apply_patch`, and `view_image`. Read-only mode blocks patch writes, the prompt prohibits every tool and local-file read, and local image paths are rejected before generation. Claude Code runs with no tools.

## 2. Normalize samples

Read [references/corpus-contract.md](references/corpus-contract.md). Interpret the selected export format and create one normalized JSONL staging file. Include only the six allowed fields. Exclude received messages, forwards, signatures, bot output, generated text, secrets, local image paths, and messages the user did not author.

The agent interprets exports; do not invent a connector or parser framework. Ask when authorship or conversation grouping is ambiguous.

## 3. Prepare the corpus

Execute the deterministic script, do not reproduce its validation or split logic:

```bash
node "$TRAIN_GHOSTWRITER_DIR/scripts/prepare-corpus.ts" corpus \
  --input /explicit/path/normalized.jsonl --seed v1 --mode dry-run
```

Show the preview and stop on every validation error. After the user confirms the destinations and split counts, execute:

```bash
node "$TRAIN_GHOSTWRITER_DIR/scripts/prepare-corpus.ts" corpus \
  --input /explicit/path/normalized.jsonl --seed v1 \
  --mode execute --confirm-write
```

## 4. Generate and install profiles

For each platform, preview the exact local files and provider boundary:

```bash
node "$TRAIN_GHOSTWRITER_DIR/scripts/run-agent.ts" profile \
  --platform slack --runner codex --mode dry-run
```

After explicit confirmation, repeat with `--mode execute --confirm-send`. The command mechanically reads only `corpus/train.jsonl` and the bundled template. It has no option for a held-out input path.

The preview records the capability policy. It must list the Codex residual capabilities above instead of claiming `tools: false`. All samples and templates are encoded into one JSON payload, followed by an explicit prohibition on tool calls and local-file reads.

Review the generated profile against [assets/profile-template.md](assets/profile-template.md): it must separate evidence from uncertainty, keep excerpts short and redacted, and not turn a single typo or event into a rule. The stricter headings apply only to newly trained profiles; the runtime still accepts existing free-form ones.

Write only `result.profile` from the command output to a temporary Markdown file. Validate and preview installation, then ask before replacement:

```bash
node "$TRAIN_GHOSTWRITER_DIR/scripts/prepare-corpus.ts" profile \
  --input /path/to/generated-profile.md --platform slack --mode dry-run
node "$TRAIN_GHOSTWRITER_DIR/scripts/prepare-corpus.ts" profile \
  --input /path/to/generated-profile.md --platform slack \
  --mode execute --confirm-write
```

The per-platform profiles produced here are complemented by a hand-authored `<home>/soul.md` holding the cross-platform voice core (openers, sign-off, spelling, fingerprint words, strategy leanings) that the runtime reads alongside each profile. This trainer does not generate `soul.md`; the user writes it, optionally with the agent's help. The `ghostwriter` skill owns and documents its shape.

## 5. Prepare held-out evaluation cases

List IDs in `corpus/heldout.jsonl`. Run one clean case-generation session per selected ID, previewing once before the first provider call:

```bash
node "$TRAIN_GHOSTWRITER_DIR/scripts/run-agent.ts" case \
  --id fictional-slack-8 --runner claude --mode dry-run
node "$TRAIN_GHOSTWRITER_DIR/scripts/run-agent.ts" case \
  --id fictional-slack-8 --runner claude --mode execute --confirm-send
```

Append `result.case` to staging `cases.jsonl`. Append `result.reference` to a separate staging `references.jsonl`. Never place `reference` in a case. Fewer than ten cases is allowed but must be reported as low support.

The scenario must make the writing task reproducible without revealing distinctive wording from the reference. Facts hold only what every candidate must preserve; constraints hold task requirements, never personal style rules.

Validate and install the pair together:

```bash
node "$TRAIN_GHOSTWRITER_DIR/scripts/prepare-corpus.ts" eval \
  --cases /path/to/cases.jsonl --references /path/to/references.jsonl \
  --mode dry-run
node "$TRAIN_GHOSTWRITER_DIR/scripts/prepare-corpus.ts" eval \
  --cases /path/to/cases.jsonl --references /path/to/references.jsonl \
  --mode execute --confirm-write
```

## 6. Verify

Require successful JSON output from every script, and report the destinations, counts, and backup paths it prints. The disjoint split, the narrow profile input surface, the case/reference ID match, and the backups are all enforced by the scripts, which fail closed rather than warn.

## Gotchas

- `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension ".ts"` means the local Node is older than 22.18 and cannot run these scripts. Report the version and ask the user to upgrade; nothing in this skill works around it.
- Never derive a profile before the split. A later split cannot undo held-out contamination. An existing profile of unknown provenance is fine for drafting, but it cannot produce an unbiased held-out result.
- Never pass `heldout.jsonl` to the `profile` command. The command deliberately has no such flag.
- Run the dry run every time. It is also the provider-transmission and destination check.
- Ambiguous authorship contaminates the profile. Ask or exclude the message.
- Do not use `claude --bare`; it bypasses subscription authentication. The adapter uses print mode, safe mode, no persistence, and no tools, and its result must be a successful wrapper with `structured_output` or it fails closed.
- Do not invoke either runner through a shell string. `run-agent.ts` uses argument arrays and standard input so sample text cannot become shell syntax.
- Never remove Codex's `--disable shell_tool` or `-c skills.include_instructions=false`; read-only mode alone permits private reads and ambient skill descriptions can contaminate training.
- Codex retains `update_plan`, `request_user_input`, `apply_patch`, and `view_image`. Do not claim all tools are disabled. Keep the post-data no-tool instruction and local image-path rejection.
- Do not install generated Markdown directly. The `profile` command validates headings, obvious personal identifiers, held-out copying, confinement, backup, and atomic replacement.
- Do not treat fewer than ten held-out cases as proof. Report observations and collect more independent writing.
- Never merge cases and references into one file. The physical split is what keeps real answers away from candidate generation.
