// zod schemas for scenarios and agents (ARCHITECTURE §5). The TypeScript
// types in events.ts are canonical; the schemas are checked against them at
// compile time below.
import { z } from 'zod';
import { AGENT_IDS, AGENT_STATES, OVERLAY_NAMES, type EventTemplate } from './events';

const agentId = z.enum(AGENT_IDS);
const clockString = z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'clock must be HH:MM:SS');

const optionCard = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  time: z.string().min(1),
  risk: z.enum(['Low', 'Medium', 'High']),
  reversible: z.boolean(),
  note: z.string(),
});

const withClock = { clock: clockString.optional() };

export const EventTemplateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('scene.start'), act: z.number().int(), title: z.string(), card: z.boolean().optional(), ...withClock }),
  z.object({ kind: z.literal('scene.end'), act: z.number().int(), ...withClock }),
  z.object({ kind: z.literal('clock.set'), clock: clockString, running: z.boolean() }),
  z.object({ kind: z.literal('clock.rate'), rate: z.number().positive().max(60), label: z.string().min(1).optional(), ...withClock }),
  z.object({ kind: z.literal('agent.state'), agent: agentId, state: z.enum(AGENT_STATES), ...withClock }),
  z.object({ kind: z.literal('thought'), agent: agentId, text: z.string().min(1), stream: z.boolean().optional(), ...withClock }),
  z.object({
    kind: z.literal('tool.call'),
    agent: agentId,
    callId: z.string().min(1),
    tool: z.string().min(1),
    args: z.record(z.string(), z.unknown()),
    ...withClock,
  }),
  z.object({
    kind: z.literal('tool.result'),
    agent: agentId,
    callId: z.string().min(1),
    summary: z.string(),
    payload: z.object({ type: z.enum(['log', 'diff', 'table', 'json']), content: z.string() }).optional(),
    status: z.enum(['ok', 'error']).optional(),
    ...withClock,
  }),
  z.object({
    kind: z.literal('message.send'),
    from: agentId,
    to: agentId,
    label: z.string().min(1),
    showLabel: z.boolean().optional(),
    ...withClock,
  }),
  z.object({
    kind: z.literal('metric.update'),
    series: z.enum(['p99', 'errorRate', 'poolActive']),
    to: z.number(),
    durationMs: z.number().nonnegative(),
    ...withClock,
  }),
  z.object({ kind: z.literal('stage.alert'), severity: z.enum(['SEV-1', 'SEV-2', 'SEV-3']), ...withClock }),
  z.object({ kind: z.literal('severity.set'), value: z.enum(['SEV-2', 'Mitigated', 'Handed to humans']), ...withClock }),
  z.object({
    kind: z.literal('evidence.pin'),
    cardId: z.string().min(1),
    agent: agentId,
    text: z.string().min(1),
    evidenceKind: z.enum(['clue', 'hypothesis']).optional(),
    ...withClock,
  }),
  z.object({ kind: z.literal('evidence.ruleOut'), cardId: z.string().min(1), reason: z.string().min(1), ...withClock }),
  z.object({
    kind: z.literal('evidence.conclude'),
    cardIds: z.array(z.string().min(1)).min(1),
    text: z.string().min(1),
    confidence: z.number().min(0).max(1),
    ...withClock,
  }),
  z.object({
    kind: z.literal('options.show'),
    agent: agentId,
    recommended: z.string(),
    options: z.array(optionCard).min(1),
    ...withClock,
  }),
  z.object({
    kind: z.literal('guardrail.check'),
    policyId: z.string().min(1),
    description: z.string().min(1),
    result: z.enum(['pass', 'fail', 'required']),
    reason: z.string(),
    ...withClock,
  }),
  z.object({
    kind: z.literal('gate.request'),
    gateId: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    evidenceRefs: z.array(z.string()),
    approveLabel: z.string().min(1),
    rejectLabel: z.string().min(1),
    footer: z.array(z.string().min(1)).optional(),
    ...withClock,
  }),
  z.object({
    kind: z.literal('gate.resolve'),
    gateId: z.string().min(1),
    decision: z.enum(['approved', 'rejected']),
    by: z.string().min(1),
    ...withClock,
  }),
  z.object({
    kind: z.literal('progress.update'),
    agent: agentId,
    label: z.string().min(1),
    current: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    ...withClock,
  }),
  z.object({ kind: z.literal('timelapse'), label: z.string().min(1), advanceClockSec: z.number().nonnegative(), ...withClock }),
  z.object({ kind: z.literal('permission.denied'), agent: agentId, tool: z.string().min(1), ...withClock }),
  z.object({
    kind: z.literal('audit'),
    severity: z.enum(['info', 'warn', 'high']),
    text: z.string().min(1),
    agent: agentId.optional(),
    ...withClock,
  }),
  z.object({
    kind: z.literal('artifact.create'),
    artifactId: z.string().min(1),
    type: z.enum(['plan', 'status', 'postmortem', 'escalation', 'pull-request']),
    title: z.string().min(1),
    markdown: z.string().min(1),
    stream: z.boolean(),
    ...withClock,
  }),
  z.object({
    kind: z.literal('channel.post'),
    author: z.string().min(1),
    agent: agentId.optional(),
    text: z.string().min(1),
    ...withClock,
  }),
  z.object({ kind: z.literal('chaos.start'), overlay: z.enum(OVERLAY_NAMES).optional(), ...withClock }),
  z.object({ kind: z.literal('chaos.end'), ...withClock }),
  z.object({ kind: z.literal('scorecard.show'), ...withClock }),
]);

