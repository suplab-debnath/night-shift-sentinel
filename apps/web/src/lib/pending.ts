// What the squad is doing between stream items (DECISIONS D-072): an agent about to speak
// is thinking; a tool call waits on its result. Derived from the timeline, so it seeks.
import type { AgentId, EngineEvent, StreamEntry, Timeline } from '@night-shift/engine';
import { typingDurationMs } from './typing';

const STREAM_KINDS = new Set(['thought', 'tool.call', 'tool.result', 'message.send']);
/** How long before a line an agent is shown thinking, at most. */
export const THINK_WINDOW_MS = 2400;

/** The agent about to speak, when nothing else is typing: shown as "thinking". */
export function pendingThought(
  timeline: Timeline,
  stream: readonly StreamEntry[],
  t: number,
  speed: number,
): { agent: AgentId; at: number } | null {
  const last = stream.at(-1);
  if (last?.type === 'thought' && last.typed && t < last.t + typingDurationMs(last.text.length, speed)) return null;
  const next = firstStreamEventAfter(timeline.events, t);
  if (!next || next.kind !== 'thought' || next.t - t > THINK_WINDOW_MS) return null;
  return { agent: next.agent, at: next.t };
}

function firstStreamEventAfter(events: readonly EngineEvent[], t: number): EngineEvent | undefined {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.t <= t) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < events.length; i++) if (STREAM_KINDS.has(events[i]!.kind)) return events[i];
  return undefined;
}

const resultIndex = new WeakMap<Timeline, Map<string, number[]>>();

/** Playback ms a tool call has been running, or null once its result has landed (or it has none). */
export function toolRunningMs(timeline: Timeline, callId: string, callT: number, t: number): number | null {
  let index = resultIndex.get(timeline);
  if (!index) {
    index = new Map();
    for (const e of timeline.events) {
      if (e.kind !== 'tool.result') continue;
      const list = index.get(e.callId) ?? [];
      list.push(e.t);
      index.set(e.callId, list);
    }
    resultIndex.set(timeline, index);
  }
  const done = index.get(callId)?.find((rt) => rt >= callT);
  if (done === undefined || t >= done) return null;
  return t - callT;
}
