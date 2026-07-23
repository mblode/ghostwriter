# Tone of Voice

Build a private writing profile, use it when drafting, and test whether it actually sounds more like you.

This repository contains three portable Agent Skills:

- [tone-of-voice](./skills/tone-of-voice/SKILL.md) drafts and rewrites from a private platform profile.
- [train-tone-of-voice](./skills/train-tone-of-voice/SKILL.md) learns profiles from writing samples stored in local files.
- [evaluate-tone-of-voice](./skills/evaluate-tone-of-voice/SKILL.md) runs blind baseline-versus-profile comparisons and records human judgments.

The skills use an already authenticated Codex or Claude Code CLI. They do not require provider API keys, an additional hosted service, or a database.

## Install

Install all three skills globally:

    npx skills add mblode/tone-of-voice -g --agent codex claude-code -y

You can also select one skill interactively:

    npx skills add mblode/tone-of-voice

## Quick start

### 1. Train

Ask your agent:

> Use train-tone-of-voice to build a Slack profile from these local writing samples.

The trainer previews the files and record counts before sending selected content through your chosen local agent CLI. It then:

1. normalizes your authored messages;
2. splits whole conversations into training and held-out sets;
3. derives a profile from training messages only;
4. creates evaluation prompts separately from held-out reference responses; and
5. validates and backs up files before installing the profile.

The canonical normalized format is JSONL:

    {"id":"message-1","platform":"slack","context":"direct-message","group":"thread-7","text":"Thanks, I will take a look today.","timestamp":"2026-07-20T01:30:00Z"}

The skill can help transform local text, Markdown, CSV, JSON, or export files into this contract. It intentionally does not include live service connectors.

### 2. Draft

Ask your agent:

> Use tone-of-voice to draft a Slack reply. Say I agree with the direction and can review it tomorrow morning.

The runtime skill reads only the selected platform profile. If the profile is missing, it routes you to the trainer instead of inventing a persona.

### 3. Evaluate

Ask your agent:

> Use evaluate-tone-of-voice to compare the Slack profile against its held-out cases using Codex.

For each case, the evaluator runs:

- a baseline with the task only; and
- a treatment with the same task plus the exact runtime skill and profile.

Candidate order is blinded. You compare both candidates with your real held-out response and label which is closer while preserving the facts. Reports show raw wins, losses, ties, and invalid cases overall and by platform.

## Private data

Personal data lives outside this repository:

    ~/.config/tone-of-voice/
      email.md
      slack.md
      corpus/
        train.jsonl
        heldout.jsonl
        manifest.json
      evals/
        cases.jsonl
        references.jsonl
        runs/
      backups/

Set TONE_OF_VOICE_HOME to use another location.

Raw exports stay where they already are. The repository contains fictional fixtures only and does not collect telemetry.

The bundled helper scripts make no direct network requests and collect no telemetry. Installation and validation may contact their package registries. Codex or Claude Code sends the content included in a generation prompt to its configured model provider. The training skill shows that boundary before the first model-backed run.

## Honest evaluation

A profile must be created after the source corpus is split. If an existing profile may have seen the proposed held-out messages, it is still useful for drafting, but it cannot produce an unbiased held-out result.

Real reference responses are kept in a separate file. Candidate generation opens cases.jsonl only. References are joined later during human review.

Human labels are the ground truth in this project. Automated judges, embedding similarity, and statistical significance claims are intentionally outside the first release.

## Requirements

- Node.js 22 or newer for deterministic helper scripts.
- An authenticated Codex CLI or Claude Code CLI for model-backed training and evaluation.
- npx for installation through the skills CLI.

There are no runtime npm dependencies.

## Development

Run the complete deterministic test suite:

    npm test

Validate each skill against the Agent Skills specification:

    uvx --from skills-ref agentskills validate skills/tone-of-voice
    uvx --from skills-ref agentskills validate skills/train-tone-of-voice
    uvx --from skills-ref agentskills validate skills/evaluate-tone-of-voice

Tests use stub agent executables and fictional data. They do not call a model or read ~/.config/tone-of-voice.

## Scope

This project is deliberately local and small. It does not provide live Gmail, Slack, LinkedIn, WhatsApp, or Linear connectors; a web interface; hosted storage; message sending; direct model API integration; or a general-purpose agent evaluation framework.

## License

[MIT](./LICENSE)
