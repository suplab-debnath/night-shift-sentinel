import type { Beat } from '@night-shift/engine';
import { premiumRun } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { findTarget } from './agentTurn';
import { checkPolicies } from './policy';
import { incidentFacts } from './prompt';
import { policyFor } from './segments';
import { allowedNumbersFrom, numbersIn, sentences, timelineStamps, validate, VALIDATOR_NAMES, type ValidationInput } from './validators';

const { scenario, fixtures } = premiumRun;
const allowed = allowedNumbersFrom(JSON.stringify(fixtures), incidentFacts(premiumRun));
const checksFor = (id: string) => liveBeats().find((b) => b.beat.id === id)!.beat.live!.checks!;
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
      const policy = policyFor(premiumRun, segment, beat.id);
      const r = validate({
        validator: beat.live!.validator,
        text: target.text,
        kind: target.kind,
        maxSentences: beat.live!.maxSentences,
        // As in agentTurn: the beat's own scripted text grounds its numbers too.
        allowedNumbers: allowedNumbersFrom(JSON.stringify(fixtures), incidentFacts(premiumRun), target.text),
        reference: target.text,
        ...(beat.live!.checks ? { checks: beat.live!.checks } : {}),
        impactFrom: scenario.impact!.from.slice(0, 5),
        ...(policy ? { policy } : {}),
      });
      expect(r, `${beat.id}: ${target.text.slice(0, 60)}`).toEqual({ ok: true });
    }
    expect(VALIDATOR_NAMES.sort()).toEqual(['facts', 'guardian-decision', 'scribe-postmortem', 'scribe-status']);
  });

  it('reject lines that break SCENARIO §9', () => {
    const bad: [string, string, string][] = [
      ['a1.b04', 'facts', 'The run will finish at 06:52 because of the tariff release.'],
      ['a1.b04', 'facts', 'The premium run is slow.'],
      ['a3.b06', 'facts', 'The database is down. Lookups fail everywhere.'],
      ['a3.b07', 'facts', 'A release happened yesterday evening.'],
      ['a3.b12', 'facts', 'Some records fail.'],
      ['a3.b17', 'facts', 'Something changed in the tariffs.'],
      ['a3.b20', 'facts', 'The database is slow.'],
      ['a4.b04', 'facts', 'Delete the extra rows and rerun.'],
      ['a4.b04', 'facts', 'Restart the batch.'],
    ];
    for (const [id, v, text] of bad) expect(validate(base(v, text, { checks: checksFor(id) })).ok, `${id}: ${text}`).toBe(false);
    expect(validate(base('facts', 'Anything.')).ok).toBe(false);
    const ref = 'Timeline\n18:40 deploy\n01:52 failures\n{{clock:a6.b03}} done\n\nWhat went well';
    expect(validate(base('scribe-status', 'The premium run was slow for a while.', { kind: 'artifact', reference: ref, impactFrom: '01:52' })).ok).toBe(false);
    expect(validate(base('scribe-postmortem', '18:40 deploy. 01:52 failures.', { kind: 'artifact', reference: ref })).ok).toBe(false);
    expect(validate(base('nope', 'Any text.')).ok).toBe(false);
  });

  it('reject Guardian text that contradicts the policy engine', () => {
    const blocked = checkPolicies({ action: 'db.alter', target: 'policy-db', env: 'prod' }, fixtures);
    const needs = checkPolicies({ action: 'batch.quarantine', target: 'premium-collection', env: 'prod' }, fixtures);
    expect(validate(base('guardian-decision', 'All policies pass. A human approves the change.', { policy: blocked })).ok).toBe(false);
    expect(validate(base('guardian-decision', 'Blocked by P-02 and P-04.', { policy: needs })).ok).toBe(false);
    expect(validate(base('guardian-decision', 'All policies pass. Ready to go.', { policy: needs })).ok).toBe(false);
    expect(validate(base('guardian-decision', 'Blocked. It violates P-02, P-04 and P-06.', { policy: blocked })).ok).toBe(true);
    expect(validate(base('guardian-decision', 'All pass.')).ok).toBe(false);
    const allowedOnly = { ...needs, verdict: 'allowed' as const };
    expect(validate(base('guardian-decision', 'All policies pass.', { policy: allowedOnly })).ok).toBe(true);
  });

  it('enforce the line rules and number grounding', () => {
    const checks = checksFor('a1.b04');
    const v = (text: string) => validate(base('facts', text, { checks }));
    const ok = 'The premium run now projects to finish at 06:52. The bank cutoff is 05:30.';
    expect(v(ok).ok).toBe(true);
    expect(v(`${ok} It is bad.`)).toEqual({ ok: false, reason: 'more than 2 sentences' });
    expect(v('The nightly premium run now projects a finish at 06:52, long after the 05:30 bank cutoff tonight.')).toMatchObject({ ok: false });
    expect(v('Finish at 06:52! Cutoff 05:30.')).toMatchObject({ reason: 'exclamation mark or emoji' });
    expect(v('- Finish at 06:52, cutoff 05:30.')).toMatchObject({ reason: 'must be plain sentences' });
    expect(v('Finish at 06:52. Cutoff 05:30 and 7,431 policies lapse.')).toMatchObject({ reason: 'ungrounded numbers 7431' });
    expect(v('   ')).toMatchObject({ reason: 'empty output' });
  });

  it('reads the postmortem timeline for the path', () => {
    expect(timelineStamps('Title\n\nTimeline\n01:55 a\n02:08:44 b\n02:08:44 c\n{{clock:a6.b03}} d\n\nWhat went well\n03:00 x')).toEqual(['01:55', '02:08:44', '{{clock:a6.b03}}']);
    expect(validate(base('scribe-postmortem', 'Anything.', { kind: 'artifact' }))).toMatchObject({ reason: 'no reference timeline' });
  });

  it('parse sentences and numbers', () => {
    expect(sentences('One. Two? Three.')).toEqual(['One.', 'Two?', 'Three.']);
    expect(sentences('v2026.10 was deployed at 18:40.')).toHaveLength(1);
    expect(numbersIn('1,912 errors at 02:10:41, 4.8 s')).toEqual(['1912', '1912', '02', '2', '10', '10', '41', '41', '4.8']);
  });
});
