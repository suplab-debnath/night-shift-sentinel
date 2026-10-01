# Brief — Night Shift: Agent Theater

## 1. One-line pitch
Watch a squad of AI agents detect, diagnose, and fix a 2 AM production incident in four minutes, with a human approving the fix and a guardian agent enforcing the rules.

## 2. Why this demo exists
Clients have seen chatbots. What they have not seen is AI that **works as a team, uses tools, respects policy, and hands control to a human at the right moment**. This demo shows where {{ORG_NAME}} is on the AI adoption curve: past assistance, into governed autonomy.

It must leave the audience with three beliefs:

1. **It is real work, not a chat.** Agents read metrics, search logs, inspect a deploy diff, and act.
2. **It is safe.** Policies are enforced in code, risky actions are blocked, a human approves production changes, and every step is audited.
3. **It is valuable and repeatable.** Measurable time savings, and the same pattern applies to many other workflows.

## 3. Audience
- **Primary:** client leadership (CIO, CTO, Head of Engineering or Operations, transformation leads). Non-specialist but sharp; allergic to hype.
- **Secondary:** client architects who will ask "how does it actually work?" — served by the inspector panel, live mode, and the technical appendix deck.

## 4. Setting
- Presented in person on a laptop to a projector or large screen, 1920×1080 primary. A tablet may be handed to the client for the approval moment.
- Venue Wi-Fi is assumed unreliable. **Scripted mode is the default and must be flawless offline.** Live mode is a bonus for technical audiences.
- Slot length: 6–8 minutes for the demo, 10–15 minutes including the deck.

## 5. The story (summary; full script in SCENARIO.md)
Fictional online retailer **Parcelo**. At 02:07 checkout latency spikes and errors climb. The squad:

| Act | Name | What the audience sees |
|---|---|---|
| 1 | Alert | Sentinel detects an SLO breach; the clock starts; the stage pulses red once |
| 2 | Fan-out | Orchestrator plans and dispatches three specialists in parallel |
| 3 | Diagnosis | Clues converge: pool exhaustion errors + a config change in last night's deploy |
| 4 | Fix and guardrail | Fixer proposes a rollback; Guardian checks it against policy |
| 5 | Human in the loop | The demo pauses; the client taps Approve (or Reject → alternative fix) |
| 6 | Recovery | Rollout progresses; the latency line falls back to green |
| 7 | Wrap-up | Scribe drafts the status update and postmortem; scorecard vs. manual |
| Finale | Chaos | An over-eager fix (restart the production database) is blocked by Guardian |

## 6. Cast
Sentinel, Orchestrator, Log Detective, Code Archaeologist, Fixer, Guardian, Scribe — plus **the human on-call engineer**, who holds final authority. Full definitions in SCENARIO.md §2.

## 7. Scope
**In scope**
- Web stage with scripted playback, branches, controls, inspector, audit trail, artifacts, human-vs-agent split view, presenter mode, keyboard shortcuts.
- Live mode: real agent turns on Claude via Amazon Bedrock, tools running against fixture data, deterministic policy engine, automatic fallback.
- Offline single-file build; local `demo` command. No Docker.
- AWS hosting provision (CDK).
- Executive deck (≈14 slides) and technical appendix deck (≈8 slides), generated from code, with app screenshots.
- Two additional scenarios outlined (legacy modernization squad, RFP response squad) to show application scope; the engine supports them, but only the incident scenario is fully scripted in v1.

**Out of scope (v1)**
- Real integrations with monitoring, Git, or deployment tools. All data is fixtures.
- Authentication beyond an optional shared passcode on the hosted API.
- Multi-user or collaborative sessions.
- Localization (English only; copy kept in one file to make it possible later).

## 8. Success criteria
- Runs end to end offline at 1× in about 4 minutes at the default pace, so the audience can follow each agent think and act (about 2½ minutes at `pace=1`; DECISIONS D-072), with no visual glitches at 1920×1080 and 1366×768.
- A first-time presenter can run it using only RUNBOOK.md after one rehearsal.
- Every branch (approve, reject → alternative, chaos) plays correctly from any point it can be triggered.
- Live mode completes a full run on Bedrock with each turn under the timeout, and survives a forced failure by falling back invisibly.
- Decks open in PowerPoint without repair prompts and pass visual QA.
- Audience test: after the demo, a non-technical viewer can explain what the human did and why Guardian blocked the database restart.

## 9. Tone
Confident, calm, precise. The agents sound like senior engineers on a good day: short sentences, evidence first, no hype, no jokes in the product UI. Energy comes from motion, pacing, and the ticking clock — not from exclamation marks.

## 10. Constraints recap
Offline-first, no Docker, light modern UI with purposeful accents, deterministic, illustrative numbers labelled, no invented statistics, no third-party brand assets.
