# Scenario — "Checkout meltdown at 2:07 AM"

This document is **canon**. Every agent line, tool call, fact, timing, and branch below must be represented in `packages/scenarios/incident-checkout/`. Live mode must stay consistent with the facts in §1 and the grounding rules in §9.

---

## 1. World and facts (fixtures)

**Company:** Parcelo, a fictional online retailer. **Night:** Tuesday into Wednesday.

| Fact | Value |
|---|---|
| Service in trouble | `checkout-api` (Java 21, Spring Boot 3, HikariCP), 6 pods on Kubernetes |
| Dependencies | `payments-gateway`, `inventory-svc`, `orders-db` (PostgreSQL) |
| Services depending on `orders-db` | 9 (checkout-api, orders-api, returns-svc, invoicing, loyalty-svc, search-indexer, reporting, fulfilment-svc, admin-portal) |
| SLO | checkout p99 latency ≤ 800 ms; error rate ≤ 1% |
| Normal state | p99 180 ms; errors 0.2%; pool active ~22 of 40 per pod |
| Bad deploy | `checkout-api` **v2.14.0**, deployed **01:55** by pipeline (previous: v2.13.2, running 9 days, all checks passed) |
| The change | Helm values refactor renamed `SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE` → `DB_POOL_MAX`; application still binds the old key |
| Effect | Pool size falls back to HikariCP default **10**; production needs ~40 per pod |
| First errors | **02:04** (traffic ramp from a regional promo email) |
| Alert fires | **02:07:00** |
| Peak | p99 **4.8 s**; error rate **11.4%**; error budget burn **14×** |
| Log signature | `HikariPool-1 - Connection is not available, request timed out after 3000ms.` (94% of errors) |
| Error count | **1,912** errored requests from 02:04 to mitigation |
| DB health | `orders-db` CPU 22%, connections 180 of 500 — healthy |
| Mitigated | **02:11:10** (rollback complete) |
| Stable confirmed | **02:16** (5 minutes stable, shown as a time-lapse) |
| Rollback | Runbook **RB-112**, rolling, one pod at a time, 6 pods, no schema migration in v2.14.0 |
| Alternative | Runbook **RB-131**, runtime config override + rolling restart, 48 h expiry |

Diff shown on stage (`deploy/helm/values-prod.yaml`, v2.13.2 → v2.14.0):

```diff
 env:
-  SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE: "40"
+  DB_POOL_MAX: "40"
   SPRING_DATASOURCE_HIKARI_CONNECTIONTIMEOUT: "3000"
```

Fixture files to create under `fixtures/`: `metrics.json` (time series for p99, error rate, pool active, pool pending per pod, DB CPU/connections), `logs.json` (≥ 40 sample lines incl. the signature and noise), `traces.json`, `deploys.json`, `diff.json`, `runbooks.json` (RB-112, RB-131), `policies.json` (§5), `services.json` (dependency graph).

---

## 2. Cast

| id | Name | Role | Colour token | Icon (lucide) | Tools | Cannot |
|---|---|---|---|---|---|---|
| `sentinel` | Sentinel | Watches metrics, detects, confirms recovery, maps blast radius | `--agent-sentinel` | `radar` | `metrics.query`, `traces.get` | Change anything |
| `orchestrator` | Orchestrator | Plans, dispatches, synthesizes, owns the incident flow | `--agent-orchestrator` | `network` | `plan.write` | Execute fixes; approve its own proposals |
| `log-detective` | Log Detective | Finds the failure signature in logs and runtime metrics | `--agent-log` | `scan-search` | `logs.search`, `metrics.query` | Change anything |
| `code-archaeologist` | Code Archaeologist | Correlates timing with deploys; reads diffs | `--agent-code` | `git-compare` | `deploys.list`, `git.diff` | Change code or config |
| `fixer` | Fixer | Proposes and, once approved, executes mitigations | `--agent-fixer` | `wrench` | `runbook.lookup`, `deploy.rollback`*, `config.override`* | Any action without Guardian pass + human approval; `db.alter` is not granted |
| `guardian` | Guardian | Checks every proposed action against policy; can block | `--agent-guardian` | `shield-check` | `policy.check` | Approve on behalf of a human |
| `scribe` | Scribe | Writes the status update, postmortem, audit summary | `--agent-scribe` | `notebook-pen` | `doc.write`, `comms.draft` | Send external messages (drafts only) |
| `human` | On-call engineer | Final authority on production changes | `--ink` | `user-round` | — | — |

\* requires an approved gate.

**Inspector copy** (shown when an agent is tapped): name, one-line role, tools (with read/write badge), "Needs approval for", "Never allowed". Keep each item under 60 characters.

**Live-mode personas** (system prompt seeds, to be expanded by `bedrock-integrator`):
- Sentinel: "You are Sentinel, a site reliability monitor. Report numbers first, then one-line judgement. Never speculate on cause."
- Orchestrator: "You coordinate an incident squad. You plan, delegate, and synthesize evidence into a root-cause statement with a confidence score. You never execute changes."
- Log Detective: "You analyze logs. Quantify, find the dominant signature, state what it implies. One idea per sentence."
- Code Archaeologist: "You correlate incidents with changes. Cite versions, times, and exact diff lines."
- Fixer: "You propose mitigations as options with time, risk, and reversibility. Prefer the fastest reversible option. You act only after approval."
- Guardian: "You evaluate proposed actions against the provided policies. Output pass/fail per policy with a short reason. You may block."
- Scribe: "You write clear, calm incident communications and blameless postmortems."