export const BeatEventSchema = z.intersection(
  EventTemplateSchema,
  z.object({
    offsetMs: z.number().nonnegative().optional(),
    /** Alternate wordings of the event's text; a take picks one (DECISIONS D-068). */
    alt: z.array(z.string().min(1)).optional(),
  }),
);

export const BeatLiveSchema = z.object({
  agent: agentId,
  goal: z.string().min(1),
  allowedTools: z.array(z.string()),
  validator: z.string().min(1),
  maxSentences: z.number().int().positive(),
  /**
   * Content rules for the "facts" validator (D-081): every group in `require` needs at least one
   * of its words; no word in `forbid` may appear. Case-insensitive.
   */
  checks: z
    .object({ require: z.array(z.array(z.string().min(1)).min(1)).default([]), forbid: z.array(z.string().min(1)).default([]) })
    .optional(),
});

export const BeatSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/i, 'beat ids are alphanumeric with dots or dashes'),
  /** ms from act start at 1× */
  t: z.number().nonnegative(),
  clock: clockString.optional(),
  /** Seeded start-time spread (±ms) applied on non-zero takes. */
  jitterMs: z.number().nonnegative().optional(),
  events: z.array(BeatEventSchema).min(1),
  live: BeatLiveSchema.optional(),
});

export const ActSchema = z.object({
  n: z.number().int().nonnegative(),
  name: z.string().min(1),
  durationMs: z.number().positive(),
  beats: z.array(BeatSchema),
});

export const SegmentEndSchema = z.union([
  z.object({ gate: z.string().min(1) }),
  z.object({ end: z.enum(['A', 'B']) }),
  z.object({ returnTo: z.literal('trigger') }),
]);

export const SegmentSchema = z.object({
  acts: z.array(ActSchema).min(1),
  endsWith: SegmentEndSchema,
});

export const ScorecardRowSchema = z.object({
  measure: z.string().min(1),
  manual: z.string().min(1),
  squad: z.string().min(1),
  /** Minutes, for proportional bars and deck charts. */
  manualMinutes: z.number().nonnegative().optional(),
  squadMinutes: z.number().nonnegative().optional(),
  /** The squad figure measured from this run (run-time tokens, D-074); `squad` stays for the decks. */
  squadLive: z.string().min(1).optional(),
  /** Beats ("a|b" lists) whose span sizes the squad bar in the app. */
  squadSpan: z.tuple([z.string().min(1), z.string().min(1)]).optional(),
});

export const SplitLaneEntrySchema = z.object({ label: z.string().min(1), clock: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/) });

export const SplitViewSchema = z.object({
  caption: z.string().min(1),
  axis: z.object({ from: z.string(), to: z.string() }),
  manual: z.array(SplitLaneEntrySchema).min(1),
  squad: z.array(SplitLaneEntrySchema).min(1),
  /** The squad lane from this run: clocks are run-time tokens (D-074). */
  squadLive: z.array(z.object({ label: z.string().min(1), clock: z.string().min(1) })).optional(),
});

