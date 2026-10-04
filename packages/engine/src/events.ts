// The one event protocol (ARCHITECTURE §4). Scripted playback and live mode
// both emit these events; the UI only ever consumes them.

export const AGENT_IDS = [
  'sentinel',
  'orchestrator',
  'log-detective',
  'code-archaeologist',
  'fixer',
  'guardian',
  'scribe',
  'human',
] as const;

export type AgentId = (typeof AGENT_IDS)[number];

export const AGENT_STATES = ['idle', 'thinking', 'working', 'watching', 'done', 'blocked', 'waiting'] as const;

export type AgentState = (typeof AGENT_STATES)[number];

export type EventSourceKind = 'script' | 'live' | 'fallback';

export type MetricSeries = 'p99' | 'errorRate' | 'poolActive';

export type AlertSeverity = 'SEV-1' | 'SEV-2' | 'SEV-3';

export type SeverityValue = 'SEV-2' | 'Mitigated' | 'Handed to humans';

export type Risk = 'Low' | 'Medium' | 'High';

export type GuardrailResult = 'pass' | 'fail' | 'required';

export type GateDecision = 'approved' | 'rejected';

export type AuditSeverity = 'info' | 'warn' | 'high';

export type ArtifactType = 'plan' | 'status' | 'postmortem' | 'escalation' | 'pull-request';

/** What-if tests spliced into the run (D-079): an over-eager fix, a poisoned log line. */
export const OVERLAY_NAMES = ['chaos', 'inject'] as const;

export type OverlayName = (typeof OVERLAY_NAMES)[number];

export type PayloadType = 'log' | 'diff' | 'table' | 'json';

export type ToolStatus = 'ok' | 'error';

export type EvidenceKind = 'clue' | 'hypothesis';

export interface OptionCard {
  id: string;
  action: string;
  time: string;
  risk: Risk;
  reversible: boolean;
  note: string;
}

interface Base {
  /** Stable id, e.g. "a3.b07.e2". */
  id: string;
  /** ms from scenario start on this path (scripted); arrival order in live. */
  t: number;
  /** Story clock "02:08:31". */
  clock?: string;
  source: EventSourceKind;
  /** Beat that produced the event (extension; see DECISIONS D-015). */
  beat?: string;
}

export type EventBody =
  | { kind: 'scene.start'; act: number; title: string; card?: boolean }
  | { kind: 'scene.end'; act: number }
  | { kind: 'clock.set'; clock: string; running: boolean }
  /** Fast-forward the run clock (rate > 1) until the next rate event; label names it on screen. */
  | { kind: 'clock.rate'; rate: number; label?: string }
  | { kind: 'agent.state'; agent: AgentId; state: AgentState }
  | { kind: 'thought'; agent: AgentId; text: string; stream?: boolean }
  | { kind: 'tool.call'; agent: AgentId; callId: string; tool: string; args: Record<string, unknown> }
  | {
      kind: 'tool.result';
      agent: AgentId;
      callId: string;
      summary: string;
      payload?: { type: PayloadType; content: string };
      /** A failed call (timeout, error); defaults to ok. */
      status?: ToolStatus;
    }
  | { kind: 'message.send'; from: AgentId; to: AgentId; label: string; showLabel?: boolean }
  | { kind: 'metric.update'; series: MetricSeries; to: number; durationMs: number }
  | { kind: 'stage.alert'; severity: AlertSeverity }
  | { kind: 'severity.set'; value: SeverityValue }
  | { kind: 'evidence.pin'; cardId: string; agent: AgentId; text: string; evidenceKind?: EvidenceKind }
  | { kind: 'evidence.ruleOut'; cardId: string; reason: string }
  | { kind: 'evidence.conclude'; cardIds: string[]; text: string; confidence: number }
  | { kind: 'options.show'; agent: AgentId; recommended: string; options: OptionCard[] }
  | { kind: 'guardrail.check'; policyId: string; description: string; result: GuardrailResult; reason: string }
  | {
      kind: 'gate.request';
      gateId: string;
      title: string;
      summary: string;
      evidenceRefs: string[];
      approveLabel: string;
      rejectLabel: string;
      /** Short provenance lines under the buttons (extension; DECISIONS D-021). */
      footer?: string[];
    }
  | { kind: 'gate.resolve'; gateId: string; decision: GateDecision; by: string }
  | { kind: 'progress.update'; agent: AgentId; label: string; current: number; total: number }
  | { kind: 'timelapse'; label: string; advanceClockSec: number }
  | { kind: 'permission.denied'; agent: AgentId; tool: string }
  | { kind: 'audit'; severity: AuditSeverity; text: string; agent?: AgentId }
  | {
      kind: 'artifact.create';
      artifactId: string;
      type: ArtifactType;
      title: string;
      markdown: string;
      stream: boolean;
    }
  | { kind: 'channel.post'; author: string; agent?: AgentId; text: string }
  | { kind: 'chaos.start'; overlay?: OverlayName }
  | { kind: 'chaos.end' }
  | { kind: 'scorecard.show' };

export type EngineEvent = Base & EventBody;

export type EventKind = EventBody['kind'];

export type EventOf<K extends EventKind> = Extract<EngineEvent, { kind: K }>;

/** An event as authored in a scenario: no id, time, or source yet. */
export type EventTemplate = EventBody & { clock?: string };

export const EVENT_KINDS: readonly EventKind[] = [
  'scene.start',
  'scene.end',
  'clock.set',
  'clock.rate',
  'agent.state',
  'thought',
  'tool.call',
  'tool.result',
  'message.send',
  'metric.update',
  'stage.alert',
  'severity.set',
  'evidence.pin',
  'evidence.ruleOut',
  'evidence.conclude',
  'options.show',
  'guardrail.check',
  'gate.request',
  'gate.resolve',
  'progress.update',
  'timelapse',
  'permission.denied',
  'audit',
  'artifact.create',
  'channel.post',
  'chaos.start',
  'chaos.end',
  'scorecard.show',
];

const KNOWN = new Set<string>(EVENT_KINDS);

export function isKnownEventKind(kind: string): kind is EventKind {
  return KNOWN.has(kind);
}

export function isAgentId(value: string): value is AgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}
