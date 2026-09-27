# QA report

Phase checklists are appended as each phase is verified. P9 completes this report.

## P8 — Decks (2026-09-24)

Build: `npm run deck` (offline build → 10 screenshots at 1920×1080 → both decks into `deck/out/`).

| Check | Result |
|---|---|
| Executive deck builds, 14 slides per DECK §4 | Pass |
| Technical deck builds, 8 slides per DECK §5 | Pass |
| `validate.py` (schema, relationships, content types, charts), both decks | Pass |
| Every slide has speaker notes (max 69 words) | Pass |
| Outcome figures labelled "Illustrative"; outcome chart is native | Pass |
| No invented industry statistics: 4 visible `{{PRESENTER: add sourced figure / use cases}}` placeholders | Pass |
| `{{ORG_NAME}}`, `{{CLIENT_NAME}}`, `{{PRESENTER_NAME}}`, `{{DEMO_DATE}}` come from `config/branding.json` and stay visible when unfilled | Pass |
| No logos or third-party brand assets | Pass |
| Screenshots captured from the offline build with network disabled, zero page errors | Pass |
| Patterns slide (DECK §6) builds, validates, renders without overflow; examples labelled illustrative | Pass |
| Visual QA (LibreOffice render of the `--font-safe` build, every slide inspected): no overflow, overlaps, or edge collisions | Pass after one fix round (exec 3, 5, 6, 7, 12; tech 1, 3, 5) |

Caveat: the default decks use Aptos (D-063). QA renders are made with Calibri/Carlito, and text boxes carry about 10% slack. Open the decks once in PowerPoint before the meeting.
