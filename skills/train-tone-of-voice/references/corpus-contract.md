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

## Normalization checks

Before running the script:

1. Confirm every selected file with the user.
2. Map export-specific fields to the six fields above.
3. Confirm the owner's identity only as needed to filter authored messages; do not store it in JSONL.
4. Assign group IDs that reveal no recipient or conversation title.
5. Inspect for obvious secrets and personal identifiers.
6. Save UTF-8 JSONL to an explicit staging path.

The script then checks syntax, exact fields, safe platform and context slugs, duplicate IDs, group counts, and split disjointness. Before model use, the runner also rejects absolute, home-relative, traversal-based, `file:` and Windows-drive image paths. Ordinary public image URLs remain valid text. Errors include the source line number where possible.
