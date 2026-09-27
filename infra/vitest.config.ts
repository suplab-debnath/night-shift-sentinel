import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'infra', include: ['test/**/*.test.ts'], environment: 'node', testTimeout: 120_000, hookTimeout: 120_000 },
});