All agent lines: ≤ 14 words per sentence, ≤ 2 sentences per thought, no exclamation marks, no emoji.

---

## 3. Time model

- **Playback time** (`t`, seconds at 1×) drives animation. Scrubber and speed controls act on playback time.
- **Story clock** (HH:MM:SS) is the incident clock at top of screen. Each beat below lists both.
- **Run clock** (DECISIONS D-074): the incident clock runs in real time from 02:07:00, one second per second of playback. It keeps running while a person decides at a gate and while the squad is paused; both count toward the outcome. It stands still during a chaos test, which is a what-if. Slow real-world work is shown as a labelled fast-forward (the rollout runs at ×4, labelled "Rolling back · ×4"), and the stability check uses an explicit **time-lapse marker** ("+5 min") rather than faking real time.
- The **Clock** column below is the authored reference at `pace` 1 with no waits; a real run shows its own times. Text that quotes a run time uses run-time tokens (§11.2), filled in from the run.
- Target at 1×: Act 1 14 s · Act 2 12 s · Act 3 47 s · Act 4 24 s · Gate (presenter) · Act 6 22 s · Act 7 28 s → ≈ 2 min 27 s plus the gate. These are the **authored** timings (`pace` 1).
- **Pacing** (DECISIONS D-072): demos run at `pace` 1.15 (`config/branding.json`, URL `pace=`). Every duration is stretched by that factor, and the timeline becomes elastic: a stream item never lands while the previous line is still being read (lines stream at 30 characters a second, plus 0.6 s), and an agent pauses 0.7–1.6 s to think before each line (1.0 s on take 0). The stage shows that pause ("<Agent> thinking…" in the stream, a bubble on the node), and a tool call shows "running n s" until its result lands. The run becomes ≈ 4 min plus the gate, most of it in Act 3. Story clocks and canonical times are unchanged.
- Times below are take 0, the canonical script. Other takes vary wording and timing within the limits in §11.

Event kinds referenced below are defined in ARCHITECTURE.md §4.

---

## 4. Acts and beats (happy path)

### Act 1 — Alert (14 s)

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:07:00 | — | `scene.start` | Title card fades: "02:07. Checkout is slowing down." (1.2 s) |
| 0.4 | 02:07:00 | — | `metric.update` | Latency line starts climbing 180 ms → 4.8 s over 8 s; error chip 0.2% → 11.4% |
| 0.5 | 02:07:01 | sentinel | `agent.state` working · `tool.call` | `metrics.query {service:"checkout-api", window:"15m"}` |
| 2.0 | 02:07:04 | sentinel | `thought` | "p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds." |
| 3.8 | 02:07:08 | sentinel | `thought` | "Error rate is 11.4% and rising. Error budget is burning at 14 times normal." |
| 5.6 | 02:07:12 | sentinel | `thought` | "The breach has held for three minutes. This is not a blip." |
| 6.4 | 02:07:14 | — | `stage.alert` · `channel.post` | Severity badge SEV-2; red edge pulse ×2 (the only unprompted big motion). Pager posts: "SEV-2 checkout-api: p99 4.8 s, errors 11.4%. Paging on-call and the agent squad." |
| 7.2 | 02:07:16 | sentinel→orchestrator | `message.send` | label "SEV-2: checkout degraded" (evidence bundle icon) |
| 8.4 | 02:07:18 | sentinel | `thought` | "Evidence bundle sent to Orchestrator. I keep watching the numbers." |
| 9.5 | 02:07:20 | sentinel | `agent.state` watching | (subtle radar sweep continues) |

### Act 2 — Fan-out (12 s)

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:07:22 | orchestrator | `agent.state` thinking · `thought` · `channel.post` | "Checkout is the revenue path. Treating this as SEV-2." Channel: "Investigating: checkout is slow and failing for some customers. SEV-2 declared." |
| 2.0 | 02:07:26 | orchestrator | `thought` | "Three questions. What is failing, what changed, and how far it spreads." |
| 3.6 | 02:07:29 | orchestrator | `artifact.create` plan | Checklist: ☐ Failure signature → Log Detective · ☐ Recent changes → Code Archaeologist · ☐ Blast radius → Sentinel |
| 5.0 | 02:07:31 | orchestrator→log-detective | `message.send` | "Find the failure signature in checkout-api" |
| 5.3 | 02:07:31 | orchestrator→code-archaeologist | `message.send` | "What changed in the last 24 hours?" |
| 5.6 | 02:07:32 | orchestrator→sentinel | `message.send` | "Map the blast radius across dependencies" |
| 7.4 | 02:07:35 | orchestrator | `thought` | "Specialists are working in parallel. Target: root cause within three minutes." Support desk posts: "Customers report card payments failing at checkout. Tickets are climbing." |
| 8.0 | 02:07:36 | log-detective, code-archaeologist, sentinel | `agent.state` working | All three light up together (fan-out moment) |

### Act 3 — Diagnosis (47 s)

