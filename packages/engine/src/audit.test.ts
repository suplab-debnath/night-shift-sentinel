import { describe, expect, it } from 'vitest';
import { AUDIT_GENESIS, auditChain, fnv1a64, verifyAuditChain } from './audit';
import type { EngineEvent, EventBody } from './events';
import { initialStageState, reduce, type StageState } from './reducer';

const init = () => initialStageState({ initialMetrics: { p99: 180, errorRate: 0.2, poolActive: 22 }, clock: '02:07:00' });

let n = 0;
function ev(body: EventBody, t = 0, extra: Partial<EngineEvent> = {}): EngineEvent {
  n += 1;
  return { id: `e${n}`, t, source: 'script', clock: '02:08:00', ...body, ...extra } as EngineEvent;
}

const run = (events: EngineEvent[], s: StageState = init()) => events.reduce(reduce, s);

describe('audit evidence per stage (D-079)', () => {
  const s = run([
    ev({ kind: 'scene.start', act: 3, title: 'Diagnosis' }),
    ev({ kind: 'tool.call', agent: 'log-detective', callId: 'c1', tool: 'logs.search', args: { service: 'checkout-api' } }, 1, { beat: 'a3.b03' }),
    ev({ kind: 'tool.result', agent: 'log-detective', callId: 'c1', summary: '1,912 errors' }, 2),
    ev({ kind: 'evidence.pin', cardId: 'h1', agent: 'log-detective', text: 'orders-db is overloaded', evidenceKind: 'hypothesis' }, 3),
    ev({ kind: 'evidence.ruleOut', cardId: 'h1', reason: 'orders-db at 22% CPU' }, 4),
    ev({ kind: 'evidence.conclude', cardIds: ['a', 'b', 'c'], text: 'v2.14.0 cut the pool to 10', confidence: 0.92 }, 5),
    ev({ kind: 'scene.start', act: 4, title: 'Fix' }, 6),
    ev(
      {
        kind: 'options.show',
        agent: 'fixer',
        recommended: 'A',
        options: [{ id: 'A', action: 'Roll back to v2.13.2', time: '~3 min', risk: 'Low', reversible: true, note: '' }],
      },
      7,
    ),
    ev({ kind: 'chaos.start', overlay: 'inject' }, 8),
    ev({ kind: 'audit', severity: 'high', text: 'Prompt injection quarantined', agent: 'guardian' }, 9),
    ev({ kind: 'chaos.end' }, 10),
    ev({ kind: 'scene.start', act: 7, title: 'Wrap-up' }, 11),
    ev({ kind: 'artifact.create', artifactId: 'pr', type: 'pull-request', title: 'Pull request #482 (draft)', markdown: 'x', stream: false }, 12),
  ]);

  it('records the stage, beat, and result of each row', () => {
    const tool = s.audit.find((r) => r.category === 'tool')!;
    expect(tool).toMatchObject({ act: 3, beat: 'a3.b03', callId: 'c1', result: { summary: '1,912 errors', status: 'ok' } });
    expect(s.audit.filter((r) => r.category === 'evidence').map((r) => r.text)).toEqual([
      'Suspect pinned: orders-db is overloaded',
      'Ruled out: orders-db is overloaded. orders-db at 22% CPU.',
      'Root cause concluded (confidence 0.92): v2.14.0 cut the pool to 10. Based on 3 pieces of evidence.',
    ]);
    expect(s.audit.find((r) => r.category === 'decision')).toMatchObject({ act: 4, agent: 'fixer' });
    expect(s.audit.find((r) => r.category === 'decision')!.text).toContain('A Roll back to v2.13.2 (~3 min, Low risk, reversible) recommended');
    expect(s.audit.find((r) => r.category === 'record')).toMatchObject({ act: 7, text: 'Recorded: Pull request #482 (draft)' });
  });

  it('keeps overlay rows, labelled with the test they came from', () => {
    const row = s.audit.find((r) => r.text === 'Prompt injection quarantined')!;
    expect(row).toMatchObject({ overlay: true, overlayName: 'inject', act: 4 });
    expect(s.overlay).toMatchObject({ active: false, name: null });
  });

  it('chains every row and detects tampering', () => {
    const chain = auditChain(s.audit);
    expect(chain[0]!.prev).toBe(AUDIT_GENESIS);
    expect(chain.every((l, i) => i === 0 || l.prev === chain[i - 1]!.hash)).toBe(true);
    expect(verifyAuditChain(chain)).toBe(true);
    // Same run, same chain.
    expect(auditChain(s.audit).map((l) => l.hash)).toEqual(chain.map((l) => l.hash));
    const edited = chain.map((l, i) => (i === 2 ? { ...l, row: { ...l.row, text: `${l.row.text} (edited)` } } : l));
    expect(verifyAuditChain(edited)).toBe(false);
    const removed = chain.filter((_, i) => i !== 1);
    expect(verifyAuditChain(removed)).toBe(false);
  });

  it('hashes to 16 hex digits and spreads small changes', () => {
    expect(fnv1a64('a')).toMatch(/^[0-9a-f]{16}$/);
    expect(fnv1a64('a')).not.toBe(fnv1a64('b'));
    expect(fnv1a64('')).toBe(fnv1a64(''));
  });
});
