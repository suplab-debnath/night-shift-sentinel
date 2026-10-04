# CLAUDE.md — Night Shift: Agent Theater

This file is the operating manual for Claude Code in this repository. Read it fully before doing anything.

## 1. What we are building

**Night Shift** is an interactive, visual demo of a multi-agent AI squad resolving a production incident ("Premium run at risk at 2:07 AM": a European life insurer's nightly SEPA premium collection; DECISIONS D-081). It is shown to clients in a live meeting to make agentic AI and our organization's AI adoption tangible: autonomy with human control, governance built in, measurable outcomes.

Deliverables, in priority order:

1. **Web app** (the "theater") that runs fully **offline** in scripted mode — no network, no Docker, no backend required.
2. **Live mode** in which the same stage is driven by real agent calls to **Claude on Amazon Bedrock**, through a small local Node server, with automatic fallback to the script.
3. **AWS deployment provision** (CDK, TypeScript) to host the app and live mode on AWS — without Docker.
4. **Two PowerPoint decks** generated from code: an executive narrative deck and a technical appendix.
5. **Runbook** for demo day (setup, presenter script, failure recovery).

## 2. Source-of-truth documents (read in this order)

| Doc | What it governs |
|---|---|
| `docs/BRIEF.md` | Why, audience, story, scope, success criteria |
| `docs/SCENARIO.md` | Every act, beat, agent line, branch, timing, fixture fact. **The script is canon.** |
| `docs/DESIGN.md` | Visual system: tokens, type, layout, motion, components, accessibility |
| `docs/ARCHITECTURE.md` | Modes, engine, event protocol, server, Bedrock integration, AWS infra |
| `docs/DECK.md` | Slide-by-slide spec for both decks |
| `docs/RUNBOOK.md` | Demo-day operations and presenter script |

If docs conflict: SCENARIO wins on content, DESIGN wins on visuals, ARCHITECTURE wins on technical structure. Flag any conflict you find in `docs/DECISIONS.md` (create it) rather than silently picking.

## 3. Non-negotiables

1. **Offline-first.** Scripted mode must work with Wi-Fi off. No CDNs, no Google Fonts links, no remote images, no runtime fetches. Fonts are bundled via `@fontsource/*` packages; icons via `lucide-react`.
2. **No Docker anywhere.** Not for dev, not for tests, not for CDK bundling. CDK `NodejsFunction` must bundle with locally installed `esbuild` (`forceDockerBundling: false`). `.claude/settings.json` denies `docker` commands.
3. **Deterministic scripted demo.** Same inputs → same frames. Seekable, pausable, steppable, speed-adjustable. No `Math.random()` in the engine; use a seeded PRNG if jitter is needed.
4. **Live mode is optional and must never break the demo.** Every live agent turn has a timeout; on error, timeout, or failed validation, that beat falls back to the scripted beat. Nothing on stage marks the mode or a fallback; the source and fallback count show only in the presenter's settings menu (DECISIONS D-070). The presenter never sees a stack trace.
5. **One event protocol.** Scripted playback and live mode emit the *same* typed events (`packages/engine/src/events.ts`). The UI only consumes events; it never knows which mode produced them.
6. **Light, modern UI** exactly per `docs/DESIGN.md`. Do not substitute a dark theme or the generic AI-demo look listed in DESIGN §9.
7. **Honest numbers.** All outcome figures (MTTR, premiums at risk) are illustrative and must be labelled "Illustrative" in the UI and decks. Never invent industry statistics; where a deck slide needs a real number, leave a visible `{{PRESENTER: add sourced figure}}` placeholder.
8. **Secrets.** AWS credentials come from the default provider chain (profile/SSO) on the server side only. Nothing AWS-related ships to the browser. Never commit `.env`.
9. **Do not guess Bedrock model IDs or SDK parameter names.** Model IDs come from env (`BEDROCK_MODEL_ID`, `BEDROCK_FAST_MODEL_ID`). Check the installed `@aws-sdk/client-bedrock-runtime` types for exact field names before using them.
10. **Placeholders** `{{ORG_NAME}}`, `{{CLIENT_NAME}}`, `{{PRESENTER_NAME}}` stay configurable (`config/branding.json`); no logos or third-party brand assets are embedded.

## 4. Tech stack

- **Runtime:** Node.js 20 LTS or newer, npm workspaces. TypeScript strict everywhere.
- **Web:** React 18 + Vite, Zustand (store), Motion (`motion/react`, formerly Framer Motion) for animation, plain CSS with CSS custom properties (tokens) + CSS Modules. Custom SVG for the latency line and packet paths. `vite-plugin-singlefile` for the offline single-file build.
- **Engine:** framework-free TypeScript package; Vitest for tests.
- **Server (live mode):** Fastify, Server-Sent Events, `@aws-sdk/client-bedrock-runtime` (Converse / ConverseStream API), `zod` for validation.
- **Infra:** AWS CDK v2 (TypeScript): S3 + CloudFront (OAC) for the web app, Lambda (Node 22, arm64; see DECISIONS D-004) with response streaming behind a Function URL for `/api/*`.
- **Decks:** `pptxgenjs` generator script + Playwright screenshot capture of the running app.
- **E2E / visual checks:** Playwright (installed browsers, no Docker).

Add a dependency only when it clearly earns its place; record why in `docs/DECISIONS.md`.

## 5. Repository layout (target)

```
night-shift/
├─ CLAUDE.md, README.md, package.json (workspaces), tsconfig.base.json, .env.example
├─ config/branding.json                 # org/client/presenter placeholders, demo options
├─ docs/                                # BRIEF, SCENARIO, DESIGN, ARCHITECTURE, DECK, RUNBOOK, DECISIONS
├─ packages/
│  ├─ engine/                           # events, scenario schema, player, reducer, PRNG
│  └─ scenarios/
│     └─ premium-run/             # scenario.json, fixtures/*.json, agents.json
├─ apps/
│  ├─ web/                              # React stage UI
│  └─ server/                           # Fastify + providers (mock, bedrock) + tools
├─ infra/                               # CDK app (no Docker bundling)
├─ deck/                                # build-deck.mjs, capture-screens.mjs, assets/, out/
└─ .claude/                             # agents, commands, settings
```

## 6. Commands (to be implemented exactly with these names)

| Command | Does |
|---|---|
| `npm install` | Install all workspaces |
| `npm run dev` | Web app in scripted mode at http://localhost:5173 |
| `npm run dev:live` | Web + server; live mode via Bedrock (reads `.env`) |
| `npm run dev:live-mock` | Web + server with the mock LLM provider (tests the live path offline) |
| `npm run build` | Typecheck + build all packages |
| `npm run build:offline` | Single self-contained `apps/web/dist-offline/index.html` (works from `file://`) |
| `npm run demo` | Build offline bundle and serve it on http://localhost:4173 |
| `npm test` | Vitest for engine, server, web units |
| `npm run e2e` | Playwright: full scripted run, all branches, reduced-motion, offline |
| `npm run deck` | Capture screenshots then build both .pptx decks into `deck/out/` |
| `npm run cdk:synth` / `npm run cdk:deploy` | Infra (from `infra/`) |

## 7. Build phases and ownership

Work phase by phase. Each phase ends with its Definition of Done (DoD) green before the next begins, except where marked parallel.

| # | Phase | Owner agent | DoD |
|---|---|---|---|
| P0 | Scaffold workspaces, tooling, lint, tsconfig, `.env.example`, branding config | (main) | `npm run build` passes on empty packages |
| P1 | Engine: events, scenario schema (zod), player (clock, speed, pause, step, seek, branches) | `engine-engineer` | Vitest ≥ 90% line coverage on engine; seek(t) equals linear replay to t |
| P2 | Scenario content: `scenario.json`, `agents.json`, fixtures from SCENARIO.md | `scenario-author` | Schema-valid; every line in SCENARIO.md present; all branches reachable |
| P3 | Stage UI, scripted mode end to end | `ui-engineer` | Full happy path plays offline at 1x in ≈ 3 min; matches DESIGN.md |
| P4 | Interactions: gates, reject branch, chaos, split view, inspector, audit, artifacts, presenter mode, shortcuts | `ui-engineer` | All RUNBOOK shortcuts work; all branches play |
| P5 | Offline packaging (`build:offline`, `demo`) | `ui-engineer` | Opens from `file://` with network disabled; fonts render |
| P6 | Server + live mode (mock + Bedrock providers, tools on fixtures, fallback) | `bedrock-integrator` | `dev:live-mock` passes e2e; Bedrock path works with a valid profile; forced timeout falls back cleanly |
| P7 | AWS infra (parallel after P6 interfaces are fixed) | `aws-infra-engineer` | `cdk synth` succeeds with no Docker installed; least-privilege IAM |
| P8 | Decks (parallel after P4) | `deck-builder` | Both decks build, validate, pass visual QA |
| P9 | QA, accessibility, rehearsal | `qa-reviewer` | QA checklist in `docs/QA_REPORT.md` all pass |

Use `/build-all` to drive the phases, `/rehearse` for a timed dry run, `/build-deck` for decks.

## 8. Conventions

- TypeScript `strict: true`, no `any` in engine or server public APIs. Discriminated unions for events.
- Pure functions in the engine; side effects only in adapters (UI, server).
- CSS: tokens only (`var(--…)`); no hard-coded hex values outside `apps/web/src/styles/tokens.css`.
- Components small and named by what users see (`GateSheet`, `ThoughtStream`), not by implementation.
- UI copy: sentence case, active voice, no exclamation marks, no emoji in the product UI.
- Tests next to code (`*.test.ts`). Every bug fixed gets a regression test.
- Commits: conventional commits (`feat(engine): …`). Small, one concern each.

## 9. Environment variables (`.env.example`)

```
AGENT_MODE=scripted            # scripted | live-mock | live-bedrock
PORT=8787
AWS_REGION=eu-west-1           # choose a region where your Claude models are enabled
AWS_PROFILE=                   # local profile or SSO profile name
BEDROCK_MODEL_ID=              # Claude model ID or inference profile ID enabled in your account
BEDROCK_FAST_MODEL_ID=         # optional cheaper/faster model for specialist agents
BEDROCK_GUARDRAIL_ID=          # optional Bedrock Guardrail
BEDROCK_GUARDRAIL_VERSION=
LIVE_TURN_TIMEOUT_MS=9000
LIVE_MAX_TOKENS_PER_TURN=600
LIVE_STALL_MS=4000
DEMO_PASSCODE=                 # optional shared passcode for the hosted /api
```

## 10. How to work here

- Before a phase, re-read the relevant docs sections; quote the section you implement in the PR/commit body.
- Prefer delegating to the named subagent for its phase; the main session integrates and reviews.
- When something in the docs is ambiguous, choose the option that keeps the demo safer and more deterministic, and log it in `docs/DECISIONS.md`.
- Never mark a phase done without running its DoD commands and pasting the result summary.