Three streams interleave. The right panel shows them in one stream with agent colour chips; the stage shows packets and an **evidence board** where clue cards pin as they arrive. The investigation is not a straight line: one tool call fails and is retried, two suspects are pinned and then ruled out, and the Orchestrator challenges the timing before it accepts a root cause (§11).

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:07:38 | log-detective | `tool.call` | `logs.search {service:"checkout-api", level:"ERROR", since:"02:00"}` |
| 1.0 | 02:07:40 | code-archaeologist | `tool.call` | `deploys.list {service:"checkout-api", since:"24h"}` |
| 2.0 | 02:07:42 | sentinel | `tool.call` | `traces.get {service:"checkout-api", depth:2}` |
| 3.0 | 02:07:43 | sentinel | `tool.result` (error) · `thought` | Result: "traces.get failed: trace store returned 503 Service Unavailable". Line: "Trace store returned an error. Retrying with a narrower window." |
| 3.6 | 02:07:44 | sentinel | `tool.call` | `traces.get {service:"checkout-api", depth:2, window:"5m"}` |
| 4.2 | 02:07:45 | log-detective | `tool.result` · `thought` | "1,912 errors since 02:04. One signature accounts for 94% of them." |
| 5.8 | 02:07:47 | log-detective | `thought` · `evidence.pin` (suspect) · `message.send` →sentinel | "Timeouts waiting on connections. First suspect: the database is overloaded." Card: "Suspect: orders-db is overloaded". Label "Is orders-db overloaded?" |
| 7.2 | 02:07:49 | log-detective | `tool.result` (log lines) | `HikariPool-1 - Connection is not available, request timed out after 3000ms.` on four pods, plus the thread-starvation warning |
| 8.6 | 02:07:52 | log-detective | `thought` | "The app is starving for database connections. Queries are not failing." |
| 10.0 | 02:07:55 | code-archaeologist | `tool.result` (deploy table) · `thought` | "v2.14.0 was deployed at 01:55. The alert fired twelve minutes later." |
| 11.6 | 02:07:57 | code-archaeologist | `thought` · `evidence.pin` (suspect) · `tool.call` | "Three changes in v2.14.0. The Spring Boot upgrade is the usual suspect." Card: "Suspect: the Spring Boot 3.3.5 upgrade". `git.diff {from:"v2.13.2", to:"v2.14.0", path:"build.gradle.kts"}` |
| 12.8 | 02:07:59 | sentinel | `tool.result` (dependency table) · `thought` | "payments-gateway and inventory-svc are healthy. orders-db is at 22% CPU." |
| 14.2 | 02:08:02 | sentinel | `thought` | "Database connections are 180 of 500. The bottleneck is inside checkout-api." |
| 15.0 | 02:08:03 | code-archaeologist | `tool.result` (diff) · `thought` · `evidence.ruleOut` | "Patch release, and HikariCP is unchanged. Ruling out the upgrade." Suspect card struck through: "Patch release; HikariCP 5.1.0 unchanged" |
| 16.0 | 02:08:04 | sentinel→orchestrator | `message.send` · `evidence.pin` · `evidence.ruleOut` | Card: "Database healthy. Problem is local to checkout-api." The database suspect is struck through: "orders-db at 22% CPU, 180 of 500 connections" |
| 17.6 | 02:08:08 | log-detective | `thought` · `tool.call` | "Not the database, then. Checking the pool inside checkout-api." `metrics.query {metric:"hikari.connections.active", service:"checkout-api"}` |
| 19.6 | 02:08:12 | log-detective | `tool.result` (per-pod table) · `thought` | "Active connections are pinned at 10 of 10 on every pod. 380 threads are waiting." |
| 21.4 | 02:08:16 | log-detective→orchestrator | `message.send` · `evidence.pin` | Card: "Connection pool exhausted. Pool max looks like 10." |
| 22.8 | 02:08:19 | code-archaeologist | `tool.call` | `git.diff {from:"v2.13.2", to:"v2.14.0", path:"deploy/"}` |
| 24.6 | 02:08:23 | code-archaeologist | `tool.result` (diff) | The diff from §1, rendered with red/green line tints |
| 26.4 | 02:08:27 | code-archaeologist | `thought` | "The config refactor renamed the pool setting. The app still reads the old key." |
| 28.2 | 02:08:31 | code-archaeologist | `thought` | "Without it, HikariCP falls back to its default of 10. Production needs about 40." |
| 29.8 | 02:08:34 | code-archaeologist→orchestrator | `message.send` · `evidence.pin` | Card: "v2.14.0 renamed the pool-size key. App ignores the new one." |
| 31.4 | 02:08:35 | orchestrator | `agent.state` thinking · `thought` · `message.send` →sentinel | "Before I accept it: why did it break at 02:04, not 01:55?" Label "What changed at 02:03?" |
| 32.8 | 02:08:36 | sentinel | `tool.call` | `metrics.query {metric:"http.requests.rate", service:"checkout-api", window:"15m"}` |
| 34.2 | 02:08:37 | sentinel | `tool.result` (traffic table) · `thought` | "Traffic more than doubled at 02:03, from 1,100 to 2,600 requests a minute." |
| 35.8 | 02:08:39 | orchestrator | `thought` | "Traffic is the trigger. The pool cut to 10 is the cause." |
| 37.4 | 02:08:40 | orchestrator | `thought` | "Three signals agree: pool exhaustion, a pool-size change, and a healthy database." |
| 40.4 | 02:08:44 | orchestrator | `evidence.conclude` | Root-cause card forms from the three clue cards: "v2.14.0 cut the connection pool from 40 to 10." Confidence 0.92 |
| 42.4 | 02:08:48 | orchestrator | `thought` · `channel.post` | "Root cause identified {{since:a1.b07}} after the alert. Moving to mitigation." Channel: "Identified: v2.14.0 cut the checkout-api connection pool from 40 to 10. Preparing a fix." |
| 44.4 | 02:08:52 | log-detective, code-archaeologist | `agent.state` done | Check marks; Sentinel stays watching |

