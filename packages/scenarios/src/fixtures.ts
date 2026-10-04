// zod schemas for fixture files. Fixtures are the facts live mode is grounded
// on (SCENARIO §1, §9), so they are validated as strictly as the script.
import { z } from 'zod';

const hms = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

/** A metric series for decks and live facts (D-081): one row per time, named numeric columns. */
export const MetricsFixtureSchema = z.object({
  series: z.array(z.object({ t: hms }).catchall(z.number())).min(1),
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
  // Governance (D-079): code changes, and untrusted text in tool output.
  z.object({ type: z.literal('review-required'), reviewers: z.string().min(1) }),
  z.object({ type: z.literal('checks-passed'), checks: z.array(z.string()).min(1) }),
  z.object({ type: z.literal('untrusted-input') }),
  // A named role must approve when the action changes what customers pay (D-081).
  z.object({ type: z.literal('premium-change'), approver: z.string().min(1) }),
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
      /** The action changes what a customer pays (insurance premium rules). */
      changesPremium: z.boolean().optional(),
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

/** The morning-after pull request and the poisoned log sample (D-079). */
export const GovernanceFixtureSchema = z.object({
  pullRequest: z.object({
    number: z.number().int().positive(),
    service: z.string(),
    branch: z.string(),
    base: z.string(),
    title: z.string(),
    files: z.array(z.object({ file: z.string(), unified: z.string() })).min(1),
    testsAdded: z.number().int().nonnegative(),
    ciRun: z.number().int().positive(),
    checks: z.array(z.object({ id: z.string(), label: z.string(), result: z.enum(['pass', 'fail']), detail: z.string() })).min(1),
    guidelines: z.array(z.string()).min(1),
    reviewers: z.string(),
    canMerge: z.literal(false),
  }),
  untrustedInput: z.object({ source: z.string(), field: z.string(), lines: z.array(z.string()).min(1) }),
});

export const FixturesSchema = z.object({
  metrics: MetricsFixtureSchema,
  deploys: DeploysFixtureSchema,
  runbooks: RunbooksFixtureSchema,
  policies: PoliciesFixtureSchema,
  services: ServicesFixtureSchema,
  governance: GovernanceFixtureSchema,
});

export type Fixtures = z.output<typeof FixturesSchema>;
export type PolicyRule = z.output<typeof PolicyRuleSchema>;
export type PoliciesFixture = z.output<typeof PoliciesFixtureSchema>;
