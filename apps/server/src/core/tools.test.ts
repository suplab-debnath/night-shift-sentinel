import { premiumRun } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { CORE_TOOLS, fromBedrockName, isKnownTool, runTool, scriptedTools, toBedrockName, toolSpecs } from './tools';

const bundle = premiumRun;
const ctx = (agent: Parameters<typeof runTool>[2]['agent'], allowedTools: string[], approvals: string[] = []) => ({ bundle, agent, allowedTools, approvals });

describe('tools (D-081)', () => {
  it('replay the scenario’s scripted results, matching arguments', () => {
    expect(runTool('metrics.query', { job: 'premium-collection', window: '60m' }, ctx('sentinel', ['metrics.query'])).summary).toBe(
      'projected finish 06:52 (bank cutoff 05:30); 1.7% items failing; 310 records/min',
    );
    expect(runTool('metrics.query', { metric: 'batch.failures.by_product' }, ctx('log-detective', ['metrics.query'])).summary).toBe(
      'all 812 failures: TP20, age band 40-44; every other product priced',
    );
    const logs = runTool('logs.search', { level: 'ERROR', since: '01:30' }, ctx('log-detective', ['logs.search']));
    expect(logs.summary).toMatch(/^812 ERROR items since 01:52/);
    expect(runTool('deploys.list', { since: '24h' }, ctx('code-archaeologist', ['deploys.list'])).summary).toMatch(/^rating-tables v2026\.10 deployed 18:40/);
    const diff = runTool('git.diff', { from: 'v2026.09', to: 'v2026.10', path: 'tariffs/' }, ctx('code-archaeologist', ['git.diff']));
    expect(diff.payload?.content).toContain('+TP20,40,44,2026-10-01,1.91');
    expect(runTool('git.diff', { path: 'build.gradle.kts' }, ctx('code-archaeologist', ['git.diff'])).summary).toMatch(/PostgreSQL driver/);
    expect(runTool('runbook.lookup', { query: 'quarantine failing records' }, ctx('fixer', ['runbook.lookup'])).summary).toMatch(/^RB-207/);
    expect(runTool('runbook.lookup', { query: 'temporary rate pin' }, ctx('fixer', ['runbook.lookup'])).summary).toMatch(/^RB-219/);
    // A failed scripted call (the 503) is never replayed as a result.
    expect(runTool('traces.get', { job: 'premium-collection', depth: 2 }, ctx('sentinel', ['traces.get'])).summary).toMatch(/^rating-service ok/);
    expect(runTool('policy.check', { action: 'db.alter', target: 'policy-db' }, ctx('guardian', ['policy.check'])).summary).toMatch(/^blocked/);
  });

  it('computes the governance tools from the fixture', () => {
    expect(runTool('pr.draft', { service: 'rating-tables' }, ctx('fixer', ['pr.draft'])).summary).toBe('Draft PR #317: 2 files changed, 2 tests added');
    expect(runTool('ci.run', { pr: 317 }, ctx('fixer', ['ci.run'])).summary).toBe('8 of 8 checks passed. The new tests fail on v2026.10 and pass with the fix.');
    expect(runTool('ci.run', { pr: 1 }, ctx('fixer', ['ci.run'])).summary).toBe('No pull request #1');
  });

  it('enforces grants, beat allow-lists, approvals, and argument schemas', () => {
    const denied = runTool('db.alter', { target: 'policy-db' }, ctx('fixer', ['db.alter']));
    expect(denied).toMatchObject({ ok: false, denied: true, summary: 'db.alter is not granted to fixer' });
    expect(runTool('logs.search', {}, ctx('sentinel', ['logs.search'])).denied).toBe(true);
    expect(runTool('metrics.query', {}, ctx('sentinel', [])).denied).toBe(true);
    expect(runTool('batch.quarantine', { records: 812 }, ctx('fixer', ['batch.quarantine']))).toMatchObject({
      denied: true,
      summary: 'batch.quarantine needs an approved gate',
    });
    expect(runTool('batch.quarantine', { records: 812 }, ctx('fixer', ['batch.quarantine'], ['g1'])).summary).toBe('812 records held; run resumed from the last commit');
    expect(runTool('rate.override', { product: 'TP20' }, ctx('fixer', ['rate.override'], ['g2'])).summary).toBe('Rate pin recorded; expires in 48 h');
    expect(runTool('policy.check', { action: 3 }, ctx('guardian', ['policy.check'])).summary).toBe('Invalid arguments for policy.check');
    expect(runTool('policy.check', null, ctx('guardian', ['policy.check'])).summary).toMatch(/Invalid arguments/);
    expect(runTool('nope', {}, ctx('fixer', ['nope'])).summary).toBe('Unknown tool nope');
    expect(runTool('comms.draft', { audience: 'finance' }, ctx('scribe', ['comms.draft'])).ok).toBe(true);
    expect(runTool('doc.write', { type: 'postmortem' }, ctx('scribe', ['doc.write'])).ok).toBe(true);
    expect(runTool('plan.write', { incident: 'x' }, ctx('orchestrator', ['plan.write'])).ok).toBe(true);
  });

  it('maps names for Bedrock and exposes JSON schemas for every granted tool', () => {
    expect(toBedrockName('logs.search')).toBe('logs_search');
    expect(fromBedrockName('logs_search')).toBe('logs.search');
    const specs = toolSpecs(bundle, ['logs.search', 'policy.check', 'missing']);
    expect(specs.map((s) => s.name)).toEqual(['logs.search', 'policy.check']);
    expect(specs[0]!.inputSchema).toMatchObject({ type: 'object', properties: { job: { type: 'string' } } });
    for (const agent of bundle.agents.agents) {
      for (const t of agent.tools) expect(isKnownTool(bundle, t.name), `${agent.id} → ${t.name}`).toBe(true);
    }
    for (const name of [...scriptedTools(bundle).keys(), ...CORE_TOOLS.map((t) => t.name)]) expect(/^[a-z]+\.[a-z]+$/.test(name)).toBe(true);
  });
});
