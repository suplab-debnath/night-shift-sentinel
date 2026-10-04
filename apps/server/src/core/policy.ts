// Deterministic policy engine over policies.json (ARCHITECTURE §7.6, DECISIONS D-002).
// Guardian's pass/fail always comes from here; the model may only explain it.
import type { GuardrailResult } from '@night-shift/engine';
import type { Fixtures, PolicyRule } from '@night-shift/scenarios';

export interface ActionRequest {
  action: string;
  target: string;
  env: string;
  to?: string;
  expires?: string;
  approvals?: string[];
  /** code.change: checks that passed on the change (D-079). */
  checks?: string[];
  /** tool.output: the text to inspect; defaults to the fixture sample for its source. */
  source?: string;
  content?: string;
}

/** Instruction-like text aimed at the agents (prompt injection). Deterministic, and deliberately simple. */
export const INSTRUCTION_PATTERN =
  /\b(ignore (all |any )?(previous|prior|earlier) instructions|disregard (the |all )?(rules|policy|policies|instructions)|skip (the )?policy checks?|you are now|new instructions)\b|\bsystem:/i;

export interface PolicyRow {
  policyId: string;
  description: string;
  shortDescription: string;
  result: GuardrailResult;
  reason: string;
}

export interface PolicyOutcome {
  rows: PolicyRow[];
  /** 'blocked' if any policy fails; 'needs-approval' if a human must approve; otherwise 'allowed'. */
  verdict: 'blocked' | 'needs-approval' | 'allowed';
}

function hours(expires: string | undefined): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*h/i.exec(expires ?? '');
  return m ? Number(m[1]) : null;
}

function evaluateRule(rule: PolicyRule, req: ActionRequest, f: Fixtures, onMatch: 'required' | 'fail'): { result: GuardrailResult; reason: string } {
  const action = f.policies.actions[req.action];
  switch (rule.type) {
    case 'human-approval':
      return req.env === rule.env ? { result: 'required', reason: 'A human must approve before execution' } : { result: 'pass', reason: 'Not a production change' };
    case 'approvals-present': {
      const missing = rule.approvals.filter((a) => !(req.approvals ?? []).includes(a));
      if (req.env !== rule.env || missing.length === 0) return { result: 'pass', reason: 'Approvals present' };
      return { result: onMatch, reason: 'No DBA or change board approval' };
    }
    case 'freeze-window': {
      const freeze = f.policies.changeFreeze;
      if (!freeze.active) return { result: 'pass', reason: 'No change freeze' };
      const incident = f.policies.incident;
      const excepted = rule.incidentException && incident.open && incident.severity <= freeze.incidentExceptionMaxSeverity;
      return excepted ? { result: 'pass', reason: 'Incident exception applies' } : { result: onMatch, reason: 'Change freeze in effect' };
    }
    case 'blast-radius': {
      const svc = f.services.services.find((s) => s.name === req.target);
      if (!svc) return { result: onMatch, reason: `Unknown target ${req.target}` };
      if (svc.kind === 'database') {
        const dependents = f.services.services.filter((s) => s.dependsOn.includes(req.target)).length;
        return dependents <= rule.maxServices
          ? { result: 'pass', reason: `${req.target} only` }
          : { result: onMatch, reason: `${dependents} services depend on ${req.target}` };
      }
      return { result: 'pass', reason: `${req.target} only` };
    }
    case 'verified-target': {
      const history = f.deploys.history[req.target] ?? [];
      const entry = history.find((h) => h.version === req.to);
      if (entry && entry.checks === 'passed' && (entry.ranDays ?? 0) <= rule.withinDays) {
        return { result: 'pass', reason: `${req.to} ran ${entry.ranDays} days` };
      }
      return { result: onMatch, reason: `${req.to ?? 'Target'} has no passing run in the last ${rule.withinDays} days` };
    }
    case 'no-outage':
      if (!action) return { result: onMatch, reason: 'Unknown action' };
      return action.outageSeconds > rule.maxOutageSeconds ? { result: onMatch, reason: action.note } : { result: 'pass', reason: action.note };
    case 'override-expiry': {
      const h = hours(req.expires);
      return h !== null && h <= rule.maxHours ? { result: 'pass', reason: `${h} h expiry set` } : { result: onMatch, reason: 'Override has no expiry within limits' };
    }
    case 'review-required':
      return { result: onMatch, reason: `Draft only. A reviewer from ${rule.reviewers} merges; the pipeline deploys.` };
    case 'checks-passed': {
      const missing = rule.checks.filter((c) => !(req.checks ?? []).includes(c));
      if (missing.length > 0) return { result: onMatch, reason: `Missing checks: ${missing.join(', ')}` };
      const added = f.governance.pullRequest.testsAdded;
      return { result: 'pass', reason: `${rule.checks.length} of ${rule.checks.length} required checks passed, ${added} new tests` };
    }
    case 'untrusted-input': {
      const sample = f.governance.untrustedInput;
      const text = req.content ?? (req.source === sample.source ? sample.lines.join('\n') : '');
      return INSTRUCTION_PATTERN.test(text)
        ? { result: onMatch, reason: `Instruction-like text in a ${sample.field}; quarantined` }
        : { result: 'pass', reason: 'No instructions found in tool output' };
    }
  }
}

export function checkPolicies(req: ActionRequest, f: Fixtures): PolicyOutcome {
  const rows: PolicyRow[] = f.policies.policies
    .filter((p) => p.appliesTo.includes(req.action))
    .map((p) => {
      const r = evaluateRule(p.rule, req, f, p.onMatch);
      return { policyId: p.id, description: p.title, shortDescription: p.shortTitle ?? p.title, ...r };
    });
  const verdict = rows.some((r) => r.result === 'fail') ? 'blocked' : rows.some((r) => r.result === 'required') ? 'needs-approval' : 'allowed';
  return { rows, verdict };
}
