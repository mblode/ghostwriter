---
name: evaluate-tone-of-voice
description: Runs blind, human-labeled baseline-versus-profile evaluations through a locally authenticated Codex or Claude Code CLI. Measures whether the exact tone-of-voice skill and private platform profiles improve resemblance to held-out writing. Use when asked to "evaluate my tone", "test my voice profile", compare writing with and without a tone skill, review blind A/B candidates, or report tone evaluation results.
---

# Evaluate tone of voice

Measure a fixed runtime skill and fixed private profiles against real held-out writing.

- **IS:** clean candidate generation, deterministic blinding, human review, and descriptive reporting.
- **IS NOT:** training profiles, modifying corpora, grading with another model, or exposing the treatment before a human choice. Use `train-tone-of-voice` to create profiles and held-out cases.

## Reference

| File | Read when |
|---|---|
| [references/evaluation-method.md](references/evaluation-method.md) | Before every evaluation, to validate inputs, protect the blind, and interpret the report. |

The scripts execute the deterministic parts of this workflow. Do not reproduce their logic manually. `scripts/run-eval.mjs` generates candidates without opening references. `scripts/review-eval.mjs` joins references only after generation and records human choices. The scripts use [assets/candidate-output.schema.json](assets/candidate-output.schema.json) for structured runner output; do not edit it per run.

## Workflow

Copy and update this checklist:

```text
Evaluation progress:
- [ ] 1. Pin inputs and runner
- [ ] 2. Preview the provider boundary
- [ ] 3. Generate matched candidate pairs
- [ ] 4. Review every pair blind
- [ ] 5. Verify counts and preserve the run
```

### 1. Pin inputs and runner

Resolve these paths explicitly:

- `evals/cases.jsonl`, containing no held-out responses
- the exact installed `tone-of-voice/SKILL.md`
- the private profile directory
- `evals/runs`
- one runner (`codex` or `claude`) and an explicit model

Keep `evals/references.jsonl` separate. Do not pass it, quote it, or read it while generating candidates. Validate the contracts in the reference before invoking a model.

Cases, profiles, and the runtime skill must not contain absolute or traversal-based local image paths. The evaluator rejects them because Codex retains a residual `view_image` tool even after its generation-capable tools are disabled.

Existing profiles with unknown training provenance are useful for drafting, but they do not support an unbiased claim against examples they may have seen.

### 2. Preview the provider boundary

Tell the user exactly what will happen before the first model call:

- Cases, facts, and constraints are sent to the selected model provider twice.
- The treatment also sends the exact runtime skill and selected private profile.
- Real held-out responses are not sent during candidate generation.
- The repository adds no telemetry or direct API request, but the local agent CLI still contacts its provider.

Get confirmation. Do not print private profile content as part of the preview.

### 3. Generate matched pairs

Run from this skill directory:

```bash
node scripts/run-eval.mjs \
  --cases <tone-home>/evals/cases.jsonl \
  --runtime-skill <installed-tone-of-voice>/SKILL.md \
  --profiles-dir <tone-home> \
  --runs-dir <tone-home>/evals/runs \
  --runner codex \
  --model <model>
```

Use `--runner claude` for Claude Code. The user may set `TONE_OF_VOICE_HOME`; otherwise `<tone-home>` is `~/.config/tone-of-voice`.

The command prints the new run directory. On failure, preserve that directory and rerun the same command with its `--run-id` plus `--resume`. Resume is rejected if inputs, runner policy, or stored candidate metadata changed.

### 4. Review blind

Do not open `manifest.json` or `candidates.jsonl` before choices are complete. They contain branch identity. Run:

```bash
node scripts/review-eval.mjs \
  --run-dir <run-directory> \
  --references <tone-home>/evals/references.jsonl
```

For each case, choose `a`, `b`, `tie`, or `invalid`. Judge which candidate sounds more like the real held-out response while preserving all required facts. Use `invalid` when the case, reference, or both candidates make a fair comparison impossible. Labels are saved after every choice, and the blind and reference file hashes are pinned when review begins.

For an externally completed blind review, provide a JSONL choices file through `--labels-file`. It must contain only `id` and `choice`.

### 5. Verify and preserve

Confirm:

- `labels.jsonl` has one record per blind case.
- Overall and per-platform report counts reconcile with those labels.
- Invalid labels are separate from valid win/tie rates.
- The report contains raw observations only, with no automated quality claim.

Keep the immutable run as evidence. Start a new run after changing any skill, profile, case, runner, or model.

## Gotchas

- Never add `--references` to `run-eval.mjs`; the option is intentionally unsupported so held-out answers cannot enter candidate prompts.
- Never remove Codex's `--disable shell_tool`; a read-only sandbox blocks writes but still allows private file reads.
- Never remove Codex's apps, multi-agent, image-generation, or web-search disables; each reintroduces an uncontrolled generation path.
- Never remove Codex's `-c skills.include_instructions=false`; `--ignore-user-config` alone still exposes globally installed skill descriptions and can contaminate the baseline.
- Codex still registers `update_plan`, `request_user_input`, `apply_patch`, and `view_image`. Read-only mode blocks `apply_patch`; prompt rules prohibit all tools; local image-path rejection limits `view_image` reads.
- Never review `manifest.json` before labeling; `blindMapping` identifies the treatment and breaks the blind.
- Leave `--seed` unset for real reviews; the script creates a private random seed so the public assignment algorithm does not reveal A/B.
- Never compare runs that changed both the profile and model; the result cannot isolate the profile's effect.
- Never regenerate successful branches during resume; the script preserves them so retries do not silently change the pair.
- Never edit references, blind candidates, mappings, or stored label metadata after review begins; pinned hashes and derived labels make the run fail closed.
- Never treat a small win rate as proof. Read losses and invalid cases to find shared failure modes.
