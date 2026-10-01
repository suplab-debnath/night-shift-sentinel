# Design — Night Shift

## 1. Concept: a control room in daylight

Incidents are usually drawn as dark war rooms full of red. We do the opposite: a **calm, bright operations room** where a capable team works in the open. Light, cool surfaces; every accent colour means something; one living line carries the drama.

- **Audience job:** understand, in real time, who is doing what, why, and what the human controls.
- **Primary screen:** 1920×1080 projector. Must hold up at 1366×768 and on an iPad in landscape.
- **Personality:** precise, calm, confident. Motion is the energy; colour is the information.

## 2. Principles

1. **Colour is identity or status, never decoration.** Each agent owns one hue. Red, green, and amber are reserved for incident status and policy results.
2. **Spend boldness in one place.** The memorable element is the **heartbeat line** — the live latency trace running across the base of the stage, crossing the SLO line into red and later easing back to green — together with the incident clock. Everything else stays quiet.
3. **Show the work.** Tool calls, log lines, and diffs appear as real machine output in mono. Thoughts appear as plain sentences.
4. **The human sits apart.** The on-call engineer's seat sits outside the squad's circle, across a subtle boundary, so authority is visible spatially.
5. **One orchestrated reveal per act at most.** Alert pulse (Act 1), fan-out (Act 2), evidence merge (Act 3), gate (Act 5), line turning green (Act 6). Nothing else animates on its own.

## 3. Colour tokens (`apps/web/src/styles/tokens.css`)

### Base
| Token | Hex | Use |
|---|---|---|
| `--paper` | `#F4F6F9` | Page background (cool, not cream) |
| `--surface` | `#FFFFFF` | Panels, sheets, cards |
| `--stage` | `#EEF1F6` | Stage floor (with a 24 px dot grid at `#D9DFE8`, 1 px dots) |
| `--line` | `#D9DFE8` | Borders, dividers, SLO dashed line |
| `--ink` | `#16202E` | Primary text, human seat |
| `--ink-2` | `#4B5769` | Secondary text |
| `--ink-3` | `#6E7A8D` | Captions, timestamps (≥ 13 px only) |
| `--signal` | `#2F4BDB` | Primary interactive accent; also Orchestrator |
| `--signal-wash` | `#E8ECFC` | Selected states, focus backgrounds |

### Status (reserved)
| Token | Hex | Wash | Use |
|---|---|---|---|
| `--alert` | `#D93A3F` | `#FDECEC` | SLO breach, policy fail, blocked |
| `--ok` | `#138A5A` | `#E4F4EC` | Recovered, policy pass |
| `--caution` | `#B87300` | `#FFF3DC` | Awaiting approval, chaos banner, "required" |

### Agent hues (rings, packets, chips, stream markers — not body text)
| Token | Hex | Agent |
|---|---|---|
| `--agent-sentinel` | `#0A8BA8` | Sentinel (cyan) |
| `--agent-orchestrator` | `#2F4BDB` | Orchestrator (cobalt) |
| `--agent-log` | `#7A4FD6` | Log Detective (violet) |
| `--agent-code` | `#B0306E` | Code Archaeologist (magenta) |
| `--agent-fixer` | `#5F7F12` | Fixer (olive) |
| `--agent-guardian` | `#3F5A80` | Guardian (slate) |
| `--agent-scribe` | `#8A5A2B` | Scribe (walnut) |
| `--ink` | `#16202E` | Human |

Each agent hue also gets a `-wash` token at ~10% tint on white for chips and stream markers. Agents are always identified by **hue + icon + name**, never hue alone.

### Elevation
Two levels only, cool-tinted, layered:
- `--shadow-1`: `0 1px 2px rgba(22,32,46,.06), 0 2px 8px rgba(22,32,46,.04)` — panels, nodes
- `--shadow-2`: `0 8px 24px rgba(22,32,46,.10), 0 2px 6px rgba(22,32,46,.06)` — gate sheet, inspector, split view

No gradients as decoration. No glassmorphism.

## 4. Typography

Bundled offline via `@fontsource`:
- **Instrument Sans** (400, 500, 600) — all UI text and headings.
- **IBM Plex Mono** (400, 500) — only for literal machine output (tool calls, log lines, diffs, metric readouts) and the incident clock. Mono is used because this content *is* machine text, not as decoration.

Scale (ratio 1.25, base 16 px at 1920 wide; `clamp()` down to 14 px base at 1366):

