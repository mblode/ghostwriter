# Normalized corpus contract

The trainer accepts UTF-8 JSON Lines. Each non-empty line is one JSON object containing only the user's authored text and the metadata needed to split it safely.

## Record shape

```json
{"id":"fictional-slack-1","platform":"slack","context":"direct-message","group":"fictional-thread-a","text":"Could you send the draft by Thursday?","timestamp":"2026-07-20T03:10:00Z"}
```

| Field | Required | Contract |
|---|---:|---|
| `id` | yes | Unique stable identifier using letters, numbers, `.`, `_`, `:`, or `-`. It must not contain a person's name or raw message text. |
| `platform` | yes | Lowercase kebab-case platform slug, for example `email`, `slack`, or `discord`. |
| `context` | yes | Kebab-case situation label, for example `direct-message`, `group-chat`, `public-post`, or `issue-update`. |
| `group` | yes | Stable conversation, thread, or document identifier. Every message that could share phrasing or context must share a group. |
| `text` | yes | The user's authored message only. Preserve wording and line breaks, but remove quoted replies, signatures, secrets, and recipient metadata. |
| `timestamp` | no | ISO 8601 timestamp including a timezone. Omit it when the export does not establish one reliably. |

Unknown fields are rejected. In particular, do not add recipient, sender, email address, channel name, workspace, URL, attachment, or raw export metadata. Keep such information out of the model boundary rather than relying on a later redaction pass.

## Authorship rules

Include:

- Messages demonstrably written by the profile owner.
- Meaningfully different contexts and message shapes.
- Short and long examples in their original wording.
- Corrections written by the owner after generated suggestions, only when the final wording is demonstrably theirs.

Exclude:

- Incoming or quoted messages.
- AI-generated drafts, autocomplete, templates, bot posts, and bulk mail.
- Forwarded content, signatures, legal footers, code, logs, and attachment text.
- Secrets, credentials, one-time links, private keys, payment details, authentication codes, and local image paths.
- Messages whose authorship or group cannot be established.

## Grouping is the leakage boundary

The deterministic split operates on `(platform, group)`, never individual messages. Give related messages the same group even when an export calls them separate messages. Reused IDs across platforms are still forbidden.

Each represented platform needs at least two groups so one can remain in train and one in heldout. More varied groups produce a more credible profile than many messages from one conversation.

Confirm the owner's identity only as far as you need it to filter authored messages, and never store it in the JSONL. Assign group IDs that reveal no recipient or conversation title.

## Duplicate and boilerplate messages leak across the split

Grouping only stops leakage between conversations. The same message text pasted into two different groups (a reused announcement, a standard reply, a boilerplate footer that survived filtering) can still land one copy in train and one in heldout, so the model memorizes text that later scores as a "blind" reference. The corpus command normalizes each message (case-folded, punctuation dropped, whitespace collapsed) and fails closed when a substantial message (at least 20 normalized characters) appears in both a train group and a held-out group. Deduplicate such text or merge the affected groups before splitting. Short recurring sign-offs such as "thanks" are ignored.

## Split strategies

The corpus command splits by `(platform, group)` in one of two deterministic modes, selected with `--split`:

- `hash` (default): a seeded `sha256(seed\0platform\0group)` ordering. Reproducible from the seed and independent of time.
- `temporal`: orders each platform's groups by their most recent message timestamp and holds out the most recent groups, giving a drift-aware evaluation that scores the profile against your latest writing. Every record must carry a `timestamp`, or the command fails closed. Ties break on group id, so the split stays deterministic.

Both modes hold out the same clamped 20% of groups and record the chosen strategy in `corpus/manifest.json`.
