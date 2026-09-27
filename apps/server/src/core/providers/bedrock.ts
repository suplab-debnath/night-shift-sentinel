// Bedrock provider: Converse streaming API (ARCHITECTURE §7.4). Field names checked
// against the installed @aws-sdk/client-bedrock-runtime types (CLAUDE.md §3.9).
// Credentials come from the default provider chain; the model ID only from env.
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlock,
  type ConverseStreamCommandInput,
  type Message,
  type Tool,
  type ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';

/** The SDK's JSON document type, taken from its own model types. */
type DocumentType = NonNullable<ToolUseBlock['input']>;
import { fromBedrockName, toBedrockName } from '../tools';
import { ProviderError, type ContentPart, type ConverseRequest, type LlmProvider, type Msg, type ProviderDelta } from './types';

export interface BedrockOptions {
  region?: string;
  guardrail?: { id: string; version: string };
  client?: BedrockRuntimeClient;
}

function toContent(part: ContentPart): ContentBlock {
  if ('text' in part) return { text: part.text };
  if ('toolUse' in part) {
    return { toolUse: { toolUseId: part.toolUse.id, name: toBedrockName(part.toolUse.name), input: part.toolUse.input as DocumentType } };
  }
  return {
    toolResult: {
      toolUseId: part.toolResult.id,
      content: [{ text: part.toolResult.content }],
      status: part.toolResult.isError ? 'error' : 'success',
    },
  };
}

export function toBedrockMessages(messages: Msg[]): Message[] {
  return messages.map((m) => ({ role: m.role, content: m.content.map(toContent) }));
}

export function buildInput(req: ConverseRequest, guardrail?: BedrockOptions['guardrail']): ConverseStreamCommandInput {
  const tools: Tool[] = req.tools.map((t) => ({
    toolSpec: { name: toBedrockName(t.name), description: t.description, inputSchema: { json: t.inputSchema as DocumentType } },
  }));
  return {
    modelId: req.modelId,
    system: [{ text: req.system }],
    messages: toBedrockMessages(req.messages),
    inferenceConfig: { maxTokens: req.maxTokens, temperature: req.temperature },
    ...(tools.length ? { toolConfig: { tools } } : {}),
    ...(guardrail ? { guardrailConfig: { guardrailIdentifier: guardrail.id, guardrailVersion: guardrail.version } } : {}),
  };
}

export class BedrockProvider implements LlmProvider {
  readonly name = 'bedrock' as const;
  private readonly client: BedrockRuntimeClient;

  constructor(private readonly opts: BedrockOptions = {}) {
    this.client = opts.client ?? new BedrockRuntimeClient(opts.region ? { region: opts.region } : {});
  }

  async *converseStream(req: ConverseRequest): AsyncIterable<ProviderDelta> {
    let response;
    try {
      response = await this.client.send(new ConverseStreamCommand(buildInput(req, this.opts.guardrail)), { abortSignal: req.signal });
    } catch (e) {
      if (req.signal.aborted) throw new ProviderError('aborted', 'aborted');
      throw new ProviderError(e instanceof Error ? e.name : 'Bedrock request failed', 'provider');
    }
    if (!response.stream) throw new ProviderError('Bedrock returned no stream', 'provider');

    // Tool-use input arrives as JSON string fragments per content block.
    const pending = new Map<number, { id: string; name: string; json: string }>();
    try {
      for await (const ev of response.stream) {
        if (ev.contentBlockStart?.start?.toolUse) {
          const tu = ev.contentBlockStart.start.toolUse;
          pending.set(ev.contentBlockStart.contentBlockIndex ?? 0, { id: tu.toolUseId ?? '', name: fromBedrockName(tu.name ?? ''), json: '' });
        } else if (ev.contentBlockDelta?.delta) {
          const d = ev.contentBlockDelta.delta;
          if (d.text !== undefined) yield { type: 'text', text: d.text };
          else if (d.toolUse?.input !== undefined) {
            const p = pending.get(ev.contentBlockDelta.contentBlockIndex ?? 0);
            if (p) p.json += d.toolUse.input;
          }
        } else if (ev.contentBlockStop) {
          const idx = ev.contentBlockStop.contentBlockIndex ?? 0;
          const p = pending.get(idx);
          if (p) {
            pending.delete(idx);
            let input: Record<string, unknown> = {};
            try {
              input = p.json ? (JSON.parse(p.json) as Record<string, unknown>) : {};
            } catch {
              input = {};
            }
            yield { type: 'toolUse', id: p.id, name: p.name, input };
          }
        } else if (ev.messageStop) {
          yield { type: 'stop', reason: ev.messageStop.stopReason ?? 'end_turn' };
        } else if (ev.metadata?.usage) {
          yield { type: 'usage', inputTokens: ev.metadata.usage.inputTokens ?? 0, outputTokens: ev.metadata.usage.outputTokens ?? 0 };
        } else if (
          ev.internalServerException ||
          ev.modelStreamErrorException ||
          ev.serviceUnavailableException ||
          ev.throttlingException ||
          ev.validationException
        ) {
          throw new ProviderError('Bedrock stream error', 'provider');
        }
      }
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      if (req.signal.aborted) throw new ProviderError('aborted', 'aborted');
      throw new ProviderError(e instanceof Error ? e.name : 'Bedrock stream failed', 'provider');
    }
  }
}
