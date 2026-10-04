// Tools for live mode (ARCHITECTURE §7.5, DECISIONS D-081). Deterministic; never throw to the model.
// Three tools are computed: policy.check (the policy engine), pr.draft and ci.run (the governance
// fixture). db.alter exists only to be denied. Every other tool replays the scenario's own
// scripted result for that call, so live and scripted runs see the same world, whatever the
// scenario.
import { z } from 'zod';
import type { AgentId, EventTemplate, PayloadType } from '@night-shift/engine';
import type { ScenarioBundle } from '@night-shift/scenarios';
import { checkPolicies } from './policy';

export interface ToolContext {
  bundle: ScenarioBundle;
  agent: AgentId;
  /** Tools this beat may use (beat.live.allowedTools). */
  allowedTools: readonly string[];
  /** Approved gate ids on the current decision path. */
  approvals: readonly string[];
}

export interface ToolResult {
  ok: boolean;
  summary: string;
  payload?: { type: PayloadType; content: string };
  /** Structured result returned to the model. */
  data: unknown;
  denied?: boolean;
}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (args: z.output<S>, ctx: ToolContext) => Omit<ToolResult, 'ok'>;
}

function def<S extends z.ZodType>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

/** Tools computed in code; everything else is replayed from the script. */
export const CORE_TOOLS = [
  def({
    name: 'policy.check',
    description: 'Evaluate a proposed action against production policies. Results are computed by the policy engine.',
    schema: z.object({
      action: z.string(),
      target: z.string(),
      env: z.string().default('prod'),
      to: z.string().optional(),
      expires: z.string().optional(),
      pr: z.number().int().optional(),
      checks: z.array(z.string()).optional(),
      source: z.string().optional(),
      content: z.string().optional(),
      records: z.number().int().optional(),
      product: z.string().optional(),
      rate: z.string().optional(),
    }),
    run: (a, { bundle }) => {
      const outcome = checkPolicies(a, bundle.fixtures);
      return {
        summary: `${outcome.verdict}: ${outcome.rows.map((r) => `${r.policyId} ${r.result}`).join(', ')}`,
        payload: { type: 'json', content: JSON.stringify(outcome.rows.map(({ policyId, result, reason }) => ({ policyId, result, reason }))) },
        data: outcome,
      };
    },
  }),
  def({
    name: 'pr.draft',
    description: 'Open a draft pull request with a code fix and its tests. Drafts only: agents cannot merge or deploy.',
    schema: z.object({ service: z.string().optional(), branch: z.string().optional(), draft: z.boolean().default(true) }),
    run: (_a, { bundle }) => {
      const pr = bundle.fixtures.governance.pullRequest;
      return {
        summary: `Draft PR #${pr.number}: ${pr.files.length} files changed, ${pr.testsAdded} tests added`,
        payload: { type: 'diff', content: pr.files.map((f) => `--- ${f.file}\n${f.unified}`).join('\n') },
        data: { number: pr.number, title: pr.title, draft: true, canMerge: pr.canMerge, files: pr.files.map((f) => f.file) },
      };
    },
  }),
  def({
    name: 'ci.run',
    description: 'Run the CI pipeline (build, tests, lint, scans) on a pull request. Read only.',
    schema: z.object({ pr: z.number().int() }),
    run: (a, { bundle }) => {
      const pr = bundle.fixtures.governance.pullRequest;
      if (a.pr !== pr.number) return { summary: `No pull request #${a.pr}`, data: null };
      const passed = pr.checks.filter((c) => c.result === 'pass').length;
      const version = bundle.fixtures.deploys.deploys[0]?.version ?? 'the release';
      return {
        summary: `${passed} of ${pr.checks.length} checks passed. The new tests fail on ${version} and pass with the fix.`,
        payload: {
          type: 'table',
          content: ['check                      result  detail', ...pr.checks.map((c) => `${c.label.padEnd(26)} ${c.result.padEnd(7)} ${c.detail}`)].join('\n'),
        },
        data: { run: pr.ciRun, checks: pr.checks },
      };
    },
  }),
  def({
    name: 'db.alter',
    description: 'Alter a production database. Exists only to demonstrate that it is not granted.',
    schema: z.object({ target: z.string(), statement: z.string().optional() }),
    run: () => ({ summary: 'Not granted', data: null, denied: true }),
  }),
] as const;

type AnyTool = ToolDef<z.ZodType>;
const CORE = new Map<string, AnyTool>(CORE_TOOLS.map((t) => [t.name, t as unknown as AnyTool]));

interface Scripted {
  args: Record<string, unknown>;
  summary: string;
  payload?: { type: PayloadType; content: string };
}

const tables = new WeakMap<ScenarioBundle, Map<string, Scripted[]>>();

