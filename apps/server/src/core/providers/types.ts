// Provider-neutral model interface (ARCHITECTURE §7.4).

export type ContentPart =
  | { text: string }
  | { toolUse: { id: string; name: string; input: Record<string, unknown> } }
  | { toolResult: { id: string; content: string; isError?: boolean } };

export interface Msg {
  role: 'user' | 'assistant';
  content: ContentPart[];
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ConverseRequest {
  modelId: string;
  system: string;
  messages: Msg[];
  tools: ToolSpec[];
  maxTokens: number;
  temperature: number;
  signal: AbortSignal;
  /** Only read by the mock provider: the scripted text and tool call of the beat. */
  mock?: { beatId: string; text: string; toolCall?: { name: string; input: Record<string, unknown> } };
}

export type ProviderDelta =
  | { type: 'text'; text: string }
  | { type: 'toolUse'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'stop'; reason: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number };

export interface LlmProvider {
  readonly name: 'mock' | 'bedrock';
  converseStream(req: ConverseRequest): AsyncIterable<ProviderDelta>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'aborted' | 'provider' | 'config',
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
