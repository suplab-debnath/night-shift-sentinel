# Architecture — Night Shift

## 1. Modes

| Mode | What runs | Network | Used for |
|---|---|---|---|
| `scripted` (default) | Browser only; engine plays `scenario.json` | None | Every client demo; offline single file |
| `live-mock` | Browser + local server; mock LLM provider replays scripted text through the live path | Localhost only | Testing the live pipeline offline; CI |
| `live-bedrock` | Browser + server (local or Lambda); agent turns call Claude on Amazon Bedrock | AWS | Technical audiences; "it's real" moment |

The UI never branches on mode. It consumes one event stream (§4) from an `EventSource` abstraction:
- `ScriptedSource` — engine player in the browser.
- `LiveSource` — streams segments from the server (§7); if the stream errors or stalls for more than `LIVE_STALL_MS` (default 4000), it hands over to `ScriptedSource` at the current beat; only the presenter's settings menu shows "Live, scripted fallback" (no badge on stage, DECISIONS D-070).

## 2. Component view

```
┌──────────────────────────── Browser (apps/web) ───────────────────────────┐
│  UI components  ◀── Zustand store ◀── Stage reducer (packages/engine)     │
│                                  ▲                                         │
│                     EventSource: ScriptedSource | LiveSource              │
│                        │ (engine player)      │ fetch() stream (POST)     │
└────────────────────────┼──────────────────────┼───────────────────────────┘
                         │                      ▼
                         │         ┌────── Server (apps/server) ──────┐
                         │         │ Segment API  ─▶ Director          │
                         │         │                 │   ▲            │
                         │         │   Agent turn ───┘   │ validators │
                         │         │     │ LlmProvider (mock|bedrock) │
                         │         │     │ Tools (fixtures) + Policy  │
                         │         │     │ engine (deterministic)     │
                         │         └─────┼─────────────────────────────┘
                         │               ▼
                         │      Amazon Bedrock (Converse / ConverseStream)
                         ▼
          packages/scenarios/incident-checkout (scenario.json, agents.json, fixtures)
```

## 3. Packages

### `packages/engine`
Framework-free TypeScript. No DOM, no Node APIs.
- `events.ts` — event union (§4).
- `schema.ts` — zod schemas for scenario, agents, fixtures; `parseScenario()`.
- `compile.ts` — turns a scenario + decision path into a flat, time-ordered timeline.
- `player.ts` — virtual clock, `play/pause/step/seek/setSpeed`, gate handling, overlay (chaos) handling.
- `reducer.ts` — `reduce(state, event) → state` producing `StageState` (agent states, packets in flight, stream lines, evidence, audit, artifacts, metrics, gate, clock, severity).
- `prng.ts` — seeded PRNG (mulberry32) for any jitter.
- `index.ts` — public API only.

### `packages/scenarios`
- `incident-checkout/scenario.json`, `agents.json`, `fixtures/*.json`, `copy.json` (all agent lines).
- `index.ts` exports typed, validated scenarios. Future: `legacy-modernization/`, `rfp-response/`.

### `apps/web`
React + Vite. `src/sources/` (ScriptedSource, LiveSource, pacer), `src/state/` (store), `src/components/`, `src/styles/tokens.css`, `src/copy.ts`, `src/shortcuts.ts`.

### `apps/server`
Fastify (local) and a Lambda streaming handler (AWS) over the same `core/`:
- `core/segments.ts` — runs a segment and yields events.
- `core/director.ts` — walks scenario beats; decides which are live.
- `core/agentTurn.ts` — one model turn with tool loop, timeout, validation, fallback.
- `core/tools/*.ts` — fixture-backed tools.
- `core/policy.ts` — deterministic policy engine over `policies.json`.
- `core/validators.ts` — per-beat checks from SCENARIO.md §9.
- `providers/mock.ts`, `providers/bedrock.ts` — `LlmProvider` implementations.
- `http/fastify.ts`, `http/lambda.ts` — transports.

## 4. Event protocol

