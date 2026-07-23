---
name: evaluate-tone-of-voice
description: Runs blind, human-labeled baseline-versus-profile evaluations through a locally authenticated Codex or Claude Code CLI. Measures whether the exact tone-of-voice skill and private platform profiles improve resemblance to held-out writing. Use when asked to "evaluate my tone", "test my voice profile", compare writing with and without a tone skill, review blind A/B candidates, or report tone evaluation results.
---

# Evaluate tone of voice

Measure a fixed runtime skill and fixed private profiles against real held-out writing.

- **IS:** clean candidate generation, deterministic blinding, human review, and descriptive reporting.
- **IS NOT:** training profiles, modifying corpora, grading with another model, or exposing the treatment before a human choice. Use `train-tone-of-voice` to create profiles and held-out cases.

The scripts execute the deterministic parts of this workflow. Do not reproduce their logic manually. `scripts/run-eval.ts` generates candidates without opening references. `scripts/review-eval.ts` joins references only after generation and records human choices. The scripts use [assets/candidate-output.schema.json](assets/candidate-output.schema.json) for structured runner output; do not edit it per run.

Both branches of a pair get the same CLI, model, case bytes, and output contract in fresh non-persistent sessions. The treatment alone also receives the complete runtime `SKILL.md` and platform profile, encoded losslessly as JSON strings. Never summarize or selectively copy either file; `manifest.json` pins hashes of their original bytes.

## 1. Pin inputs and runner

Resolve these paths explicitly:

- `evals/cases.jsonl`, containing no held-out responses
- the exact installed `tone-of-voice/SKILL.md`
- the private profile directory
- `evals/runs`
- one runner (`codex` or `claude`) and an explicit model

Keep `evals/references.jsonl` separate. Do not pass it, quote it, or read it while generating candidates. Validate the contracts in the reference before invoking a model.

Cases, profiles, and the runtime skill must not contain absolute or traversal-based local image paths. The evaluator rejects them because Codex retains a residual `view_image` tool even after its generation-capable tools are disabled.

Existing profiles with unknown training provenance are useful for drafting, but they do not support an unbiased claim against examples they may have seen.

## 2. Preview the provider boundary

Tell the user exactly what will happen before the first model call:

- Cases, facts, and constraints are sent to the selected model provider twice.
- The treatment also sends the exact runtime skill and selected private profile.
- Real held-out responses are not sent during candidate generation.
- The repository adds no telemetry or direct API request, but the local agent CLI still contacts its provider.

Get confirmation. Do not print private profile content as part of the preview.

## 3. Generate matched pairs

Run from this skill directory:

```bash
node scripts/run-eval.ts \
  --cases <tone-home>/evals/cases.jsonl \
  --runtime-skill <installed-tone-of-voice>/SKILL.md \
  --profiles-dir <tone-home> \
  --runs-dir <tone-home>/evals/runs \
  --runner codex \
  --model <model>
```

Use `--runner claude` for Claude Code. The user may set `TONE_OF_VOICE_HOME`; otherwise `<tone-home>` is `~/.config/tone-of-voice`.

The command prints the new run directory. On failure, preserve that directory and rerun the same command with its `--run-id` plus `--resume`. Resume is rejected if inputs, runner policy, or stored candidate metadata changed.

## 4. Review blind

Do not open `manifest.json` or `candidates.jsonl` before choices are complete. They contain branch identity. Run:

```bash
node scripts/review-eval.ts \
  --run-dir <run-directory> \
  --references <tone-home>/evals/references.jsonl
```

For each case, choose `a`, `b`, `tie`, or `invalid`. Judge which candidate sounds more like the real held-out response while preserving all required facts. Use `tie` when both are comparably close and factually valid, and `invalid` when the case, reference, or both candidates make a fair comparison impossible. Do not label on polish alone: a fluent candidate that alters a required fact loses. Labels are saved after every choice, and the blind and reference file hashes are pinned when review begins.

For an externally completed blind review, provide a JSONL choices file through `--labels-file`. It must contain only `id` and `choice`.

## 5. Verify and preserve

Confirm:

- `labels.jsonl` has one record per blind case.
- Overall and per-platform report counts reconcile with those labels.
- Invalid labels are separate from valid win/tie rates.
- The report contains raw observations only, with no automated quality claim.

Keep the immutable run as evidence. Start a new run after changing any skill, profile, case, runner, or model. Inspect every treatment loss and invalid case and group recurring causes before changing anything.

## Gotchas

- Never add `--references` to `run-eval.ts`; the option is intentionally unsupported so held-out answers cannot enter candidate prompts.
- Never weaken Codex's flag set. `--disable shell_tool` matters because a read-only sandbox blocks writes but still allows private file reads; the apps, multi-agent, image-generation and web-search disables each close an uncontrolled generation path; and `-c skills.include_instructions=false` matters because `--ignore-user-config` alone still exposes globally installed skill descriptions and can contaminate the baseline.
- Codex still registers `update_plan`, `request_user_input`, `apply_patch`, and `view_image`. Read-only mode blocks `apply_patch`; prompt rules prohibit all tools; local image-path rejection limits `view_image` reads.
- Never open `manifest.json` before labeling, and never edit references, blind candidates, mappings, or stored labels after review begins. `blindMapping` identifies the treatment, and pinned hashes make an altered run fail closed.
- Leave `--seed` unset for real reviews; the script creates a private random seed so the public assignment algorithm does not reveal A/B.
- Never compare runs that changed both the profile and model; the result cannot isolate the profile's effect.
- Never regenerate successful branches during resume; the script preserves them so retries do not silently change the pair.
- Never treat a small win rate as proof.
