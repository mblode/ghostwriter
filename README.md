# Ghostwriter

Draft messages that read as you wrote them, not as a model did. Three portable Agent Skills that run on an authenticated Codex or Claude Code CLI. No API keys, no service, no database. Your writing stays on your machine.

- [ghostwriter](./skills/ghostwriter/SKILL.md) drafts, rewrites, and reviews from a private per-platform profile you personalise, with built-in rules that strip the tells marking prose as AI.
- [train-ghostwriter](./skills/train-ghostwriter/SKILL.md) builds those profiles from your own Slack, email, or WhatsApp.
- [evaluate-ghostwriter](./skills/evaluate-ghostwriter/SKILL.md) runs blind comparisons so you can see if a profile helps.

## Quick start

Install all three, then copy the demo voice into your tone home:

    npx skills add mblode/ghostwriter -g --agent codex claude-code -y
    mkdir -p ~/.config/ghostwriter
    cp examples/soul.md examples/slack.md ~/.config/ghostwriter/

Now ask your agent:

> Use ghostwriter to draft a Slack reply saying I agree and can review the PR tomorrow.

That works right away in the demo voice ("Sam").

## Make it yours

Replace the demo files with your own: edit `soul.md` (your cross-platform core) and `slack.md` (one platform's register), adding any `<platform>.md` you need. Or point `train-ghostwriter` at your samples and it derives them. A platform file is required; `soul.md` is optional.

## Private data

Your data lives under `GHOSTWRITER_HOME` (default `~/.config/ghostwriter`): `soul.md`, per-platform profiles, plus `corpus/`, `evals/`, and `backups/`. The bundled scripts make no network requests, but Codex or Claude Code sends any generation prompt to its model provider.

## License

[MIT](./LICENSE)
