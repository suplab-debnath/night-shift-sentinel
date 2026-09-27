import { compile, type EngineEvent } from '@night-shift/engine';
import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { checkPolicies } from './policy';

const { scenario, fixtures } = incidentCheckout;

/** Every scripted policy.check with the guardrail rows that follow it. */
function scriptedChecks() {
  const decisions = [
    { type: 'gate' as const, gateId: 'g1', decision: 'rejected' as const, by: 'x' },
    { type: 'gate' as const, gateId: 'g2', decision: 'approved' as const, by: 'x' },
  ];
  const tl0 = compile(scenario, decisions);
  const tl = compile(scenario, [...decisions, { type: 'chaos', at: tl0.endT }]);
  const checks: { args: Record<string, string>; rows: Extract<EngineEvent, { kind: 'guardrail.check' }>[] }[] = [];
  for (const e of tl.events) {
    if (e.kind === 'tool.call' && e.tool === 'policy.check') checks.push({ args: e.args as Record<string, string>, rows: [] });
    if (e.kind === 'guardrail.check') checks.at(-1)!.rows.push(e);
  }
  return checks;
}

describe('policy engine (deterministic)', () => {
  it('reproduces every scripted guardrail row: ids, results, reasons, and wording', () => {
    const checks = scriptedChecks();
    expect(checks.map((c) => c.args.action)).toEqual(['deploy.rollback', 'config.override', 'db.alter']);
    for (const c of checks) {
      const out = checkPolicies({ action: c.args.action!, target: c.args.target!, env: c.args.env!, to: c.args.to, expires: c.args.expires }, fixtures);
      expect(out.rows.map((r) => r.policyId)).toEqual(c.rows.map((r) => r.policyId));
      out.rows.forEach((r, i) => {
        const s = c.rows[i]!;
        expect(r.result, `${c.args.action} ${r.policyId}`).toBe(s.result);
        expect(r.reason).toBe(s.reason);
        expect([r.description, r.shortDescription]).toContain(s.description);
      });
    }
  });

  it('gives the verdicts the script depends on', () => {
    expect(checkPolicies({ action: 'deploy.rollback', target: 'checkout-api', env: 'prod', to: 'v2.13.2' }, fixtures).verdict).toBe('needs-approval');
    expect(checkPolicies({ action: 'db.alter', target: 'orders-db', env: 'prod' }, fixtures).verdict).toBe('blocked');
    expect(checkPolicies({ action: 'config.override', target: 'checkout-api', env: 'prod', expires: '48h' }, fixtures).verdict).toBe('needs-approval');
  });

  it('fails the checks that should fail', () => {
    const f = structuredClone(fixtures);
    const stale = checkPolicies({ action: 'deploy.rollback', target: 'checkout-api', env: 'prod', to: 'v1.0.0' }, f);
    expect(stale.rows.find((r) => r.policyId === 'P-05')?.result).toBe('fail');
    const forever = checkPolicies({ action: 'config.override', target: 'checkout-api', env: 'prod', expires: '720h' }, f);
    expect(forever.rows.find((r) => r.policyId === 'P-08')?.result).toBe('fail');
    const noExpiry = checkPolicies({ action: 'config.override', target: 'checkout-api', env: 'prod' }, f);
    expect(noExpiry.rows.find((r) => r.policyId === 'P-08')?.result).toBe('fail');
    const unknown = checkPolicies({ action: 'deploy.rollback', target: 'nope', env: 'prod', to: 'v2.13.2' }, f);
    expect(unknown.rows.find((r) => r.policyId === 'P-04')?.result).toBe('fail');
    f.policies.incident.open = false;
    expect(checkPolicies({ action: 'deploy.rollback', target: 'checkout-api', env: 'prod', to: 'v2.13.2' }, f).rows.find((r) => r.policyId === 'P-03')?.result).toBe('fail');
    f.policies.changeFreeze.active = false;
    expect(checkPolicies({ action: 'deploy.rollback', target: 'checkout-api', env: 'prod', to: 'v2.13.2' }, f).rows.find((r) => r.policyId === 'P-03')?.result).toBe('pass');
    expect(checkPolicies({ action: 'deploy.rollback', target: 'checkout-api', env: 'staging', to: 'v2.13.2' }, f).rows.find((r) => r.policyId === 'P-01')?.result).toBe('pass');
    expect(checkPolicies({ action: 'db.alter', target: 'orders-db', env: 'prod', approvals: ['dba', 'change-board'] }, f).rows.find((r) => r.policyId === 'P-02')?.result).toBe('pass');
    expect(checkPolicies({ action: 'unknown.action', target: 'checkout-api', env: 'prod' }, f).rows).toEqual([]);
  });
});
