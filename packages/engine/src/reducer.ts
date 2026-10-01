// Pure, total reducer: reduce(state, event) → StageState (ARCHITECTURE §3, §4).
// Unknown event kinds return the same state. Audit rows are derived here.
import {
  AGENT_IDS,
  isKnownEventKind,
  type AgentId,
  type AgentState,
  type AlertSeverity,
  type ArtifactType,
  type AuditSeverity,
  type EngineEvent,
  type EventOf,
  type EventSourceKind,
  type EvidenceKind,
  type GateDecision,
  type GuardrailResult,
  type MetricSeries,
  type OptionCard,
  type PayloadType,
  type SeverityValue,
  type ToolStatus,
} from './events';
import { formatArgs } from './format';
import { metricValueAt, type MetricTracks } from './metrics';

interface EntryBase {
  id: string;
  t: number;
  clock: string | null;
  source: EventSourceKind;
}

export type StreamEntry = EntryBase &
  (
    | { type: 'thought'; agent: AgentId; text: string; typed: boolean }
    | { type: 'tool.call'; agent: AgentId; callId: string; tool: string; args: Record<string, unknown> }
    | {
        type: 'tool.result';
        agent: AgentId;
        callId: string;
        summary: string;
        payload?: { type: PayloadType; content: string };
        status: ToolStatus;
      }
    | { type: 'message'; from: AgentId; to: AgentId; label: string }
  );

export interface MessageEntry {
  id: string;
  t: number;
  from: AgentId;
  to: AgentId;
  label: string;
  showLabel: boolean;
}

export interface EvidenceCard {
  cardId: string;
  agent: AgentId;
  text: string;
  t: number;
  kind: EvidenceKind;
  ruledOut: { reason: string; t: number } | null;
}

export interface ChannelPost {
  id: string;
  t: number;
  clock: string | null;
  author: string;
  agent: AgentId | null;
  text: string;
}

export interface Conclusion {
  cardIds: string[];
  text: string;
  confidence: number;
  t: number;
}

export interface OptionSet {
  id: string;
  agent: AgentId;
  recommended: string;
  options: OptionCard[];
  t: number;
}

export interface ChecklistRow {
  policyId: string;
  description: string;
  result: GuardrailResult;
  reason: string;
  t: number;
}

export interface Checklist {
  id: string;
  agent: AgentId;
  args: Record<string, unknown>;
  rows: ChecklistRow[];
  t: number;
}

export interface GateView {
  gateId: string;
  title: string;
  summary: string;
  evidenceRefs: string[];
  approveLabel: string;
  rejectLabel: string;
  footer: string[];
  status: 'open' | GateDecision;
  by: string | null;
  requestedT: number;
  resolvedT: number | null;
}

export interface ProgressView {
  agent: AgentId;
  label: string;
  current: number;
  total: number;
  t: number;
}

export type AuditCategory = 'tool' | 'policy' | 'gate' | 'permission' | 'note';

export interface AuditRow {
  id: string;
  t: number;
  clock: string | null;
  severity: AuditSeverity;
  category: AuditCategory;
  agent: AgentId | null;
  text: string;
  overlay: boolean;
  source: EventSourceKind;
}

export interface ArtifactView {
  artifactId: string;
  type: ArtifactType;
  title: string;
  markdown: string;
  stream: boolean;
  t: number;
}

export type SeverityState = 'none' | AlertSeverity | SeverityValue;