```ts
export type AgentId =
  | 'sentinel' | 'orchestrator' | 'log-detective' | 'code-archaeologist'
  | 'fixer' | 'guardian' | 'scribe' | 'human';

export type AgentState =
  | 'idle' | 'thinking' | 'working' | 'watching' | 'done' | 'blocked' | 'waiting';

interface Base {
  id: string;                 // stable, e.g. "a3.b07.e2"
  t: number;                  // ms from scenario start on this path (scripted); arrival order in live
  clock?: string;             // story clock "02:08:31"
  source: 'script' | 'live' | 'fallback';
}

export type EngineEvent = Base & (
  | { kind: 'scene.start'; act: number; title: string }
  | { kind: 'scene.end'; act: number }
  | { kind: 'clock.set'; clock: string; running: boolean }
  | { kind: 'agent.state'; agent: AgentId; state: AgentState }
  | { kind: 'thought'; agent: AgentId; text: string; stream?: boolean }
  | { kind: 'tool.call'; agent: AgentId; callId: string; tool: string; args: Record<string, unknown> }
  | { kind: 'tool.result'; agent: AgentId; callId: string; summary: string;
      payload?: { type: 'log' | 'diff' | 'table' | 'json'; content: string };
      status?: 'ok' | 'error' }                       // error: a failed call, audited as warn
  | { kind: 'message.send'; from: AgentId; to: AgentId; label: string; showLabel?: boolean }
  | { kind: 'metric.update'; series: 'p99' | 'errorRate' | 'poolActive';
      to: number; durationMs: number }
  | { kind: 'stage.alert'; severity: 'SEV-1' | 'SEV-2' | 'SEV-3' }
  | { kind: 'severity.set'; value: 'SEV-2' | 'Mitigated' | 'Handed to humans' }
  | { kind: 'evidence.pin'; cardId: string; agent: AgentId; text: string;
      evidenceKind?: 'clue' | 'hypothesis' }         // hypothesis: a suspect that may be ruled out
  | { kind: 'evidence.ruleOut'; cardId: string; reason: string }
  | { kind: 'evidence.conclude'; cardIds: string[]; text: string; confidence: number }
  | { kind: 'options.show'; agent: AgentId; recommended: string;
      options: { id: string; action: string; time: string; risk: 'Low' | 'Medium' | 'High';
                 reversible: boolean; note: string }[] }
  | { kind: 'guardrail.check'; policyId: string; description: string;
      result: 'pass' | 'fail' | 'required'; reason: string }
  | { kind: 'gate.request'; gateId: string; title: string; summary: string;
      evidenceRefs: string[]; approveLabel: string; rejectLabel: string }
  | { kind: 'gate.resolve'; gateId: string; decision: 'approved' | 'rejected'; by: string }
  | { kind: 'progress.update'; agent: AgentId; label: string; current: number; total: number }
  | { kind: 'timelapse'; label: string; advanceClockSec: number }
  | { kind: 'permission.denied'; agent: AgentId; tool: string }
  | { kind: 'audit'; severity: 'info' | 'warn' | 'high'; text: string; agent?: AgentId }
  | { kind: 'artifact.create'; artifactId: string;
      type: 'plan' | 'status' | 'postmortem' | 'escalation'; title: string; markdown: string; stream: boolean }
  | { kind: 'channel.post'; author: string; agent?: AgentId; text: string }  // incident channel
  | { kind: 'chaos.start' } | { kind: 'chaos.end' }
  | { kind: 'scorecard.show' }
);
```

Rules: events are immutable; the reducer is pure and total (unknown kinds are ignored with a dev warning); the audit log is derived from events (every `tool.call`, `guardrail.check`, `gate.*`, `permission.denied`, `audit` produces an audit row).

## 5. Scenario schema (summary)

