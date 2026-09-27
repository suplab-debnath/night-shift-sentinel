// Director (ARCHITECTURE §7.2): walks a segment's beats. Scripted beats are already on the
// client; live beats run agent turns (in parallel, bounded) and stream as frames.
import type { Beat, Decision, EventTemplate, LiveFrame } from '@night-shift/engine';
import type { ScenarioBundle } from '@night-shift/scenarios';
import type { ServerConfig } from '../config';
import { runAgentTurn, type TurnLog } from './agentTurn';
import { checkPolicies, type PolicyOutcome } from './policy';
import type { LlmProvider } from './providers/types';

export class SegmentError extends Error {}

export function liveBeats(bundle: ScenarioBundle, segment: string): Beat[] {
  const seg = bundle.scenario.segments[segment];
  if (!seg) throw new SegmentError(`Unknown segment ${segment}`);
  return seg.acts.flatMap((a) => a.beats.filter((b) => b.live));
}

/** The policy outcome Guardian must explain: the last policy.check scripted before this beat. */
export function policyFor(bundle: ScenarioBundle, segment: string, beatId: string): PolicyOutcome | undefined {
  const seg = bundle.scenario.segments[segment]!;
  let last: Extract<EventTemplate, { kind: 'tool.call' }> | undefined;
  for (const act of seg.acts) {
    for (const b of act.beats) {
      if (b.id === beatId) {
        if (!last) return undefined;
        const a = last.args as Record<string, string>;
        return checkPolicies({ action: a.action ?? '', target: a.target ?? '', env: a.env ?? 'prod', to: a.to, expires: a.expires }, bundle.fixtures);
      }
      for (const e of b.events) if (e.kind === 'tool.call' && e.tool === 'policy.check') last = e;
    }
  }
  return undefined;
}

/** The scripted tool call whose result appears in this beat (matched by callId). */
export function toolHintFor(bundle: ScenarioBundle, beat: Beat): { name: string; input: Record<string, unknown> } | undefined {
  const result = beat.events.find((e) => e.kind === 'tool.result');
  if (!result || result.kind !== 'tool.result') return undefined;
  for (const seg of Object.values(bundle.scenario.segments)) {
    for (const act of seg.acts) {
      for (const b of act.beats) {
        for (const e of b.events) {
          if (e.kind === 'tool.call' && e.callId === result.callId && beat.live?.allowedTools.includes(e.tool)) return { name: e.tool, input: e.args };
        }
      }
    }
  }
  return undefined;
}

export interface SegmentRun {
  bundle: ScenarioBundle;
  segment: string;
  decisions: Decision[];
  context: string;
  provider: LlmProvider;
  config: ServerConfig;
  log?: (entry: TurnLog & { segment: string }) => void;
  signal?: AbortSignal;
}

export async function* runSegment(run: SegmentRun): AsyncGenerator<LiveFrame> {
  const beats = liveBeats(run.bundle, run.segment);
  const approvals = run.decisions.flatMap((d) => (d.type === 'gate' && d.decision === 'approved' ? [d.gateId] : []));
  const queue = [...beats];
  const done: LiveFrame[] = [];
  let wake: (() => void) | null = null;
  let active = 0;
  let fallbacks = 0;

  const startNext = () => {
    while (active < run.config.concurrency && queue.length > 0 && !run.signal?.aborted) {
      const beat = queue.shift()!;
      active++;
      const policy = beat.live!.validator === 'guardian-decision' ? policyFor(run.bundle, run.segment, beat.id) : undefined;
      const toolHint = toolHintFor(run.bundle, beat);
      void runAgentTurn({
        bundle: run.bundle,
        beat,
        context: run.context,
        approvals,
        provider: run.provider,
        config: run.config,
        ...(policy ? { policy } : {}),
        ...(toolHint ? { toolHint } : {}),
      }).then(
        (r) => {
          active--;
          if (r.log.outcome === 'fallback') fallbacks++;
          run.log?.({ ...r.log, segment: run.segment });
          done.push({
            frame: 'beat',
            beatId: beat.id,
            outcome: r.log.outcome,
            ...(r.log.fallbackReason ? { reason: r.log.fallbackReason } : {}),
            events: r.override.events,
          });
          wake?.();
        },
      );
    }
  };

  startNext();
  let emitted = 0;
  while (emitted < beats.length) {
    if (run.signal?.aborted) return;
    if (done.length === 0) await new Promise<void>((r) => (wake = r));
    wake = null;
    while (done.length > 0) {
      yield done.shift()!;
      emitted++;
    }
    startNext();
  }
  yield { frame: 'segment.end', segment: run.segment, beats: beats.length, fallbacks };
}
