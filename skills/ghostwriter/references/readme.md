# README

Read when writing a README from scratch or rewriting one wholesale. Fixing the prose of a README that already covers the project is a docs task, which SKILL.md routes separately. A `readme` profile under the data root, when one exists, owns the register, spelling, and house markup (header block, badge style, canonical heading names, footer credit) and wins every conflict with this file. Without one, default to terse second-person imperative, no emoji, no exclamation marks, concrete numbers over adjectives.

## Contents

- [The reader](#the-reader)
- [Detect the type and where it renders](#detect-the-type-and-where-it-renders)
- [The spine](#the-spine)
- [Sections](#sections)
- [Badges](#badges)
- [Check before returning](#check-before-returning)
- [Gotchas](#gotchas)

## The reader

Someone arrived from a search result, a registry listing, or a profile page. They have about fifteen seconds and one question: is this worth my time? Every line either answers that or gets cut.

They are not a contributor. The build pipeline, workspace layout, release process, and coding standards do not help them decide, so none of it belongs here. Contributor content moves to `CONTRIBUTING.md` or `AGENTS.md`; create the destination file if it does not exist, because deleting load-bearing setup notes is worse than a long README. The README keeps at most a one-line pointer. This departs on purpose from standard-readme, which requires `## Contributing` and holds that too long beats too short.

## Detect the type and where it renders

Read the manifest (`package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`) for name, description, license, scripts, `bin`, `"private"`, and `repository`. Read the existing README if rewriting. First matching row wins:

| Type | Decisive signal |
|---|---|
| Skill bundle | `skills/` directory of `SKILL.md` files |
| Monorepo | workspace config (`turbo.json`, `pnpm-workspace.yaml`, workspaces) |
| CLI tool | `bin` field, `src/cli.*`, or a commander/yargs/clap dependency |
| Framework | plugin or middleware architecture, config API, documented extension points |
| Library | `main` or `exports` set, no `bin`, `src/index.*` entry |
| Web app | framework config (`next.config.*`, `vite.config.*`), no publish |

A monorepo is a delivery mechanism, not a README type: write for what a stranger installs or visits (a repo whose `apps/cli` publishes to npm gets a CLI README at the root), and put the workspace layout in `AGENTS.md`. If two types fit, pick how most users consume it and fold the other into one section.

Record where the file renders: a `"private": true` manifest or no registry listing means GitHub only; a published package also renders on npmjs.com, PyPI, or crates.io, which changes image URLs and earns badges.

Ask the user only what the code cannot reveal: what problem it solves, and any section to force in or leave out. If they are unreachable, state what it does from the code. Do not invent a motive or an origin story; "I built this because" is the user's to supply or leave out.

## The spine

1. **Header:** title as the display name with spaces and capitals, linked to the live site when one exists; a one-line tagline that says what it does rather than what it is and does not open with the project's own name; a second plain line only when the tagline leaves the reader unsure what they would do with it; badges when registry-listed.
2. **`## Demo`** only when a live URL or a screenshot exists. One line, then the link or image.
3. **`## Install`**: the single fastest command, copied from the manifest `name` (never the old README, which may predate a rename). One command, not a package-manager matrix. A hosted app leads with its URL instead; do not invent installation for a product used in the browser.
4. **`## Quickstart`**: the shortest complete thing that produces visible output. It keeps its full length even when that makes it the longest block, because a truncated example fails only after the reader pasted it. A skill bundle has no quickstart; invoking a skill is the agent's job.
5. Capability sections, as many as the decision needs and usually one or two; a fifth is almost always contributor content wearing a reader-facing heading.
6. **`## License`**: the bare licence name, plus the footer credit if the profile has one. A licence with real constraints keeps the sentence that explains them.

Heading names stay canonical across a set of repos: `Install`, `Quickstart`, `Demo`, `License`, sentence case throughout. `##` for sections; `###` only for genuinely parallel variants inside one section, or category groupings in a skill catalogue past about ten skills.

## Sections

Named for what the reader gets, as a plain noun phrase. Bullets take the form `- **Name:** what it does.` with a colon; a spaced hyphen reads as a stand-in for an em dash. Table cells meaning "not applicable" stay empty.

| Section | Use it for |
|---|---|
| `## What you can do` | An app or tool whose value is a set of things you do |
| `## Modes` or `## Presets` | Distinct operating modes the reader picks between |
| `## Usage` | A library with two or three patterns beyond the quickstart, simplest first |
| `## API` | A library or CLI that genuinely exports one: signature plus a line each |
| `## Options`, `## Commands` | A CLI with more than three flags or with subcommands, as a table; a pasted `--help` dump goes stale and is unreadable on mobile |
| `## Configuration`, `## Environment variables` | A config surface, or an app the reader self-hosts |
| `## Requirements` | A non-obvious runtime, OS, or hardware need, each with the reason |
| `## Notes` | The two or three awkward facts plus credit to prior art. Three one-bullet sections read as padding; one Notes section with three bullets reads as honest |
| `## Skills` or `## Packages` | A skill bundle's catalogue (one row per skill, linked to its `SKILL.md`, one clause each) or a monorepo's two to five installable things |

Every code block runs as pasted: real ports, real branch names, real values, no `foo`, `my-app`, or `your-name-here`. A `> [!NOTE]` alert earns a place only for the one fact that breaks installs; PyPI renders it as a literal `[!NOTE]`, so a Python package states the fact in prose.

## Badges

Only when the project is listed on a registry (npm, crates.io, PyPI, VS Code Marketplace, skills.sh). Two, in one style and one colour scheme so a set of repos looks like one set: version (or installs for a skill bundle) and license. A third only for a distribution channel the reader would not otherwise know exists. Never CI (renders as a permanent failure when the workflow does not fire), stars, downloads, runtime version, or "maintained". The license badge reads the repo's detected licence and renders `not identified` without a `LICENSE` file, so check the file exists. The profile sets colours and query strings; the skills.sh endpoint is `https://img.shields.io/endpoint?url=https%3A%2F%2Fwww.skills.sh%2Fapi%2Fbadge%2F{{owner}}%2F{{repo}}&label=installs`, percent-encoded once.

## Check before returning

Each command must return nothing:

```bash
grep -nE "TODO|\{\{" README.md                                        # leftover placeholders
perl -CSD -ne 'print "$.: $_" if /\x{2014}/' README.md                # em dashes
grep -nE "^## (Installation|Getting Started|Quick Start|Licence|Development|Tech Stack|Contributing)" README.md
grep -nE '(src|\]\()=?"?\.?/?\.github/assets' README.md               # relative image paths break on npm and PyPI
```

Then confirm the install line: `npm view {{name}} version` (or `cargo search`, `pip index versions`). Not done, whatever else is right: no description, no install or demo, a scaffold README left in place, a code example that cannot run, a section that only serves contributors, an install command against a package that does not exist. For a published package, say that npmjs.com and PyPI show the README from the last publish, so the page changes after the next release.

## Gotchas

- The blank lines inside `<div align="center">` and around a `<p align="center">` row are load-bearing: CommonMark treats the tag as an HTML block until the next blank line, so `# Title` directly after it renders as literal text.
- A relative image path renders on GitHub and 404s on npmjs.com and PyPI. For a published package use `https://raw.githubusercontent.com/{owner}/{repo}/main/.github/assets/...`; the file still lives in the repo. Off-repo hosts rot; commit images under `.github/assets/`.
- A dark/light logo uses `<picture>` with two `<source media="(prefers-color-scheme: ...)">` lines and an `<img>` fallback; PyPI strips `<source>`, so the fallback is the light version. The `#gh-dark-mode-only` fragments are deprecated.
- The most common rewrite failure is a published package whose README was written for its maintainer: the first heading is `## Workspaces` or the install step is `git clone`. The fix is a different reader, not trimming.
- A library README with a `git clone` getting-started, or an app README with registry badges, means the type was guessed wrong. Reclassify before editing prose.
- Rewriting several repos at once tempts you to guess install commands. Cite the manifest field each came from and paste-test one.
- A `## Features` section that restates the tagline is noise; name the section for what the reader gets so each bullet has to add a capability.
- Never ship a default scaffold README (create-next-app, create-vite); replace it wholesale.
