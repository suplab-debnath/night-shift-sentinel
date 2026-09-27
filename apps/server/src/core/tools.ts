// Fixture-backed tools (ARCHITECTURE §7.5). Deterministic; never throw to the model.
import { z } from 'zod';
import type { AgentId, PayloadType } from '@night-shift/engine';
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
  /** Gate that must be approved on the path before this tool may run. */
  requiresApproval?: string[];
  run: (args: z.output<S>, ctx: ToolContext) => Omit<ToolResult, 'ok'>;
}

function def<S extends z.ZodType>(d: ToolDef<S>): ToolDef<S> {
  return d;
}

const service = z.string().default('checkout-api');

export const TOOLS = [
  def({
    name: 'metrics.query',
    description: 'Query service metrics: p99 latency, error rate, error budget burn, or a named metric such as hikari.connections.active.',
    schema: z.object({ service, window: z.string().optional(), metric: z.string().optional() }),
    run: (a, { bundle }) => {
      const m = bundle.fixtures.metrics;
      if (a.metric?.includes('hikari') || a.metric?.includes('pool')) {
        const pods = m.podsAt.pods;
        return {
          summary: `active ${pods[0]!.poolActive}/${pods[0]!.poolMax} on ${pods.length} of ${pods.length} pods; ${m.podsAt.pendingTotal} threads pending`,
          data: m.podsAt,
        };
      }
      return {
        summary: `p99 ${m.peak.p99Ms / 1000} s (SLO ${m.slo.p99Ms} ms); errors ${m.peak.errorRatePct}%; budget burn ${m.peak.errorBudgetBurn}×`,
        data: { slo: m.slo, normal: m.normal, peak: m.peak, events: m.events, service: a.service },
      };
    },
  }),
  def({
    name: 'traces.get',
    description: 'Get a sampled trace and dependency health for a service.',
    schema: z.object({ service, depth: z.number().int().min(1).max(3).default(2) }),
    run: (_a, { bundle }) => {
      const t = bundle.fixtures.traces;
      const db = t.dependencies.find((d) => d.service === 'orders-db') as Record<string, unknown> | undefined;
      return {
        summary: `payments-gateway ok; inventory-svc ok; orders-db CPU ${db?.cpuPct}%, connections ${db?.connections}/${db?.maxConnections}`,
        data: t,
      };
    },
  }),
  def({
    name: 'logs.search',
    description: 'Search service logs by level and time. Returns counts, the dominant signature, and sample lines.',
    schema: z.object({ service, level: z.string().optional(), since: z.string().optional(), query: z.string().optional() }),
    run: (a, { bundle }) => {
      const l = bundle.fixtures.logs;
      const lines = l.lines.filter((x) => (!a.level || x.level === a.level.toUpperCase()) && (!a.query || x.message.includes(a.query)));
      return {
        summary: `${l.stats.errorCount.toLocaleString('en-US')} ERROR lines since ${l.stats.window.from.slice(0, 5)}; top signature ${Math.round(l.stats.signatureShare * 100)}%`,
        payload: { type: 'log', content: l.stats.signature },
        data: { stats: l.stats, sample: lines.slice(0, 8) },
      };
    },
  }),
  def({
    name: 'deploys.list',
    description: 'List recent deploys for a service with versions, times, and check results.',
    schema: z.object({ service, since: z.string().optional() }),
    run: (a, { bundle }) => {
      const d = bundle.fixtures.deploys;
      const mine = d.deploys.filter((x) => x.service === a.service);
      const first = mine[0];
      return {
        summary: first
          ? `${first.service} ${first.version} deployed ${first.at} by ${first.by}; previous ${first.previous} ran ${d.history[a.service]?.find((h) => h.version === first.previous)?.ranDays} days`
          : `No deploys for ${a.service}`,
        data: { deploys: mine, history: d.history[a.service] ?? [] },
      };
    },
  }),
  def({
    name: 'git.diff',
    description: 'Show the diff between two versions for a path.',
    schema: z.object({ from: z.string(), to: z.string(), path: z.string().default('deploy/') }),
    run: (a, { bundle }) => {
      const d = bundle.fixtures.diff;
      if (a.from !== d.from || a.to !== d.to) return { summary: `No diff recorded for ${a.from}..${a.to}`, data: null };
      const file = d.files.find((f) => f.file.startsWith(a.path)) ?? d.files[0]!;
      const deps = file.file.startsWith('build') ? (d.dependencies ?? []).filter((x) => x.from !== x.to) : [];
      return {
        summary: deps.length
          ? `${file.file}: ${deps.map((x) => `${x.name} ${x.from} → ${x.to}`).join('; ')}`
          : `${file.file}: 1 key renamed`,
        payload: { type: 'diff', content: file.unified },
        data: d,
      };
    },
  }),
  def({
    name: 'runbook.lookup',
    description: 'Find a runbook by keywords.',
    schema: z.object({ query: z.string() }),
    run: (a, { bundle }) => {
      const q = a.query.toLowerCase();
      const rb = bundle.fixtures.runbooks.runbooks.find((r) => r.keywords.some((k) => q.includes(k)));
      return rb ? { summary: `${rb.id} ${rb.title}`, data: rb } : { summary: 'No matching runbook', data: null };
    },
  }),
  def({
    name: 'policy.check',
    description: 'Evaluate a proposed action against production policies. Results are computed by the policy engine.',
    schema: z.object({
      action: z.string(),
      target: z.string(),
      env: z.string().default('prod'),
      to: z.string().optional(),
      expires: z.string().optional(),
      key: z.string().optional(),
      value: z.string().optional(),
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
    name: 'deploy.rollback',
    description: 'Roll back a service (requires an approved gate).',
    schema: z.object({ service, to: z.string(), strategy: z.string().default('rolling'), batch: z.number().int().default(1) }),
    requiresApproval: ['g1'],
    run: (a) => ({ summary: `${a.service} rolling back to ${a.to}`, data: { accepted: true } }),
  }),
  def({
    name: 'config.override',
    description: 'Apply a runtime config override with expiry (requires an approved gate).',
    schema: z.object({ service, key: z.string(), value: z.string(), expires: z.string() }),
    requiresApproval: ['g2'],
    run: (a) => ({ summary: `Override recorded; expires in ${a.expires}`, data: { accepted: true } }),
  }),
  def({
    name: 'deploy.restart',
    description: 'Rolling restart (requires an approved gate).',
    schema: z.object({ strategy: z.string().default('rolling') }),
    requiresApproval: ['g2'],
    run: () => ({ summary: 'Rolling restart started', data: { accepted: true } }),
  }),
  def({
    name: 'doc.write',
    description: 'Write a document draft (postmortem). Drafts only.',
    schema: z.object({ type: z.string(), style: z.string().optional() }),
    run: (a) => ({ summary: `Draft ${a.type} saved`, data: { saved: true } }),
  }),
  def({
    name: 'comms.draft',
    description: 'Draft a communication. Drafts only; nothing is sent.',
    schema: z.object({ audience: z.string(), kind: z.string().optional() }),
    run: (a) => ({ summary: `Draft for ${a.audience} saved`, data: { saved: true } }),
  }),
  def({
    name: 'plan.write',
    description: 'Write the incident plan.',
    schema: z.object({ incident: z.string(), questions: z.number().int().optional() }),
    run: () => ({ summary: 'Plan saved', data: { saved: true } }),
  }),
  def({
    name: 'db.alter',
    description: 'Alter a production database. Exists only to demonstrate that it is not granted.',
    schema: z.object({ target: z.string(), statement: z.string().optional() }),
    run: () => ({ summary: 'Not granted', data: null, denied: true }),
  }),
] as const;

type AnyTool = ToolDef<z.ZodType>;
const BY_NAME = new Map<string, AnyTool>(TOOLS.map((t) => [t.name, t as unknown as AnyTool]));

export function getTool(name: string): AnyTool | undefined {
  return BY_NAME.get(name);
}

/** Bedrock tool names must be alphanumeric with _ or - (ARCHITECTURE §7.4). */
export const toBedrockName = (name: string) => name.replace(/\./g, '_');
export const fromBedrockName = (name: string) => name.replace(/_/g, '.');

export function toolSpecs(names: readonly string[]) {
  return names
    .map((n) => BY_NAME.get(n))
    .filter((t): t is AnyTool => t !== undefined)
    .map((t) => ({ name: t.name, description: t.description, inputSchema: z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown> }));
}

/** Runs a tool with permission checks. Never throws. */
export function runTool(name: string, rawArgs: unknown, ctx: ToolContext): ToolResult & { args: Record<string, unknown> } {
  const tool = BY_NAME.get(name);
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Record<string, unknown>;
  if (!tool) return { ok: false, summary: `Unknown tool ${name}`, data: { error: 'unknown-tool' }, args };
  const agent = ctx.bundle.agentById(ctx.agent);
  const granted = agent?.tools.some((t) => t.name === name) ?? false;
  if (!granted || !ctx.allowedTools.includes(name)) {
    return { ok: false, denied: true, summary: `${name} is not granted to ${ctx.agent}`, data: { error: 'permission.denied' }, args };
  }
  if (tool.requiresApproval && !tool.requiresApproval.some((g) => ctx.approvals.includes(g))) {
    return { ok: false, denied: true, summary: `${name} needs an approved gate`, data: { error: 'approval.required' }, args };
  }
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, summary: `Invalid arguments for ${name}`, data: { error: 'invalid-arguments', issues: parsed.error.issues.map((i) => i.message) }, args };
  }
  try {
    const r = tool.run(parsed.data, ctx);
    return { ok: !r.denied, ...r, args: parsed.data as Record<string, unknown> };
  } catch {
    return { ok: false, summary: `${name} failed`, data: { error: 'tool-failed' }, args };
  }
}
