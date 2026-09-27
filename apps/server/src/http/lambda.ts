// AWS transport (P7): Lambda response streaming behind a Function URL (ARCHITECTURE §8).
import type { Writable } from 'node:stream';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { loadConfig, type ServerConfig } from '../config';
import { createProvider, health, startSegment } from './core';
import { MAX_BODY_BYTES, SSE_HEADERS, sseFrame } from './protocol';

interface FunctionUrlEvent {
  rawPath: string;
  body?: string;
  isBase64Encoded?: boolean;
  headers: Record<string, string | undefined>;
  requestContext: { http: { method: string } };
}

type StreamHandler = (event: FunctionUrlEvent, stream: Writable) => Promise<void>;

declare const awslambda: {
  streamifyResponse(handler: StreamHandler): unknown;
  HttpResponseStream: { from(stream: Writable, meta: { statusCode: number; headers: Record<string, string> }): Writable };
};

const base = loadConfig();
const provider = createProvider(base);
const log = (entry: Record<string, unknown>) => console.log(JSON.stringify(entry));

/** The optional passcode lives in SSM as a SecureString; read once per cold start. */
let configPromise: Promise<ServerConfig> | null = null;
function getConfig(): Promise<ServerConfig> {
  configPromise ??= (async () => {
    const name = process.env.DEMO_PASSCODE_PARAM;
    if (!name) return base;
    try {
      const res = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
      return { ...base, passcode: res.Parameter?.Value ?? base.passcode };
    } catch {
      // Fail closed: an unreadable passcode means nobody gets in.
      log({ msg: 'passcode parameter unreadable' });
      return { ...base, passcode: crypto.randomUUID() };
    }
  })();
  return configPromise;
}

function json(stream: Writable, statusCode: number, body: unknown) {
  const out = awslambda.HttpResponseStream.from(stream, { statusCode, headers: { 'content-type': 'application/json' } });
  out.end(JSON.stringify(body));
}

export const handler = awslambda.streamifyResponse(async (event, stream) => {
  const config = await getConfig();
  const method = event.requestContext.http.method;
  if (method === 'GET' && event.rawPath.endsWith('/api/health')) return json(stream, 200, health(config));
  if (method !== 'POST' || !event.rawPath.endsWith('/api/segments')) return json(stream, 404, { error: 'Not found' });
  const raw = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body) : '';
  if (raw.length > MAX_BODY_BYTES) return json(stream, 413, { error: 'Request too large' });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(stream, 400, { error: 'Invalid request' });
  }
  const start = startSegment(body, event.headers, config, provider, log);
  if (!start.ok) return json(stream, start.status, { error: start.message });
  const out = awslambda.HttpResponseStream.from(stream, { statusCode: 200, headers: { ...SSE_HEADERS } });
  // Keep CloudFront's origin read timeout from firing between frames.
  const ping = setInterval(() => out.write(': ping\n\n'), 5000);
  try {
    for await (const frame of start.frames) out.write(sseFrame(frame));
  } finally {
    clearInterval(ping);
    out.end();
  }
});
