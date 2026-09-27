---
description: Timed dry run of the demo against RUNBOOK §3 using Playwright on the offline build.
---

1. `npm run build:offline`.
2. With Playwright (installed Chromium, no Docker), open `apps/web/dist-offline/index.html` via `file://` with network disabled, at 1920×1080, `?presenter=1`.
3. Play at 1×: record wall-clock time at each act start, the gate, recovery, scorecard, and end card. Compare against RUNBOOK §3 timings and SCENARIO §3 targets.
4. Then run the reject path (reject g1 → approve g2), the End B path (reject g1 → reject g2), and chaos from Act 4 and from the end card, at `?speed=8`.
5. Capture a screenshot at each act and any console errors.
6. Report a table: segment, target, actual, delta, issues. $ARGUMENTS may be `fast` to run everything at speed 8.
