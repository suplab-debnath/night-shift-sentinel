# Decks — specification

Two PowerPoint decks are generated from code by `deck/build-deck.mjs` (pptxgenjs), using screenshots captured from the running app by `deck/capture-screens.mjs` (Playwright). Output: `deck/out/night-shift-executive.pptx` and `deck/out/night-shift-technical.pptx`.

## 1. Generation rules

- Layout `LAYOUT_WIDE` (13.333 × 7.5 in). Set before adding slides.
- Colours from DESIGN.md §3, hex **without** `#`. Background white `FFFFFF` or `F4F6F9`; never cream.
- Every `addText` uses `isTextBox: true`; margins ≥ 0.5 in from slide edges; ≥ 0.3 in between elements.
- Speaker notes via `slide.addNotes()` — every slide has notes. The executive deck's notes are taken from `docs/PRESENTER_SCRIPT.md` (spoken lines and stage directions per slide); the generator's own notes are the fallback.
- Charts native (`addChart`) with title, data labels, palette colours, quiet gridlines.
- No accent lines under titles, no decorative stripes or edge bars, no stock photos, no third-party logos. No gradient fills on shapes; the executive deck's story backgrounds (night sky, dawn) and phone frames are drawn in code by `deck/art.mjs` as seeded SVG and rasterised with `sharp` (DECISIONS D-076).
- `{{ORG_NAME}}`, `{{CLIENT_NAME}}`, `{{PRESENTER_NAME}}` come from `config/branding.json`. Unfilled values render visibly as the placeholder text so they are caught in review.
- Any slide needing a real-world number shows `{{PRESENTER: add sourced figure}}` instead of an invented statistic.
- Illustrative figures carry an "Illustrative" tag and the footnote from SCENARIO.md §8.
- After build: validate the file, render to images, and fix overflow/overlap before declaring done (see `.claude/agents/deck-builder.md`).

## 2. Deck typography
Web fonts are not guaranteed on the client machine. Decks use:
- Headings: **Aptos Display** · Body: **Aptos** · Code/tool text: **Consolas**.
- `--font-safe` flag swaps to Calibri / Calibri / Consolas for older Office installs.
- Sizes: title 40, slide title 30, subtitle 20, body 16–18, captions 12, notes plain text.

## 3. Screenshots to capture (`deck/assets/screens/`)
Captured from the offline build at 1920×1080, presenter mode on, via URL params `?speed=8&pauseAt=<beatId>&presenter=1` (the web app must support `pauseAt`).

| File | Moment |
|---|---|
| `01-alert.png` | End of Act 1: SEV-2 badge, red heartbeat line |
| `02-fanout.png` | Act 2, three packets in flight |
| `03-evidence.png` | Act 3, root-cause card just formed |
| `04-guardian.png` | Act 4, checklist complete |
| `05-gate.png` | Gate g1 open |
| `06-recovery.png` | Act 6, line green, pods 6 of 6 |
| `07-scorecard.png` | Act 7 scorecard |
| `08-split.png` | Split view |
| `09-chaos.png` | Chaos: Guardian blocked, permission toast visible |
| `10-inspector.png` | Inspector open on Fixer |
| `11-suspects.png` | Act 3, suspects pinned and ruled out (`pauseAt=a3.x05`) |

---

## 4. Executive deck — "When the pager rings at 2 AM" (20 slides)

A story in four parts, told as one night (DECISIONS D-076). Parts 1–2 are dark "night" slides with a big amber clock stamp top left; Part 3 turns light (the squad and the app screenshots); Part 4 stays light and closes on a dawn slide. Every slide has speaker notes written as the presenter's script. Manual-response slides carry "Dramatization of a typical manual response. Times are illustrative."; outcome slides carry the "Illustrative" tag and footnote.

