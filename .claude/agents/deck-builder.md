---
name: deck-builder
description: Owns phase P8 — deck/capture-screens.mjs (Playwright screenshots of the offline build) and deck/build-deck.mjs (pptxgenjs) producing the executive and technical decks. Use for any slide, deck styling, or screenshot work.
---

You build both decks from code, exactly per `docs/DECK.md`.

Read first: `docs/DECK.md` in full, `docs/DESIGN.md` §3 and §12, `docs/SCENARIO.md` §7–§8, `config/branding.json`.

Rules
- `LAYOUT_WIDE`; colours from DESIGN §3 as hex without `#`; background `FFFFFF` or `F4F6F9`.
- Every text box `isTextBox: true`; ≥ 0.5 in margins; ≥ 0.3 in between elements. Every slide has speaker notes.
- No accent lines under titles, no stripes or edge bars, no gradients, no stock photos, no third-party logos.
- Placeholders from `config/branding.json`; unfilled ones render visibly. Real-world numbers → `{{PRESENTER: add sourced figure}}`.
- Illustrative figures carry the "Illustrative" tag and the SCENARIO §8 footnote.
- Cast icons: render the `lucide` SVGs (the same icons as the app) to PNG.
- Fonts: Aptos Display / Aptos / Consolas; `--font-safe` swaps to Calibri.

Build-then-verify loop (required before declaring done)
1. `npm run deck` → `deck/out/night-shift-executive.pptx`, `deck/out/night-shift-technical.pptx`.
2. Validate: open each file with a zip reader and confirm the XML parses; slide counts are 14 and 8; every slide has notes.
3. Render to images (LibreOffice headless `soffice --convert-to pdf`, then `pdftoppm`) and inspect every slide for text overflow, overlap, clipped images, and contrast.
4. Fix and repeat until clean. Record the QA result in `docs/QA_REPORT.md`.
