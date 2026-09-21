# Docs

Read when writing, rewriting, or auditing technical documentation: docs sites, API references, tutorials, how-to guides, explanations, and the prose of an existing README. For a README from scratch or a full rewrite, SKILL.md routes to the README reference instead. A `docs` profile under the data root, when one exists, sets register, spelling, and house conventions and wins over the defaults here.

## Contents

- [Classify first](#classify-first)
- [What applies where](#what-applies-where)
- [Write against this](#write-against-this)
- [Writing](#writing)
- [Auditing](#auditing)
- [Gotchas](#gotchas)

## Classify first

Doc type gates which checks apply, so classify every file before writing or auditing. Diataxis compass: does the page serve **action** (doing) or **cognition** (understanding), and is the reader **acquiring** a skill or **applying** one?

| | Acquisition (learning) | Application (working) |
|---|---|---|
| **Action** | Tutorial: a lesson, "we" voice, reliable result, no options | How-to: a task for a competent reader, no teaching |
| **Cognition** | Explanation: "About X", context and alternatives | Reference: neutral description mirroring the product's structure |

One type per file. A page that answers differently for different sections is mixed: split it and link between the parts. Classify by the reader's task, not the filename; a README can orient or reference, a getting-started page can be a tutorial or a how-to.

## What applies where

| Check | Applies to |
|---|---|
| Quick start early (the fewest steps that produce visible output) | Getting-started pages, READMEs |
| "Next steps" linking what the reader most likely needs next; numbered imperative procedures | Tutorials, how-to guides |
| Same operation in the 2-3 most used languages plus `curl` | Reference and how-to pages for a multi-SDK API |
| Request and response examples beside each entry | API reference |
| Experimental and planned labels | Reference and how-to pages for unstable or unshipped features |
| `llms.txt` index and a Markdown variant of every page | Docs sites, not a single README |

Everything else applies to every type. Tutorials get the "we" allowance; reference pages get the signature-block allowance below.

## Write against this

**Voice.** Active voice, present tense, actor before action. Second person; "the user" is someone other than the reader; "we" only for the authoring organisation or a tutorial's tutor voice. Common contractions. Professional, not promotional: no superlatives, no "simply", no "easy". Lead with what the reader can do, not what the product does. Software does not think, want, or try; it returns, rejects, stores. Define a necessary term on first use. "Must" for a requirement, "should" only for a recommendation; no "please" in instructions.

**Structure.** Bottom line up front: what the page covers and what the reader can do afterwards, backstory to the end or to an explanation page. Conditions before instructions: where to be and what to have, then the action. One topic per section, summarisable in a sentence. Every section earns its place: a summary that repeats the intro, an Overview that lists the headings below it, an empty Prerequisites heading are padding; cut them rather than fill them. Follow a heading with an orienting sentence only when the heading alone does not say what the section covers or when it applies; a heading that names a list is enough, and a reference entry followed by its signature or parameter table is the standard shape. Steps start with an imperative verb, one action each, numbered when sequential.

**Clarity.** Plain words: use, start, help. Cut filler: very, really, just, basically, actually, in order to. Be specific with a measured number when you have one; otherwise cut the adjective. Never invent a figure, a latency, or a time-to-complete. Standard US English for a global audience unless the profile says otherwise; no idioms or sports metaphors. Paragraphs of a few sentences; a one-sentence paragraph is fine for emphasis. One idea per sentence: a sentence over 25 words with two "and"s is a candidate to split, not a failure by length. Serial comma. Write out Latin abbreviations. Verbs, not nominalisations ("decide", not "make a decision").

**Code.** Every concept, function, or endpoint gets a complete example: imports, expected output in a comment, a language tag on the fence. Comments explain why, not what. Tutorials are mostly prose with short code steps; references are signature, table, request, response with prose only where a value needs qualifying. Show the key function first, then where it fits. Break complex operations into named functions so the top level reads like pseudocode. Example values come from the product's domain (`subscriptionId`, `orderTotal`), never `foo`, `bar`, `data`. Placeholders are `UPPER_SNAKE_CASE`, explained once under "Replace the following". Credentials use the provider's test prefix (`sk_test_...`) or a placeholder; a live-looking key gets pasted into production and tripped by secret scanners. Errors documented as the message the reader sees, the cause, and the fix.

**Format.** Sentence case headings. Bold for UI elements the reader clicks; code font for filenames, commands, parameters. Link text names the destination; never "click here". Alt text describes what the image shows. Lowercase hyphenated filenames. US punctuation inside closing quotes, code font for strings where punctuation matters. Markdown syntax, not raw HTML, so headings get anchors and code gets a copy button.

**Navigation.** Every doc linked from at least one other. Link to the existing explanation instead of re-explaining. Relative paths for internal links. Headings use the words readers search for; "Common issues" and "More info" match no query. Summary for quick readers with links to depth. Opening context (parent or prerequisite) only where the site renders no breadcrumb or the page depends on an earlier one.

**Hygiene.** Delete docs for removed features; update when behaviour changes; a migration's old behaviour goes in a collapsed `<details>` block. Docs live in `docs/` or the project's equivalent, by type. No status reports, meeting notes, or dated plans. An experimental feature gets a callout after the intro. A page written ahead of the code is marked `[PLANNED]`, future tense, linked to its issue, unmarked in the PR that ships it. Freshness comes from the build (VCS date or `applies_to: v3.2+`), never a hand-typed date.

**Review.** A fresh reader follows the page from scratch; note where they stall. Read aloud, cut what makes you stumble, then check what the cut lost and stop when a cut removes a fact or a step. Verify against the implementation: run every example, check parameter names and defaults. Links resolve. Docs change in the same PR as the code, with prose lint (Vale, markdownlint, a link checker) in CI; findings a tool reports are not findings for a human to repeat.

## Writing

Pick one type per file, name the audience and what they can do afterwards, then write the page against the checks above and the type-gated ones that apply. A doc ships when its examples ran and its links resolved, not when it reads well: run them and quote the output. Length follows what the reader has to do; drop a section the page does not need rather than filling it.

## Auditing

Scope to changed files unless a full sweep was requested. Classify each file, then run the checks above in priority order (voice and structure first, then clarity and code, then the rest), skipping what the type gates exclude. Report grouped by file, ordered by severity within each; every finding names the check, states the issue, and proposes the fix, with `file:line` when available; list clean files as pass. No praise. "Improve" or "fix" means apply the fixes and return the page; "review" or "audit" means report. After applying fixes, rerun the checks that produced findings.

```markdown
## Documentation audit

### path/to/file.md
- [voice] Passive voice obscures who performs the action. Fix: "The server loads the configuration."

### path/to/clean-file.md
- pass
```

## Gotchas

- Misclassification is the top false positive. A missing quick start on an explanation page, or a Next steps section demanded of a reference page, is a finding against Diataxis, not for it.
- "Should" is not a bug. Flag it only where the sentence states a requirement; flagging every "should" produces a wall of false positives.
- A Correct example that quantifies a claim with a number the source never gave teaches the reader to invent benchmarks. Carry a number from the input or cut the claim.
- A hand-typed "Last updated" that nobody maintains reads as abandoned and is worse than no date.
- A "This guide is part of the X series" opener on every page of a docs site duplicates the sidebar.
- Don't rewrite content you were asked to review. Don't audit unchanged files unless a full sweep was requested; unscoped findings drown the real ones.
