// Registered scenarios, validated at import time.
import { parseAgents, parseScenario, type AgentDef, type AgentsFile, type Scenario } from '@night-shift/engine';
import scenarioJson from './incident-checkout/scenario.json';
import agentsJson from './incident-checkout/agents.json';
import metrics from './incident-checkout/fixtures/metrics.json';
import logs from './incident-checkout/fixtures/logs.json';
import traces from './incident-checkout/fixtures/traces.json';
import deploys from './incident-checkout/fixtures/deploys.json';
import diff from './incident-checkout/fixtures/diff.json';
import runbooks from './incident-checkout/fixtures/runbooks.json';
import policies from './incident-checkout/fixtures/policies.json';
import services from './incident-checkout/fixtures/services.json';
import { FixturesSchema, type Fixtures } from './src/fixtures';

export * from './src/fixtures';

export const SCENARIO_IDS = ['incident-checkout'] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export interface ScenarioBundle {
  id: ScenarioId;
  scenario: Scenario;
  agents: AgentsFile;
  fixtures: Fixtures;
  agentById: (id: string) => AgentDef | undefined;
}

function bundle(id: ScenarioId, scenario: unknown, agents: unknown, fixtures: unknown): ScenarioBundle {
  const parsedAgents = parseAgents(agents);
  return {
    id,
    scenario: parseScenario(scenario),
    agents: parsedAgents,
    fixtures: FixturesSchema.parse(fixtures),
    agentById: (agentId) => parsedAgents.agents.find((a) => a.id === agentId),
  };
}

export const incidentCheckout: ScenarioBundle = bundle('incident-checkout', scenarioJson, agentsJson, {
  metrics,
  logs,
  traces,
  deploys,
  diff,
  runbooks,
  policies,
  services,
});

const REGISTRY: Record<ScenarioId, ScenarioBundle> = { 'incident-checkout': incidentCheckout };

export function getScenario(id: string): ScenarioBundle | undefined {
  return (REGISTRY as Record<string, ScenarioBundle>)[id];
}