```ts
Scenario = {
  id: string; title: string; world: { company: string; service: string };
  clockStart: string;                       // "02:07:00"
  acts: Act[];                              // main path, in order
  gates: Record<string, { onApprove: SegmentRef; onReject: SegmentRef }>;
  segments: Record<string, Segment>;        // "main", "g1-approved", "g1-rejected", "g2-approved", "g2-rejected", "chaos"
  overlays: { chaos: { segment: 'chaos'; availableFrom: { act: number } } };
  scorecard: ScorecardRow[]; splitView: SplitLane[];
}
Segment = { acts: Act[]; endsWith: { gate: string } | { end: 'A' | 'B' } | { returnTo: 'trigger' } }
Act = { n: number; name: string; beats: Beat[] }
Beat = {
  id: string; t: number /* ms from act start at 1x */; clock?: string;
  jitterMs?: number;                        // seeded start spread on non-zero takes (SCENARIO §11)
  events: (EventTemplate & { offsetMs?: number; alt?: string[] })[];  // alt: take wordings, never emitted
  live?: { agent: AgentId; goal: string; allowedTools: string[]; validator: string; maxSentences: number }
}
```

Validation tests (P2): schema-valid; every gate has both branches; every segment reachable; every `copy` line in SCENARIO.md is present (a script extracts quoted lines from SCENARIO.md tables and compares).

## 6. Engine player

- **Timeline compilation:** `compile(scenario, decisions)` concatenates segments along the decision path, converting beat-relative `t` into absolute ms. Before a gate is decided, the timeline ends at `gate.request` and the player enters `awaitingGate`.
- **Clock:** `advance(dtMs)` called by a driver (`requestAnimationFrame` in the browser; a manual driver in tests). Speed multiplies `dtMs`.
- **Seek:** `state = events.filter(e => e.t <= target).reduce(reduce, initial)`. Snapshots cached every 5 s of timeline for O(1)-ish scrubbing. Seeking before a resolved gate clears that decision and everything after it.
- **Step:** jump to the next beat boundary.
- **Overlay (chaos):** pauses the main timeline, plays the chaos segment on an overlay layer, then resumes. Overlay audit rows persist; overlay visual state is discarded at `chaos.end`.
- **Determinism:** no wall-clock reads inside the engine; property test: for random seek targets, `seek(t)` equals linear playback to `t`.
- **Run clock (DECISIONS D-074):** event clocks are computed, not authored: real time from `clockStart`, faster during `clock.rate` fast-forwards, jumping at time-lapses, standing still during chaos, and moved forward by two kinds of decisions the UI adapter records from wall time: `gate.waitedMs` (how long the person took) and `{ type: 'hold', at, ms }` (the squad was paused). Both are ordinary decisions, so replay stays deterministic and seeking before one clears it. Text that quotes run times carries tokens (`{{clock:a6.b02}}`, `{{span:a:b}}`, `{{wait}}`) resolved in `compile`; `resolveRunText` resolves scenario-level text (headline, scorecard, split view) the same way. Live turns receive the tokenised reference and must copy tokens verbatim.
- **Pacing (D-072):** `pace` stretches scripted durations and makes the timeline elastic (reading time per line, a thinking pause before each).

## 7. Server and live mode

