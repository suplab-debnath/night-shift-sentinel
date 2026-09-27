// Local transport: Fastify with SSE over POST (ARCHITECTURE §7.1).
import Fastify, { type FastifyInstance } from 'fastify';
import type { ServerConfig } from '../config';
import type { LlmProvider } from '../core/providers/types';
import { createProvider, health, startSegment } from './core';
import { MAX_BODY_BYTES, SSE_HEADERS, sseFrame } from './protocol';

export function buildServer(config: ServerConfig, opts: { provider?: LlmProvider | null; logger?: boolean } = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: MAX_BODY_BYTES });
  const provider = opts.provider !== undefined ? opts.provider : createProvider(config);
  const log = (entry: Record<string, unknown>) => app.log.info(entry);

  app.get('/api/health', async () => health(config));

  app.post('/api/segments', async (req, reply) => {
    const abort = new AbortController();
    // The response closing before we end it means the client went away. (The request's own
    // 'close' fires once its body is read, so it cannot be used for this.)
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded) abort.abort();
    });
    const start = startSegment(req.body, req.headers, config, provider, log, abort.signal);
    if (!start.ok) return reply.code(start.status).send({ error: start.message });
    reply.hijack();
    reply.raw.writeHead(200, SSE_HEADERS);
    const ping = setInterval(() => reply.raw.write(': ping\n\n'), 5000);
    try {
      for await (const frame of start.frames) reply.raw.write(sseFrame(frame));
    } finally {
      clearInterval(ping);
      reply.raw.end();
    }
  });

  // Anything else is not ours; never echo internals.
  app.setErrorHandler((err: { message?: string; statusCode?: number }, _req, reply) => {
    app.log.error({ msg: 'request failed', error: err.message });
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    void reply.code(status).send({ error: 'Request failed' });
  });
  return app;
}