export const EndingSchema = z.object({
  headline: z.string().min(1),
  /** Headline with run-time tokens, shown in the app (D-074); `headline` stays for the decks. */
  headlineLive: z.string().min(1).optional(),
  severityLabel: z.string().optional(),
});

/** A stage banner shown when a milestone is reached (D-080). Text may carry run-time tokens. */
export const MomentSchema = z.object({
  milestone: z.string().min(1),
  tone: z.enum(['signal', 'ok', 'caution', 'alert']),
  icon: z.enum(['radar', 'search', 'check', 'shield', 'hand']).default('check'),
  title: z.string().min(1).max(70),
  sub: z.string().min(1).max(110).optional(),
});

/**
 * How the stage presents this scenario's world (D-081): the primary metric on the heartbeat line
 * (latency in ms, or a clock time in minutes after midnight), and the labels around it.
 * Defaults reproduce the checkout incident.
 */
export const DisplaySchema = z
  .object({
    primary: z
      .object({
        label: z.string().default('p99 latency'),
        format: z.enum(['latency', 'clock']).default('latency'),
        scale: z.enum(['log', 'linear']).default('log'),
        min: z.number().positive().default(100),
        max: z.number().positive().default(6000),
        /** Label on the threshold line; defaults to "SLO <p99Ms> ms". */
        thresholdLabel: z.string().optional(),
      })
      .prefault({}),
    errorsLabel: z.string().default('errors'),
    impactLabel: z.string().default('Customer impact'),
    channel: z.string().default('#inc-checkout-api'),
    progressLabel: z.string().default('Rollout'),
    /** Change-request references shown on the gate sheet, by gate id. */
    changeRefs: z.record(z.string(), z.string()).default({ g1: 'CHG-24817', g2: 'CHG-24818' }),
  })
  .prefault({});

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  /** Beat ids ("a|b") whose first event marks the milestone on each path. */
  beats: z.string().min(1),
});

const OverlaySchema = z.object({ segment: z.string().min(1), availableFrom: z.object({ act: z.number().int() }) });

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  world: z.object({ company: z.string().min(1), service: z.string().min(1) }),
  clockStart: clockString,
  slo: z.object({ p99Ms: z.number().positive(), errorRatePct: z.number().positive() }),
  initialMetrics: z.object({ p99: z.number(), errorRate: z.number(), poolActive: z.number() }),
  /** Gap between the human decision and the first event of the continuation. */
  gateGapMs: z.number().nonnegative().default(600),
  gates: z.record(z.string(), z.object({ onApprove: z.string().min(1), onReject: z.string().min(1) })),
  segments: z.record(z.string(), SegmentSchema),
  overlays: z.object({
    chaos: OverlaySchema,
    /** The poisoned-log test (D-079). */
    inject: OverlaySchema.optional(),
  }),
  scorecard: z.array(ScorecardRowSchema),
  scorecardFootnote: z.string().min(1),
  endings: z.object({ A: EndingSchema, B: EndingSchema }),
  splitView: SplitViewSchema,
  /** The incident milestones on the operations bar (D-075). */
  milestones: z.array(MilestoneSchema).default([]),
  /** Stage presentation of this world (D-081). */
  display: DisplaySchema,
  /** Facts given to live-mode agents as their whole world (D-081). */
  liveFacts: z.array(z.string().min(1)).default([]),
  /** Stage banners for the big moments (D-080). */
  moments: z.array(MomentSchema).default([]),
  /** Customer impact: from a fixed story time until a milestone beat (D-075). */
  impact: z.object({ from: clockString, until: z.string().min(1) }).optional(),
});

export const ToolAccessSchema = z.enum(['read', 'write', 'approval']);

export const AgentDefSchema = z.object({
  id: agentId,
  name: z.string().min(1),
  role: z.string().min(1).max(60),
  hueToken: z.string().regex(/^--[a-z0-9-]+$/),
  icon: z.string().min(1),
  tools: z.array(z.object({ name: z.string().min(1), access: ToolAccessSchema })),
  needsApprovalFor: z.array(z.string().max(60)),
  neverAllowed: z.array(z.string().max(60)),
  /** Stage position as a percentage of stage size (0–100). */
  position: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  size: z.enum(['md', 'lg']).default('md'),
  persona: z.string().optional(),
  /** Which approved model serves this agent in live mode: the main model or the faster one (D-079). */
  modelTier: z.enum(['main', 'fast']).optional(),
});