| Token | px | Use |
|---|---|---|
| `--t-xs` | 13 | Timestamps, captions |
| `--t-sm` | 14 | Tool lines, chips, panel meta |
| `--t-md` | 16 | Body, thought lines |
| `--t-lg` | 20 | Agent names on stage, gate summary |
| `--t-xl` | 25 | Panel titles, option card titles |
| `--t-2xl` | 31 | Gate title, scorecard values |
| `--t-3xl` | 49 | Incident clock (Plex Mono 500, tabular) |
| `--t-4xl` | 61 | Title card and end card headline |

Line height 1.45 for body, 1.15 for display. Line length ≤ 70 characters in the panel. Sentence case everywhere. Headlines are set plainly: no single-word colour or italic accents.

## 5. Layout

### 5.1 Desktop 1920×1080

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Night Shift   Parcelo checkout-api        [SEV-2]      02:08:31           ⚙ │ 64
├───────────────────────────────────────────────────────┬──────────────────────┤
│                                                       │ Stream  Evidence     │
│     (Sentinel)      (Log Detective)   (Code Arch.)    │ Audit   Artifacts    │
│            ╲              │              ╱            │──────────────────────│
│                    (ORCHESTRATOR)                     │ ● Sentinel  02:07:04 │
│            ╱              │              ╲            │ p99 latency on …     │
│     (Fixer)          (Guardian)          (Scribe)     │ ▸ metrics.query {…}  │
│                                              ┊        │                      │
│   [evidence board, appears in Act 3]         ┊ (You)  │                      │
│                                              ┊ human  │                      │
│ 4.8 s ~~~~~~~~~~~~~~~~~~~~/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  │                      │
│ - - - - - - - - - - - - - SLO 800 ms - - - - - - - -  │                      │
├───────────────────────────────────────────────────────┴──────────────────────┤
│ ⏮ ⏯ ⏭   1× 1.5× 2×   |1 Alert|2 Fan-out|3 Diagnosis|4 Fix|5 You|6|7|   Split  Chaos │ 72
└──────────────────────────────────────────────────────────────────────────────┘
```

- Stage: flexible width; side panel 440 px (380 px at ≤ 1599 px wide).
- Agent nodes: 88 px circles with a 4 px hue ring, icon centred, name below. Orchestrator 112 px. Positions are defined in `agents.json` as percentages of stage size so layout scales.
- Human seat: bottom right, separated by a 1 px dashed `--line` vertical boundary and labelled "You" in presenter mode (or the presenter's name).
- Heartbeat line: full stage width, 140 px tall band at the bottom; SLO drawn as a dashed line with a small label at the right end; current value in Plex Mono at the head of the line.
- Evidence board: appears in Act 3 in the lower-left of the stage; three clue cards (240 px wide) that merge into one root-cause card.
- Content is left-aligned throughout; the stage is the only centred composition.

### 5.2 Other sizes
- **1280–1599:** panel 380 px; node 76 px; clock `--t-2xl`.
- **iPad landscape (1024–1279):** panel becomes a right drawer toggled by a "Details" button; the stage fills the width; the gate sheet is 640 px wide and centred; touch targets ≥ 56 px.
- **< 1024 (portrait/phone):** stage on top (fixed 16:10), panel below as tabs; transport condensed to play, step, act menu.

## 6. Components

| Component | Spec |
|---|---|
| `TopBar` | 64 px, `--surface`, bottom border `--line`. Left: product name + scenario name. Centre: severity badge + clock. Right: details toggle (tablet), settings. No mode badge: the stage looks the same whatever drives it (DECISIONS D-070). The settings menu opens with a presenter-only source line (Scripted · take n / Live on Bedrock · n scripted lines / Live, scripted fallback). |
| `IncidentClock` | Plex Mono 500 `--t-3xl`, tabular figures. The run clock (D-074): real time, still ticking while a person decides or the squad is paused. A chip below it reads "Awaiting approval" (`--caution` on its wash) at a gate, or names a labelled fast-forward ("Rolling back · ×4", `--signal` on its wash). |
| `SeverityBadge` | Pill, 28 px tall. SEV-2 = `--alert` text on `--alert-wash`; Mitigated = `--ok` on `--ok-wash`; Handed to humans = `--caution` on its wash. |
| `AgentNode` | States: idle (ring 40% opacity), thinking (ring breathes 1.6 s), working (small dot orbits ring, 2.4 s), watching (radar sweep, Sentinel only), done (check badge, ring solid), blocked (ring `--alert`, shield badge, single 240 ms shake), waiting (ring `--caution` pulse). Tap/click → `AgentInspector`. |
| `Packet` | Pill 24 px tall in agent hue with white label text (label only for messages marked `showLabel`); travels a quadratic curve between nodes in 700 ms; 400 ms fading trail. |
| `HeartbeatLine` | SVG path, 2.5 px stroke; colour interpolates `--ink-2` → `--alert` above SLO → `--ok` once below SLO after recovery. Values carry seeded noise (±4% p99, ±3% errors) so readouts never sit on round numbers; while a gate waits, the head and readout keep drifting on wall time (not under reduced motion). Error-rate chip rides above the head. `TimelapseMarker` slides across it in Act 6. |
| `EvidenceBoard` | Clue cards (`--surface`, radius 10, `--shadow-1`, 3 px agent-hue dot + agent name). Suspect cards have a 1.5 px dashed `--ink-3` border and a "Suspect" tag; when ruled out, the text is struck through with the reason below, and after 2.5 s of playback the card shrinks into a single "Ruled out:" pill above the row. Conclude animation: cards slide together (500 ms) and cross-fade into the root-cause card with confidence meter. |
| `OptionCards` | Three cards in a row inside a sheet above the stage floor; recommended card has `--signal` 2 px outline and a "Recommended" chip. Columns: time, risk, reversible. |
| `GuardrailChecklist` | Rows: policy id (mono), description, result chip (Pass / Required / Fail). Rows tick in one by one. |
| `GateSheet` | Bottom sheet, radius 20 top corners, `--shadow-2`, max width 760. Eyebrow line `--t-xs` `--ink-2` reads like a change request: reference (mono), "Standard change", "On-call paged", live waiting time (mono). Title `--t-2xl`, summary `--t-lg`, collapsible evidence, primary button filled `--signal` (56 px tall), secondary outlined. Focus trapped; Esc does nothing (decision is required). |
| `SidePanel` | Tabs: Stream, Evidence, Channel, Audit, Artifacts (counts on Evidence, Channel, Artifacts). Stream auto-scrolls unless the user scrolls up (then a "Jump to latest" chip appears). |
| `ThoughtLine` | Agent chip (hue wash + icon + name), timestamp `--t-xs` `--ink-3`, text `--t-md` `--ink`. Streams like a model at 30 chars/s on average (reading pace): a short think (caret only), then chunks of a few tokens at uneven, seeded gaps, finishing in the same time as an even reveal (instant under reduced motion). |
| `ToolCallLine` / `LogLine` / `DiffBlock` | Plex Mono `--t-sm` on `--stage`, radius 6. Diff lines tinted with alert/ok washes. Tables keep columns and scroll sideways. A failed call shows on `--alert-wash` with an `--alert` ✕. |
| `PendingThought` / thinking bubble | While an agent works out its next line (paced runs, D-072): the stream ends with its chip and "thinking" plus three pulsing dots (`--ink-3`), and a small `--surface` pill with three dots in the agent hue sits at the node's top right. A tool call line shows a 10 px spinner and "running n.n s" (mono, `--ink-3`) until its result lands. Static under reduced motion. |
| `ChannelTab` / `ChannelToast` | The incident channel: avatar (agent hue and icon, or initial), author, clock, text. A new post shows for 4.5 s as a toast at the stage's bottom right (`--surface`, `--shadow-2`, 340 px), except while a gate is open or the Channel tab is showing. |
| `AgentInspector` | Popover 360 px: role, tools with Read/Write/Needs approval chips, "Never allowed" list. |
| `OperationsBar` | 72 px, replaces the media transport (D-075). Left: one primary pill (48 px, `--ink`): Start → Pause squad → Resume squad (`--signal`) → Waiting on you (disabled at a gate) → Incident closed. Centre: milestone track Detected · Triaged · Root cause · Approved · Mitigated · Resolved; each dot fills `--ok` with its run-clock time (mono `--t-xs`) when reached, the next one has a `--signal` ring, and on End B the rest turn dashed. Then "Customer impact" m:ss (mono, `--alert` while it grows, `--ink` once errors stop). Right: "Compare with manual response" and "Test a bad idea" (outlined pills). Speed (1×, 1.5×, 2×) moves to the settings menu; stepping, act jumps, and seek stay on the keyboard. |
| `SquadBanner` | While the squad is paused: a `--signal-wash` strip across the top of the stage, "Squad paused by <name>. Agents are holding their work; the incident clock keeps running." with an m:ss counter; every stage animation holds (`animation-play-state: paused`). The presenter freeze (`F`) holds animations too but shows no banner. |
| `SplitView` | Full-screen overlay, two lanes on a shared time axis; manual lane in `--ink-2`, squad lane in `--signal`; "Illustrative" tag top right. |
| `Scorecard` | Five rows, two columns (Manual / Squad), values in `--t-2xl`; "Illustrative" tag and footnote. Bars drawn inline as thin horizontal rules proportional to time. The stage sheet and the end card each have a close button (✕, 36/44 px) and close on `Esc`; a "Show summary" pill (top centre of the stage) brings them back; replay resets it (D-073). |
| `ChaosBanner` | Top-of-stage banner, `--caution` wash, text `--ink`: "Chaos test: an over-eager fix". |
| `PermissionToast` | Anchored to Fixer node: "db.alter is not granted to Fixer". |
| `EndCard` | Headline `--t-4xl` from the run: "Mitigated in 3 min 38 s." with the second sentence ("A person approved every change.") under it in `--t-xl` `--ink-2`. The scorecard's Squad column and the split view's squad lane are measured from the run too (D-074). Buttons: "Show human vs agent timeline", "Try the chaos test", "Replay". |
| `IllustrativeTag` | Small outlined pill, `--ink-2`, text "Illustrative". |

Radii are deliberately varied by role: nodes are circles, pills are fully rounded, cards 10, code blocks 6, sheets 20. There is no single radius applied to everything.

## 7. Motion

- Easing: `cubic-bezier(.2,.7,.2,1)` for movement; `ease-out` for fades.
- Durations: micro 160 ms, state change 280 ms, packet 700 ms, evidence merge 500 ms, sheet 320 ms.
- Motion scales with playback speed (2× halves durations), except typing speed caps at 90 chars/s.
- **Unprompted motion budget:** alert pulse (Act 1), fan-out (Act 2), evidence merge (Act 3), heartbeat colour shift (Act 6). Everything else answers the presenter's action.
- `prefers-reduced-motion` or the in-app "Reduce motion" setting: no pulses, no trails, no orbit/breath loops (static state icons instead), packets appear at destination with a 120 ms cross-fade, text appears whole.

## 8. Copy rules

- Sentence case; active voice; buttons say exactly what happens ("Approve rollback", not "Submit").
- No exclamation marks, no emoji, no "AI-powered" or "magic".
- Numbers carry units ("4.8 s", "11.4%"). Times in 24 h.
- Illustrative figures always carry the `IllustrativeTag`.
- All UI copy lives in `apps/web/src/copy.ts` (scenario text lives in the scenario package).

## 9. Avoid (generic AI-demo defaults)

- Warm cream backgrounds with serif display and terracotta accent; near-black backgrounds with a single neon accent.
- The SaaS card kit: identical rounded cards, one radius everywhere, the same grey shadow under everything, gradient washes.
- ALL-CAPS tracked eyebrow labels above headings; meta strings joined with middle dots; "WORD — fragment" labels; arrows appended to button text.
- Numbered markers on content that is not a sequence (acts *are* a sequence, so act numbers are fine).
- Colour-coding that is not explained by identity or status.
- Decorative stripes or edge bars on cards.

**Design review note:** an early direction used generic white cards with a single cobalt accent and coral highlights. It read as a template. It was replaced by the agent-hue identity system plus reserved status colours, which makes colour carry meaning, and by concentrating the drama in the heartbeat line.

## 10. Accessibility

- Text contrast ≥ 4.5:1 (all `--ink*` tokens on `--surface`/`--paper` qualify; `--ink-3` only at ≥ 13 px for non-essential text).
- Agent hues are used for rings, dots, and chips; names and icons always accompany them.
- Visible focus: 3 px `--signal` ring, 2 px offset, on every interactive element.
- Full keyboard control (RUNBOOK §5). Gate sheet traps focus and announces itself.
- An `aria-live="polite"` region announces thought lines, throttled to one per 1.5 s; tool calls are not announced.
- Respect `prefers-reduced-motion`; provide an in-app override.
- Minimum touch target 44 px (56 px for gate buttons).

## 11. Presenter mode

Toggle with `P`. Increases type one step, shows act names on the scrubber, hides the settings menu, auto-hides the cursor after 2 s idle, and shows a small notes strip (from RUNBOOK) at the bottom-left of the transport bar that only the presenter's laptop shows if a second screen is used (mirrored setups: notes strip can be turned off with `N`).

## 12. Deck alignment
Decks reuse this palette (hex without `#` in pptxgenjs) and the agent hues for the cast slide. Font choices for decks are in DECK.md §2, because the web fonts are not guaranteed on the client's machine.
