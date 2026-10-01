import type { Beat } from '@night-shift/engine';
import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { findTarget } from './agentTurn';
import { checkPolicies } from './policy';
import { incidentFacts } from './prompt';
import { policyFor } from './segments';
import { allowedNumbersFrom, numbersIn, sentences, timelineStamps, validate, VALIDATOR_NAMES, type ValidationInput } from './validators';

const { scenario, fixtures } = incidentCheckout;
const allowed = allowedNumbersFrom(JSON.stringify(fixtures), incidentFacts(incidentCheckout));
const base = (validator: string, text: string, extra: Partial<ValidationInput> = {}): ValidationInput => ({
  validator,
  text,
  kind: 'thought',
  maxSentences: 2,
  allowedNumbers: allowed,
  ...extra,
});

function liveBeats(): { segment: string; beat: Beat }[] {
  return Object.entries(scenario.segments).flatMap(([segment, s]) => s.acts.flatMap((a) => a.beats.filter((b) => b.live).map((beat) => ({ segment, beat }))));
}

describe('validators', () => {
  it('accept every canonical scripted line (so the fallback is never impossible to beat)', () => {
    const beats = liveBeats();
    expect(beats.length).toBe(12);
    for (const { segment, beat } of beats) {
      const target = findTarget(beat, beat.live!.agent)!;
      const policy = policyFor(incidentCheckout, segment, beat.id);
      const r = validate({
        validator: beat.live!.validator,
        text: target.text,
        kind: target.kind,
        maxSentences: beat.live!.maxSentences,
        // As in agentTurn: the beat's own scripted text grounds its numbers too.
        allowedNumbers: allowedNumbersFrom(JSON.stringify(fixtures), incidentFacts(incidentCheckout), target.text),
        reference: target.text,
        ...(policy ? { policy } : {}),
      });
      expect(r, `${beat.id}: ${target.text.slice(0, 60)}`).toEqual({ ok: true });
    }
    expect(VALIDATOR_NAMES).toHaveLength(10);
  });

  it('reject lines that break SCENARIO §9', () => {
    const bad: [string, string][] = [
      ['sentinel-detection', 'Latency is 4.8 seconds against the 800 ms SLO because of the deploy.'],
      ['sentinel-detection', 'Latency is very high.'],
      ['log-signature', 'The database is down. Connection pool errors everywhere.'],
      ['log-signature', 'Errors are rising.'],
      ['log-pool', 'The pool is exhausted on every pod.'],
      ['code-deploy', 'A deploy happened last night.'],
      ['code-diff', 'Something changed in the chart.'],
      ['orchestrator-root-cause', 'The database is slow.'],
      ['fixer-recommendation', 'Raise max_connections and roll back.'],
      ['fixer-recommendation', 'Scale out the pods.'],
      ['scribe-status', 'Checkout was slow for a while.'],
      ['scribe-postmortem', '01:55 deploy. 02:04 errors.'],
      ['nope', 'Any text.'],
    ];
    for (const [v, text] of bad) {
      const ref = 'Timeline\n01:55 deploy\n02:04 errors\n{{clock:a6.b03}} done\n\nWhat went well';
      expect(validate(base(v, text, v.startsWith('scribe') ? { kind: 'artifact', reference: ref } : {})).ok, `${v}: ${text}`).toBe(false);
    }
  });

  it('reject Guardian text that contradicts the policy engine', () => {
    const blocked = checkPolicies({ action: 'db.alter', target: 'orders-db', env: 'prod' }, fixtures);
    const needs = checkPolicies({ action: 'deploy.rollback', target: 'checkout-api', env: 'prod', to: 'v2.13.2' }, fixtures);
    expect(validate(base('guardian-decision', 'All policies pass. A human approves the change.', { policy: blocked })).ok).toBe(false);
    expect(validate(base('guardian-decision', 'Blocked by P-02 and P-04.', { policy: needs })).ok).toBe(false);
    expect(validate(base('guardian-decision', 'All policies pass. Ready to go.', { policy: needs })).ok).toBe(false);
    expect(validate(base('guardian-decision', 'Blocked. It violates P-02, P-04 and P-06.', { policy: blocked })).ok).toBe(true);
    expect(validate(base('guardian-decision', 'All pass.')).ok).toBe(false);
    const allowedOnly = { ...needs, verdict: 'allowed' as const };
    expect(validate(base('guardian-decision', 'All policies pass.', { policy: allowedOnly })).ok).toBe(true);
  });

  it('enforce the line rules and number grounding', () => {
    const ok = 'p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds.';
    expect(validate(base('sentinel-detection', ok)).ok).toBe(true);
    expect(validate(base('sentinel-detection', `${ok} It is bad.`))).toEqual({ ok: false, reason: 'more than 2 sentences' });
    expect(validate(base('sentinel-detection', 'p99 latency on the checkout api service is now 4.8 seconds against the 800 millisecond SLO.'))).toMatchObject({ ok: false });
    expect(validate(base('sentinel-detection', 'p99 is 4.8 seconds! The SLO is 800 ms.'))).toMatchObject({ reason: 'exclamation mark or emoji' });
    expect(validate(base('sentinel-detection', '- p99 is 4.8 s over the 800 ms SLO.'))).toMatchObject({ reason: 'must be plain sentences' });
    expect(validate(base('sentinel-detection', 'p99 is 4.8 s. The SLO is 800 ms and 7,431 users left.'))).toMatchObject({ reason: 'ungrounded numbers 7431' });
    expect(validate(base('sentinel-detection', '   '))).toMatchObject({ reason: 'empty output' });
  });

  it('reads the postmortem timeline for the path', () => {
    expect(timelineStamps('Title\n\nTimeline\n01:55 a\n02:08:44 b\n02:08:44 c\n{{clock:a6.b03}} d\n\nWhat went well\n03:00 x')).toEqual(['01:55', '02:08:44', '{{clock:a6.b03}}']);
    expect(validate(base('scribe-postmortem', 'Anything.', { kind: 'artifact' }))).toMatchObject({ reason: 'no reference timeline' });
  });

  it('parse sentences and numbers', () => {
    expect(sentences('One. Two? Three.')).toEqual(['One.', 'Two?', 'Three.']);
    expect(sentences('v2.14.0 was deployed at 01:55.')).toHaveLength(1);
    expect(numbersIn('1,912 errors at 02:10:41, 4.8 s')).toEqual(['1912', '1912', '02', '2', '10', '10', '41', '41', '4.8']);
  });
});
