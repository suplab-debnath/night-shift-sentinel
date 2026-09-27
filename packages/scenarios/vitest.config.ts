import { defineProject } from 'vitest/config';

export default defineProject({
  test: { name: 'scenarios', include: ['**/*.test.ts'], exclude: ['node_modules/**'], environment: 'node', passWithNoTests: true },
});
