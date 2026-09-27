// One live agent turn (ARCHITECTURE §7.3): prompt → stream → tool loop (≤ 3) →
// validate → emit, or fall back to the scripted beat. Never throws.
import type { AgentId, Beat, BeatOverride, EventTemplate } from '@night-shift/engine';
import type { ScenarioBundle } from '@night-shift/scenarios';
import type { ServerConfig } from '../config';
import type { PolicyOutcome } from './policy';
import { incidentFacts, POSTMORTEM_TIMELINE, systemPrompt } from './prompt';
import { ProviderError, type LlmProvider, type Msg } from './providers/types';
import { runTool, toolSpecs } from './tools';
import { allowedNumbersFrom, validate, type TargetKind } from './validators';

export const MAX_TOOL_ROUNDS = 3;

export interface TurnLog {
  beat: string;
  agent: AgentId;
  modelId: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  outcome: 'live' | 'fallback';
  fallbackReason?: string;
}

export interface TurnResult {
  override: BeatOverride;
  log: TurnLog;
}

type OverrideEvent = BeatOverride['events'][number];

interface Target {
  index: number;
  kind: TargetKind;
  text: string;
}

export function findTarget(beat: Beat, agent: AgentId): Target | null {
  const idx = beat.events.findIndex((e) => e.kind === 'thought' && e.agent === agent);
  if (idx >= 0) return { index: idx, kind: 'thought', text: (beat.events[idx] as Extract<EventTemplate, { kind: 'thought' }>).text };
  const c = beat.events.findIndex((e) => e.kind === 'evidence.conclude');
  if (c >= 0) return { index: c, kind: 'conclusion', text: (beat.events[c] as Extract<EventTemplate, { kind: 'evidence.conclude' }>).text };
  const a = beat.events.findIndex((e) => e.kind === 'artifact.create');
  if (a >= 0) return { index: a, kind: 'artifact', text: (beat.events[a] as Extract<EventTemplate, { kind: 'artifact.create' }>).markdown };
  return null;
}

function withText(e: EventTemplate, text: string): EventTemplate {
  if (e.kind === 'thought') return { ...e, text };
  if (e.kind === 'evidence.conclude') return { ...e, text };
  if (e.kind === 'artifact.create') return { ...e, markdown: text };
  return e;
}

/** The scripted beat, with the target line marked as a fallback. */
export function fallbackOverride(beat: Beat, targetIndex: number | null): BeatOverride {
  return {
    events: beat.events.map((e, i) => ({ ...e, source: i === targetIndex ? 'fallback' : 'script' }) as OverrideEvent),
  };
}

export interface TurnInput {
  bundle: ScenarioBundle;
  beat: Beat;
  context: string;
  approvals: string[];
  provider: LlmProvider;
  config: ServerConfig;
  policy?: PolicyOutcome;
  /** The scripted tool call behind this beat's result (used by the mock provider only). */
  toolHint?: { name: string; input: Record<string, unknown> };
}

