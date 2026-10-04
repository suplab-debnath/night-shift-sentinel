// Prompt assembly: global rules + persona + grounded facts (ARCHITECTURE §7.3).
import type { AgentDef } from '@night-shift/engine';
import type { ScenarioBundle } from '@night-shift/scenarios';
import type { PolicyOutcome } from './policy';
import type { TargetKind } from './validators';

const LINE_RULES = (maxSentences: number) =>
  [
    `Write at most ${maxSentences} plain sentence${maxSentences > 1 ? 's' : ''}, each 14 words or fewer.`,
    'No exclamation marks, no emoji, no lists, no markdown, no preamble. Output only the line itself.',
  ].join(' ');

const DOC_RULES =
  'Write the document as plain text with short headings on their own lines. No exclamation marks, no emoji. Output only the document.';

/** Run times are tokens the stage fills in (DECISIONS D-074); the model must copy them. */
export const TOKEN_RULES =
  'Times from tonight\'s run are placeholders in double braces, for example {{clock:a6.b03}} or {{hm:a6.b02}}. Copy every placeholder you use exactly, braces included; the stage fills in the real times. Never write a run time as digits.';

/** The facts a live agent may use: the scenario's own list (DECISIONS D-081). */
export function incidentFacts(bundle: ScenarioBundle): string {
  return bundle.scenario.liveFacts.join('\n');
}

export function systemPrompt(opts: {
  bundle: ScenarioBundle;
  agent: AgentDef;
  kind: TargetKind;
  maxSentences: number;
  policy?: PolicyOutcome;
  timeline?: string;
}): string {
  const { agent, kind, maxSentences, policy } = opts;
  return [
    'You are one agent in Night Shift, an incident-response squad demo shown to clients. The facts below are the whole world: use only them.',
    'Never invent numbers, times, versions, or services. Numbers must come from the facts or the context.',
    `Persona: ${agent.persona ?? agent.role}`,
    kind === 'artifact' ? DOC_RULES : LINE_RULES(maxSentences),
    '',
    'Facts:',
    incidentFacts(opts.bundle),
    opts.timeline ? `\n${TOKEN_RULES}\nTimeline so far:\n${opts.timeline}` : '',
    policy
      ? `\nPolicy results computed by the policy engine (you may only explain these, never change them):\n${policy.rows
          .map((r) => `${r.policyId} ${r.description}: ${r.result} (${r.reason})`)
          .join('\n')}\nVerdict: ${policy.verdict}.`
      : '',
  ].join('\n');
}

/** The "Timeline" section of a scripted postmortem (with run-time tokens), given to the model. */
export function timelineSection(doc: string): string {
  return doc.split(/^Timeline$/m)[1]?.split(/\n\s*\n/)[0]?.trim() ?? '';
}