export interface StageState {
  act: number;
  titleCard: { title: string; t: number } | null;
  agents: Record<AgentId, AgentState>;
  agentChangedAt: Record<AgentId, number>;
  stream: StreamEntry[];
  messages: MessageEntry[];
  metrics: MetricTracks;
  alert: { severity: AlertSeverity; t: number } | null;
  severity: SeverityState;
  evidence: { cards: EvidenceCard[]; conclusion: Conclusion | null };
  optionSets: OptionSet[];
  checklists: Checklist[];
  gate: GateView | null;
  gates: GateView[];
  progress: ProgressView | null;
  timelapse: { label: string; t: number } | null;
  permissionDenied: { agent: AgentId; tool: string; t: number } | null;
  audit: AuditRow[];
  artifacts: ArtifactView[];
  /** Incident channel (status updates, pager, people around the incident). */
  channel: ChannelPost[];
  overlay: { active: boolean; startedAt: number | null; saved: StageState | null };
  chaosRuns: number;
  scorecard: { t: number } | null;
  endCard: { t: number } | null;
  clock: string | null;
  lastEventT: number;
  /** A labelled fast-forward of the run clock, while one is running (D-074). */
  clockRate: { rate: number; label: string | null } | null;
  /** Live-mode fallbacks seen, for the subtle "scripted" marker. */
  fallbackCount: number;
}

export interface InitialStateOptions {
  initialMetrics: Record<MetricSeries, number>;
  clock?: string;
}

function record<V>(value: V): Record<AgentId, V> {
  return Object.fromEntries(AGENT_IDS.map((id) => [id, value])) as Record<AgentId, V>;
}

export function initialStageState(opts: InitialStateOptions): StageState {
  return {
    act: 0,
    titleCard: null,
    agents: record<AgentState>('idle'),
    agentChangedAt: record(0),
    stream: [],
    messages: [],
    metrics: {
      p99: { initial: opts.initialMetrics.p99, tweens: [] },
      errorRate: { initial: opts.initialMetrics.errorRate, tweens: [] },
      poolActive: { initial: opts.initialMetrics.poolActive, tweens: [] },
    },
    alert: null,
    severity: 'none',
    evidence: { cards: [], conclusion: null },
    optionSets: [],
    checklists: [],
    gate: null,
    gates: [],
    progress: null,
    timelapse: null,
    permissionDenied: null,
    audit: [],
    artifacts: [],
    channel: [],
    overlay: { active: false, startedAt: null, saved: null },
    chaosRuns: 0,
    scorecard: null,
    endCard: null,
    clock: opts.clock ?? null,
    lastEventT: 0,
    clockRate: null,
    fallbackCount: 0,
  };
}

function base(e: EngineEvent, clock: string | null): EntryBase {
  return { id: e.id, t: e.t, clock, source: e.source };
}

function auditRow(
  s: StageState,
  e: EngineEvent,
  clock: string | null,
  row: Pick<AuditRow, 'severity' | 'category' | 'agent' | 'text'>,
): AuditRow {
  return { ...base(e, clock), ...row, overlay: s.overlay.active };
}

const GUARDRAIL_LABEL: Record<GuardrailResult, string> = { pass: 'Pass', fail: 'Fail', required: 'Required' };
const GUARDRAIL_SEVERITY: Record<GuardrailResult, AuditSeverity> = { pass: 'info', fail: 'high', required: 'warn' };

/** Pure and total. Returns the same object for unknown kinds. */
export function reduce(state: StageState, event: EngineEvent): StageState {
  if (!isKnownEventKind(event.kind)) return state;
  const clock = event.clock ?? state.clock;
  const s: StageState = {
    ...state,
    clock,
    lastEventT: event.t,
    fallbackCount: event.source === 'fallback' ? state.fallbackCount + 1 : state.fallbackCount,
  };
  return apply(s, event, clock);
}

