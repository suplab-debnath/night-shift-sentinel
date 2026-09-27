import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compile, formatArgs, parseClock, type Decision, type EngineEvent, type Timeline } from '@night-shift/engine';
import { describe, expect, it } from 'vitest';
import { incidentCheckout, getScenario } from '../index';

const { scenario, agents, fixtures } = incidentCheckout;
const SCENARIO_MD = readFileSync(fileURLToPath(new URL('../../../docs/SCENARIO.md', import.meta.url)), 'utf8');

const by = 'Asha';
const g = (gateId: 'g1' | 'g2', decision: 'approved' | 'rejected'): Decision => ({ type: 'gate', gateId, decision, by });

const PATHS: Record<string, Decision[]> = {
  approve: [g('g1', 'approved')],
  'reject-approve': [g('g1', 'rejected'), g('g2', 'approved')],
  'reject-reject': [g('g1', 'rejected'), g('g2', 'rejected')],
};

function allStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => allStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => allStrings(v, out));
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

function allEvents(): EngineEvent[] {
  const seen = new Map<string, EngineEvent>();
  for (const decisions of Object.values(PATHS)) {
    const full = compile(scenario, decisions);
    const withChaos = compile(scenario, [...decisions, { type: 'chaos', at: full.endT }]);
    for (const e of withChaos.events) seen.set(e.id, e);
  }
  return [...seen.values()];
}