/** Every scripted tool.call with its result, across all segments, by tool name. */
export function scriptedTools(bundle: ScenarioBundle): Map<string, Scripted[]> {
  const cached = tables.get(bundle);
  if (cached) return cached;
  const table = new Map<string, Scripted[]>();
  for (const seg of Object.values(bundle.scenario.segments)) {
    const events: EventTemplate[] = seg.acts.flatMap((a) => a.beats.flatMap((b) => b.events));
    for (const e of events) {
      if (e.kind !== 'tool.call' || CORE.has(e.tool)) continue;
      const result = events.find((r) => r.kind === 'tool.result' && r.callId === e.callId && r.status !== 'error');
      const list = table.get(e.tool) ?? [];
      // Writers (plan, document, draft) produce an artifact rather than a result line.
      if (!result || result.kind !== 'tool.result') {
        if (events.some((r) => r.kind === 'tool.result' && r.callId === e.callId)) continue;
        list.push({ args: e.args, summary: 'Draft saved' });
      } else {
        list.push({ args: e.args, summary: result.summary, ...(result.payload ? { payload: result.payload } : {}) });
      }
      table.set(e.tool, list);
    }
  }
  tables.set(bundle, table);
  return table;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The scripted call that best matches the arguments: exact, then most matching fields, then first. */
function bestMatch(entries: readonly Scripted[], args: Record<string, unknown>): Scripted {
  const exact = entries.find((e) => same(e.args, args));
  if (exact) return exact;
  let best = entries[0]!;
  let score = -1;
  for (const e of entries) {
    const s = Object.entries(args).filter(([k, v]) => same(e.args[k], v)).length;
    if (s > score) {
      best = e;
      score = s;
    }
  }
  return best;
}

export function isKnownTool(bundle: ScenarioBundle, name: string): boolean {
  return CORE.has(name) || scriptedTools(bundle).has(name);
}

/** Bedrock tool names must be alphanumeric with _ or - (ARCHITECTURE §7.4). */
export const toBedrockName = (name: string) => name.replace(/\./g, '_');
export const fromBedrockName = (name: string) => name.replace(/_/g, '.');

function jsonType(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

export function toolSpecs(bundle: ScenarioBundle, names: readonly string[]) {
  const table = scriptedTools(bundle);
  return names.flatMap((n) => {
    const core = CORE.get(n);
    if (core) return [{ name: core.name, description: core.description, inputSchema: z.toJSONSchema(core.schema, { io: 'input' }) as Record<string, unknown> }];
    const entries = table.get(n);
    if (!entries) return [];
    const properties: Record<string, { type: string }> = {};
    for (const e of entries) for (const [k, v] of Object.entries(e.args)) properties[k] ??= { type: jsonType(v) };
    return [
      {
        name: n,
        description: `Query tonight's systems with ${n}. Example arguments: ${JSON.stringify(entries[0]!.args)}.`,
        inputSchema: { type: 'object', properties, additionalProperties: false } as Record<string, unknown>,
      },
    ];
  });
}

/** Runs a tool with permission checks. Never throws. */
export function runTool(name: string, rawArgs: unknown, ctx: ToolContext): ToolResult & { args: Record<string, unknown> } {
  const args = (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs) ? rawArgs : {}) as Record<string, unknown>;
  if (!isKnownTool(ctx.bundle, name)) return { ok: false, summary: `Unknown tool ${name}`, data: { error: 'unknown-tool' }, args };
  const agent = ctx.bundle.agentById(ctx.agent);
  const grant = agent?.tools.find((t) => t.name === name);
  if (!grant || !ctx.allowedTools.includes(name)) {
    return { ok: false, denied: true, summary: `${name} is not granted to ${ctx.agent}`, data: { error: 'permission.denied' }, args };
  }
  if (grant.access === 'approval' && ctx.approvals.length === 0) {
    return { ok: false, denied: true, summary: `${name} needs an approved gate`, data: { error: 'approval.required' }, args };
  }
  const core = CORE.get(name);
  if (core) {
    if (rawArgs === null || rawArgs === undefined) return { ok: false, summary: `Invalid arguments for ${name}`, data: { error: 'invalid-arguments' }, args };
    const parsed = core.schema.safeParse(args);
    if (!parsed.success) {
      return { ok: false, summary: `Invalid arguments for ${name}`, data: { error: 'invalid-arguments', issues: parsed.error.issues.map((i) => i.message) }, args };
    }
    try {
      const r = core.run(parsed.data, ctx);
      return { ok: !r.denied, ...r, args: parsed.data as Record<string, unknown> };
    } catch {
      return { ok: false, summary: `${name} failed`, data: { error: 'tool-failed' }, args };
    }
  }
  const hit = bestMatch(scriptedTools(ctx.bundle).get(name)!, args);
  return { ok: true, summary: hit.summary, ...(hit.payload ? { payload: hit.payload } : {}), data: { summary: hit.summary, ...(hit.payload ? { detail: hit.payload.content } : {}) }, args };
}
