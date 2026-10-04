import { compile, initialStageState, reduce, type StageState } from '@night-shift/engine';
import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { activeMoment, MOMENT_MS, stageTone } from './moments';
import { beatOnPath } from './runclock';

const { scenario } = incidentCheckout;
const tl = compile(scenario, [{ type: 'gate', gateId: 'g1', decision: 'approved', by: 'x' }]);
const stateAt = (t: number): StageState =>
  tl.events.filter((e) => e.t <= t).reduce(reduce, initialStageState({ initialMetrics: scenario.initialMetrics, clock: scenario.clockStart }));
const at = (milestone: string) => beatOnPath(tl, scenario.milestones.find((m) => m.id === milestone)!.beats)!.t;

describe('stage moments (D-080)', () => {
  it('shows each moment for a few seconds after its milestone, with run times filled in', () => {
    const rc = at('root-cause');
    expect(activeMoment(scenario.moments, scenario.milestones, tl, stateAt(rc - 1), rc - 1)?.moment.milestone).not.toBe('root-cause');
    const shown = activeMoment(scenario.moments, scenario.milestones, tl, stateAt(rc + 100), rc + 100)!;
    expect(shown.moment.milestone).toBe('root-cause');
    expect(shown.title).toMatch(/^Root cause found · .+ after the alert$/);
    expect(shown.title).not.toContain('{{');
    expect(activeMoment(scenario.moments, scenario.milestones, tl, stateAt(rc + MOMENT_MS), rc + MOMENT_MS)).toBeNull();
    const mit = activeMoment(scenario.moments, scenario.milestones, tl, stateAt(at('mitigated') + 10), at('mitigated') + 10)!;
    expect(mit.title).toMatch(/^Mitigated · errors stopped at \d{2}:\d{2}:\d{2}$/);
  });

  it('stays out of the way of the gate, overlays, and the end card', () => {
    const gateT = tl.gatePoints[0]!.requestT;
    const s = stateAt(gateT);
    expect(s.gate?.status).toBe('open');
    expect(activeMoment(scenario.moments, scenario.milestones, tl, s, gateT)).toBeNull();
    const overlay = { ...stateAt(at('root-cause') + 10), overlay: { active: true, name: 'chaos' as const, startedAt: 0, saved: null } };
    expect(activeMoment(scenario.moments, scenario.milestones, tl, overlay, at('root-cause') + 10)).toBeNull();
  });

  it('tones the stage: red while customers are affected, amber at the gate, green after mitigation', () => {
    expect(stageTone(scenario.impact, tl, stateAt(0), 0)).toBe('none');
    expect(stageTone(scenario.impact, tl, stateAt(at('root-cause')), at('root-cause'))).toBe('alert');
    const gateT = tl.gatePoints[0]!.requestT;
    expect(stageTone(scenario.impact, tl, stateAt(gateT), gateT)).toBe('caution');
    expect(stageTone(scenario.impact, tl, stateAt(at('mitigated')), at('mitigated'))).toBe('ok');
  });
});
