# Repository instructions

One installable Agent Skill, `skills/ghostwriter`, and nothing to build. Keep it local-first, dependency-free, and safe for personal writing data.

- Read `SKILL.md` and every reference the change touches before editing. Every reference and `evals/evals.json` must be named in `SKILL.md`; nothing else in the folder loads.
- Keep tone rules in private profiles under `GHOSTWRITER_HOME`. Runtime instructions never hard-code one person's or one company's habits, and the repository never holds a real profile, sample, or excerpt.
- No em dashes anywhere. Commas, colons, full stops, or parentheses.
- Before declaring a change complete: `agentskills validate skills/ghostwriter` (install with `pip install skills-ref`), and `perl -CSD -ne 'print "$ARGV:$.: $_" if /\x{2014}/' $(git ls-files '*.md')` prints nothing. When agent-skills is checked out alongside, `../agent-skills/skills/agent-skills-creator/scripts/validate.sh skills/ghostwriter` is the house check.
- `evals/evals.json` holds authored scenarios, not executed evidence. Do not claim behaviour changed from a static edit.