export const AgentsSchema = z.object({ agents: z.array(AgentDefSchema).min(1) });

export type ScenarioInput = z.input<typeof ScenarioSchema>;
export type Scenario = z.output<typeof ScenarioSchema>;
export type Segment = z.output<typeof SegmentSchema>;
export type Act = z.output<typeof ActSchema>;
export type Beat = z.output<typeof BeatSchema>;
export type BeatLive = z.output<typeof BeatLiveSchema>;
export type BeatEvent = EventTemplate & { offsetMs?: number; alt?: string[] };
export type ScorecardRow = z.output<typeof ScorecardRowSchema>;
export type SplitView = z.output<typeof SplitViewSchema>;
export type Ending = z.output<typeof EndingSchema>;
export type Milestone = z.output<typeof MilestoneSchema>;
export type Moment = z.output<typeof MomentSchema>;
export type Display = z.output<typeof DisplaySchema>;
export type AgentDef = z.output<typeof AgentDefSchema>;
export type AgentsFile = z.output<typeof AgentsSchema>;

// Compile-time guarantee that the schema and the hand-written union agree.
type Assert<T extends true> = T;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
export type _SchemaMatchesEvents = Assert<Mutual<z.output<typeof EventTemplateSchema>, EventTemplate>>;

export class ScenarioValidationError extends Error {
  constructor(
    message: string,
    readonly issues: string[],
  ) {
    super(message);
    this.name = 'ScenarioValidationError';
  }
}

/** Parse and cross-check a scenario (schema plus referential integrity). */
export function parseScenario(input: unknown): Scenario {
  const result = ScenarioSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ScenarioValidationError(`Scenario is invalid (${issues.length} issues)`, issues);
  }
  const scenario = result.data;
  const issues = checkScenarioIntegrity(scenario);
  if (issues.length > 0) {
    throw new ScenarioValidationError(`Scenario is inconsistent (${issues.length} issues)`, issues);
  }
  return scenario;
}

export function parseAgents(input: unknown): AgentsFile {
  const result = AgentsSchema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new ScenarioValidationError(`Agents file is invalid (${issues.length} issues)`, issues);
  }
  return result.data;
}

export function checkScenarioIntegrity(s: Scenario): string[] {
  const issues: string[] = [];
  if (!s.segments.main) issues.push('segments.main is required');
  const beatIds = new Set<string>();
  for (const [key, seg] of Object.entries(s.segments)) {
    if ('gate' in seg.endsWith && !s.gates[seg.endsWith.gate]) {
      issues.push(`segments.${key} ends with unknown gate "${seg.endsWith.gate}"`);
    }
    for (const act of seg.acts) {
      let prev = -1;
      for (const beat of act.beats) {
        if (beatIds.has(beat.id)) issues.push(`duplicate beat id "${beat.id}"`);
        beatIds.add(beat.id);
        if (beat.t < prev) issues.push(`beat "${beat.id}" is out of order in segment ${key}`);
        prev = beat.t;
        if (beat.t > act.durationMs) issues.push(`beat "${beat.id}" starts after its act ends`);
        for (const e of beat.events) {
          if (e.alt && !('text' in e)) issues.push(`beat "${beat.id}": alt is only allowed on events with text`);
        }
      }
    }
  }
  for (const [id, gate] of Object.entries(s.gates)) {
    for (const target of [gate.onApprove, gate.onReject]) {
      if (!s.segments[target]) issues.push(`gate ${id} points to unknown segment "${target}"`);
    }
    const requested = Object.values(s.segments).some((seg) =>
      seg.acts.some((a) => a.beats.some((b) => b.events.some((e) => e.kind === 'gate.request' && e.gateId === id))),
    );
    if (!requested) issues.push(`gate ${id} is never requested`);
  }
  for (const m of s.moments) {
    if (!s.milestones.some((x) => x.id === m.milestone)) issues.push(`moment points to unknown milestone "${m.milestone}"`);
  }
  for (const [name, overlay] of Object.entries(s.overlays)) {
    if (!overlay) continue;
    const seg = s.segments[overlay.segment];
    if (!seg) issues.push(`overlay ${name} points to unknown segment "${overlay.segment}"`);
    else if (!('returnTo' in seg.endsWith)) issues.push(`the ${name} segment must end with returnTo: trigger`);
  }
  return issues;
}
