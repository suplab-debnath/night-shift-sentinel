import { describe, expect, it } from 'vitest';
import { parseAgents, parseScenario, ScenarioValidationError, type ScenarioInput } from './schema';
import { fixture, fixtureInput } from './test-fixture';

function clone(): ScenarioInput {
  return JSON.parse(JSON.stringify(fixtureInput)) as typeof fixtureInput;
}

function issuesOf(input: unknown): string[] {
  try {
    parseScenario(input);
  } catch (e) {
    if (e instanceof ScenarioValidationError) return e.issues;
    throw e;
  }
  return [];
}

describe('parseScenario', () => {
  it('accepts the fixture and applies defaults', () => {
    expect(fixture.id).toBe('fixture');
    const noGap = clone();
    delete noGap.gateGapMs;
    expect(parseScenario(noGap).gateGapMs).toBe(600);
  });

  it('reports schema errors with paths', () => {
    const bad = clone() as unknown as { clockStart: string };
    bad.clockStart = '2:07';
    expect(issuesOf(bad).join('\n')).toMatch(/clockStart/);
    expect(issuesOf({})).not.toHaveLength(0);
  });

  it('rejects unknown event kinds and agents', () => {
    const bad = clone();
    const events = bad.segments.main!.acts[0]!.beats[0]!.events as unknown[];
    events.push({ kind: 'segment.end' });
    expect(issuesOf(bad).length).toBeGreaterThan(0);
    const bad2 = clone();
    (bad2.segments.main!.acts[0]!.beats[1]!.events[0] as { agent: string }).agent = 'dba';
    expect(issuesOf(bad2).length).toBeGreaterThan(0);
  });

  it('checks referential integrity', () => {
    const s = clone();
    s.segments.main!.endsWith = { gate: 'nope' };
    s.gates.g1 = { onApprove: 'missing', onReject: 'g1-rejected' };
    s.segments['g2-approved']!.acts[0]!.beats[1]!.id = 'r2a.b01';
    s.segments['g1-rejected']!.acts[0]!.beats[1]!.t = 10;
    s.segments['g1-rejected']!.acts[0]!.beats[0]!.t = 2900;
    s.segments['g2-rejected']!.acts[0]!.beats[0]!.t = 99999;
    s.overlays.chaos.segment = 'g1-approved';
    const issues = issuesOf(s).join('\n');
    expect(issues).toMatch(/unknown gate "nope"/);
    expect(issues).toMatch(/unknown segment "missing"/);
    expect(issues).toMatch(/duplicate beat id "r2a.b01"/);
    expect(issues).toMatch(/out of order/);
    expect(issues).toMatch(/starts after its act ends/);
    expect(issues).toMatch(/returnTo: trigger/);
  });

  it('requires main, requested gates, and an existing chaos segment', () => {
    const s = clone();
    delete s.segments.main;
    s.gates.g3 = { onApprove: 'g2-approved', onReject: 'g2-rejected' };
    s.overlays.chaos.segment = 'nowhere';
    const issues = issuesOf(s).join('\n');
    expect(issues).toMatch(/segments.main is required/);
    expect(issues).toMatch(/gate g3 is never requested/);
    expect(issues).toMatch(/unknown segment "nowhere"/);
  });
});

describe('parseAgents', () => {
  const agent = {
    id: 'guardian',
    name: 'Guardian',
    role: 'Checks every proposed action against policy; can block',
    hueToken: '--agent-guardian',
    icon: 'shield-check',
    tools: [{ name: 'policy.check', access: 'read' }],
    needsApprovalFor: [],
    neverAllowed: ['Approve on behalf of a human'],
    position: { x: 50, y: 70 },
  };

  it('accepts a valid file and defaults size', () => {
    expect(parseAgents({ agents: [agent] }).agents[0]!.size).toBe('md');
  });

  it('rejects over-long inspector copy', () => {
    expect(() => parseAgents({ agents: [{ ...agent, role: 'x'.repeat(61) }] })).toThrow(ScenarioValidationError);
  });
});
