import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/engine', 'packages/scenarios', 'apps/server', 'apps/web', 'infra'],
  },
});