function apply(s: StageState, e: EngineEvent, clock: string | null): StageState {
  switch (e.kind) {
    case 'scene.start':
      return { ...s, act: e.act, titleCard: e.card ? { title: e.title, t: e.t } : s.titleCard };
    case 'scene.end':
      return { ...s, endCard: { t: e.t } };
    case 'clock.set':
      return { ...s, clock: e.clock };
    case 'clock.rate':
      return { ...s, clockRate: e.rate === 1 ? null : { rate: e.rate, label: e.label ?? null } };
    case 'agent.state':
      return {
        ...s,
        agents: { ...s.agents, [e.agent]: e.state },
        agentChangedAt: { ...s.agentChangedAt, [e.agent]: e.t },
      };
    case 'thought':
      return {
        ...s,
        stream: [...s.stream, { ...base(e, clock), type: 'thought', agent: e.agent, text: e.text, typed: e.stream ?? true }],
      };
    case 'tool.call':
      return onToolCall(s, e, clock);
    case 'tool.result': {
      const status = e.status ?? 'ok';
      return {
        ...s,
        stream: [
          ...s.stream,
          {
            ...base(e, clock),
            type: 'tool.result',
            agent: e.agent,
            callId: e.callId,
            summary: e.summary,
            status,
            ...(e.payload ? { payload: e.payload } : {}),
          },
        ],
        audit:
          status === 'error'
            ? [...s.audit, auditRow(s, e, clock, { severity: 'warn', category: 'tool', agent: e.agent, text: `Tool call failed: ${e.summary}` })]
            : s.audit,
      };
    }
    case 'message.send':
      return {
        ...s,
        messages: [
          ...s.messages,
          { id: e.id, t: e.t, from: e.from, to: e.to, label: e.label, showLabel: e.showLabel ?? false },
        ],
        stream: [...s.stream, { ...base(e, clock), type: 'message', from: e.from, to: e.to, label: e.label }],
      };
    case 'metric.update': {
      const track = s.metrics[e.series];
      const from = metricValueAt(track, e.t);
      return {
        ...s,
        metrics: {
          ...s.metrics,
          [e.series]: { ...track, tweens: [...track.tweens, { from, to: e.to, startT: e.t, durationMs: e.durationMs }] },
        },
      };
    }
    case 'stage.alert':
      return { ...s, alert: { severity: e.severity, t: e.t }, severity: e.severity };
    case 'severity.set':
      return { ...s, severity: e.value };
    case 'evidence.pin':
      return {
        ...s,
        evidence: {
          ...s.evidence,
          cards: [
            ...s.evidence.cards.filter((c) => c.cardId !== e.cardId),
            { cardId: e.cardId, agent: e.agent, text: e.text, t: e.t, kind: e.evidenceKind ?? 'clue', ruledOut: null },
          ],
        },
      };
    case 'evidence.ruleOut':
      return {
        ...s,
        evidence: {
          ...s.evidence,
          cards: s.evidence.cards.map((c) => (c.cardId === e.cardId ? { ...c, ruledOut: { reason: e.reason, t: e.t } } : c)),
        },
      };
    case 'evidence.conclude':
      return {
        ...s,
        evidence: {
          ...s.evidence,
          conclusion: { cardIds: e.cardIds, text: e.text, confidence: e.confidence, t: e.t },
        },
      };
    case 'options.show':
      return {
        ...s,
        optionSets: [...s.optionSets, { id: e.id, agent: e.agent, recommended: e.recommended, options: e.options, t: e.t }],
      };
    case 'guardrail.check':
      return onGuardrail(s, e, clock);
    case 'gate.request': {
      const gate: GateView = {
        gateId: e.gateId,
        title: e.title,
        summary: e.summary,
        evidenceRefs: e.evidenceRefs,
        approveLabel: e.approveLabel,
        rejectLabel: e.rejectLabel,
        footer: e.footer ?? [],
        status: 'open',
        by: null,
        requestedT: e.t,
        resolvedT: null,
      };
      return {
        ...s,
        gate,
        gates: [...s.gates, gate],
        audit: [
          ...s.audit,
          auditRow(s, e, clock, { severity: 'warn', category: 'gate', agent: 'human', text: `Approval requested: ${e.title}` }),
        ],
      };
    }
    case 'gate.resolve': {
      const current = s.gate && s.gate.gateId === e.gateId ? s.gate : null;
      const resolved: GateView | null = current
        ? { ...current, status: e.decision, by: e.by, resolvedT: e.t }
        : null;
      const title = current?.title ?? e.gateId;
      const verb = e.decision === 'approved' ? 'Approved' : 'Rejected';
      return {
        ...s,
        gate: resolved ?? s.gate,
        gates: resolved ? s.gates.map((g) => (g.gateId === e.gateId && g.status === 'open' ? resolved : g)) : s.gates,
        audit: [
          ...s.audit,
          auditRow(s, e, clock, {
            severity: e.decision === 'approved' ? 'info' : 'warn',
            category: 'gate',
            agent: 'human',
            text: `${verb} by ${e.by}: ${title}`,
          }),
        ],
      };
    }
    case 'progress.update':
      return { ...s, progress: { agent: e.agent, label: e.label, current: e.current, total: e.total, t: e.t } };
    case 'timelapse':
      return { ...s, timelapse: { label: e.label, t: e.t } };
    case 'permission.denied':
      return {
        ...s,
        permissionDenied: { agent: e.agent, tool: e.tool, t: e.t },
        audit: [
          ...s.audit,
          auditRow(s, e, clock, {
            severity: 'high',
            category: 'permission',
            agent: e.agent,
            text: `${e.tool} is not granted to ${e.agent}`,
          }),
        ],
      };
    case 'audit':
      return {
        ...s,
        audit: [...s.audit, auditRow(s, e, clock, { severity: e.severity, category: 'note', agent: e.agent ?? null, text: e.text })],
      };
    case 'artifact.create': {
      const artifact: ArtifactView = {
        artifactId: e.artifactId,
        type: e.type,
        title: e.title,
        markdown: e.markdown,
        stream: e.stream,
        t: e.t,
      };
      return { ...s, artifacts: [...s.artifacts.filter((a) => a.artifactId !== e.artifactId), artifact] };
    }
    case 'channel.post':
      return {
        ...s,
        channel: [...s.channel, { id: e.id, t: e.t, clock, author: e.author, agent: e.agent ?? null, text: e.text }],
      };
    case 'chaos.start': {
      if (s.overlay.active) return s;
      const saved: StageState = { ...s, overlay: { active: false, startedAt: null, saved: null } };
      return { ...s, overlay: { active: true, startedAt: e.t, saved } };
    }
    case 'chaos.end': {
      const saved = s.overlay.saved;
      if (!s.overlay.active || !saved) return s;
      // Overlay visual state is discarded; audit rows persist (ARCHITECTURE §6).
      return {
        ...saved,
        audit: s.audit,
        clock: s.clock,
        lastEventT: s.lastEventT,
        fallbackCount: s.fallbackCount,
        chaosRuns: saved.chaosRuns + 1,
      };
    }
    case 'scorecard.show':
      return { ...s, scorecard: { t: e.t } };
  }
}

