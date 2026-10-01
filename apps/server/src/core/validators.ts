// Per-beat validators (SCENARIO §9) plus general line rules (SCENARIO §2) and number
// grounding ("numbers are always taken from fixtures"). A failed check means fallback.
import type { PolicyOutcome } from './policy';

export type TargetKind = 'thought' | 'conclusion' | 'artifact';

export interface ValidationInput {
  validator: string;
  text: string;
  kind: TargetKind;
  maxSentences: number;
  /** Numbers the text may use (fixtures, script, request context). */
  allowedNumbers: ReadonlySet<string>;
  /** Computed policy outcome, for Guardian. */
  policy?: PolicyOutcome;
  /** The scripted text of the beat (the postmortem check reads its timeline). */
  reference?: string;
}

export type ValidationResult = { ok: true } | { ok: false; reason: string };

const has = (text: string, word: string) => text.toLowerCase().includes(word.toLowerCase());
const any = (text: string, words: string[]) => words.some((w) => has(text, w));

const MAX_WORDS = 14;

export function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.?])\s+(?=[A-Za-z0-9])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Quantities in text, normalised: "1,912" → "1912", "4.8" stays, "02:10:41" → "02","10","41".
 * Digits glued to letters or dots are identifiers, not quantities (p99, v2.14.0, IPv4).
 */
export function numbersIn(text: string): string[] {
  return (text.match(/(?<![A-Za-z\d.])\d[\d,]*(?:\.\d+)?(?![A-Za-z\d])/g) ?? []).flatMap((n) => {
    const clean = n.replace(/,/g, '').replace(/\.$/, '');
    return [clean, ...(clean.includes('.') ? [] : [String(Number(clean))])];
  });
}

export function allowedNumbersFrom(...sources: string[]): Set<string> {
  const set = new Set<string>();
  for (const s of sources) for (const n of numbersIn(s)) set.add(n);
  return set;
}

const RULES: Record<string, (text: string, input: ValidationInput) => string | null> = {
  'sentinel-detection': (t) =>
    !has(t, '4.8') || !any(t, ['SLO', '800'])
      ? 'must report 4.8 and the SLO'
      : any(t, ['because', 'caused', 'due to', 'deploy', 'config', 'pool', 'release'])
        ? 'must not claim a cause'
        : null,
  // Canon: "connection" and ("pool" or "Hikari"); "database" accepted so the scripted line passes (D-046).
  'log-signature': (t) =>
    has(t, 'database is down') ? 'must not claim the database is down' : !has(t, 'connection') || !any(t, ['pool', 'hikari', 'database']) ? 'must name the connection signature' : null,
  'log-pool': (t) => (!/\b10\b/.test(t) ? 'must state the pool size of 10' : null),
  'code-deploy': (t) => (!has(t, 'v2.14.0') || !has(t, '01:55') ? 'must cite v2.14.0 and 01:55' : null),
  // Canon: ("renamed" or "key") and "10"; "default" accepted for the effect line (D-046).
  'code-diff': (t) => (!any(t, ['renamed', 'key', 'default']) || !/\b10\b/.test(t) ? 'must name the key change and 10' : null),
  'orchestrator-root-cause': (t) => (!has(t, 'v2.14.0') || !any(t, ['pool', 'connection']) ? 'must name v2.14.0 and the pool' : null),
  'fixer-recommendation': (t) =>
    !any(t, ['rollback', 'roll back']) ? 'must recommend the rollback' : has(t, 'max_connections') ? 'must not propose max_connections' : null,
  'guardian-decision': (t, input) => {
    const verdict = input.policy?.verdict;
    if (!verdict) return 'no computed policy outcome';
    const saysBlocked = any(t, ['block', 'fail', 'violat', 'denied', 'reject']);
    if (verdict === 'blocked' && !saysBlocked) return 'contradicts the policy engine: action is blocked';
    if (verdict !== 'blocked' && saysBlocked) return 'contradicts the policy engine: nothing fails';
    if (verdict === 'needs-approval' && !any(t, ['human', 'approv'])) return 'must say a human approves';
    return null;
  },
  // The impact window: from 02:04 until the run's own mitigation time (a token, D-074).
  'scribe-status': (t, input) => {
    const needed = ['02:04', ...tokensIn(input.reference ?? '')];
    const missing = needed.filter((s) => !has(t, s));
    return missing.length ? `must state the impact window (missing ${missing.join(', ')})` : null;
  },
  // SCENARIO §9: every timeline timestamp of the postmortem, taken from this path's script.
  'scribe-postmortem': (t, input) => {
    const stamps = timelineStamps(input.reference ?? '');
    if (stamps.length === 0) return 'no reference timeline';
    const missing = stamps.filter((s) => !has(t, s));
    return missing.length ? `missing timeline timestamps ${missing.join(', ')}` : null;
  },
};

/** Timestamps and run-time tokens in the "Timeline" section of a postmortem. */
export function timelineStamps(doc: string): string[] {
  const section = doc.split(/^Timeline$/m)[1]?.split(/\n\s*\n/)[0] ?? '';
  return [...new Set([...(section.match(/\b\d{2}:\d{2}(?::\d{2})?\b/g) ?? []), ...tokensIn(section)])];
}

/** Run-time tokens in a text (DECISIONS D-074). */
export function tokensIn(text: string): string[] {
  return [...new Set(text.match(/\{\{[^}]+\}\}/g) ?? [])];
}

export const VALIDATOR_NAMES = Object.keys(RULES);

export function validate(input: ValidationInput): ValidationResult {
  const text = input.text.trim();
  if (!text) return { ok: false, reason: 'empty output' };
  if (/!|\p{Extended_Pictographic}/u.test(text)) return { ok: false, reason: 'exclamation mark or emoji' };
  if (input.kind !== 'artifact') {
    if (/^\s*([-*#>]|\d+\.)\s/m.test(text) || text.includes('\n')) return { ok: false, reason: 'must be plain sentences' };
    const s = sentences(text);
    if (s.length > input.maxSentences) return { ok: false, reason: `more than ${input.maxSentences} sentences` };
    const long = s.find((x) => x.split(/\s+/).length > MAX_WORDS);
    if (long) return { ok: false, reason: `sentence over ${MAX_WORDS} words` };
  }
  const invented = numbersIn(text).filter((n) => !input.allowedNumbers.has(n));
  if (invented.length) return { ok: false, reason: `ungrounded numbers ${[...new Set(invented)].join(', ')}` };
  const rule = RULES[input.validator];
  if (!rule) return { ok: false, reason: `unknown validator ${input.validator}` };
  const problem = rule(text, input);
  return problem ? { ok: false, reason: problem } : { ok: true };
}