### 7.1 Stateless segment API
Lambda cannot hold a run in memory between requests, so the live protocol is **stateless and segment-based**. The client holds the run context and sends it with each request; the server streams one segment and closes.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/health` | — | `{ mode, bedrock: { configured, region, model: "<masked>" } }` |
| POST | `/api/segments` | `{ scenarioId, segment, decisions, context }` | `text/event-stream` of `EngineEvent`, ends with `{kind:"segment.end"}` |
| POST | `/api/ask` (stretch) | `{ scenarioId, context, question }` | streamed answer grounded in fixtures and context |

`context` = compact evidence summary accumulated client-side (pinned evidence texts, root-cause text, options chosen). Size-capped at 8 KB. The client reads the stream with `fetch()` + `ReadableStream` (EventSource cannot POST). Optional header `x-demo-passcode` when `DEMO_PASSCODE` is set.

### 7.2 Director
Walks the segment's beats in order. For each beat:
- Beats without `live` → emit scripted events (source `script`).
- Beats with `live` → run an **agent turn**. Visual/system events around it (metric updates, packets, states, guardrail results, gates) always come from the script or the policy engine, never from the model.

This is **directed autonomy**: the story keeps its shape, while the words, tool arguments, and summaries are produced live.

### 7.3 Agent turn
1. Build the request: system prompt = global rules + persona (SCENARIO §2) + allowed facts; user message = beat goal + `context`; tools = only `allowedTools`.
2. Call the provider with streaming; forward text deltas as `thought` events (chunked on sentence boundaries).
3. Tool loop (max 3 iterations): execute tool against fixtures, emit `tool.call`/`tool.result`, return result to the model.
4. Timeout per turn: `LIVE_TURN_TIMEOUT_MS`. Token cap: `LIVE_MAX_TOKENS_PER_TURN`.
5. Validate the full output with the beat's validator (SCENARIO §9). On failure, timeout, or provider error: discard live output **not yet shown**, emit the scripted beat with `source: 'fallback'`, log the reason. If some live text was already shown, finish with the scripted beat's final sentence so the story stays correct.

### 7.4 Providers
```ts
interface LlmProvider {
  converseStream(req: {
    modelId: string; system: string; messages: Msg[]; tools: ToolSpec[];
    maxTokens: number; temperature: number; signal: AbortSignal;
  }): AsyncIterable<ProviderDelta>;  // text deltas, tool-use requests, stop, usage
}
```
- `MockProvider` — yields scripted text with realistic delays; can be configured to fail/timeout for tests.
- `BedrockProvider` — `@aws-sdk/client-bedrock-runtime` `ConverseStreamCommand`. Credentials from the default provider chain. `modelId` from `BEDROCK_MODEL_ID` (Orchestrator, Guardian explanations, Scribe) and `BEDROCK_FAST_MODEL_ID` (other specialists; falls back to the main model). Optional guardrail via the request's guardrail configuration when `BEDROCK_GUARDRAIL_ID` is set. **Check the installed SDK's TypeScript types for exact field names** (tool spec, stream event shapes, usage metadata) rather than relying on memory.
- **Tool names:** Bedrock tool names must be alphanumeric with `_` or `-`. Internal dotted names (`logs.search`) are mapped to `logs_search` at the provider boundary and back.
- Temperature 0.3; `stopSequences` none; max 2 sentences enforced by validator, not by truncation.

### 7.5 Tools (fixture-backed, deterministic)
`metrics.query`, `traces.get`, `logs.search`, `deploys.list`, `git.diff`, `runbook.lookup`, `policy.check`, `deploy.rollback`*, `config.override`*, `deploy.restart`*, `doc.write`, `comms.draft`. (* only callable when the segment's decision path contains the matching approval; otherwise return `permission.denied`.) `db.alter` exists in the registry so the chaos beat can demonstrate `permission.denied`, but is granted to no agent.

Each tool validates args with zod and returns a compact summary plus an optional payload. Tools never throw to the model; they return structured errors.

### 7.6 Policy engine
`policy.check(action)` evaluates `policies.json` rules in code and returns per-policy results. The Guardian model receives these results and may only phrase the explanation. Validators reject any Guardian text that contradicts the computed outcome.

`policies.json` includes P-01 human approval for prod changes, P-02 prod DB changes need DBA and change board, P-03 change freeze with incident exception, P-04 blast radius one service, P-05 rollback target verified within 30 days, P-06 no irreversible or outage-causing operations, P-08 runtime overrides recorded with expiry.

## 8. AWS deployment (CDK, no Docker)

```
Viewer ─▶ CloudFront ─┬─ /*       ─▶ S3 (private, OAC)        static web build
                      └─ /api/*   ─▶ Lambda Function URL (OAC, RESPONSE_STREAM)
                                       └─▶ Amazon Bedrock (Converse)
```

- **Stack `NightShiftStack`** (`infra/lib/night-shift-stack.ts`):
  - S3 bucket: block all public access, SSE-S3, versioning on; deployed with `BucketDeployment` from `apps/web/dist`.
  - CloudFront distribution: OAC for S3; SPA fallback to `index.html`; `/api/*` behaviour to the Function URL origin with caching disabled and an origin request policy that forwards all viewer headers except `Host`.
  - Lambda: Node.js 22 (see DECISIONS D-004), arm64, 512 MB, 120 s timeout, reserved concurrency 5 (cost cap), `NodejsFunction` with **`bundling.forceDockerBundling: false`** and `esbuild` as a devDependency. Function URL `invokeMode: RESPONSE_STREAM`, `authType: AWS_IAM`, fronted by CloudFront OAC.
  - IAM (least privilege): `bedrock:InvokeModel`, `bedrock:InvokeModelWithResponseStream` on the configured model ARNs — and, if an inference profile is used, on the profile ARN plus the underlying foundation-model ARNs in each region it can route to; `bedrock:ApplyGuardrail` on the guardrail ARN if configured; `ssm:GetParameter` on the passcode parameter.
  - Config via CDK context: `region`, `modelId`, `fastModelId`, `guardrailId`, `guardrailVersion`, `passcodeParam` (SSM SecureString name).
  - Optional: AWS Budgets alarm construct (`budgetMonthlyUsd` context).
- **OAC and POST:** when CloudFront signs requests to a Lambda Function URL with OAC, POST bodies need the `x-amz-content-sha256` header from the viewer. The web client computes the SHA-256 of the JSON body with Web Crypto and sends it on `/api/*` POSTs. Verify this against current AWS documentation during P7; if it changes, adjust the client.
- **Lambda streaming handler:** `http/lambda.ts` uses Lambda response streaming (`awslambda.streamifyResponse`) and writes SSE frames from `core/segments.ts`.
- **Region:** choose a region where the chosen Claude model is enabled for the account (for an EU client, prefer an EU region and an EU inference profile). Model access must be enabled in the Bedrock console first.
- **Commands:** `npm run cdk:synth`, `npm run cdk:deploy -- -c modelId=... -c region=...`. `cdk bootstrap` once per account/region (CloudFormation only, no Docker).
- **Acceptance:** `cdk synth` succeeds on a machine without Docker installed.

## 9. Offline build

- `vite build --mode offline` with `vite-plugin-singlefile`; `assetsInlineLimit` high enough to inline the `woff2` font files; scenario JSON imported statically.
- Output: `apps/web/dist-offline/index.html`, one file, opens from `file://` with the network disabled.
- `npm run demo` builds it and serves `dist-offline/` via `vite preview` on port 4173.
- No service worker needed; no external requests (Playwright test asserts zero non-`file:`/non-localhost requests).

## 10. Testing strategy

| Layer | Tool | Must cover |
|---|---|---|
| Engine | Vitest (+ fast-check for property tests) | reducer totality, compile per decision path, seek ≡ replay, step, speed, overlay resume |
| Scenario | Vitest | schema validity, reachability, SCENARIO.md line coverage |
| Server | Vitest + `aws-sdk-client-mock` | director order, tool loop, validator pass/fail, timeout → fallback, tool-name mapping, policy engine outcomes |
| Web units | Vitest + Testing Library | GateSheet focus trap, shortcut map, reduced-motion rendering |
| E2E | Playwright | happy path (speed 8× via `?speed=8`), Branch R (approve g2, reject g2), chaos from Act 4 and end card, reduced motion, offline `file://`, 1366×768 layout, no console errors |

## 11. Observability and cost

- Server logs: structured JSON (`pino`), one line per turn: `segment`, `beat`, `agent`, `modelId`, `latencyMs`, `inputTokens`, `outputTokens`, `fallbackReason?`.
- A full live run is roughly a dozen model turns with small outputs; cap with `LIVE_MAX_TOKENS_PER_TURN`, reserved concurrency, and the optional budget alarm.
- `/api/health` shows whether Bedrock is configured without exposing identifiers in full.

## 12. Security

- No AWS credentials or model IDs in the browser bundle.
- Prompts include only fixture data; no client data ever enters the demo.
- Input validation with zod on every endpoint; body size limit 16 KB.
- Optional passcode; CORS restricted to the CloudFront domain in AWS and `localhost` locally.
- Bedrock Guardrail optional for content filtering; the policy engine is the primary control for actions.

## 13. Adding a scenario

1. Copy `packages/scenarios/incident-checkout` to a new folder.
2. Write the script in a new `docs/SCENARIO-<name>.md` following the same structure.
3. Update `agents.json` (positions, hues may be reused), fixtures, policies, validators.
4. Register it in `packages/scenarios/index.ts`; add a scenario picker entry (hidden unless `?scenario=` is set in v1).
