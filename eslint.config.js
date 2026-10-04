import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-offline/**',
      '**/dist-aws/**',
      '**/dist-lambda/**',
      '**/cdk.out/**',
      '**/coverage/**',
      'deck/out/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // Deck scripts run in Node; page.evaluate callbacks run in the browser.
    files: ['deck/*.mjs'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', window: 'readonly', document: 'readonly' },
    },
  },
  {
    // Build scripts run in Node.
    files: ['apps/*/scripts/*.mjs'],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly' } },
  },
  {
    // The engine must stay deterministic (CLAUDE.md §3.3).
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in prng.ts.' },
        { object: 'Date', property: 'now', message: 'The engine must not read the wall clock.' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
);