### Act 4 — Fix and guardrail (24 s)

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:08:54 | orchestrator→fixer | `message.send` | "Propose a mitigation. Fastest safe path." |
| 1.0 | 02:08:56 | fixer | `agent.state` thinking · `tool.call` | `runbook.lookup {query:"rollback checkout-api"}` → RB-112 |
| 3.0 | 02:09:00 | fixer | `options.show` | Three option cards (below) |
| 6.0 | 02:09:06 | fixer | `thought` | "Recommending option A. v2.14.0 has no schema migration, so rollback is clean." |
| 8.0 | 02:09:10 | fixer→guardian | `message.send` | "Validate: roll back checkout-api to v2.13.2 in production" |
| 9.0 | 02:09:12 | guardian | `agent.state` working · `tool.call` | `policy.check {action:"deploy.rollback", target:"checkout-api", to:"v2.13.2", env:"prod"}` |
| 10–17 | 02:09:14–28 | guardian | `guardrail.check` ×5 | Checklist ticks one per 1.4 s (below) |
| 18.0 | 02:09:30 | guardian | `thought` | "All policies pass. P-01 requires a human to approve production changes." |
| 20.0 | 02:09:34 | guardian→human | `message.send` · `gate.request` | Opens gate `g1` |

**Option cards** (A is highlighted as recommended):

| Option | Action | Time | Risk | Reversible | Note |
|---|---|---|---|---|---|
| A | Roll back checkout-api to v2.13.2 | ~3 min | Low | Yes | Restores known-good config. Recommended |
| B | Fix the config key and redeploy | ~15 min | Medium | Yes | Needs build and review |
| C | Scale out checkout-api pods | ~4 min | Medium | Yes | Partial relief only; each pod is still capped at 10. Not recommended |

**Guardian checklist for option A:**

| Policy | Check | Result |
|---|---|---|
| P-01 | Production changes need human approval | Required (amber) |
| P-03 | Change freeze window | Pass — incident exception applies |
| P-04 | Blast radius limited to one service | Pass — checkout-api only |
| P-05 | Rollback target passed checks in the last 30 days | Pass — v2.13.2 ran 9 days |
| P-06 | No irreversible or outage-causing operations | Pass — rolling, one pod at a time |

### Act 5 — Human in the loop (gate `g1`)

Story clock pauses. Stage dims slightly except the Human seat and the gate sheet. Presenter hands over the tablet or clicks.

**Gate sheet copy**
- Title: "Approve production rollback?"
- Summary: "Roll back checkout-api from v2.14.0 to v2.13.2. One service, six pods, rolling. Estimated recovery: 3 minutes. Reversible."
- Evidence (collapsed by default): the root-cause card and Guardian checklist.
- Buttons: **Approve rollback** (primary) · **Reject** (secondary).
- Footer (two lines): "Guardian: all policies pass" and "Requested by Fixer"
- Just before the sheet opens, Pager posts: "Approval requested from on-call: production rollback of checkout-api."

On **Approve**: `gate.resolve {gateId:"g1", decision:"approved", by:"{{PRESENTER_NAME|On-call engineer}}"}` → audit entry → channel: "Mitigating: rollback to v2.13.2 approved. Rolling out one pod at a time." → clock resumes at 02:09:40 → Act 6.
On **Reject**: → Branch R (§5.1).

### Act 6 — Recovery (22 s)

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:09:40 | fixer | `agent.state` working · `tool.call` | `deploy.rollback {service:"checkout-api", to:"v2.13.2", strategy:"rolling", batch:1}` |
| 1–13 | 02:09:45–02:11:05 | fixer | `progress.update` ×6 | "Pod 1 of 6 … 6 of 6 on v2.13.2", one every 2.2 s |
| 3–15 | — | — | `metric.update` | Latency line eases down 4.8 s → 190 ms; errors → 0.2%; line colour transitions alert → ok as it crosses the SLO line |
| 9.0 | 02:10:41 | log-detective | `thought` · `channel.post` | "Pool errors stopped at {{clock}}. Active connections are 22 of 40." Channel: "Monitoring: pool errors stopped at {{clock:a6.b02}}. Watching for five minutes." |
| 14.0 | 02:11:10 | fixer | `agent.state` done · `thought` | "Rollback complete. All six pods run v2.13.2." |
| 16.0 | — | — | `timelapse` | Marker "+5 min" slides across the latency line |
| 17.0 | 02:16:10 | sentinel | `thought` | "p99 is 190 milliseconds and errors are 0.2%. Stable for five minutes." |
| 19.5 | 02:16:14 | sentinel | `agent.state` done · `channel.post` ×2 | Severity badge changes to "Mitigated". Channel: "Resolved: p99 190 ms, errors 0.2%, stable for five minutes." Support desk: "Payment failure tickets have stopped. Thanks, all." |

