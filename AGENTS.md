# Repository instructions

Three independently installable Agent Skills. Keep the repository local-first, dependency-free at runtime, and safe for personal writing data.

## Before editing

- Read the nearest SKILL.md and every reference needed for the change.
- Keep each skill self-contained. A skill must not reference files outside its own directory at runtime.
- Use fictional fixtures only. Never copy a personal profile, export, held-out response, credential, or eval run into Git.
- Preserve the boundary between cases.jsonl and references.jsonl.

## Implementation

- Scripts are TypeScript run directly by Node's type stripping, so keep every file to erasable syntax (no enums, namespaces, or parameter properties).
- Use Node.js standard-library modules. Do not add a runtime dependency for work the standard library handles clearly.
- Spawn local agents with argument arrays and stdin, never through an interpolated shell command.
- Keep deterministic data work in scripts and language judgment in the invoking agent.
- Use plan, validate, execute for profile replacement and other multi-file writes.
- Keep tone rules in private profiles. Runtime instructions must not hard-code one person's stylistic habits.
- Persistent user data belongs under GHOSTWRITER_HOME, never inside an installed skill.

## Verification

Before declaring a change complete:

    npm test
    uvx --from skills-ref agentskills validate skills/ghostwriter
    uvx --from skills-ref agentskills validate skills/train-ghostwriter
    uvx --from skills-ref agentskills validate skills/evaluate-ghostwriter

Model-backed smoke tests are opt-in. CI and ordinary unit tests must use fictional fixtures and stub executables.
