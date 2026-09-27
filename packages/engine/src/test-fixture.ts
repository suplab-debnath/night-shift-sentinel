// A compact scenario with every branch shape, used only by engine tests.
import { parseScenario, type ScenarioInput } from './schema';

export const fixtureInput: ScenarioInput = {
  id: 'fixture',
  title: 'Fixture',
  world: { company: 'Parcelo', service: 'checkout-api' },
  clockStart: '02:07:00',
  slo: { p99Ms: 800, errorRatePct: 1 },
  initialMetrics: { p99: 180, errorRate: 0.2, poolActive: 22 },
  gateGapMs: 600,
  gates: {
    g1: { onApprove: 'g1-approved', onReject: 'g1-rejected' },
    g2: { onApprove: 'g2-approved', onReject: 'g2-rejected' },
  },
  segments: {
    main: {
      acts: [
        {
          n: 1,
          name: 'Alert',
          durationMs: 4000,
          beats: [
            {
              id: 'a1.b01',
              t: 0,
              clock: '02:07:00',
              events: [
                { kind: 'scene.start', act: 1, title: '02:07. Checkout is slowing down.', card: true },
                { kind: 'metric.update', series: 'p99', to: 4800, durationMs: 2000, offsetMs: 400 },
              ],
            },
            {
              id: 'a1.b02',
              t: 1000,
              clock: '02:07:04',
              events: [
                { kind: 'agent.state', agent: 'sentinel', state: 'working' },
                { kind: 'tool.call', agent: 'sentinel', callId: 'c1', tool: 'metrics.query', args: { service: 'checkout-api', window: '15m' } },
                { kind: 'thought', agent: 'sentinel', text: 'p99 latency is 4.8 seconds.' },
              ],
            },
            {
              id: 'a1.b03',
              t: 2000,
              clock: '02:07:14',
              events: [
                { kind: 'stage.alert', severity: 'SEV-2' },
                { kind: 'message.send', from: 'sentinel', to: 'orchestrator', label: 'SEV-2', showLabel: true, offsetMs: 500 },
              ],
            },
          ],
        },
        {
          n: 2,
          name: 'Diagnosis',
          durationMs: 4000,
          beats: [
            {
              id: 'a2.b01',
              t: 0,
              clock: '02:07:22',
              events: [
                { kind: 'scene.start', act: 2, title: 'Diagnosis' },
                { kind: 'tool.result', agent: 'sentinel', callId: 'c1', summary: '4.8 s', payload: { type: 'log', content: 'HikariPool-1' } },
                { kind: 'evidence.pin', cardId: 'e1', agent: 'log-detective', text: 'Pool exhausted.' },
                { kind: 'evidence.pin', cardId: 'e2', agent: 'code-archaeologist', text: 'Key renamed.' },
              ],
            },
            {
              id: 'a2.b02',
              t: 2000,
              clock: '02:08:44',
              events: [
                { kind: 'evidence.conclude', cardIds: ['e1', 'e2'], text: 'v2.14.0 cut the pool.', confidence: 0.92 },
                { kind: 'artifact.create', artifactId: 'plan', type: 'plan', title: 'Plan', markdown: '- [ ] a', stream: false },
              ],
            },
          ],
        },
        {
          n: 4,
          name: 'Fix and guardrail',
          durationMs: 3000,
          beats: [
            {
              id: 'a4.b01',
              t: 0,
              clock: '02:08:54',
              events: [
                {
                  kind: 'options.show',
                  agent: 'fixer',
                  recommended: 'A',
                  options: [{ id: 'A', action: 'Roll back', time: '~3 min', risk: 'Low', reversible: true, note: 'Recommended' }],
                },
                { kind: 'tool.call', agent: 'guardian', callId: 'pc1', tool: 'policy.check', args: { action: 'deploy.rollback' } },
                { kind: 'guardrail.check', policyId: 'P-01', description: 'Production changes need human approval', result: 'required', reason: '' },
                { kind: 'guardrail.check', policyId: 'P-04', description: 'Blast radius limited to one service', result: 'pass', reason: 'checkout-api only', offsetMs: 1000 },
              ],
            },
          ],
        },
        {
          n: 5,
          name: 'You',
          durationMs: 1000,
          beats: [
            {
              id: 'a5.b01',
              t: 0,
              clock: '02:09:34',
              events: [
                { kind: 'agent.state', agent: 'human', state: 'waiting' },
                {
                  kind: 'gate.request',
                  gateId: 'g1',
                  title: 'Approve production rollback?',
                  summary: 'Roll back.',
                  evidenceRefs: ['root-cause'],
                  approveLabel: 'Approve rollback',
                  rejectLabel: 'Reject',
                },
              ],
            },
          ],
        },
      ],
      endsWith: { gate: 'g1' },
    },
    'g1-approved': {
      acts: [
        {
          n: 5,
          name: 'You',
          durationMs: 500,
          beats: [
            {
              id: 'ap.b01',
              t: 0,
              clock: '02:09:40',
              events: [{ kind: 'gate.resolve', gateId: 'g1', decision: 'approved', by: 'placeholder' }],
            },
          ],
        },
        {
          n: 6,
          name: 'Recovery',
          durationMs: 4000,
          beats: [
            {
              id: 'a6.b01',
              t: 0,
              clock: '02:09:40',
              events: [
                { kind: 'progress.update', agent: 'fixer', label: 'Pod 1 of 6', current: 1, total: 6 },
                { kind: 'metric.update', series: 'p99', to: 190, durationMs: 1500 },
              ],
            },
            { id: 'a6.b02', t: 1000, clock: '02:11:10', events: [{ kind: 'agent.state', agent: 'fixer', state: 'done' }] },
            { id: 'a6.b03', t: 2000, events: [{ kind: 'timelapse', label: '+5 min', advanceClockSec: 300 }] },
            {
              id: 'a6.b04',
              t: 3000,
              clock: '02:16:10',
              events: [{ kind: 'severity.set', value: 'Mitigated' }],
            },
          ],
        },
        {
          n: 7,
          name: 'Wrap-up',
          durationMs: 3000,
          beats: [
            {
              id: 'a7.b01',
              t: 0,
              clock: '02:16:16',
              events: [
                { kind: 'artifact.create', artifactId: 'status', type: 'status', title: 'Status', markdown: 'Mitigated.', stream: true },
                { kind: 'scorecard.show' },
              ],
            },
            { id: 'a7.b02', t: 2000, events: [{ kind: 'scene.end', act: 7 }] },
          ],
        },
      ],
      endsWith: { end: 'A' },
    },
    'g1-rejected': {
      acts: [
        {
          n: 5,
          name: 'Alternative',
          durationMs: 3000,
          beats: [
            {
              id: 'r.b01',
              t: 0,
              clock: '02:09:40',
              events: [{ kind: 'gate.resolve', gateId: 'g1', decision: 'rejected', by: 'placeholder' }],
            },
            {
              id: 'r.b02',
              t: 2000,
              clock: '02:10:12',
              events: [
                {
                  kind: 'gate.request',
                  gateId: 'g2',
                  title: 'Approve runtime config override?',
                  summary: 'Override.',
                  evidenceRefs: [],
                  approveLabel: 'Approve override',
                  rejectLabel: 'Reject',
                },
              ],
            },
          ],
        },
      ],
      endsWith: { gate: 'g2' },
    },
    'g2-approved': {
      acts: [
        {
          n: 6,
          name: 'Recovery',
          durationMs: 2000,
          beats: [
            {
              id: 'r2a.b01',
              t: 0,
              clock: '02:10:20',
              events: [{ kind: 'gate.resolve', gateId: 'g2', decision: 'approved', by: 'placeholder' }],
            },
            { id: 'r2a.b02', t: 1000, events: [{ kind: 'scene.end', act: 7 }] },
          ],
        },
      ],
      endsWith: { end: 'A' },
    },
    'g2-rejected': {
      acts: [
        {
          n: 7,
          name: 'Handed to humans',
          durationMs: 2000,
          beats: [
            {
              id: 'r2r.b01',
              t: 0,
              clock: '02:10:20',
              events: [
                { kind: 'gate.resolve', gateId: 'g2', decision: 'rejected', by: 'placeholder' },
                { kind: 'severity.set', value: 'Handed to humans' },
                { kind: 'scene.end', act: 7, offsetMs: 1000 },
              ],
            },
          ],
        },
      ],
      endsWith: { end: 'B' },
    },
    chaos: {
      acts: [
        {
          n: 8,
          name: 'Chaos test',
          durationMs: 3000,
          beats: [
            {
              id: 'c.b01',
              t: 0,
              events: [
                { kind: 'chaos.start' },
                { kind: 'thought', agent: 'fixer', text: 'Faster idea: restart orders-db.', offsetMs: 200 },
              ],
            },
            {
              id: 'c.b02',
              t: 1000,
              events: [
                { kind: 'agent.state', agent: 'guardian', state: 'blocked' },
                { kind: 'guardrail.check', policyId: 'P-02', description: 'Production database changes need a DBA and change board', result: 'fail', reason: '' },
                { kind: 'permission.denied', agent: 'fixer', tool: 'db.alter' },
                { kind: 'audit', severity: 'high', text: 'Blocked: violates P-02', agent: 'guardian' },
              ],
            },
            { id: 'c.b03', t: 2500, events: [{ kind: 'chaos.end' }] },
          ],
        },
      ],
      endsWith: { returnTo: 'trigger' },
    },
  },
  overlays: { chaos: { segment: 'chaos', availableFrom: { act: 4 } } },
  scorecard: [{ measure: 'Time to mitigate', manual: '48 min', squad: '4 min 10 s', manualMinutes: 48, squadMinutes: 4.17 }],
  scorecardFootnote: 'Illustrative figures for a scripted scenario. Replace with your own baselines.',
  endings: {
    A: { headline: 'Mitigated in 4 minutes. One human decision.' },
    B: { headline: 'The squad stopped where people said stop.', severityLabel: 'Handed to humans' },
  },
  splitView: {
    caption: 'Illustrative comparison based on a typical manual response.',
    axis: { from: '02:00', to: '03:00' },
    manual: [{ label: 'Alert pages on-call', clock: '02:07' }],
    squad: [{ label: 'Sentinel detects, squad engaged', clock: '02:07' }],
  },
};

export const fixture = parseScenario(fixtureInput);

/** Main path timings in the fixture (ms). */
export const FIX = {
  act4Start: 8000,
  g1RequestT: 11000,
  g1ResolveT: 11600,
  chaosDuration: 3000,
} as const;
