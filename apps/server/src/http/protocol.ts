// Request validation and SSE framing shared by the Fastify and Lambda transports.
import { z } from 'zod';
import type { LiveFrame } from '@night-shift/engine';

export const MAX_BODY_BYTES = 16 * 1024;
export const MAX_CONTEXT_BYTES = 8 * 1024;

const decision = z.union([
  z.object({ type: z.literal('gate'), gateId: z.string().max(16), decision: z.enum(['approved', 'rejected']), by: z.string().max(80) }),
  z.object({ type: z.literal('chaos'), at: z.number().nonnegative() }),
]);

export const SegmentRequestSchema = z.object({
  scenarioId: z.string().max(64),
  segment: z.string().max(64),
  decisions: z.array(decision).max(10),
  context: z.string().max(MAX_CONTEXT_BYTES),
});

export function sseFrame(frame: LiveFrame): string {
  return `data: ${JSON.stringify(frame)}\n\n`;
}

export const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
} as const;