describe('incident-checkout scenario', () => {
  it('is schema-valid and registered', () => {
    expect(getScenario('incident-checkout')).toBe(incidentCheckout);
    expect(getScenario('nope')).toBeUndefined();
    expect(Object.keys(scenario.segments).sort()).toEqual(['chaos', 'g1-approved', 'g1-rejected', 'g2-approved', 'g2-rejected', 'main']);
  });

  it('reaches every segment and both endings', () => {
    const visited = new Set<string>();
    const endings = new Set<string>();
    for (const decisions of Object.values(PATHS)) {
      const tl = compile(scenario, decisions);
      tl.beats.forEach((b) => visited.add(b.segment));
      if (tl.end.kind === 'end') endings.add(tl.end.ending);
      const chaos = compile(scenario, [...decisions, { type: 'chaos', at: tl.endT }]);
      chaos.beats.forEach((b) => visited.add(b.segment));
    }
    expect([...visited].sort()).toEqual(Object.keys(scenario.segments).sort());
    expect([...endings].sort()).toEqual(['A', 'B']);
  });

  it('allows chaos from the start of Act 4, at each gate, and at the end card', () => {
    const main = compile(scenario);
    const act4 = main.acts.find((a) => a.n === 4)!;
    expect(() => compile(scenario, [{ type: 'chaos', at: act4.t - 1 }])).toThrow();
    for (const at of [act4.t, main.endT]) {
      const tl = compile(scenario, [{ type: 'chaos', at }]);
      expect(tl.events.filter((e) => e.kind === 'chaos.start')).toHaveLength(1);
      expect(tl.events.filter((e) => e.kind === 'chaos.end')).toHaveLength(1);
    }
    const r = compile(scenario, [g('g1', 'rejected')]);
    expect(() => compile(scenario, [g('g1', 'rejected'), { type: 'chaos', at: r.endT }])).not.toThrow();
  });

  it('matches SCENARIO §3 act timings', () => {
    const main = scenario.segments.main!.acts.map((a) => [a.n, a.durationMs]);
    // Act 4 is 24 s in SCENARIO §3: 20 s of beats, then the gate opens (Act 5). See DECISIONS D-022.
    expect(main).toEqual([
      [1, 14000],
      [2, 12000],
      [3, 47000],
      [4, 20000],
      [5, 1000],
    ]);
    const approved = scenario.segments['g1-approved']!.acts.map((a) => [a.n, a.durationMs]);
    expect(approved).toEqual([
      [5, 1000],
      [6, 22000],
      [7, 28000],
    ]);
    const tl = compile(scenario, PATHS.approve);
    // ≈ 2 min 27 s of acts plus the gate (DECISIONS D-008, D-069).
    expect(tl.endT / 1000).toBeGreaterThan(142);
    expect(tl.endT / 1000).toBeLessThan(152);
  });

  it('keeps the story clock monotonic on every path and hits the canonical times', () => {
    for (const [name, decisions] of Object.entries(PATHS)) {
      const tl: Timeline = compile(scenario, decisions);
      let prev = -1;
      for (const e of tl.events) {
        const s = parseClock(e.clock!);
        expect(s, `${name} ${e.id}`).toBeGreaterThanOrEqual(prev);
        prev = s;
      }
    }
    const tl = compile(scenario, PATHS.approve);
    const clockOf = (pred: (e: EngineEvent) => boolean) => tl.events.find(pred)?.clock;
    expect(clockOf((e) => e.kind === 'stage.alert')).toBe('02:07:14');
    expect(clockOf((e) => e.kind === 'evidence.conclude')).toBe('02:08:44');
    expect(clockOf((e) => e.kind === 'gate.request')).toBe('02:09:34');
    expect(clockOf((e) => e.kind === 'gate.resolve')).toBe('02:09:40');
    expect(clockOf((e) => e.kind === 'agent.state' && e.agent === 'fixer' && e.state === 'done')).toBe('02:11:10');
    expect(clockOf((e) => e.kind === 'timelapse')).toBe('02:16:10');
    expect(clockOf((e) => e.kind === 'scorecard.show')).toBe('02:16:54');
  });

  it('has a unique beat id everywhere, usable for pauseAt', () => {
    const ids = Object.values(scenario.segments).flatMap((s) => s.acts.flatMap((a) => a.beats.map((b) => b.id)));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only uses tools the acting agent is granted (except the chaos permission demo)', () => {
    const granted = new Map(agents.agents.map((a) => [a.id, new Set(a.tools.map((t) => t.name))]));
    for (const e of allEvents()) {
      if (e.kind !== 'tool.call') continue;
      expect(granted.get(e.agent)?.has(e.tool), `${e.agent} → ${e.tool}`).toBe(true);
    }
    const fixer = granted.get('fixer')!;
    expect(fixer.has('db.alter')).toBe(false);
  });

  it('follows the agent line rules: ≤ 14 words per sentence, no exclamation marks or emoji', () => {
    for (const e of allEvents()) {
      if (e.kind !== 'thought') continue;
      expect(e.text).not.toMatch(/!|\p{Extended_Pictographic}/u);
      for (const sentence of e.text.split(/(?<=[.?])\s+/)) {
        expect(sentence.split(/\s+/).length, e.text).toBeLessThanOrEqual(14);
      }
    }
  });

  it('declares live beats only for agents that exist, with known validators', () => {
    const validators = new Set([
      'sentinel-detection',
      'log-signature',
      'log-pool',
      'code-deploy',
      'code-diff',
      'orchestrator-root-cause',
      'fixer-recommendation',
      'guardian-decision',
      'scribe-status',
      'scribe-postmortem',
    ]);
    const live = Object.values(scenario.segments).flatMap((s) => s.acts.flatMap((a) => a.beats.flatMap((b) => (b.live ? [b.live] : []))));
    expect(live.length).toBeGreaterThanOrEqual(10);
    for (const l of live) {
      expect(validators.has(l.validator), l.validator).toBe(true);
      const agent = agents.agents.find((a) => a.id === l.agent)!;
      for (const tool of l.allowedTools) expect(agent.tools.some((t) => t.name === tool)).toBe(true);
    }
  });
});

