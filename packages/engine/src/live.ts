// Live-mode transport (DECISIONS D-009): frames carried by the segment stream.
// Events inside frames are the same EngineEvent bodies, tagged with their source.
import type { BeatOverride, Decision } from './compile';

export interface SegmentRequest {
  scenarioId: string;
  segment: string;
  decisions: Decision[];
  /** Compact evidence summary accumulated client-side; ≤ 8 KB. */
  context: string;
}

export type LiveFrame =
  | { frame: 'beat'; beatId: string; outcome: 'live' | 'fallback'; reason?: string; events: BeatOverride['events'] }
  | { frame: 'segment.end'; segment: string; beats: number; fallbacks: number }
  | { frame: 'error'; message: string };
