# Evaluation method

## Input contracts

`cases.jsonl` and `references.jsonl` are physically separate files joined only during human review.

Each case is one JSON object per line:

```json
{"id":"slack-001","platform":"slack","context":"direct-message","scenario":"Move a catch-up to Friday","facts":["The current booking is Thursday","Friday afternoon works"],"constraints":["Ask rather than assume"]}
```

The only case fields are:

- `id`: unique non-empty identifier
- `platform`: lowercase kebab-case profile name
- `context`: non-empty situation label
- `scenario`: task description without the real response
- `facts`: non-empty array of facts that must remain true
- `constraints`: array of response constraints, which may be empty

Each reference is one JSON object per line with exactly `id` and `reference`:

```json
{"id":"slack-001","reference":"Hey, any chance we could move Thursday's catch-up to Friday arvo?"}
```

Every evaluated case needs one reference with the same ID. A case must never contain `reference`, `response`, `text`, or other ground-truth fields.

Cases, profiles, and the runtime skill may contain ordinary URLs, but not absolute or traversal-based local image paths. Codex retains `view_image` as a residual tool, so `file:` image URLs, home-relative paths, parent-directory paths, and Windows drive paths are rejected before generation.

## Matched comparison

For one case, baseline and treatment use:

- the same local CLI and explicit model
- fresh non-persistent sessions
- the same case prompt bytes and structured-output contract
- the same facts and constraints

The treatment alone also receives the complete runtime `SKILL.md` and platform profile, losslessly encoded as JSON strings so delimiter-like content remains data. Do not summarize or selectively copy either file. Hashes of their original bytes in `manifest.json` pin what was evaluated.

Codex runs ephemerally with ambient user config and rules ignored, automatic skill instructions excluded, and shell, apps, multi-agent, image generation, and web search disabled. Read-only sandboxing remains as defense in depth. Codex still registers `update_plan`, `request_user_input`, `apply_patch`, and `view_image`; these are recorded honestly in the manifest. Read-only mode blocks patch writes, local image paths are rejected, and the final prompt explicitly prohibits every tool and local-file read.

Claude Code runs in print mode, safe mode, without session persistence or tools. Its result must be a successful wrapper containing `structured_output`; error wrappers and unstructured `result` text fail closed. Both runners receive prompts on standard input and must return the same `{ "text": "..." }` shape.

## Blind review

The private run seed and case ID determine whether treatment becomes A or B. A real run gets a random seed by default; an explicit seed is for repeatable fictional tests. `blind-review.jsonl` contains neutral candidate fields and no mapping, runner metadata, prompt hashes, or branch names. `manifest.json` retains the seed and mapping for later scoring, so the reviewer must not inspect it before choosing. The first review pins hashes of the blind and reference files; later changes are rejected.

Ask one question per case:

> Which candidate sounds more like the real held-out response while preserving every required fact?

Allowed choices:

- `a` or `b`: one candidate is closer
- `tie`: both are comparably close and factually valid
- `invalid`: a fair comparison is impossible

Do not label based on polish alone. A fluent candidate that alters a required fact loses.

## Report interpretation

The report translates A/B choices into treatment win, baseline win, tie, or invalid after labeling. It presents exact counts overall and by platform.

Treatment, baseline, and tie rates use valid labels as their denominator. The invalid rate uses all reviewed cases. This keeps unusable examples visible without treating them as wins or losses.

The report is descriptive. Inspect every treatment loss and invalid case, group recurring causes, and change the shared skill or profile contract only when evidence supports it. Any change requires a new run because an old manifest pins the earlier inputs.

## Privacy boundary

The scripts make no direct network request and add no telemetry. The selected local Codex or Claude Code CLI sends candidate prompts to its model provider. Treatment prompts include private profiles. References remain local because only the human review script reads them.

Run directories contain private generated text, profile hashes, CLI metadata, labels, and reports. Store them under the private tone home, never in the public skill repository.