### Act 7 — Wrap-up (28 s)

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:16:16 | orchestrator→scribe | `message.send` | "Draft the status update and the postmortem." |
| 1.0 | 02:16:18 | scribe | `agent.state` working · `thought` | "Two audiences: stakeholders now, engineers in the morning." |
| 3.0 | 02:16:22 | scribe | `artifact.create` status | §6.1 text streams into Artifacts tab |
| 9.0 | 02:16:34 | scribe | `artifact.create` postmortem | §6.2 text streams |
| 17.0 | 02:16:50 | orchestrator | `thought` · `channel.post` | "Four follow-ups proposed. Owners are suggested, not assigned. The team decides." Scribe posts: "Stakeholder update and postmortem draft are ready for review." |
| 19.0 | 02:16:54 | — | `scorecard.show` | §8, labelled "Illustrative" |
| 22.0 | — | — | `scene.end` | End card with two buttons: "Show human vs agent timeline" · "Try the chaos test" |

---

## 5. Branches

### 5.1 Branch R — human rejects the rollback

| t | Clock | Agent | Event | Content |
|---|---|---|---|---|
| 0.0 | 02:09:40 | human | `gate.resolve` rejected · `channel.post` | Audit: "Rollback declined by on-call engineer". Channel: "Rollback declined by on-call. Evaluating a fix that keeps v2.14.0." |
| 1.0 | 02:09:42 | orchestrator | `thought` | "Rollback declined. Looking for a fix that keeps v2.14.0 live." |
| 2.5 | 02:09:45 | orchestrator→fixer | `message.send` | "Alternative without rollback, please." |
| 3.5 | 02:09:47 | fixer | `tool.call` | `runbook.lookup {query:"runtime config override"}` → RB-131 |
| 5.5 | 02:09:51 | fixer | `options.show` | Option D: "Set the old pool key to 40 at runtime, then rolling restart. Keeps v2.14.0. ~4 min. Low risk. Reversible. Override expires in 48 h." |
| 8.0 | 02:09:56 | fixer→guardian | `message.send` | "Validate: runtime override of pool size, rolling restart" |
| 9–15 | 02:09:58–10:10 | guardian | `guardrail.check` ×5 | P-01 Required · P-03 Pass · P-04 Pass · P-06 Pass · **P-08** "Runtime overrides must be recorded and expire" Pass — 48 h expiry set |
| 16.0 | 02:10:12 | guardian→human | `gate.request` | Gate `g2`: "Approve runtime config override?" Summary: "Set pool size to 40 on checkout-api via the old key, then restart pods one at a time. Keeps v2.14.0. Expires in 48 hours." Buttons: Approve override · Reject. Pager posts first: "Approval requested from on-call: runtime override on checkout-api." |

- `g2` **approved** → Act 6 variant: tool `config.override` then `deploy.restart {strategy:"rolling"}`; progress text "Pod n of 6 restarted with pool size 40"; the rollout fast-forward reads "Restarting pods · ×4"; Fixer done line: "Override applied. All six pods run with pool size 40." Act 7 postmortem adds action item: "Remove runtime override after the config fix ships (expires in 48 h)." Channel posts follow Act 6 and 7 with the override wording: "Mitigating: runtime override approved. Restarting pods with pool size 40." and "Monitoring: pool errors stopped at {{clock:o6.b02}}. Watching for five minutes."
- `g2` **rejected** → End B: Orchestrator: "Holding. Escalating to the incident commander with both options and the evidence." Scribe drafts an escalation note (§6.3). Severity badge stays SEV-2, label "Handed to humans". End card copy: "The squad stopped where people said stop." This is a feature, not a failure — the presenter should say so. Channel: "Escalated to the incident commander. The squad is holding, nothing changed."

### 5.2 Branch C — chaos test (governance finale)

Available any time after Act 4 begins (button "Chaos test", shortcut `C`) and from the end card. It runs as an **overlay beat** and then returns to where it was triggered (or to the end card).

| t | Agent | Event | Content |
|---|---|---|---|
| 0.0 | — | `chaos.start` | Thin banner: "Chaos test: an over-eager fix" (caution colour) |
| 0.8 | fixer | `thought` | "Faster idea: raise max_connections on orders-db and restart it." |
| 2.4 | fixer→guardian | `message.send` | "Validate: ALTER SYSTEM SET max_connections = 1000; restart orders-db (prod)" |
| 3.4 | guardian | `tool.call` | `policy.check {action:"db.alter", target:"orders-db", env:"prod"}` |
| 4.4 | guardian | `guardrail.check` | **P-02** "Production database changes need a DBA and change board" — **Fail** |
| 5.6 | guardian | `guardrail.check` | **P-04** "Blast radius limited to one service" — **Fail**: 9 services depend on orders-db |
| 6.8 | guardian | `guardrail.check` | **P-06** "No outage-causing operations" — **Fail**: restart means ~90 s full outage |
| 8.0 | guardian | `agent.state` blocked · `thought` | "Blocked. This takes down nine services to treat a symptom in one." |
| 9.8 | guardian | `thought` | "It would not help anyway. The limit is inside checkout-api, not the database." |
| 11.4 | — | `permission.denied` | Toast on Fixer: "db.alter is not granted to Fixer" (second layer of defence) |
| 12.6 | guardian→orchestrator | `message.send` · `audit` (high) | "Blocked: violates P-02, P-04, P-06" |
| 14.0 | orchestrator | `thought` | "Discarded. Continuing with the approved plan." |
| 15.5 | — | `chaos.end` | Banner clears; return to trigger point |

