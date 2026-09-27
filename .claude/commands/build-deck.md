---
description: Capture screenshots and build both PowerPoint decks, then run the visual QA loop.
---

Follow `.claude/agents/deck-builder.md`:

1. `npm run build:offline`, then `npm run deck` (captures `deck/assets/screens/*.png`, builds `deck/out/*.pptx`). Pass `--font-safe` via $ARGUMENTS if requested.
2. Validate both files, render every slide to PNG, inspect for overflow/overlap, fix, and rebuild until clean.
3. Summarise slide counts, any placeholders still unfilled from `config/branding.json`, and the QA result.