describe('SCENARIO.md coverage', () => {
  const strings = allStrings(scenario).map(norm);
  const toolCalls = allEvents().flatMap((e) => (e.kind === 'tool.call' ? [`${e.tool} ${formatArgs(e.args)}`] : []));

  // Quoted text in SCENARIO.md that is intentionally not a single scenario string.
  const NOT_SCENARIO_STRINGS: Record<string, string> = {
    'Show human vs agent timeline': 'End card button: UI copy (apps/web/src/copy.ts)',
    'Try the chaos test': 'End card button: UI copy (apps/web/src/copy.ts)',
    'Chaos test': 'Transport button: UI copy',
    'Chaos test: an over-eager fix': 'ChaosBanner copy (DESIGN §6): UI copy',
    'db.alter is not granted to Fixer': 'PermissionToast copy, built from permission.denied',
    'Pod 1 of 6 … 6 of 6 on v2.13.2': 'Range shorthand; six progress.update labels (checked below)',
    'Pod n of 6 restarted with pool size 40': 'Template; six progress.update labels (checked below)',
    '+5 min': 'Present as the timelapse label',
    'Set the old pool key to 40 at runtime, then rolling restart. Keeps v2.14.0. ~4 min. Low risk. Reversible. Override expires in 48 h.':
      'Option D card split into action/time/risk/reversible/note (checked below)',
    'Production changes need human approval': 'Guardrail description (present)',
    'Runtime overrides must be recorded and expire': 'Guardrail description (present)',
  };

  function quotedInTables(md: string): string[] {
    const out: string[] = [];
    for (const line of md.split('\n')) {
      if (!line.startsWith('|')) continue;
      for (const m of line.matchAll(/"([^"]+)"/g)) {
        const q = m[1]!;
        // Skip JSON-like argument values inside tool calls (they are checked as tool calls).
        if (line.includes(`:"${q}"`)) continue;
        out.push(q);
      }
    }
    return out;
  }

  it('contains every quoted line from the SCENARIO.md tables', () => {
    const script = SCENARIO_MD.split('## 9.')[0]!; // §9 lists validator rules, not script lines
    const missing = quotedInTables(script)
      .filter((q) => !(q in NOT_SCENARIO_STRINGS) || q === '+5 min')
      .filter((q) => !strings.some((s) => s.includes(norm(q))));
    expect(missing).toEqual([]);
  });

  it('contains every tool call from the SCENARIO.md tables', () => {
    const calls = [...SCENARIO_MD.matchAll(/`([a-z]+\.[a-z]+ \{[^`]*\})`/g)]
      .map((m) => m[1]!)
      .filter((c) => !c.startsWith('gate.resolve')); // an event, checked below
    expect(calls.length).toBeGreaterThanOrEqual(12);
    const missing = calls.filter((c) => !toolCalls.includes(c));
    expect(missing).toEqual([]);
  });

  it('contains the log signature, the diff, and the exact artifact texts from §6', () => {
    expect(strings.some((s) => s.includes('HikariPool-1 - Connection is not available, request timed out after 3000ms.'))).toBe(true);
    const diffBlock = /```diff\n([\s\S]*?)```/.exec(SCENARIO_MD)![1]!;
    const diff = allEvents().find((e) => e.kind === 'tool.result' && e.payload?.content.includes('values-prod.yaml'));
    for (const line of diffBlock.trim().split('\n')) {
      expect(diff?.kind === 'tool.result' && diff.payload?.content.includes(line.trimEnd())).toBe(true);
    }
    const statusQuote = /### 6\.1[\s\S]*?\n> \*\*(.+?)\*\*\n> (.+?)\n/.exec(SCENARIO_MD)!;
    const pmBlock = /### 6\.2[\s\S]*?```\n([\s\S]*?)```/.exec(SCENARIO_MD)![1]!;
    const escQuote = /### 6\.3[\s\S]*?\n> \*\*(.+?)\*\*\n> (.+?)\n/.exec(SCENARIO_MD)!;
    const artifacts = allEvents().flatMap((e) => (e.kind === 'artifact.create' ? [e] : []));
    const status = artifacts.find((a) => a.artifactId === 'status' && a.id.startsWith('a7'))!;
    expect(status.markdown).toContain(statusQuote[1]);
    expect(status.markdown).toContain(statusQuote[2]);
    const pm = artifacts.find((a) => a.artifactId === 'postmortem' && a.id.startsWith('a7'))!;
    expect(pm.markdown).toBe(pmBlock.trimEnd());
    const esc = artifacts.find((a) => a.artifactId === 'escalation')!;
    expect(esc.markdown).toContain(escQuote[1]);
    expect(esc.markdown).toContain(escQuote[2]);
  });

  it('records gate decisions with the presenter placeholder (SCENARIO §4 Act 5)', () => {
    const resolves = Object.values(scenario.segments).flatMap((seg) =>
      seg.acts.flatMap((a) => a.beats.flatMap((b) => b.events.filter((e) => e.kind === 'gate.resolve'))),
    );
    expect(resolves).toHaveLength(4);
    for (const r of resolves) expect(r).toMatchObject({ by: '{{PRESENTER_NAME|On-call engineer}}' });
  });

  it('includes composite lines field by field', () => {
    const events = allEvents();
    const progress = events.flatMap((e) => (e.kind === 'progress.update' ? [e.label] : []));
    for (let n = 1; n <= 6; n++) {
      expect(progress).toContain(`Pod ${n} of 6 on v2.13.2`);
      expect(progress).toContain(`Pod ${n} of 6 restarted with pool size 40`);
    }
    const optionD = events.flatMap((e) => (e.kind === 'options.show' ? e.options : [])).find((o) => o.id === 'D')!;
    expect(optionD).toMatchObject({ time: '~4 min', risk: 'Low', reversible: true });
    expect(`${optionD.action}. ${optionD.note}`).toBe('Set the old pool key to 40 at runtime, then rolling restart. Keeps v2.14.0. Override expires in 48 h.');
  });

  it('includes the scorecard and split view tables verbatim', () => {
    for (const row of scenario.scorecard) {
      expect(SCENARIO_MD).toContain(`| ${row.measure} | ${row.manual} | ${row.squad} |`);
    }
    expect(SCENARIO_MD).toContain(scenario.scorecardFootnote);
    for (const e of [...scenario.splitView.manual, ...scenario.splitView.squad]) {
      expect(SCENARIO_MD).toContain(`${e.label} | ${e.clock}`);
    }
  });
});

describe('fixtures agree with SCENARIO §1', () => {
  it('metrics', () => {
    const m = fixtures.metrics;
    expect(m.slo).toEqual({ p99Ms: 800, errorRatePct: 1 });
    expect(m.peak).toEqual({ p99Ms: 4800, errorRatePct: 11.4, errorBudgetBurn: 14 });
    expect(Math.max(...m.series.map((p) => p.p99Ms))).toBe(4800);
    expect(Math.max(...m.series.map((p) => p.errorRatePct))).toBe(11.4);
    expect(m.events).toMatchObject({ firstErrors: '02:04:00', alert: '02:07:00', errorsStopped: '02:10:41', mitigated: '02:11:10' });
    expect(m.podsAt.pods).toHaveLength(6);
    expect(m.podsAt.pods.every((p) => p.poolActive === 10 && p.poolMax === 10)).toBe(true);
    expect(m.podsAt.pods.reduce((n, p) => n + p.pending, 0)).toBe(380);
    const db = m.dependencies.services.find((s) => s.name === 'orders-db')!;
    expect(db).toMatchObject({ cpuPct: 22, connections: 180, maxConnections: 500 });
    expect(m.podsAfter.pods.every((p) => p.poolActive === 22 && p.poolMax === 40 && p.version === 'v2.13.2')).toBe(true);
    // Before the incident the SLO holds; at the alert it is breached.
    expect(m.series.filter((p) => p.t < '02:04:00').every((p) => p.p99Ms < 800 && p.errorRatePct <= 1)).toBe(true);
    expect(m.series.filter((p) => p.t >= '02:11:30').every((p) => p.p99Ms < 800 && p.errorRatePct <= 1)).toBe(true);
  });

  it('logs', () => {
    const l = fixtures.logs;
    expect(l.lines.length).toBeGreaterThanOrEqual(40);
    expect(l.stats.errorCount).toBe(1912);
    expect(l.stats.signatureShare).toBe(0.94);
    expect(Math.round((l.stats.signatureCount / l.stats.errorCount) * 100)).toBe(94);
    expect(l.stats.signatureCount + l.stats.otherErrors.reduce((n, e) => n + e.count, 0)).toBe(1912);
    const errors = l.lines.filter((x) => x.level === 'ERROR');
    const sig = errors.filter((x) => x.message === l.stats.signature);
    expect(sig.length / errors.length).toBeGreaterThan(0.9);
    expect(errors.every((x) => x.t >= '02:04:00')).toBe(true);
    const sorted = [...l.lines].sort((a, b) => a.t.localeCompare(b.t));
    expect(sorted).toEqual(l.lines);
  });

  it('deploys, diff, runbooks', () => {
    const d = fixtures.deploys.deploys.find((x) => x.service === 'checkout-api')!;
    expect(d).toMatchObject({ version: 'v2.14.0', previous: 'v2.13.2', at: '01:55', by: 'pipeline', schemaMigration: false });
    expect(fixtures.deploys.history['checkout-api']!.find((h) => h.version === 'v2.13.2')).toMatchObject({ ranDays: 9, checks: 'passed' });
    expect(fixtures.diff.analysis).toMatchObject({ effectivePoolSize: 10, productionNeedsPerPod: 40 });
    expect(fixtures.diff.analysis.renamedKey).toEqual({ from: 'SPRING_DATASOURCE_HIKARI_MAXIMUMPOOLSIZE', to: 'DB_POOL_MAX' });
    const ids = fixtures.runbooks.runbooks.map((r) => r.id);
    expect(ids).toEqual(['RB-112', 'RB-131']);
    expect(fixtures.runbooks.runbooks[1]!.expiryHours).toBe(48);
  });

  it('services and policies', () => {
    const dependents = fixtures.services.services.filter((s) => s.dependsOn.includes('orders-db')).map((s) => s.name);
    expect(dependents).toHaveLength(9);
    expect(dependents).toContain('checkout-api');
    expect(fixtures.services.services.find((s) => s.name === 'checkout-api')?.pods).toBe(6);
    const ids = fixtures.policies.policies.map((p) => p.id);
    expect(ids).toEqual(['P-01', 'P-02', 'P-03', 'P-04', 'P-05', 'P-06', 'P-08']);
  });

  it('guardrail rows in the script match policy titles and applicability', () => {
    const byId = new Map(fixtures.policies.policies.map((p) => [p.id, p]));
    const tl = compile(scenario, [...PATHS['reject-approve']!, { type: 'chaos', at: compile(scenario, PATHS['reject-approve']).endT }]);
    let action = '';
    for (const e of tl.events) {
      if (e.kind === 'tool.call' && e.tool === 'policy.check') action = String(e.args.action);
      if (e.kind !== 'guardrail.check') continue;
      const p = byId.get(e.policyId)!;
      expect([p.title, p.shortTitle]).toContain(e.description);
      expect(p.appliesTo).toContain(action);
    }
  });
});

describe('takes (DECISIONS D-068)', () => {
  const TAKES = Array.from({ length: 60 }, (_, i) => i + 1);

  it('every take keeps the story clock monotonic and the line rules on every path', () => {
    for (const take of TAKES) {
      for (const [name, decisions] of Object.entries(PATHS)) {
        const tl = compile(scenario, decisions, { take });
        let prev = -1;
        for (const e of tl.events) {
          const s = parseClock(e.clock!);
          expect(s, `take ${take} ${name} ${e.id}`).toBeGreaterThanOrEqual(prev);
          prev = s;
          if (e.kind !== 'thought') continue;
          expect(e.text).not.toMatch(/!|\p{Extended_Pictographic}/u);
          for (const sentence of e.text.split(/(?<=[.?])\s+/)) {
            expect(sentence.split(/\s+/).length, e.text).toBeLessThanOrEqual(14);
          }
        }
      }
    }
  });

  it('keeps beat order within each act, so stories stay causal', () => {
    for (const take of TAKES) {
      const tl = compile(scenario, PATHS.approve!, { take });
      for (const seg of Object.values(scenario.segments)) {
        for (const act of seg.acts) {
          const ts = act.beats.flatMap((b) => tl.beats.filter((m) => m.id === b.id).map((m) => m.t));
          expect([...ts].sort((a, b) => a - b), `take ${take} act ${act.n}`).toEqual(ts);
        }
      }
    }
  });

  it('lists every alternate line in SCENARIO.md §11', () => {
    const section = SCENARIO_MD.slice(SCENARIO_MD.indexOf('\n## 11. '));
    const alts = Object.values(scenario.segments).flatMap((s) =>
      s.acts.flatMap((a) => a.beats.flatMap((b) => b.events.flatMap((e) => (e as { alt?: string[] }).alt ?? []))),
    );
    expect(alts.length).toBeGreaterThanOrEqual(25);
    expect(alts.filter((a) => !section.includes(a))).toEqual([]);
  });
});