function onToolCall(s: StageState, e: EventOf<'tool.call'>, clock: string | null): StageState {
  const next: StageState = {
    ...s,
    stream: [
      ...s.stream,
      { ...base(e, clock), type: 'tool.call', agent: e.agent, callId: e.callId, tool: e.tool, args: e.args },
    ],
    audit: [
      ...s.audit,
      auditRow(s, e, clock, { severity: 'info', category: 'tool', agent: e.agent, text: `${e.tool} ${formatArgs(e.args)}` }),
    ],
  };
  if (e.tool === 'policy.check') {
    next.checklists = [...s.checklists, { id: e.callId, agent: e.agent, args: e.args, rows: [], t: e.t }];
  }
  return next;
}

function sentence(text: string): string {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

function onGuardrail(s: StageState, e: EventOf<'guardrail.check'>, clock: string | null): StageState {
  const row: ChecklistRow = { policyId: e.policyId, description: e.description, result: e.result, reason: e.reason, t: e.t };
  const last = s.checklists[s.checklists.length - 1];
  const checklists = last
    ? [...s.checklists.slice(0, -1), { ...last, rows: [...last.rows, row] }]
    : [{ id: `${e.id}.list`, agent: 'guardian' as const, args: {}, rows: [row], t: e.t }];
  const reason = e.reason ? ` ${e.reason}` : '';
  return {
    ...s,
    checklists,
    audit: [
      ...s.audit,
      auditRow(s, e, clock, {
        severity: GUARDRAIL_SEVERITY[e.result],
        category: 'policy',
        agent: 'guardian',
        text: `${e.policyId} ${GUARDRAIL_LABEL[e.result]}: ${sentence(e.description)}${reason}`,
      }),
    ],
  };
}
