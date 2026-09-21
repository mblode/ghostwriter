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

Ask your agent for something:

> Use ghostwriter to draft a Slack reply saying I agree and can review the PR tomorrow.

It works with no profile: plain prose, the machine tells stripped. Then make it yours:

> Here are ten Slack messages I wrote. Write my slack profile.

It writes `~/.config/ghostwriter/slack.md` from them, and the next draft sounds like you. Add a `soul.md` the same way for what is constant across platforms, and any other `<platform>.md` you write on: email, linkedin, linear, github, blog, readme.

## Skills

| Skill | What it does |
| --- | --- |
| [ghostwriter](./skills/ghostwriter/SKILL.md) | Writes, rewrites, and critiques as you (from your platform profiles) or as a company (from a brand manifest), covering messages, posts, PRs, tickets, PRDs, slides, copy, docs, and READMEs, and strips the tells that mark prose as AI. |
| [train-ghostwriter](./skills/train-ghostwriter/SKILL.md) | Builds evaluable profiles from full Slack, email, or WhatsApp exports, with held-out cases. |
| [evaluate-ghostwriter](./skills/evaluate-ghostwriter/SKILL.md) | Runs blind comparisons to see whether a profile actually helps. |

## Make it yours

`soul.md` holds your cross-platform core and each `<platform>.md` holds one platform's register. A missing platform falls back to your nearest one. For a profile built from a full export with held-out cases you can score, run `train-ghostwriter`.

For a company, add `brands/<slug>/brand.json` pointing at its brand, voice, and glossary documents, then ask for copy "for <slug>". Personal profiles are never used as a company voice.

## Private data

Everything lives under `GHOSTWRITER_HOME`, which defaults to `~/.config/ghostwriter`: `soul.md`, your platform profiles, `brands/`, plus `corpus/`, `evals/`, and `backups/`. The bundled scripts make no network requests. Codex or Claude Code still sends any prompt you generate to its own model provider.

## License

MIT

---

Crafted by [<img src="https://blode.co/avatar-circle.png" width="20" align="top" />](https://blode.co) [Matthew Blode](https://blode.co)
