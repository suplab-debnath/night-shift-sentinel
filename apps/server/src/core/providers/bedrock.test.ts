import { BedrockRuntimeClient, ConverseStreamCommand, type ConverseStreamOutput } from '@aws-sdk/client-bedrock-runtime';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, describe, expect, it } from 'vitest';
import { BedrockProvider, buildInput, toBedrockMessages } from './bedrock';
import { ProviderError, type ConverseRequest, type ProviderDelta } from './types';

const bedrock = mockClient(BedrockRuntimeClient);
afterEach(() => bedrock.reset());

async function* events(list: ConverseStreamOutput[]): AsyncIterable<ConverseStreamOutput> {
  for (const e of list) yield e;
}

const req = (over: Partial<ConverseRequest> = {}): ConverseRequest => ({
  modelId: 'model-from-env',
  system: 'sys',
  messages: [{ role: 'user', content: [{ text: 'hi' }] }],
  tools: [{ name: 'logs.search', description: 'd', inputSchema: { type: 'object' } }],
  maxTokens: 600,
  temperature: 0.3,
  signal: new AbortController().signal,
  ...over,
});

async function drain(it: AsyncIterable<ProviderDelta>) {
  const out: ProviderDelta[] = [];
  for await (const d of it) out.push(d);
  return out;
}

describe('Bedrock provider (mocked SDK, no AWS calls)', () => {
  it('builds the Converse request with the SDK field names and Bedrock-safe tool names', () => {
    const input = buildInput(req(), { id: 'gr-1', version: '2' });
    expect(input).toMatchObject({
      modelId: 'model-from-env',
      system: [{ text: 'sys' }],
      inferenceConfig: { maxTokens: 600, temperature: 0.3 },
      toolConfig: { tools: [{ toolSpec: { name: 'logs_search', description: 'd', inputSchema: { json: { type: 'object' } } } }] },
      guardrailConfig: { guardrailIdentifier: 'gr-1', guardrailVersion: '2' },
    });
    expect(buildInput(req({ tools: [] }))).not.toHaveProperty('toolConfig');
    expect(buildInput(req())).not.toHaveProperty('guardrailConfig');
    const msgs = toBedrockMessages([
      { role: 'assistant', content: [{ text: 'x' }, { toolUse: { id: 't1', name: 'git.diff', input: { from: 'a' } } }] },
      { role: 'user', content: [{ toolResult: { id: 't1', content: '{}', isError: true } }] },
    ]);
    expect(msgs[0]!.content![1]).toEqual({ toolUse: { toolUseId: 't1', name: 'git_diff', input: { from: 'a' } } });
    expect(msgs[1]!.content![0]).toEqual({ toolResult: { toolUseId: 't1', content: [{ text: '{}' }], status: 'error' } });
  });

  it('streams text, assembles tool-use JSON fragments, and reports stop and usage', async () => {
    bedrock.on(ConverseStreamCommand).resolves({
      stream: events([
        { messageStart: { role: 'assistant' } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'Hello ' } } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { text: 'there.' } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
        { contentBlockStart: { contentBlockIndex: 1, start: { toolUse: { toolUseId: 'tu-1', name: 'logs_search' } } } },
        { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '{"level":' } } } },
        { contentBlockDelta: { contentBlockIndex: 1, delta: { toolUse: { input: '"ERROR"}' } } } },
        { contentBlockStop: { contentBlockIndex: 1 } },
        { messageStop: { stopReason: 'tool_use' } },
        { metadata: { usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 }, metrics: { latencyMs: 5 } } },
      ]),
    });
    const out = await drain(new BedrockProvider({ client: new BedrockRuntimeClient({ region: 'eu-west-1' }) }).converseStream(req()));
    expect(out).toEqual([
      { type: 'text', text: 'Hello ' },
      { type: 'text', text: 'there.' },
      { type: 'toolUse', id: 'tu-1', name: 'logs.search', input: { level: 'ERROR' } },
      { type: 'stop', reason: 'tool_use' },
      { type: 'usage', inputTokens: 12, outputTokens: 7 },
    ]);
    const sent = bedrock.commandCalls(ConverseStreamCommand)[0]!.args[0].input;
    expect(sent.modelId).toBe('model-from-env');
  });

  it('maps failures to ProviderError without leaking details', async () => {
    const p = new BedrockProvider({ client: new BedrockRuntimeClient({ region: 'eu-west-1' }) });
    bedrock.on(ConverseStreamCommand).rejects(Object.assign(new Error('AccessDenied: secret details'), { name: 'AccessDeniedException' }));
    await expect(drain(p.converseStream(req()))).rejects.toMatchObject({ code: 'provider', message: 'AccessDeniedException' });

    bedrock.on(ConverseStreamCommand).resolves({ stream: events([{ throttlingException: { message: 'slow down' } } as ConverseStreamOutput]) });
    await expect(drain(p.converseStream(req()))).rejects.toBeInstanceOf(ProviderError);

    bedrock.on(ConverseStreamCommand).resolves({});
    await expect(drain(p.converseStream(req()))).rejects.toMatchObject({ message: 'Bedrock returned no stream' });

    bedrock.on(ConverseStreamCommand).resolves({
      stream: events([
        { contentBlockStart: { contentBlockIndex: 0, start: { toolUse: { toolUseId: 'x', name: 'git_diff' } } } },
        { contentBlockDelta: { contentBlockIndex: 0, delta: { toolUse: { input: '{not json' } } } },
        { contentBlockStop: { contentBlockIndex: 0 } },
      ]),
    });
    expect(await drain(p.converseStream(req()))).toEqual([{ type: 'toolUse', id: 'x', name: 'git.diff', input: {} }]);

    const abort = new AbortController();
    abort.abort();
    bedrock.on(ConverseStreamCommand).rejects(new Error('aborted'));
    await expect(drain(p.converseStream(req({ signal: abort.signal })))).rejects.toMatchObject({ code: 'aborted' });
    expect(new BedrockProvider({ region: 'eu-west-1' }).name).toBe('bedrock');
  });
});