---

## 6. Artifacts (exact text; Scribe streams these)

### 6.1 Status update (stakeholders)

> **Checkout incident — mitigated**
> From 02:04 to {{hm:a6.b02}} some customers could not complete checkout. The cause was a configuration change in last night's release that limited database connections. We rolled back the release at {{hm:a6.b03}} after on-call approval, and checkout has been stable since. No data was lost. A full review follows tomorrow.

### 6.2 Postmortem draft (engineers, blameless)

```
Title: Checkout degradation after checkout-api v2.14.0
Status: Draft — for review by the service team
Severity: SEV-2
Duration: customer impact 02:04–{{hm:a6.b02}}
Impact (illustrative): 1,912 errored checkout requests; p99 peaked at 4.8 s

Summary
v2.14.0 renamed the pool-size environment variable in Helm values. The application
still binds the old key, so HikariCP used its default pool size of 10 instead of 40.
Under promo traffic, pods exhausted their pools and requests timed out.

Timeline
01:55 v2.14.0 deployed by pipeline
02:04 first connection timeout errors
{{clock:a1.b07}} SLO alert; squad engaged
{{clock:a3.b20}} root cause identified (confidence 0.92)
{{clock:a5.b01}} rollback proposed; policy checks passed
{{clock:a5.b02}} rollback approved by on-call engineer
{{clock:a6.b03}} rollback complete; errors stopped at {{clock:a6.b02}}
{{hm:a6.b05}} stable for 5 minutes

What went well
Detection within 3 minutes of first errors. Evidence from logs, deploys, and traces
converged quickly. Guardrails and approval worked as designed.

What we will change (owners proposed, not assigned)
A1 Contract test: fail the build if the app does not bind every config key the chart sets — Platform team
A2 CI check for unknown or unused environment keys in Helm values — Platform team
A3 Alert on connection-pool saturation above 80% for 2 minutes — SRE
A4 Add a config diff section to the release review template — Release management
```

### 6.3 Escalation note (End B only)

> **Checkout incident — escalated to incident commander**
> Root cause is identified with high confidence: v2.14.0 reduced the database connection pool from 40 to 10. Two mitigations are ready and policy-checked: rollback to v2.13.2, or a 48-hour runtime override. The on-call engineer declined both. The squad is holding and has attached all evidence.

---

## 7. Human vs agent split view (illustrative)

In the app the squad lane is measured from the run (`splitView.squadLive`, run-time tokens, D-074); the times below are the static reference used by the decks.

Two lanes on a shared time axis 02:00–03:00. Label: "Illustrative comparison based on a typical manual response."

| Manual lane | Time | Agent lane | Time |
|---|---|---|---|
| Alert pages on-call | 02:07 | Sentinel detects, squad engaged | 02:07 |
| On-call acknowledges | 02:12 | Root cause identified | 02:08:44 |
| On VPN, opens dashboards | 02:19 | Rollback proposed, policy-checked | 02:09:34 |
| Spots connection errors | 02:27 | Human approves (30 s) | 02:09:40 |
| Asks about recent deploys | 02:36 | Mitigated | 02:11:10 |
| Finds config rename in diff | 02:44 | Postmortem drafted | 02:16:50 |
| Rollback approved | 02:49 | | |
| Recovery confirmed | 02:55 | | |

---

## 8. Scorecard (illustrative)

In the app the Squad column is measured from the run (`squadLive`: time to engage, root cause, and mitigate from the alert; human time is the time spent deciding at gates; postmortem draft time after mitigation). The values below are the static reference used by the decks. The Manual column stays an illustrative estimate.

| Measure | Manual | Squad |
|---|---|---|
| Time to engage | 5 min | 0 min |
| Time to root cause | 37 min | 1 min 44 s |
| Time to mitigate | 48 min | 4 min 10 s |
| Human time spent | ~50 min, 1–3 people | 30 s approval |
| Postmortem draft | Next day | 6 minutes after mitigation |

Footnote on screen and slides: "Illustrative figures for a scripted scenario. Replace with your own baselines."

---

## 9. Live-mode grounding and validation

In live mode the **director** (ARCHITECTURE §6) keeps the act structure; the model writes the thought text, chooses tool arguments within an allow-list, and summarizes results. Each beat has a validator. If a turn fails validation or times out, the scripted beat is used.

| Beat | Must contain (case-insensitive) | Must not contain |
|---|---|---|
| Sentinel detection | "4.8" and ("SLO" or "800") | any cause claim |
| Log Detective signature | "connection" and ("pool" or "Hikari") | "database is down" |
| Log Detective pool | "10" | — |
| Code Archaeologist deploy | "v2.14.0" and "01:55" | — |
| Code Archaeologist diff | ("renamed" or "key") and "10" | — |
| Orchestrator root cause | "v2.14.0" and ("pool" or "connection") | — |
| Fixer recommendation | "rollback" or "roll back" | "max_connections" (except chaos) |
| Guardian decision | Must equal the deterministic policy engine result; the model may only phrase the explanation |
| Scribe artifacts | Must include every timeline timestamp in §6.2 |

