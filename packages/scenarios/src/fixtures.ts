// zod schemas for fixture files. Fixtures are the facts live mode is grounded
// on (SCENARIO §1, §9), so they are validated as strictly as the script.
import { z } from 'zod';

const hms = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

export const MetricsFixtureSchema = z.object({
  service: z.string(),
  interval: z.string(),
  slo: z.object({ p99Ms: z.number(), errorRatePct: z.number() }),
  normal: z.object({ p99Ms: z.number(), errorRatePct: z.number(), poolActivePerPod: z.number(), poolMaxPerPod: z.number() }),
  peak: z.object({ p99Ms: z.number(), errorRatePct: z.number(), errorBudgetBurn: z.number() }),
  events: z.record(z.string(), hms),
  series: z
    .array(
      z.object({
        t: hms,
        p99Ms: z.number(),
        errorRatePct: z.number(),
        requestsPerMin: z.number(),
        poolActivePerPod: z.number(),
        poolMaxPerPod: z.number(),
        poolPendingTotal: z.number(),
        dbCpuPct: z.number(),
        dbConnections: z.number(),
      }),
    )
    .min(10),
  podsAt: z.object({
    t: hms,
    metric: z.string(),
    pods: z.array(z.object({ name: z.string(), version: z.string(), poolMax: z.number(), poolActive: z.number(), pending: z.number() })),
    pendingTotal: z.number(),
  }),
  podsAfter: z.object({
    t: hms,
    pods: z.array(z.object({ name: z.string(), version: z.string(), poolMax: z.number(), poolActive: z.number(), pending: z.number() })),
  }),
  dependencies: z.object({ t: hms, services: z.array(z.record(z.string(), z.union([z.string(), z.number()]))) }),
});

export const LogsFixtureSchema = z.object({
  service: z.string(),
  stats: z.object({
    window: z.object({ from: hms, to: hms }),
    errorCount: z.number().int(),
    signature: z.string(),
    signatureCount: z.number().int(),
    signatureShare: z.number(),
    otherErrors: z.array(z.object({ message: z.string(), count: z.number().int() })),
  }),
  lines: z
    .array(z.object({ t: hms, level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']), pod: z.string(), logger: z.string(), message: z.string() }))
    .min(40),
});

export const TracesFixtureSchema = z.object({
  service: z.string(),
  sampledAt: hms,
  trace: z.object({
    traceId: z.string(),
    root: z.object({ name: z.string(), service: z.string(), durationMs: z.number(), status: z.enum(['ok', 'error']) }),
    spans: z.array(
      z.object({
        name: z.string(),
        service: z.string(),
        depth: z.number().int(),
        durationMs: z.number(),
        status: z.enum(['ok', 'error']),
        note: z.string().optional(),
      }),
    ),
  }),
  dependencies: z.array(z.object({ service: z.string(), status: z.enum(['healthy', 'degraded', 'down']) }).passthrough()),
});

export const DeploysFixtureSchema = z.object({
  now: hms,
  deploys: z.array(
    z.object({
      service: z.string(),
      version: z.string(),
      previous: z.string(),
      at: z.string(),
      by: z.string(),
      pipelineRun: z.number().optional(),
      checks: z.enum(['passed', 'failed']),
      schemaMigration: z.boolean(),
      changes: z.array(z.string()),
    }),
  ),
  history: z.record(
    z.string(),
    z.array(
      z.object({
        version: z.string(),
        at: z.string().optional(),
        ranDays: z.number().optional(),
        status: z.enum(['current', 'previous', 'retired']),
        checks: z.enum(['passed', 'failed']),
      }),
    ),
  ),
});

export const DiffFixtureSchema = z.object({
  service: z.string(),
  from: z.string(),
  to: z.string(),
  path: z.string(),
  files: z.array(z.object({ file: z.string(), unified: z.string() })).min(1),
  analysis: z.object({
    renamedKey: z.object({ from: z.string(), to: z.string() }),
    applicationBinds: z.string(),
    effectivePoolSize: z.number(),
    hikariDefaultPoolSize: z.number(),
    productionNeedsPerPod: z.number(),
  }),
  dependencies: z.array(z.object({ name: z.string(), from: z.string(), to: z.string() })).optional(),
});

export const RunbooksFixtureSchema = z.object({
  runbooks: z.array(
    z.object({
      id: z.string().regex(/^RB-\d+$/),
      title: z.string(),
      keywords: z.array(z.string()),
      action: z.string(),
      strategy: z.string(),
      estimatedMinutes: z.number(),
      reversible: z.boolean(),
      expiryHours: z.number().optional(),
      preconditions: z.array(z.string()),
      steps: z.array(z.string()),
    }),
  ),
});

export const PolicyRuleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('human-approval'), env: z.string() }),
  z.object({ type: z.literal('approvals-present'), env: z.string(), approvals: z.array(z.string()) }),
  z.object({ type: z.literal('freeze-window'), incidentException: z.boolean() }),
  z.object({ type: z.literal('blast-radius'), maxServices: z.number().int().positive() }),
  z.object({ type: z.literal('verified-target'), withinDays: z.number().int().positive() }),
  z.object({ type: z.literal('no-outage'), maxOutageSeconds: z.number().nonnegative() }),
  z.object({ type: z.literal('override-expiry'), maxHours: z.number().positive() }),
]);

export const PoliciesFixtureSchema = z.object({
  incident: z.object({ severity: z.string(), open: z.boolean() }),
  changeFreeze: z.object({ active: z.boolean(), window: z.string(), incidentExceptionMaxSeverity: z.string() }),
  actions: z.record(
    z.string(),
    z.object({
      mutates: z.boolean(),
      targetKind: z.enum(['service', 'database']),
      outageSeconds: z.number().nonnegative(),
      reversible: z.boolean(),
      strategy: z.string(),
      requiresExpiry: z.boolean().optional(),
      /** Reason text the policy engine uses for the outage check. */
      note: z.string(),
    }),
  ),
  policies: z.array(
    z.object({
      id: z.string().regex(/^P-\d{2}$/),
      title: z.string(),
      shortTitle: z.string().optional(),
      appliesTo: z.array(z.string()).min(1),
      rule: PolicyRuleSchema,
      onMatch: z.enum(['required', 'fail']),
    }),
  ),
});

export const ServicesFixtureSchema = z.object({
  services: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(['service', 'database']),
      stack: z.string().optional(),
      engine: z.string().optional(),
      pods: z.number().int().optional(),
      maxConnections: z.number().optional(),
      dependsOn: z.array(z.string()),
    }),
  ),
});

export const FixturesSchema = z.object({
  metrics: MetricsFixtureSchema,
  logs: LogsFixtureSchema,
  traces: TracesFixtureSchema,
  deploys: DeploysFixtureSchema,
  diff: DiffFixtureSchema,
  runbooks: RunbooksFixtureSchema,
  policies: PoliciesFixtureSchema,
  services: ServicesFixtureSchema,
});

export type Fixtures = z.output<typeof FixturesSchema>;
export type PolicyRule = z.output<typeof PolicyRuleSchema>;
export type PoliciesFixture = z.output<typeof PoliciesFixtureSchema>;
