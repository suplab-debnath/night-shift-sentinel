import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { fromBedrockName, getTool, runTool, toBedrockName, toolSpecs, TOOLS } from './tools';

const bundle = incidentCheckout;
const ctx = (agent: Parameters<typeof runTool>[2]['agent'], allowedTools: string[], approvals: string[] = []) => ({ bundle, agent, allowedTools, approvals });

describe('fixture tools', () => {
  it('return the scripted summaries from fixtures', () => {
    expect(runTool('metrics.query', { service: 'checkout-api', window: '15m' }, ctx('sentinel', ['metrics.query'])).summary).toBe(
      'p99 4.8 s (SLO 800 ms); errors 11.4%; budget burn 14×',
    );
    expect(runTool('metrics.query', { metric: 'hikari.connections.active' }, ctx('log-detective', ['metrics.query'])).summary).toBe(
      'active 10/10 on 6 of 6 pods; 380 threads pending',
    );
    expect(runTool('traces.get', { service: 'checkout-api', depth: 2 }, ctx('sentinel', ['traces.get'])).summary).toBe(
      'payments-gateway ok; inventory-svc ok; orders-db CPU 22%, connections 180/500',
    );
    const logs = runTool('logs.search', { level: 'ERROR', since: '02:00' }, ctx('log-detective', ['logs.search']));
    expect(logs.summary).toBe('1,912 ERROR lines since 02:04; top signature 94%');
    expect(logs.payload?.content).toContain('HikariPool-1');
    expect(runTool('deploys.list', { since: '24h' }, ctx('code-archaeologist', ['deploys.list'])).summary).toBe(
      'checkout-api v2.14.0 deployed 01:55 by pipeline; previous v2.13.2 ran 9 days',
    );
    expect(runTool('git.diff', { from: 'v2.13.2', to: 'v2.14.0', path: 'deploy/' }, ctx('code-archaeologist', ['git.diff'])).payload?.type).toBe('diff');
    expect(runTool('git.diff', { from: 'v1', to: 'v2' }, ctx('code-archaeologist', ['git.diff'])).summary).toMatch(/No diff/);
    expect(runTool('git.diff', { from: 'v2.13.2', to: 'v2.14.0', path: 'deploy/' }, ctx('code-archaeologist', ['git.diff'])).summary).toBe(
      'deploy/helm/values-prod.yaml: 1 key renamed',
    );
    expect(runTool('git.diff', { from: 'v2.13.2', to: 'v2.14.0', path: 'build.gradle.kts' }, ctx('code-archaeologist', ['git.diff'])).summary).toBe(
      'build.gradle.kts: org.springframework.boot 3.3.4 → 3.3.5',
    );
    expect(runTool('runbook.lookup', { query: 'rollback checkout-api' }, ctx('fixer', ['runbook.lookup'])).summary).toMatch(/^RB-112/);
    expect(runTool('runbook.lookup', { query: 'runtime config override' }, ctx('fixer', ['runbook.lookup'])).summary).toMatch(/^RB-131/);
    expect(runTool('runbook.lookup', { query: 'reboot the moon' }, ctx('fixer', ['runbook.lookup'])).summary).toBe('No matching runbook');
    const p = runTool('policy.check', { action: 'db.alter', target: 'orders-db' }, ctx('guardian', ['policy.check']));
    expect(p.summary).toMatch(/^blocked/);
    expect(runTool('deploys.list', { service: 'nope' }, ctx('code-archaeologist', ['deploys.list'])).summary).toBe('No deploys for nope');
  });

  it('enforces grants, beat allow-lists, approvals, and argument schemas', () => {
    const denied = runTool('db.alter', { target: 'orders-db' }, ctx('fixer', ['db.alter']));
    expect(denied).toMatchObject({ ok: false, denied: true, summary: 'db.alter is not granted to fixer' });
    expect(runTool('logs.search', {}, ctx('sentinel', ['logs.search'])).denied).toBe(true);
    expect(runTool('metrics.query', {}, ctx('sentinel', [])).denied).toBe(true);
    expect(runTool('deploy.rollback', { to: 'v2.13.2' }, ctx('fixer', ['deploy.rollback']))).toMatchObject({ denied: true, summary: 'deploy.rollback needs an approved gate' });
    expect(runTool('deploy.rollback', { to: 'v2.13.2' }, ctx('fixer', ['deploy.rollback'], ['g1'])).ok).toBe(true);
    expect(runTool('config.override', { key: 'K', value: '40', expires: '48h' }, ctx('fixer', ['config.override'], ['g2'])).summary).toBe('Override recorded; expires in 48h');
    expect(runTool('deploy.restart', {}, ctx('fixer', ['deploy.restart'], ['g2'])).ok).toBe(true);
    expect(runTool('git.diff', { from: 3 }, ctx('code-archaeologist', ['git.diff'])).summary).toBe('Invalid arguments for git.diff');
    expect(runTool('nope', {}, ctx('fixer', ['nope'])).summary).toBe('Unknown tool nope');
    expect(runTool('comms.draft', { audience: 'stakeholders' }, ctx('scribe', ['comms.draft'])).ok).toBe(true);
    expect(runTool('doc.write', { type: 'postmortem' }, ctx('scribe', ['doc.write'])).ok).toBe(true);
    expect(runTool('plan.write', { incident: 'x' }, ctx('orchestrator', ['plan.write'])).ok).toBe(true);
    expect(runTool('comms.draft', null, ctx('scribe', ['comms.draft'])).summary).toMatch(/Invalid arguments/);
  });

  it('maps names for Bedrock and exposes JSON schemas', () => {
    expect(toBedrockName('logs.search')).toBe('logs_search');
    expect(fromBedrockName('logs_search')).toBe('logs.search');
    const specs = toolSpecs(['logs.search', 'missing']);
    expect(specs).toHaveLength(1);
    expect(specs[0]!.inputSchema).toMatchObject({ type: 'object' });
    for (const t of TOOLS) expect(/^[a-z]+\.[a-z]+$/.test(t.name)).toBe(true);
    expect(getTool('db.alter')).toBeDefined();
  });
});
