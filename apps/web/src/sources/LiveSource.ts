// Live mode (ARCHITECTURE §1, §7): the scripted timeline keeps its timing, gates, and seek;
// live beats are held just before they play until the server's version arrives. A beat
// that stalls longer than LIVE_STALL_MS, or a stream that fails, plays the scripted beat
// and the settings menu source line reads "Live, scripted fallback" (no badge on stage, D-070). The presenter never sees an error.
import type { Beat, BeatOverride, GateDecision, LiveFrame, Scenario, SegmentRequest } from '@night-shift/engine';
import { ScriptedSource, type ScriptedSourceOptions } from './ScriptedSource';
import type { StageSnapshot } from './types';

export interface LiveOptions {
  apiBase: string;
  scenarioId: string;
  passcode?: string;
  /** Mock server only: ask for failures, e.g. "a1.b04:timeout" (rehearsing fallback). */
  mockFail?: string;
  fetchImpl?: typeof fetch;
  /** Wall clock for stall detection; injectable for tests. */
  now?: () => number;
}

const TEXT_KINDS = new Set(['thought', 'evidence.conclude', 'artifact.create']);

export function liveBeatsOf(scenario: Scenario, segment: string): Beat[] {
  return scenario.segments[segment]?.acts.flatMap((a) => a.beats.filter((b) => b.live)) ?? [];
}

/** The scripted beat, with its text marked as a fallback (subtle "scripted" marker). */
export function scriptedFallback(beat: Beat): BeatOverride {
  return {
    events: beat.events.map((e) => ({ ...e, source: TEXT_KINDS.has(e.kind) ? 'fallback' : 'script' }) as BeatOverride['events'][number]),
  };
}

/** Parse server-sent events from a fetch body. */
export async function* readFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<LiveFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n');
      if (data) yield JSON.parse(data) as LiveFrame;
    }
  }
}

