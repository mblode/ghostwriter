# Tone of Voice

Draft messages that read as you wrote them, not as a model did.

Three portable Agent Skills:

- [tone-of-voice](./skills/tone-of-voice/SKILL.md) drafts, rewrites, and reviews from a private per-platform profile, strips the machine tells that mark prose as AI, and applies a communication-strategy layer to high-stakes messages.
- [train-tone-of-voice](./skills/train-tone-of-voice/SKILL.md) builds those profiles from your own writing samples, with a held-out split kept clean for evaluation.
- [evaluate-tone-of-voice](./skills/evaluate-tone-of-voice/SKILL.md) runs blind baseline-versus-profile comparisons so you can check whether a profile actually helps.

They run on an already authenticated Codex or Claude Code CLI. No provider API keys, hosted service, or database. Your writing stays on your machine.

## Quick start

Install all three skills globally:

    npx skills add mblode/tone-of-voice -g --agent codex claude-code -y

Copy the two demo files into your tone home so there is a voice to draft in:

    mkdir -p ~/.config/tone-of-voice
    cp examples/soul.md examples/slack.md ~/.config/tone-of-voice/

Now ask your agent to draft a Slack message:

> Use tone-of-voice to draft a Slack reply saying I agree with the direction and can review the PR tomorrow morning.

That works immediately in the fictional demo voice ("Sam"). Drafting needs nothing but the agent: no Node, no dependencies, no setup beyond the two files above.

## Make it yours

The demo files are invented. Replace them with your own voice one of two ways:

- **By hand.** Edit `~/.config/tone-of-voice/soul.md` (your cross-platform core: openers, sign-off, spelling, fingerprint words) and `~/.config/tone-of-voice/slack.md` (the register for one platform). Add `email.md`, `linkedin.md`, or any `<platform>.md` you need. `soul.md` is optional; a platform file is required to draft for that platform.
- **From real writing.** Point `train-tone-of-voice` at samples you have actually written, and it derives the profiles for you (see below).

The runtime reads only `soul.md` and the requested platform file from your tone home. If a platform profile is missing, it routes you to the trainer rather than inventing a persona.

## Train from your own writing

> Use train-tone-of-voice to build a Slack profile from these local writing samples.

The trainer works from local text, Markdown, CSV, JSON, or export files you name explicitly. There are no live connectors. It previews files and counts before anything reaches a model, normalizes your authored messages, splits whole conversations into training and held-out sets, derives a profile from the training set only, generates evaluation cases from the held-out set separately, then validates and backs up files before installing. Deriving the profile before the split is what keeps a later evaluation unbiased.

## Evaluate whether it helps

> Use evaluate-tone-of-voice to compare the Slack profile against its held-out cases using Codex.

Each held-out case runs twice: a baseline with the task only, and a treatment with the same task plus the exact runtime skill and profile. Candidate order is blinded. You compare both against your real held-out response and label which is closer while preserving the facts. Reports show raw wins, losses, ties, and invalid cases, overall and per platform. Human labels are the ground truth; the tool makes no automated quality claim.

## Private data

Personal data lives outside this repository, under `TONE_OF_VOICE_HOME` (default `~/.config/tone-of-voice`):

    soul.md               your cross-platform core (optional)
    slack.md, email.md    per-platform profiles
    corpus/               train.jsonl, heldout.jsonl, manifest.json
    evals/                cases.jsonl, references.jsonl, runs/
    backups/

Raw exports stay wherever they already are. The bundled scripts make no network requests and collect no telemetry, but Codex or Claude Code sends the content of a generation prompt to its model provider. The trainer and evaluator both show that boundary before the first model-backed run.

## License

[MIT](./LICENSE)
