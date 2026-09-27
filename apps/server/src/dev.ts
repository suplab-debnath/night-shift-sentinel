// Local entry: `tsx src/dev.ts [--mode=live-mock|live-bedrock]`. Reads the repo .env if present.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, type AgentMode } from './config';
import { buildServer } from './http/fastify';

const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const modeArg = process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) as AgentMode | undefined;
const config = loadConfig(process.env, modeArg ? { mode: modeArg } : {});
const app = buildServer(config, { logger: true });

app.listen({ port: config.port, host: '127.0.0.1' }).then(() => {
  const b = config.mode === 'live-bedrock' ? (config.modelId ? 'model configured' : 'BEDROCK_MODEL_ID is not set: every beat will fall back') : '';
  app.log.info(`Night Shift server: ${config.mode} on http://127.0.0.1:${config.port} ${b}`);
});
