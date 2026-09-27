import type { Beat } from '@night-shift/engine';
import { incidentCheckout } from '@night-shift/scenarios';
import { describe, expect, it } from 'vitest';
import { testConfig } from '../test-helpers';
import { runAgentTurn } from './agentTurn';
import { MockProvider } from './providers/mock';
import { ProviderError, type LlmProvider, type ProviderDelta } from './providers/types';
import { policyFor, toolHintFor } from './segments';

const bundle = incidentCheckout;
const beat = (id: string): Beat => Object.values(bundle.scenario.segments).flatMap((s) => s.acts.flatMap((a) => a.beats)).find((b) => b.id === id)!;

function scripted(deltas: ProviderDelta[][]): LlmProvider {
  let call = 0;
  return {
    name: 'bedrock',
    async *converseStream() {
      for (const d of deltas[Math.min(call++, deltas.length - 1)]!) yield d;
    },
  };
}

const cfg = testConfig({ modelId: 'test-model', fastModelId: 'fast-model' });

describe('agent turn', () => {
  it('runs a live turn through the tool loop and keeps scripted system events', async () => {
    const b = beat('a3.b12');
    const r = await runAgentTurn({ bundle, beat: b, context: '', approvals: [], provider: new MockProvider({ delayScale: 0 }), config: testConfig(), toolHint: toolHintFor(bundle, b)! });
    expect(r.log.outcome).toBe('live');
    expect(r.log.toolCalls).toBe(1);
    expect(r.override.events.map((e) => `${e.kind}:${e.source}`)).toEqual(['metric.update:script', 'tool.call:live', 'tool.result:live', 'thought:live']);
    expect(r.override.events.at(-1)).toMatchObject({ text: 'Active connections are pinned at 10 of 10 on every pod. 380 threads are waiting.' });
  });

  it('uses model text from a real-shaped provider and the right model per agent', async () => {
    const seen: string[] = [];
    const provider: LlmProvider = {
      name: 'bedrock',
      async *converseStream(req) {
        seen.push(req.modelId);
        yield { type: 'text', text: 'v2.14.0 shipped at 01:55. ' };
        yield { type: 'text', text: 'Errors began nine minutes later.' };
        yield { type: 'usage', inputTokens: 10, outputTokens: 5 };
        yield { type: 'stop', reason: 'end_turn' };
      },
    };
    const r = await runAgentTurn({ bundle, beat: beat('a3.b07'), context: '', approvals: [], provider, config: cfg });
    expect(r.log).toMatchObject({ outcome: 'live', inputTokens: 10, outputTokens: 5 });
    expect(r.override.events.find((e) => e.kind === 'thought')).toMatchObject({ text: 'v2.14.0 shipped at 01:55. Errors began nine minutes later.', source: 'live' });
    expect(seen).toEqual(['fast-model']);
    await runAgentTurn({ bundle, beat: beat('a3.b20'), context: '', approvals: [], provider, config: cfg });
    expect(seen.at(-1)).toBe('test-model');
  });

  it('falls back cleanly on invalid output, errors, timeouts, guardrails, and tool loops', async () => {
    const cases: [string, LlmProvider, Partial<Parameters<typeof testConfig>[0]>][] = [
      ['validator', new MockProvider({ delayScale: 0, failures: { 'a1.b04': 'invalid' } }), {}],
      ['provider: provider', new MockProvider({ delayScale: 0, failures: { 'a1.b04': 'error' } }), {}],
      ['timeout', new MockProvider({ delayScale: 0, failures: { 'a1.b04': 'timeout' } }), { turnTimeoutMs: 50 }],
      ['stopped: guardrail_intervened', scripted([[{ type: 'stop', reason: 'guardrail_intervened' }]]), { modelId: 'm' }],
      ['tool loop limit', scripted([[{ type: 'toolUse', id: 't', name: 'metrics.query', input: {} }, { type: 'stop', reason: 'tool_use' }]]), { modelId: 'm' }],
      ['provider error', { name: 'bedrock', converseStream: () => { throw new Error('boom'); } } as LlmProvider, { modelId: 'm' }],
      ['no model configured', scripted([[]]), { mode: 'live-bedrock', modelId: undefined }],
    ];
    for (const [reason, provider, over] of cases) {
      const r = await runAgentTurn({ bundle, beat: beat('a1.b04'), context: '', approvals: [], provider, config: testConfig(over) });
      expect(r.log.outcome, reason).toBe('fallback');
      expect(r.log.fallbackReason, reason).toContain(reason);
      const thought = r.override.events.find((e) => e.kind === 'thought')!;
      expect(thought).toMatchObject({ source: 'fallback', text: 'p99 latency on checkout-api is 4.8 seconds. The SLO is 800 milliseconds.' });
      expect(r.override.events.filter((e) => e.source === 'script').length).toBe(r.override.events.length - 1);
    }
    expect(new ProviderError('x', 'timeout').code).toBe('timeout');
  });

  it('gives Guardian the computed policy outcome and rejects a contradiction', async () => {
    const b = beat('a4.b12');
    const policy = policyFor(bundle, 'main', b.id)!;
    expect(policy.verdict).toBe('needs-approval');
    const liar = scripted([[{ type: 'text', text: 'Blocked by P-04.' }, { type: 'stop', reason: 'end_turn' }]]);
    const r = await runAgentTurn({ bundle, beat: b, context: '', approvals: [], provider: liar, config: cfg, policy });
    expect(r.log.fallbackReason).toContain('contradicts the policy engine');
    expect(policyFor(bundle, 'main', 'a1.b04')).toBeUndefined();
  });

  it('writes artifacts and requires the full postmortem timeline', async () => {
    const b = beat('a7.b04');
    const r = await runAgentTurn({ bundle, beat: b, context: '', approvals: ['g1'], provider: new MockProvider({ delayScale: 0 }), config: testConfig(), toolHint: toolHintFor(bundle, b) ?? { name: 'doc.write', input: { type: 'postmortem' } } });
    expect(r.log.outcome).toBe('live');
    expect(r.override.events.find((e) => e.kind === 'artifact.create')).toMatchObject({ source: 'live' });
  });
});
