import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'engine',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-fixture.ts', 'src/index.ts'],
      thresholds: { lines: 90 },
    },
  },
});
