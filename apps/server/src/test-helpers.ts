import { loadConfig, type ServerConfig } from './config';

export function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return { ...loadConfig({}), mode: 'live-mock', turnTimeoutMs: 2000, concurrency: 3, ...overrides };
}
