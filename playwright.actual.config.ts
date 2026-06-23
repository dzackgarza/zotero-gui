import { defineConfig } from '@playwright/test';

const frontendUrl = 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e-actual',
  outputDir: 'test-results/e2e-actual',
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: frontendUrl,
    screenshot: 'on',
    trace: 'on',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'just dev',
    url: frontendUrl,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