async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class LiveSource extends ScriptedSource {
  private enabled = true;
  private degraded = false;
  private stallMs = 4000;
  private provider: 'bedrock' | 'mock' | null = null;
  private readonly aborts = new Set<AbortController>();
  private readonly pendingBeats = new Map<string, Beat>();
  private holdStart: { beat: string; at: number } | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    scenario: Scenario,
    opts: ScriptedSourceOptions,
    private readonly live: LiveOptions,
  ) {
    super(scenario, opts);
    this.fetchImpl = live.fetchImpl ?? ((...a) => fetch(...a));
    this.now = live.now ?? (() => performance.now());
  }

  /** Check the server, then fetch the main segment. Resolves when the first request is under way. */
  async connect(): Promise<void> {
    try {
      const res = await this.fetchImpl(`${this.live.apiBase}/health`);
      if (!res.ok) throw new Error('health');
      const health = (await res.json()) as { live?: boolean; stallMs?: number; provider?: 'bedrock' | 'mock' | null };
      if (!health.live) throw new Error('scripted server');
      this.stallMs = health.stallMs ?? this.stallMs;
      this.provider = health.provider ?? null;
      this.refresh();
    } catch {
      this.degrade();
      return;
    }
    this.requestPath();
  }

  protected override wrap(): StageSnapshot {
    const mode = !this.enabled ? 'scripted' : this.degraded ? 'fallback' : 'live';
    return { ...super.wrap(), mode, provider: this.provider };
  }

  /** Request the segments on the current decision path that still have live beats ahead. */
  private requestPath() {
    const snap = this.player.getSnapshot();
    const keys = ['main'];
    for (const d of snap.decisions) {
      if (d.type !== 'gate') continue;
      const gate = this.scenario.gates[d.gateId];
      if (gate) keys.push(d.decision === 'approved' ? gate.onApprove : gate.onReject);
    }
    for (const key of keys) this.requestSegment(key);
  }

  private requestSegment(segment: string) {
    if (!this.enabled || this.degraded) return;
    const t = this.player.getSnapshot().t;
    const marks = new Map(this.player.getSnapshot().timeline.beats.map((b) => [b.id, b.t]));
    const ahead = liveBeatsOf(this.scenario, segment).filter((b) => (marks.get(b.id) ?? Infinity) > t);
    if (ahead.length === 0) return;
    for (const b of ahead) this.pendingBeats.set(b.id, b);
    this.player.hold(ahead.map((b) => b.id));
    void this.stream(segment, ahead);
  }

  private context(): string {
    const s = this.player.getSnapshot();
    const lines = [
      ...s.state.evidence.cards.map((c) => `Evidence (${c.agent}): ${c.text}`),
      ...(s.state.evidence.conclusion ? [`Root cause: ${s.state.evidence.conclusion.text} (confidence ${s.state.evidence.conclusion.confidence})`] : []),
      ...s.decisions.flatMap((d) => (d.type === 'gate' ? [`Gate ${d.gateId}: ${d.decision}`] : [])),
    ];
    return lines.join('\n').slice(0, 8000);
  }

  private async stream(segment: string, beats: Beat[]) {
    const abort = new AbortController();
    this.aborts.add(abort);
    const request: SegmentRequest = { scenarioId: this.live.scenarioId, segment, decisions: [...this.player.getSnapshot().decisions], context: this.context() };
    const body = JSON.stringify(request);
    try {
      const hash = await sha256Hex(body);
      const res = await this.fetchImpl(`${this.live.apiBase}/segments`, {
        method: 'POST',
        body,
        signal: abort.signal,
        headers: {
          'content-type': 'application/json',
          // CloudFront OAC signs POSTs to the Lambda URL only with the body hash (ARCHITECTURE §8).
          ...(hash ? { 'x-amz-content-sha256': hash } : {}),
          ...(this.live.passcode ? { 'x-demo-passcode': this.live.passcode } : {}),
          ...(this.live.mockFail ? { 'x-mock-fail': this.live.mockFail } : {}),
        },
      });
      if (!res.ok || !res.body) throw new Error('segment request failed');
      for await (const frame of readFrames(res.body)) {
        if (abort.signal.aborted) return;
        if (frame.frame === 'beat') this.applyBeat(frame.beatId, { events: frame.events });
        else if (frame.frame === 'error') throw new Error('segment error');
        else if (frame.frame === 'segment.end') break;
      }
      // Anything the server did not send plays scripted.
      for (const b of beats) if (this.pendingBeats.has(b.id)) this.fallbackBeat(b.id);
    } catch {
      if (!abort.signal.aborted) this.degrade();
    } finally {
      this.aborts.delete(abort);
    }
  }

  private applyBeat(beatId: string, override: BeatOverride) {
    if (!this.pendingBeats.has(beatId)) return;
    this.pendingBeats.delete(beatId);
    // Too late (the beat already played scripted) → setOverride refuses; nothing else to do.
    this.player.setOverride(beatId, override);
    this.player.release(beatId);
  }

  private fallbackBeat(beatId: string) {
    const beat = this.pendingBeats.get(beatId);
    if (!beat) return;
    this.applyBeat(beatId, scriptedFallback(beat));
  }

  /** Stream failed or stalled: every pending beat plays scripted; the settings menu shows the fallback. */
  private degrade() {
    this.degraded = true;
    for (const id of [...this.pendingBeats.keys()]) this.fallbackBeat(id);
    this.player.releaseAll();
    this.refresh();
  }

  protected override onFrame(now: number) {
    const s = this.player.getSnapshot();
    if (!s.holding || !s.playing) {
      this.holdStart = null;
      return;
    }
    if (this.holdStart?.beat !== s.holding) this.holdStart = { beat: s.holding, at: this.now() || now };
    else if (this.now() - this.holdStart.at > this.stallMs) {
      this.holdStart = null;
      this.degrade();
    }
  }

  override decide = (gateId: string, decision: GateDecision) => {
    const ok = this.decideWithWait(gateId, decision);
    if (ok) {
      const gate = this.scenario.gates[gateId];
      if (gate) this.requestSegment(decision === 'approved' ? gate.onApprove : gate.onReject);
    }
    return ok;
  };

  private abortAll() {
    for (const a of this.aborts) a.abort();
    this.aborts.clear();
    this.pendingBeats.clear();
    this.player.releaseAll();
  }

  override reset = () => {
    this.abortAll();
    this.player.clearOverrides();
    this.player.reset();
    this.degraded = false;
    this.requestPath();
    this.refresh();
  };

  switchMode = () => {
    this.enabled = !this.enabled;
    this.abortAll();
    if (!this.enabled) {
      this.player.clearOverrides();
    } else {
      this.degraded = false;
      this.requestPath();
    }
    this.refresh();
    return true;
  };
}

