# Tone of Voice

Build a private writing profile, use it when drafting, and test whether it actually sounds more like you.

Three portable Agent Skills:

- [tone-of-voice](./skills/tone-of-voice/SKILL.md) drafts and rewrites from a private platform profile.
- [train-tone-of-voice](./skills/train-tone-of-voice/SKILL.md) learns profiles from writing samples stored in local files.
- [evaluate-tone-of-voice](./skills/evaluate-tone-of-voice/SKILL.md) runs blind baseline-versus-profile comparisons and records human judgments.

They use an already authenticated Codex or Claude Code CLI. No provider API keys, hosted service, or database.

## Install

Install all three skills globally:

    npx skills add mblode/tone-of-voice -g --agent codex claude-code -y

Or select one interactively:

    npx skills add mblode/tone-of-voice

## Quick start

### 1. Train

> Use train-tone-of-voice to build a Slack profile from these local writing samples.

The trainer previews files and record counts before sending anything to your chosen agent CLI. It normalizes your authored messages, splits whole conversations into training and held-out sets, derives a profile from training messages only, creates evaluation prompts separately from held-out reference responses, then validates and backs up files before installing the profile.

The normalized format is JSONL:

    {"id":"message-1","platform":"slack","context":"direct-message","group":"thread-7","text":"Thanks, I will take a look today.","timestamp":"2026-07-20T01:30:00Z"}

The skill can transform local text, Markdown, CSV, JSON, or export files into this contract. It has no live service connectors.

### 2. Draft

> Use tone-of-voice to draft a Slack reply. Say I agree with the direction and can review it tomorrow morning.

The runtime skill reads only the selected platform profile. If the profile is missing, it routes you to the trainer instead of inventing a persona.

### 3. Evaluate

> Use evaluate-tone-of-voice to compare the Slack profile against its held-out cases using Codex.

Each case runs twice: a baseline with the task only, and a treatment with the same task plus the exact runtime skill and profile. Candidate order is blinded. You compare both candidates with your real held-out response and label which is closer while preserving the facts. Reports show raw wins, losses, ties, and invalid cases, overall and by platform.

Human labels are the ground truth. A profile trained before the split is what makes a held-out result unbiased; an older profile of unknown provenance is still fine for drafting.

## Private data

Personal data lives outside this repository, under `~/.config/tone-of-voice` or `TONE_OF_VOICE_HOME`:

    email.md
    slack.md
    corpus/     train.jsonl, heldout.jsonl, manifest.json
    evals/      cases.jsonl, references.jsonl, runs/
    backups/

Raw exports stay where they already are. The bundled scripts make no network requests and collect no telemetry, but Codex or Claude Code sends the content of a generation prompt to its model provider. The training skill shows that boundary before the first model-backed run.

## Development

    npm test     # type check and run the deterministic test suite

Tests use stub agent executables and fictional fixtures. They never call a model or read `~/.config/tone-of-voice`.

Validate the skills against the Agent Skills specification:

    uvx --from skills-ref agentskills validate skills/tone-of-voice
    uvx --from skills-ref agentskills validate skills/train-tone-of-voice
    uvx --from skills-ref agentskills validate skills/evaluate-tone-of-voice

Requires Node.js 22.18 or newer, which runs the TypeScript sources directly. TypeScript is a dev dependency for type checking only; there are no runtime dependencies.

## License

[MIT](./LICENSE)
