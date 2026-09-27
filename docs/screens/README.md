# Key-beat screenshots

Captured from the scripted build (dev server) with Playwright, at 1920×1080 and 1366×768, at `?take=0&speed=8&autoplay=1&pauseAt=<beat>` (take 0 is the canonical script, SCENARIO §11). Illustrative scenario; these are review frames, not the deck assets (the deck captures its own set in P8, DECK §3).

| File | Beat | Story clock | Moment |
|---|---|---|---|
| `01-title` | start | 02:07:00 | Title card, paused |
| `02-alert` | `a1.b08` | 02:07:16 | SEV-2, red edge pulse, Sentinel → Orchestrator |
| `03-fanout` | `a2.b06` | 02:07:32 | Three packets in flight |
| `04-evidence-clues` | `a3.b18` | 02:08:34 | Three clue cards pinned, diff in stream |
| `05-root-cause` | `a3.b21` | 02:08:48 | Root-cause card, confidence 0.92 |
| `06-options-guardian` | `a4.b12` | 02:09:30 | Options A–C, policy checklist complete |
| `07-gate` | `a5.b01` | 02:09:34 | Gate g1 open, clock paused |
| `08-rollout` | `a6.p4` | 02:10:33 | Rollback pod 4 of 6, line falling |
| `09-rollback-complete` | `a6.b03` | 02:11:10 | 6 of 6 on v2.13.2 |
| `10-mitigated` | `a6.b06` | 02:16:14 | +5 min time-lapse, Mitigated, line green |
| `11-scorecard` | `a7.b06` | 02:16:54 | Scorecard (Illustrative) |
| `12-end-card` | `a7.b07` | 02:16:54 | End A with scorecard |
| `13-reject-alternative` | `r.b12` | 02:10:10 | Branch R: option D, P-08 check |
| `14-gate-override` | `r.b13` | 02:10:12 | Gate g2 open |
| `15-override-rollout` | `o6.b03` | 02:11:42 | Override applied to 6 of 6 pods |
| `16-end-handed-to-humans` | `b.b06` | 02:10:32 | End B: "The squad stopped where people said stop." |
| `17-chaos-blocked` | chaos from `a4.b12` | 02:09:30 | Guardian blocks P-02, P-04, P-06; `db.alter` not granted |
| `18-suspect-ruled-out` | `a3.x05` | 02:08:03 | Two suspect cards; the Spring Boot upgrade struck through, failed trace call in the stream history |