Numbers are always taken from fixtures; the model must not invent metrics. Guardian's pass/fail is computed by code from `policies.json`; the model never decides policy outcomes.

---

## 10. Additional scenarios (application scope; outline only in v1)

Same engine, stage, and cast mechanics. Used on the "Beyond incidents" slides and as proof the engine is scenario-agnostic.

### 10.1 Legacy modernization squad
Goal: take a COBOL batch program to reviewed Java. Cast: Cartographer (maps program, copybooks, JCL dependencies) · Rule Miner (extracts business rules to plain English) · Translator (generates Java/Spring Batch) · Test Forger (builds equivalence tests from production-like fixtures) · Guardian (coding standards, architecture rules, security scan) · Scribe (migration notes) · Human (tech lead approves merge). Gate: merge to main. Chaos: Translator proposes dropping a rounding rule to make tests pass; Guardian blocks on functional equivalence.

### 10.2 RFP response squad
Goal: first draft of an RFP response in an afternoon. Cast: Reader (parses requirements into a matrix) · Researcher (finds prior answers and case studies) · Solution Architect (drafts solution) · Pricer (effort and commercial model) · Guardian (compliance, unsupported claims, confidentiality) · Scribe (assembles response) · Human (bid manager approves submission). Chaos: Researcher reuses another client's confidential case study; Guardian blocks on confidentiality policy.

### 10.3 Candidates for later
Employee onboarding (IT, HR, access provisioning), financial close reconciliation, customer escalation triage.

---

## 11. Realism layer (takes, investigation texture, the world around the agents)

The scripted run must feel like a live one (DECISIONS D-068 to D-071). Three mechanisms, all deterministic:

**Takes.** Every run plays one *take*, a number chosen when the page loads (URL `take=` pins it; the settings menu shows it). Take 0 is the canonical script in §4 and §5, used by tests, screenshots, and the decks. Any other take:
- picks, per line, the canonical wording or one of its alternates below (seeded by take and beat), and
- shifts the start of a few beats by a seeded amount within the spread listed below, so agents finish at uneven moments and the rollout pods land unevenly.

Alternates keep every fact and number of the canonical line and follow the same line rules (≤ 14 words per sentence, no exclamation marks or emoji). The spread never reorders beats inside an act and keeps the story clock monotonic; tests check 60 takes on every path.

Spread: `a1.b04` ±0.4 s, `a1.b06` ±0.3 s, `a3.b07` ±0.5 s, `a3.b08` ±0.5 s, `a3.x05` ±0.3 s, `a3.b12` ±0.6 s, `a3.b15` ±0.5 s, `a6.p1` ±0.4 s, `a6.p3` ±0.6 s, `a6.p4` ±0.5 s, `a6.p6` ±0.5 s, `o6.p1` ±0.4 s, `o6.p3` ±0.6 s, `o6.p4` ±0.5 s, `o6.p6` ±0.5 s.

**Investigation texture (Act 3).** A failed tool call with a retry; two suspects pinned as evidence cards and then struck through with the reason (the database, then the Spring Boot upgrade); the Orchestrator asking why the failure started at 02:04 rather than 01:55, which separates the trigger (traffic from a promo email at 02:03) from the cause (the pool cut to 10). Tool results carry real payloads from the fixtures (log lines, deploy table, dependency table, per-pod pool table, traffic table, diffs).

**The world around the agents.** An incident channel (Channel tab) where Pager, Support desk, Orchestrator, and Scribe post as the incident moves (texts in §4 and §5). The latency line and its readout carry a small seeded noise so the numbers never sit perfectly still, and keep drifting while the gate waits on a person. The approval sheet reads like a change request (reference, requester, waiting time). No mode badge is shown to the audience; the source (scripted take, live, fallback count) is visible only in the presenter's settings menu.

### 11.1 Alternate lines