| # | Stamp / title | Visual |
|---|---|---|
| 1 | "When the pager rings at 2 AM" / "One bad deploy. Two ways through the night." | Night sky, moon, sleeping city |
| **Part 1 · We push the code** | | |
| 2 | 01:55 "A small change ships. Every check is green." | Pipeline cards (commit, build, tests, deploy) and the Helm diff; "Nothing fails. Yet." |
| 3 | 02:04 "Traffic doubles. Checkout starts failing." | Native line chart of fixture p99 01:58–02:07, promo and timeout chips, customer phone showing "Payment failed" |
| **Part 2 · The traditional night** | | |
| 4 | 02:07 "The pager goes off." | Night sky, lock-screen phone with the page |
| 5 | 02:19 "Twelve minutes before anyone looks at the data." | Three steps from `splitView.manual` |
| 6 | 02:27 "The war room fills up." | Incident chat of seven messages; "Six people woken across six teams" |
| 7 | 02:29–02:44 "Page, wait, check, hand off. Repeat." | Hand-off map: on-call in the centre, five people around |
| 8 | 02:55 "Recovered. 48 minutes after the alert." | Timeline with the customer-impact bar; three manual stat tiles |
| **Part 3 · The same night, with a squad** | | |
| 9 | "Rewind." | Night sky; "This time a squad of AI agents is on call, and a person still decides." |
| 10 | "Seven specialists and one human" | Cast tiles, human tile apart |
| 11 | "Let's watch the squad work." | Live demo hand-off card over a faded `01-alert` |
| 12 | "What you just saw" | Storyboard: 01, 02, 11-suspects, 03, 05, 06 |
| 13 | "They investigate like engineers: suspect, check, rule out" | `11-suspects` and three suspect cards |
| 14 | "People stay in charge" | `05-gate` and `09-chaos` |
| **Part 4 · What changed** | | |
| 15 | "Same night, two timelines" | Manual lane 48 min vs squad lane 4 min, Illustrative |
| 16 | "Minutes, not most of an hour" | Native clustered bar chart (engage, root cause, mitigate); "6 → 1 People woken up", "30 s Human time" |
| 17 | "Where this sits in our AI journey" | Four stages, `{{PRESENTER: add 1–2 of our live use cases}}` |
| 18 | "Where agents fit first" | 2×2 repeatability × risk |
| 19 | "Proposed next step: a six-week pilot" | Four phases, "Proposal" tag, shadow mode line |
| 20 | "Let the squad take the first shift." / "People keep the last word." | Dawn over the same city; closing question "Where would you want a squad like this first?" |

The "Beyond incidents" material lives in the patterns slide (§6) and the architecture in the technical deck (§5).

---

## 5. Technical appendix deck (8 slides)

1. **Architecture** — component diagram from ARCHITECTURE §2 rebuilt with shapes; notes on modes.
2. **Directed autonomy** — director + agent turns; what is live (words, tool args, summaries) vs fixed (acts, gates, policy outcomes); why.
3. **Event protocol** — the event union as a two-column code block (Consolas 11) with a note: one stream for scripted and live.
4. **Agent turn lifecycle** — sequence: prompt → stream → tool loop (≤ 3) → validate → emit or fall back; timeouts and token caps.
5. **Guardrails** — policy engine table (P-01…P-08), tool permission matrix per agent, optional Bedrock Guardrail, audit trail.
6. **Security and IAM** — least-privilege Bedrock permissions, no credentials in browser, OAC, passcode, data boundaries (fixtures only).
7. **Operations and cost controls** — structured logs, per-turn metrics, reserved concurrency, token caps, budget alarm.
8. **Extending** — adding a scenario in four steps (ARCHITECTURE §13); roadmap: real integrations behind the same tool interfaces, human-in-the-loop via Teams/Slack approvals, evaluation harness.

Every technical slide has notes that a presenter can read verbatim in under 45 seconds.

## 6. Patterns slide (1 slide, `night-shift-patterns.pptx`)

A standalone slide for follow-up conversations, answering "why is this agentic, and where else does it fit?"

- Title: "Why it is agentic, and where else it fits". Subtitle contrasts automation (fixed steps), a chatbot (answers), and an agent squad (pursues a goal).
- Left: five traits, each backed by something the demo shows: starts from a goal, divides the work, uses real tools, acts within limits, adapts.
- Right: the reusable loop (Detect, Plan, Investigate, Propose, Check, Approve, Act and record; Approve is always a person), then six example workflows with trigger, specialists, and human gate.
- Footnote: the workflows are illustrative examples, not delivered case studies. Notes under 45 seconds.
