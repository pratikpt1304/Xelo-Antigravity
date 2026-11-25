import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: 'capture.spec.mjs',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    cwd: '../..',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 30000,
  },
});
