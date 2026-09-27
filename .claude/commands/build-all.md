---
description: Drive the Night Shift build phase by phase (P0–P9) with Definition-of-Done gates.
---

Drive the build using the phase table in `CLAUDE.md` §7.

1. Read `docs/DECISIONS.md` and `git log --oneline -20` to find the last completed phase.
2. For the next phase: re-read the docs sections that govern it, delegate to its owner agent in `.claude/agents/` (or do it inline if asked), then run its DoD commands.
3. Only when the DoD is green: commit (conventional commits, quoting the doc section implemented), push, and summarise the DoD results.
4. Stop at checkpoints after P1, P3, P6 and P8 for user review. $ARGUMENTS may name a single phase (e.g. `P4`) to run only that one.