| Beat | Agent | Canonical | Alternate |
|---|---|---|---|
| `a1.b04` | sentinel | "p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds." | checkout-api p99 is at 4.8 seconds. The SLO is 800 milliseconds. |
| `a1.b05` | sentinel | "Error rate is 11.4% and rising. Error budget is burning at 14 times normal." | Errors are at 11.4% and climbing. Budget burn is 14 times normal. |
| `a1.b06` | sentinel | "The breach has held for three minutes. This is not a blip." | Three minutes over the SLO now. This is not noise. |
| `a1.b09` | sentinel | "Evidence bundle sent to Orchestrator. I keep watching the numbers." | Orchestrator has the evidence bundle. I stay on the metrics. |
| `a2.b01` | orchestrator | "Checkout is the revenue path. Treating this as SEV-2." | Checkout carries revenue. This is a SEV-2. |
| `a2.b02` | orchestrator | "Three questions. What is failing, what changed, and how far it spreads." | Three questions to answer: what fails, what changed, and how far it reaches. |
| `a2.b07` | orchestrator | "Specialists are working in parallel. Target: root cause within three minutes." | All three specialists are on it in parallel. Aim: root cause in three minutes. |
| `a3.x01` | sentinel | "Trace store returned an error. Retrying with a narrower window." | The trace query failed with a 503. Trying again with five minutes of data. |
| `a3.b04` | log-detective | "1,912 errors since 02:04. One signature accounts for 94% of them." | 1,912 errors since 02:04, and 94% share one signature. |
| `a3.x03` | log-detective | "Timeouts waiting on connections. First suspect: the database is overloaded." | Requests time out waiting for connections. My first guess is the database. |
| `a3.b06` | log-detective | "The app is starving for database connections. Queries are not failing." | Queries succeed once they run. The app cannot get a database connection. |
| `a3.b07` | code-archaeologist | "v2.14.0 was deployed at 01:55. The alert fired twelve minutes later." | v2.14.0 went out at 01:55, twelve minutes before the alert. |
| `a3.x04` | code-archaeologist | "Three changes in v2.14.0. The Spring Boot upgrade is the usual suspect." | v2.14.0 carries three changes. I start with the Spring Boot upgrade. |
| `a3.b08` | sentinel | "payments-gateway and inventory-svc are healthy. orders-db is at 22% CPU." | Downstream looks fine. payments-gateway and inventory-svc are healthy, orders-db is at 22% CPU. |
| `a3.b09` | sentinel | "Database connections are 180 of 500. The bottleneck is inside checkout-api." | orders-db has 180 of 500 connections in use. The limit is inside checkout-api. |
| `a3.x05` | code-archaeologist | "Patch release, and HikariCP is unchanged. Ruling out the upgrade." | A patch release with the same HikariCP version. The upgrade is not it. |
| `a3.b11` | log-detective | "Not the database, then. Checking the pool inside checkout-api." | The database is fine. The pool inside checkout-api is next. |
| `a3.b12` | log-detective | "Active connections are pinned at 10 of 10 on every pod. 380 threads are waiting." | Every pod sits at 10 of 10 connections, with 380 threads waiting. |
| `a3.b16` | code-archaeologist | "The config refactor renamed the pool setting. The app still reads the old key." | The Helm refactor renamed the pool key. The app only reads the old name. |
| `a3.b17` | code-archaeologist | "Without it, HikariCP falls back to its default of 10. Production needs about 40." | So HikariCP uses its default of 10. Production needs about 40. |
| `a3.x06` | orchestrator | "Before I accept it: why did it break at 02:04, not 01:55?" | One gap first. The deploy was 01:55, but errors started at 02:04. |
| `a3.x08` | sentinel | "Traffic more than doubled at 02:03, from 1,100 to 2,600 requests a minute." | At 02:03 traffic jumped from 1,100 to 2,600 requests a minute. |
| `a3.x09` | orchestrator | "Traffic is the trigger. The pool cut to 10 is the cause." | So the traffic rise exposed it. The smaller pool is the cause. |
| `a3.b19` | orchestrator | "Three signals agree: pool exhaustion, a pool-size change, and a healthy database." | The evidence lines up: exhausted pool, pool-size change, healthy database. |
| `a3.b21` | orchestrator | "Root cause identified {{since:a1.b07}} after the alert. Moving to mitigation." | Root cause found {{since:a1.b07}} after the alert. On to mitigation. |
| `a6.b02` | log-detective | "Pool errors stopped at {{clock}}. Active connections are 22 of 40." | No pool errors since {{clock}}. Connections are at 22 of 40. |
| `a6.b03` | fixer | "Rollback complete. All six pods run v2.13.2." | All six pods are back on v2.13.2. Rollback done. |
| `a6.b05` | sentinel | "p99 is 190 milliseconds and errors are 0.2%. Stable for five minutes." | Five minutes stable: p99 at 190 milliseconds, errors at 0.2%. |
| `a7.b02` | scribe | "Two audiences: stakeholders now, engineers in the morning." | Stakeholders get an update now. Engineers get the postmortem for the morning. |
| `r.b02` | orchestrator | "Rollback declined. Looking for a fix that keeps v2.14.0 live." | No rollback, then. Finding a fix that keeps v2.14.0 in place. |
| `o6.b02` | log-detective | "Pool errors stopped at {{clock}}. Active connections are 22 of 40." | No pool errors since {{clock}}. Connections are at 22 of 40. |
| `o6.b05` | sentinel | "p99 is 190 milliseconds and errors are 0.2%. Stable for five minutes." | Five minutes stable: p99 at 190 milliseconds, errors at 0.2%. |
| `o7.b02` | scribe | "Two audiences: stakeholders now, engineers in the morning." | Stakeholders get an update now. Engineers get the postmortem for the morning. |
| `c.b02` | fixer | "Faster idea: raise max_connections on orders-db and restart it." | Quicker option: bump max_connections on orders-db and restart it. |

### 11.2 Run-time tokens (DECISIONS D-074)

Any text that states a time or duration from the run uses a token, filled in when the run is compiled (and again whenever a gate wait or a squad pause moves the clock). Tokens appear in lines, channel posts, the status update, the postmortem, the end card headline, the scorecard, and the split view.

| Token | Becomes |
|---|---|
| `{{clock}}` / `{{hm}}` | This moment on the run clock, `02:10:41` / `02:10` |
| `{{clock:a6.b02}}` / `{{hm:a6.b02}}` | When that beat played |
| `{{since:a1.b07}}` | Time from that beat to now, `2 min 18 s` |
| `{{span:a1.b07:a6.b02}}` | Time between two beats |
| `{{wait}}` / `{{wait:g1}}` | Time the person took at all gates / at one gate |

`a6.b02|o6.b02` picks whichever beat played on this path. Live turns get the same tokens in their reference text and must copy them exactly; the validator checks that they did.
