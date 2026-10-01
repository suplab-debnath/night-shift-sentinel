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

export function incidentFacts(bundle: ScenarioBundle): string {
  const f = bundle.fixtures;
  const m = f.metrics;
  const d = f.deploys.deploys.find((x) => x.service === 'checkout-api');
  const db = f.traces.dependencies.find((x) => x.service === 'orders-db') as Record<string, unknown> | undefined;
  const dependents = f.services.services.filter((s) => s.dependsOn.includes('orders-db')).length;
  return [
    `Company: ${bundle.scenario.world.company}. Service: checkout-api (Java 21, Spring Boot 3, HikariCP), 6 pods.`,
    `SLO: p99 latency at most ${m.slo.p99Ms} ms; error rate at most ${m.slo.errorRatePct}%.`,
    `Normal: p99 ${m.normal.p99Ms} ms, errors ${m.normal.errorRatePct}%, pool active ${m.normal.poolActivePerPod} of ${m.normal.poolMaxPerPod} per pod.`,
    `Peak: p99 ${m.peak.p99Ms / 1000} s, errors ${m.peak.errorRatePct}%, error budget burn ${m.peak.errorBudgetBurn} times normal.`,
    // Times after the alert depend on the run (gate waits, pauses), so they are tokens, not facts (D-074).
    `Times: v2.14.0 deployed 01:55, first errors ${m.events.firstErrors}, alert at about ${(m.events.alert ?? '02:07').slice(0, 5)}.`,
    `Logs: ${f.logs.stats.errorCount.toLocaleString('en-US')} errors since 02:04; ${Math.round(f.logs.stats.signatureShare * 100)}% match "${f.logs.stats.signature}".`,
    `Pool now: ${m.podsAt.pods[0]!.poolActive} of ${m.podsAt.pods[0]!.poolMax} active on every pod; ${m.podsAt.pendingTotal} threads waiting.`,
    `orders-db: CPU ${db?.cpuPct}%, connections ${db?.connections} of ${db?.maxConnections}, healthy. ${dependents} services depend on orders-db.`,
    d ? `Deploy: ${d.version} at ${d.at} by ${d.by}; previous ${d.previous} ran 9 days; schema migration: ${d.schemaMigration ? 'yes' : 'no'}.` : '',
    `Diff: Helm values renamed ${f.diff.analysis.renamedKey.from} to ${f.diff.analysis.renamedKey.to}; the app still binds the old key, so HikariCP uses its default of ${f.diff.analysis.hikariDefaultPoolSize}. Production needs about ${f.diff.analysis.productionNeedsPerPod} per pod.`,
    `Runbooks: RB-112 rollback (rolling, one pod at a time, about 3 min); RB-131 runtime override plus rolling restart, 48 h expiry.`,
  ]
    .filter(Boolean)
    .join('\n');
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
