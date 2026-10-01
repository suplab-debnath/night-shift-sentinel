import { defineConfig, devices } from '@playwright/test';

// Uses the pre-installed Chromium; never downloads browsers, never uses Docker.
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    viewport: { width: 1920, height: 1080 },
    ...devices['Desktop Chrome'],
    deviceScaleFactor: 1,
  },
  projects: [
    { name: 'fast', grepInvert: /@realtime/, testIgnore: [/offline\.spec\.ts/, /live\.spec\.ts/] },
    { name: 'realtime', grep: /@realtime/, timeout: 420_000, testIgnore: [/offline\.spec\.ts/, /live\.spec\.ts/] },
    // Runs against apps/web/dist-offline/index.html via file:// (npm run build:offline first).
    { name: 'offline', testMatch: /offline\.spec\.ts/ },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