export async function runAgentTurn(input: TurnInput): Promise<TurnResult> {
  const { bundle, beat, provider, config } = input;
  const live = beat.live!;
  const agent = bundle.agentById(live.agent)!;
  const target = findTarget(beat, live.agent);
  const specialist = !['orchestrator', 'guardian', 'scribe'].includes(live.agent);
  const modelId = provider.name === 'mock' ? 'mock' : ((specialist ? config.fastModelId : undefined) ?? config.modelId ?? '');
  const started = Date.now();
  const log: TurnLog = {
    beat: beat.id,
    agent: live.agent,
    modelId: provider.name === 'mock' ? 'mock' : `${modelId.slice(0, 4)}…`,
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    outcome: 'fallback',
  };
  const fail = (reason: string): TurnResult => ({
    override: fallbackOverride(beat, target?.index ?? null),
    log: { ...log, latencyMs: Date.now() - started, outcome: 'fallback', fallbackReason: reason },
  });

  if (!target) return fail('beat has no text target');
  if (!modelId) return fail('no model configured');

  const inBeat = beat.events.find((e) => e.kind === 'tool.call') as Extract<EventTemplate, { kind: 'tool.call' }> | undefined;
  const scriptedTool = inBeat ? { name: inBeat.tool, input: inBeat.args } : input.toolHint;
  const timeline = target.kind === 'artifact' ? POSTMORTEM_TIMELINE : undefined;
  const system = systemPrompt({ bundle, agent, kind: target.kind, maxSentences: live.maxSentences, policy: input.policy, timeline });
  const messages: Msg[] = [
    {
      role: 'user',
      content: [{ text: `Task: ${live.goal}\n\nContext from the incident so far:\n${input.context || '(none)'}` }],
    },
  ];
  const tools = toolSpecs(live.allowedTools);
  const liveEvents: OverrideEvent[] = [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.turnTimeoutMs);
  let text = '';

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      text = '';
      const uses: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let stop = 'end_turn';
      const stream = provider.converseStream({
        modelId,
        system,
        messages,
        tools: round < MAX_TOOL_ROUNDS ? tools : [],
        maxTokens: config.maxTokensPerTurn,
        temperature: 0.3,
        signal: controller.signal,
        mock: {
          beatId: beat.id,
          text: target.text,
          ...(scriptedTool ? { toolCall: scriptedTool } : {}),
        },
      });
      for await (const d of stream) {
        if (d.type === 'text') text += d.text;
        else if (d.type === 'toolUse') uses.push(d);
        else if (d.type === 'stop') stop = d.reason;
        else if (d.type === 'usage') {
          log.inputTokens += d.inputTokens;
          log.outputTokens += d.outputTokens;
        }
      }
      if (stop === 'guardrail_intervened' || stop === 'content_filtered') return fail(`stopped: ${stop}`);
      if (stop !== 'tool_use' || uses.length === 0) break;
      if (round === MAX_TOOL_ROUNDS) return fail('tool loop limit');

      messages.push({ role: 'assistant', content: [...(text ? [{ text }] : []), ...uses.map((u) => ({ toolUse: u }))] });
      const results: Msg['content'] = [];
      for (const u of uses) {
        const r = runTool(u.name, u.input, { bundle, agent: live.agent, allowedTools: live.allowedTools, approvals: input.approvals });
        log.toolCalls++;
        const callId = `live-${beat.id}-${log.toolCalls}`;
        liveEvents.push({ kind: 'tool.call', agent: live.agent, callId, tool: u.name, args: r.args, source: 'live' });
        if (r.denied) liveEvents.push({ kind: 'permission.denied', agent: live.agent, tool: u.name, source: 'live' });
        liveEvents.push({
          kind: 'tool.result',
          agent: live.agent,
          callId,
          summary: r.summary,
          ...(r.payload ? { payload: r.payload } : {}),
          source: 'live',
        });
        results.push({ toolResult: { id: u.id, content: JSON.stringify({ summary: r.summary, data: r.data }), isError: !r.ok } });
      }
      messages.push({ role: 'user', content: results });
    }
  } catch (e) {
    if (controller.signal.aborted) return fail('timeout');
    return fail(e instanceof ProviderError ? `provider: ${e.code}` : 'provider error');
  } finally {
    clearTimeout(timer);
  }

  const cleaned = text.trim().replace(/^["“]|["”]$/g, '');
  // Numbers may come from the fixtures, the facts given to the model, the timeline, the context, or the script.
  const allowed = allowedNumbersFrom(JSON.stringify(bundle.fixtures), incidentFacts(bundle), POSTMORTEM_TIMELINE, input.context, target.text);
  const verdict = validate({
    validator: live.validator,
    text: cleaned,
    kind: target.kind,
    maxSentences: live.maxSentences,
    allowedNumbers: allowed,
    reference: target.text,
    ...(input.policy ? { policy: input.policy } : {}),
  });
  if (!verdict.ok) return fail(`validator: ${verdict.reason}`);

  // Assemble: scripted system events stay; live tool calls replace scripted ones; the text is live.
  const events: OverrideEvent[] = [];
  beat.events.forEach((e, i) => {
    const isScriptedTool = e.kind === 'tool.call' || e.kind === 'tool.result';
    if (isScriptedTool && liveEvents.length > 0) return;
    if (i === target.index) {
      events.push(...liveEvents);
      events.push({ ...withText(e, cleaned), source: 'live' } as OverrideEvent);
      return;
    }
    events.push({ ...e, source: 'script' } as OverrideEvent);
  });
  return { override: { events }, log: { ...log, latencyMs: Date.now() - started, outcome: 'live' } };
}
