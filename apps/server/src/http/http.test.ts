import { describe, expect, it } from 'vitest';
import { loadConfig, maskId, parseMockFailures } from '../config';
import { MockProvider } from '../core/providers/mock';
import { testConfig } from '../test-helpers';
import { createProvider } from './core';
import { buildServer } from './fastify';

const body = (over: Record<string, unknown> = {}) => ({ scenarioId: 'premium-run', segment: 'main', decisions: [], context: '', ...over });

function frames(payload: string) {
  return payload
    .split('\n\n')
    .filter((c) => c.startsWith('data: '))
    .map((c) => JSON.parse(c.slice(6)) as { frame: string });
}

describe('HTTP API', () => {
  it('reports health without exposing identifiers', async () => {
    const app = buildServer(testConfig({ mode: 'live-bedrock', modelId: 'anthropic.some-long-model-id-v1', region: 'eu-west-1' }), { provider: null });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.json()).toMatchObject({ mode: 'live-bedrock', live: true, stallMs: 4000, bedrock: { configured: true, region: 'eu-west-1', model: 'anth…d-v1' } });
    expect(res.body).not.toContain('some-long-model');
  });

  it('streams a segment as server-sent events', async () => {
    const app = buildServer(testConfig(), { provider: new MockProvider({ delayScale: 0 }) });
    const res = await app.inject({ method: 'POST', url: '/api/segments', payload: body() });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    const f = frames(res.body);
    expect(f.filter((x) => x.frame === 'beat')).toHaveLength(8);
    expect(f.at(-1)).toMatchObject({ frame: 'segment.end' });
  });

  it('validates requests and never leaks internals', async () => {
    const app = buildServer(testConfig(), { provider: new MockProvider({ delayScale: 0 }) });
    expect((await app.inject({ method: 'POST', url: '/api/segments', payload: { segment: 1 } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/segments', payload: body({ scenarioId: 'nope' }) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/segments', payload: body({ segment: 'nope' }) })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/segments', payload: body({ context: 'x'.repeat(9000) }) })).statusCode).toBe(400);
    const big = await app.inject({ method: 'POST', url: '/api/segments', payload: body({ context: 'x'.repeat(20_000) }) });
    expect(big.statusCode).toBe(413);
    expect(big.body).not.toMatch(/at .*\.ts/);
    const bad = await app.inject({ method: 'POST', url: '/api/segments', headers: { 'content-type': 'application/json' }, payload: '{nope' });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'Request failed' });
  });

  it('requires the passcode when set, and refuses live segments in scripted mode', async () => {
    const locked = buildServer(testConfig({ passcode: 'open-sesame' }), { provider: new MockProvider({ delayScale: 0 }) });
    expect((await locked.inject({ method: 'POST', url: '/api/segments', payload: body() })).statusCode).toBe(401);
    const ok = await locked.inject({ method: 'POST', url: '/api/segments', payload: body({ segment: 'chaos' }), headers: { 'x-demo-passcode': 'open-sesame' } });
    expect(ok.statusCode).toBe(200);
    const scripted = buildServer(testConfig({ mode: 'scripted' }));
    expect((await scripted.inject({ method: 'POST', url: '/api/segments', payload: body() })).statusCode).toBe(409);
  });
});

it('honours x-mock-fail in mock mode only', async () => {
  const app = buildServer(testConfig(), { provider: new MockProvider({ delayScale: 0 }) });
  const res = await app.inject({ method: 'POST', url: '/api/segments', payload: body(), headers: { 'x-mock-fail': 'a1.b04:invalid' } });
  const beat = frames(res.body).find((f) => (f as { beatId?: string }).beatId === 'a1.b04') as unknown as { outcome: string };
  expect(beat.outcome).toBe('fallback');
  const health = await app.inject({ method: 'GET', url: '/api/health' });
  expect(health.json().provider).toBe('mock');
});

describe('config', () => {
  it('parses env with safe defaults and masks ids', () => {
    const c = loadConfig({ AGENT_MODE: 'live-bedrock', BEDROCK_MODEL_ID: '  ', BEDROCK_GUARDRAIL_ID: 'g', LIVE_TURN_TIMEOUT_MS: '5000' });
    expect(c).toMatchObject({ mode: 'live-bedrock', modelId: undefined, guardrail: { id: 'g', version: 'DRAFT' }, turnTimeoutMs: 5000, port: 8787 });
    expect(loadConfig({}, { mode: 'live-mock' }).mode).toBe('live-mock');
    expect(parseMockFailures('a1.b04:timeout, a3.b12:invalid,bad,x:nope')).toEqual({ 'a1.b04': 'timeout', 'a3.b12': 'invalid' });
    expect(maskId(undefined)).toBeNull();
    expect(maskId('short')).toBe('****');
    expect(createProvider(testConfig({ mode: 'scripted' }))).toBeNull();
    expect(createProvider(testConfig({ mode: 'live-mock' }))?.name).toBe('mock');
    expect(createProvider(testConfig({ mode: 'live-bedrock', region: 'eu-west-1' }))?.name).toBe('bedrock');
  });
});
