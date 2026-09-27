import { describe, expect, it } from 'vitest';
import type { EngineEvent, EventBody } from './events';
import { metricValueAt } from './metrics';
import { initialStageState, reduce, type StageState } from './reducer';

const init = () => initialStageState({ initialMetrics: { p99: 180, errorRate: 0.2, poolActive: 22 }, clock: '02:07:00' });

let n = 0;
function ev(body: EventBody, t = 0, extra: Partial<EngineEvent> = {}): EngineEvent {
  n += 1;
  return { id: `e${n}`, t, source: 'script', ...body, ...extra } as EngineEvent;
}

function run(events: EngineEvent[], s: StageState = init()): StageState {
  return events.reduce(reduce, s);
}

describe('reduce', () => {
  it('is total: unknown kinds return the same object', () => {
    const s = init();
    expect(reduce(s, { id: 'x', t: 0, source: 'script', kind: 'segment.end' } as unknown as EngineEvent)).toBe(s);
  });

  it('tracks scene, clock, and agent states', () => {
    const s = run([
      ev({ kind: 'scene.start', act: 1, title: 'Title', card: true }, 0, { clock: '02:07:00' }),
      ev({ kind: 'scene.start', act: 2, title: 'Fan-out' }, 10),
      ev({ kind: 'clock.set', clock: '02:07:30', running: true }, 11),
      ev({ kind: 'agent.state', agent: 'sentinel', state: 'watching' }, 12),
    ]);
    expect(s.act).toBe(2);
    expect(s.titleCard).toEqual({ title: 'Title', t: 0 });
    expect(s.clock).toBe('02:07:30');
    expect(s.agents.sentinel).toBe('watching');
    expect(s.agentChangedAt.sentinel).toBe(12);
    expect(s.lastEventT).toBe(12);
  });

  it('builds the stream from thoughts, tools, and messages', () => {
    const s = run([
      ev({ kind: 'thought', agent: 'sentinel', text: 'One.' }, 1, { clock: '02:07:04' }),
      ev({ kind: 'thought', agent: 'sentinel', text: 'Two.', stream: false }, 2),
      ev({ kind: 'tool.call', agent: 'log-detective', callId: 'c1', tool: 'logs.search', args: { level: 'ERROR' } }, 3),
      ev({ kind: 'tool.result', agent: 'log-detective', callId: 'c1', summary: 'ok' }, 4),
      ev({ kind: 'tool.result', agent: 'log-detective', callId: 'c1', summary: 'line', payload: { type: 'log', content: 'Hikari' } }, 5),
      ev({ kind: 'message.send', from: 'sentinel', to: 'orchestrator', label: 'SEV-2' }, 6),
    ]);
    expect(s.stream.map((x) => x.type)).toEqual(['thought', 'thought', 'tool.call', 'tool.result', 'tool.result', 'message']);
    expect(s.stream[0]).toMatchObject({ clock: '02:07:04', typed: true });
    expect(s.stream[1]).toMatchObject({ clock: '02:07:04', typed: false });
    expect(s.stream[3]).not.toHaveProperty('payload');
    expect(s.stream[4]).toHaveProperty('payload.type', 'log');
    expect(s.messages[0]).toMatchObject({ from: 'sentinel', to: 'orchestrator', showLabel: false });
    expect(s.audit).toHaveLength(1);
    expect(s.audit[0]).toMatchObject({ category: 'tool', text: 'logs.search {level:"ERROR"}', agent: 'log-detective' });
  });

  it('tweens metrics from their current value', () => {
    const s = run([
      ev({ kind: 'metric.update', series: 'p99', to: 4800, durationMs: 1000 }, 0),
      ev({ kind: 'metric.update', series: 'p99', to: 190, durationMs: 1000 }, 500),
    ]);
    const track = s.metrics.p99;
    expect(track.tweens[1]!.from).toBeCloseTo(2490);
    expect(metricValueAt(track, 2000)).toBe(190);
  });

  it('handles alert, severity, evidence, options, progress, timelapse, artifacts, scorecard, end', () => {
    const s = run([
      ev({ kind: 'stage.alert', severity: 'SEV-2' }, 1),
      ev({ kind: 'evidence.pin', cardId: 'a', agent: 'sentinel', text: 'A' }, 2),
      ev({ kind: 'evidence.pin', cardId: 'a', agent: 'sentinel', text: 'A2' }, 3),
      ev({ kind: 'evidence.conclude', cardIds: ['a'], text: 'Root', confidence: 0.92 }, 4),
      ev({ kind: 'options.show', agent: 'fixer', recommended: 'A', options: [] }, 5),
      ev({ kind: 'progress.update', agent: 'fixer', label: 'Pod 1 of 6', current: 1, total: 6 }, 6),
      ev({ kind: 'timelapse', label: '+5 min', advanceClockSec: 300 }, 7),
      ev({ kind: 'artifact.create', artifactId: 's', type: 'status', title: 'S', markdown: 'x', stream: true }, 8),
      ev({ kind: 'artifact.create', artifactId: 's', type: 'status', title: 'S', markdown: 'y', stream: true }, 9),
      ev({ kind: 'severity.set', value: 'Mitigated' }, 10),
      ev({ kind: 'scorecard.show' }, 11),
      ev({ kind: 'scene.end', act: 7 }, 12),
    ]);
    expect(s.alert).toEqual({ severity: 'SEV-2', t: 1 });
    expect(s.severity).toBe('Mitigated');
    expect(s.evidence.cards).toEqual([{ cardId: 'a', agent: 'sentinel', text: 'A2', t: 3, kind: 'clue', ruledOut: null }]);
    expect(s.evidence.conclusion?.confidence).toBe(0.92);
    expect(s.optionSets).toHaveLength(1);
    expect(s.progress?.current).toBe(1);
    expect(s.timelapse?.label).toBe('+5 min');
    expect(s.artifacts).toHaveLength(1);
    expect(s.artifacts[0]!.markdown).toBe('y');
    expect(s.scorecard).toEqual({ t: 11 });
    expect(s.endCard).toEqual({ t: 12 });
  });

  it('groups guardrail rows under the latest policy check and audits them', () => {
    const s = run([
      ev({ kind: 'guardrail.check', policyId: 'P-00', description: 'Orphan', result: 'pass', reason: '' }, 0),
      ev({ kind: 'tool.call', agent: 'guardian', callId: 'pc', tool: 'policy.check', args: { action: 'deploy.rollback' } }, 1),
      ev({ kind: 'guardrail.check', policyId: 'P-01', description: 'Needs a human.', result: 'required', reason: '' }, 2),
      ev({ kind: 'guardrail.check', policyId: 'P-02', description: 'DBA', result: 'fail', reason: 'Nine services.' }, 3),
    ]);
    expect(s.checklists).toHaveLength(2);
    expect(s.checklists[1]!.rows.map((r) => r.policyId)).toEqual(['P-01', 'P-02']);
    const policy = s.audit.filter((a) => a.category === 'policy');
    expect(policy.map((a) => a.severity)).toEqual(['info', 'warn', 'high']);
    expect(policy[1]!.text).toBe('P-01 Required: Needs a human.');
    expect(policy[2]!.text).toBe('P-02 Fail: DBA. Nine services.');
  });

  it('opens and resolves gates with audit rows', () => {
    const req = ev({
      kind: 'gate.request',
      gateId: 'g1',
      title: 'Approve production rollback?',
      summary: 's',
      evidenceRefs: [],
      approveLabel: 'Approve rollback',
      rejectLabel: 'Reject',
    }, 1);
    const s = run([req, ev({ kind: 'gate.resolve', gateId: 'g1', decision: 'approved', by: 'Asha' }, 2)]);
    expect(s.gate).toMatchObject({ status: 'approved', by: 'Asha', resolvedT: 2 });
    expect(s.gates).toHaveLength(1);
    expect(s.gates[0]!.status).toBe('approved');
    expect(s.audit.map((a) => a.text)).toEqual([
      'Approval requested: Approve production rollback?',
      'Approved by Asha: Approve production rollback?',
    ]);
    const orphan = run([ev({ kind: 'gate.resolve', gateId: 'gX', decision: 'rejected', by: 'Asha' }, 1)]);
    expect(orphan.gate).toBeNull();
    expect(orphan.audit[0]).toMatchObject({ severity: 'warn', text: 'Rejected by Asha: gX' });
  });

  it('discards overlay visual state at chaos.end but keeps audit rows', () => {
    const before = run([ev({ kind: 'agent.state', agent: 'fixer', state: 'working' }, 0)]);
    const during = run(
      [
        ev({ kind: 'chaos.start' }, 1),
        ev({ kind: 'chaos.start' }, 1),
        ev({ kind: 'agent.state', agent: 'guardian', state: 'blocked' }, 2),
        ev({ kind: 'permission.denied', agent: 'fixer', tool: 'db.alter' }, 3),
        ev({ kind: 'audit', severity: 'high', text: 'Blocked', agent: 'guardian' }, 4),
        ev({ kind: 'audit', severity: 'info', text: 'Note' }, 4),
      ],
      before,
    );
    expect(during.overlay.active).toBe(true);
    expect(during.permissionDenied?.tool).toBe('db.alter');
    expect(during.audit.every((a) => a.overlay)).toBe(true);
    const after = reduce(during, ev({ kind: 'chaos.end' }, 5));
    expect(after.overlay).toEqual({ active: false, startedAt: null, saved: null });
    expect(after.agents.guardian).toBe('idle');
    expect(after.agents.fixer).toBe('working');
    expect(after.permissionDenied).toBeNull();
    expect(after.audit).toHaveLength(3);
    expect(after.chaosRuns).toBe(1);
    // chaos.end without a start is a no-op.
    const noop = reduce(before, ev({ kind: 'chaos.end' }, 6));
    expect({ ...noop, lastEventT: 0 }).toEqual({ ...before, lastEventT: 0 });
  });

  it('counts live fallbacks', () => {
    const s = run([
      ev({ kind: 'thought', agent: 'sentinel', text: 'a' }, 0, { source: 'fallback' }),
      ev({ kind: 'thought', agent: 'sentinel', text: 'b' }, 1, { source: 'live' }),
    ]);
    expect(s.fallbackCount).toBe(1);
    expect(s.stream[0]!.source).toBe('fallback');
  });
});
