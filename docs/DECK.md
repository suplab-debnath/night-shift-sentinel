# Decks — specification

Two PowerPoint decks are generated from code by `deck/build-deck.mjs` (pptxgenjs), using screenshots captured from the running app by `deck/capture-screens.mjs` (Playwright). Output: `deck/out/night-shift-executive.pptx` and `deck/out/night-shift-technical.pptx`.

## 1. Generation rules

- Layout `LAYOUT_WIDE` (13.333 × 7.5 in). Set before adding slides.
- Colours from DESIGN.md §3, hex **without** `#`. Background white `FFFFFF` or `F4F6F9`; never cream.
- Every `addText` uses `isTextBox: true`; margins ≥ 0.5 in from slide edges; ≥ 0.3 in between elements.
- Speaker notes via `slide.addNotes()` — every slide has notes (text below).
- Charts native (`addChart`) with title, data labels, palette colours, quiet gridlines.
- No accent lines under titles, no decorative stripes or edge bars, no gradients, no stock photos, no third-party logos.
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

---

## 4. Executive deck — "Agentic AI in action" (14 slides)

**1. Title**
- Title: "When the pager rings at 2 AM"
- Subtitle: "Agentic AI in action, with people in charge"
- Footer text: "{{ORG_NAME}} for {{CLIENT_NAME}}", presenter name, date.
- Visual: `06-recovery.png` cropped to the heartbeat line, full-bleed lower third.
- Notes: "We'll show you a team of AI agents handling a real-shaped production incident. Watch what they do, and watch where they stop and ask a human."

**2. The shift we are seeing**
- Title: "From answering questions to doing the work"
- Three columns: Chat (answers questions) → Copilot (helps a person do a task) → Agent squad (runs a workflow, uses tools, asks for approval).
- Notes: "Most organisations are between the first two. The value — and the risk — is in the third."

**3. Where this sits on the adoption curve**
- Title: "Our AI adoption journey"
- Four stages left to right: Explore, Assist, Automate, Governed autonomy. Each with one-line definition and `{{PRESENTER: add 1–2 of our live use cases}}` under it. Highlight Governed autonomy with `2F4BDB` outline.
- Notes: "This is the holistic view. Today's demo lives in the fourth stage, and it only works because the first three are in place: data access, tooling, and governance."

**4. The scenario**
- Title: "02:07. Checkout is slowing down."
- Left: short setup (Parcelo, checkout-api, SLO, a release shipped at 01:55). Right: `01-alert.png`.
- Notes: "Fictional company, realistic failure. A config change quietly shrank a database connection pool."

**5. Meet the squad**
- Title: "Seven specialists and one human"
- Grid of 8 cast tiles: coloured circle in agent hue with white icon (react-icons rendered to PNG), name, one-line role. Human tile visually separate on the right.
- Notes: "Each agent has one job and a limited set of tools. None of them can change production on their own."

**6. How the story unfolds**
- Title: "Seven acts in about four minutes"
- Horizontal timeline of acts 1–7 with story-clock times (02:07 → 02:16) and one line each.
- Notes: "Detect, fan out, diagnose, propose, approve, recover, document."

**7. Diagnosis is teamwork**
- Title: "Three clues, one root cause"
- Visual `03-evidence.png`; three callouts: pool exhausted (Log Detective), key renamed in v2.14.0 (Code Archaeologist), database healthy (Sentinel).
- Notes: "The Orchestrator doesn't guess. It waits until independent evidence agrees, and it states its confidence."

**8. People stay in charge**
- Title: "The human decides"
- Visual `05-gate.png`; right side: "What the human sees" — summary, evidence, policy results, one clear decision.
- Notes: "If the human rejects, the squad finds an alternative. If they reject again, it stops and escalates. It stops where people say stop."

**9. Governance built in, not bolted on**
- Title: "Two layers of defence"
- Left: `09-chaos.png`. Right: two stacked blocks — "Policy as code: Guardian checks every action" and "Least-privilege tools: agents can't call what they aren't granted". Plus "Every step is audited."
- Notes: "In the chaos test, an over-eager agent tries to restart the production database. Policy blocks it, and even if policy failed, the tool isn't granted."

**10. The outcome**
- Title: "Four minutes, one decision"
- Native clustered bar chart, minutes: Time to engage (5 vs 0), Time to root cause (37 vs 1.7), Time to mitigate (48 vs 4.2); series Manual `6E7A8D`, Squad `2F4BDB`; data labels on. "Illustrative" tag + footnote.
- Side stat: "Human time: 30 seconds of approval".
- Notes: "These numbers are illustrative for this scenario. In a pilot we'd baseline your own incidents first."

**11. Beyond incidents**
- Title: "The same pattern, many workflows"
- Three scenario tiles from SCENARIO.md §10: Legacy modernization squad, RFP response squad, Onboarding and access provisioning — each with cast, the human gate, and a chaos example.
- Notes: "The engine is the same: specialists, a guardian, a scribe, and a human gate. Only the tools and policies change."

**12. Choosing where to start**
- Title: "Where agents fit first"
- 2×2: x = process repeatability (low → high), y = risk of a wrong action (low → high). Place: incident triage (high repeat, medium risk, gated), RFP drafting (medium, low), code modernization (high, medium), payments changes (low, high → keep human-led).
- Notes: "Start where the work is repeatable and actions are reversible. Keep humans leading where mistakes are costly or irreversible."

**13. How it runs**
- Title: "Built on AWS, runs anywhere we demo"
- Simple diagram (shapes, not an image): Browser → CloudFront → Lambda → Amazon Bedrock (Claude); side note: "Offline mode for demos; policy engine and tools run in our code."
- Notes: "The same code runs on a laptop with no network, or live on Amazon Bedrock in your account."

**14. A pilot, not a promise**
- Title: "Proposed next step: a six-week pilot"
- Four phases: Weeks 1–2 pick one workflow and capture policies; Weeks 3–4 build on your data in shadow mode; Weeks 5–6 live with human gates; End: measure against your baseline. Label "Proposal".
- Closing line: "What would you want a squad to take off your team's plate first?"
- Notes: "Ask the question and stop talking."

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
