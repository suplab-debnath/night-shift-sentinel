/**
 * Presenter speeds (RUNBOOK §5). URL `speed` may go beyond these for tests and capture.
 * 0.3× is the realistic pace (DECISIONS D-072): it stretches the ~2.5 min canonical
 * timeline to a ~7-8 min run-through so agent thinking, tool calls, and decisions read
 * at a believable cadence, without touching the authored timeline itself.
 */
export const SPEEDS = [0.3, 1, 1.5, 2] as const;
