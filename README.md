<div align="center">

# Ghostwriter

**Writes anything as you, or as your company, and it reads as a person wrote it**

One writing skill for messages, posts, essays, brand copy, docs, and READMEs, plus a trainer and an evaluator. Your voice stays on your machine.

</div>

## Install

```bash
npx skills add mblode/ghostwriter -g --agent codex claude-code -y
```

Runs on whichever of Codex or Claude Code you already have authenticated. No API keys, no service, no database.

## Quickstart

Copy the demo voice in:

```bash
mkdir -p ~/.config/ghostwriter
curl -o ~/.config/ghostwriter/soul.md https://raw.githubusercontent.com/mblode/ghostwriter/main/examples/soul.md
curl -o ~/.config/ghostwriter/slack.md https://raw.githubusercontent.com/mblode/ghostwriter/main/examples/slack.md
```

Then ask your agent:

> Use ghostwriter to draft a Slack reply saying I agree and can review the PR tomorrow.

The reply comes back in the demo persona's voice, Sam, with no training step first.

## Skills

| Skill | What it does |
| --- | --- |
| [ghostwriter](./skills/ghostwriter/SKILL.md) | Writes, rewrites, and critiques as you (from your platform profiles) or as a company (from a brand manifest), covering messages, posts, essays, copy, docs, and READMEs, and strips the tells that mark prose as AI. |
| [train-ghostwriter](./skills/train-ghostwriter/SKILL.md) | Builds those profiles from your own Slack, email, or WhatsApp exports. |
| [evaluate-ghostwriter](./skills/evaluate-ghostwriter/SKILL.md) | Runs blind comparisons to see whether a profile actually helps. |

## Make it yours

Swap the demo files for your own. `soul.md` holds your cross-platform core and `slack.md` holds one platform's register; add any `<platform>.md` you need, including `readme.md` or `docs.md` for house conventions. A missing platform falls back to your nearest one. Or point `train-ghostwriter` at your samples and it writes them for you.

For a company, add `brands/<slug>/brand.json` pointing at its brand, voice, and glossary documents, then ask for copy "for <slug>". Personal profiles are never used as a company voice.

## Private data

Everything lives under `GHOSTWRITER_HOME`, which defaults to `~/.config/ghostwriter`: `soul.md`, your platform profiles, `brands/`, plus `corpus/`, `evals/`, and `backups/`. The bundled scripts make no network requests. Codex or Claude Code still sends any prompt you generate to its own model provider.

## License

MIT

---

Crafted by [<img src="https://blode.co/avatar-circle.png" width="20" align="top" />](https://blode.co) [Matthew Blode](https://blode.co)
