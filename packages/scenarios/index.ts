// Registered scenarios, validated at import time.
import { parseAgents, parseScenario, type AgentDef, type AgentsFile, type Scenario } from '@night-shift/engine';
import scenarioJson from './premium-run/scenario.json';
import agentsJson from './premium-run/agents.json';
import metrics from './premium-run/fixtures/metrics.json';
import deploys from './premium-run/fixtures/deploys.json';
import runbooks from './premium-run/fixtures/runbooks.json';
import policies from './premium-run/fixtures/policies.json';
import services from './premium-run/fixtures/services.json';
import governance from './premium-run/fixtures/governance.json';
import { FixturesSchema, type Fixtures } from './src/fixtures';

export * from './src/fixtures';

export const SCENARIO_IDS = ['premium-run'] as const;
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

export const premiumRun: ScenarioBundle = bundle('premium-run', scenarioJson, agentsJson, {
  metrics,
  deploys,
  runbooks,
  policies,
  services,
  governance,
});

const REGISTRY: Record<ScenarioId, ScenarioBundle> = { 'premium-run': premiumRun };

export function getScenario(id: string): ScenarioBundle | undefined {
  return (REGISTRY as Record<string, ScenarioBundle>)[id];
}
