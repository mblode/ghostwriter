<div align="center">

# Ghostwriter

**Writes anything as you, or as your company, and it reads as a person wrote it**

One skill for messages, posts, PRs, tickets, PRDs, slides, copy, docs, and READMEs. Your voice stays on your machine.

</div>

## Install

```bash
npx skills add mblode/ghostwriter -g --agent codex claude-code -y
```

No API keys, no service, no build. The whole skill is [one file plus six references](./skills/ghostwriter/SKILL.md).

## Quickstart

Ask your agent for something:

> Use ghostwriter to draft a Slack reply saying I agree and can review the PR tomorrow.

It works with no profile: plain prose, the machine tells stripped. Then make it yours:

> Here are ten Slack messages I wrote. Write my slack profile.

It writes `~/.config/ghostwriter/slack.md` from them, and the next draft sounds like you.

## Make it yours

`soul.md` holds what is constant across platforms. Each `<platform>.md` holds one platform's register: `email`, `linkedin`, `linear`, `github`, `blog`, `readme`, `docs`, or any slug you write on. A company is a profile too: `donebear.md` is read when you ask for copy as Done Bear. Write any of them from pasted samples, or by hand; a missing profile falls back to your nearest one.

## Private data

Everything lives under `GHOSTWRITER_HOME`, default `~/.config/ghostwriter`. The skill has no scripts and makes no network requests; your agent still sends any prompt to its own model provider.

## License

MIT

---

Crafted by [<img src="https://blode.co/avatar-circle.png" width="20" align="top" />](https://blode.co) [Matthew Blode](https://blode.co)
