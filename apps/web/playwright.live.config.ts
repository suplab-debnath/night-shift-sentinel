import { defineConfig, devices } from '@playwright/test';

// P6: the live path end to end with the mock provider (localhost only, no AWS, no Docker).
// Own ports so it never collides with the scripted dev server.
export default defineConfig({
  testDir: './e2e',
  testMatch: /live\.spec\.ts/,
  timeout: 150_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:5175', viewport: { width: 1920, height: 1080 }, ...devices['Desktop Chrome'], deviceScaleFactor: 1 },
  webServer: [
    {
      command: 'npm run start:mock -w @night-shift/server',
      cwd: '../..',
      url: 'http://localhost:8788/api/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: '8788', LIVE_TURN_TIMEOUT_MS: '3000', LIVE_STALL_MS: '6000' },
    },
    {
      command: 'npx vite --mode live --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { NIGHT_SHIFT_API: 'http://localhost:8788' },
    },
  ],
});
