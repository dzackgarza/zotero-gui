import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { loadAppConfig } from './src/server/config.js';

const frontendUrl = 'http://127.0.0.1:3000';
const e2eConfig = loadAppConfig(path.resolve(process.cwd(), 'zotero-gui.e2e.config.json'));
const fixtureApiUrl = `http://127.0.0.1:${e2eConfig.server.port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: frontendUrl,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bunx tsx tests/e2e/fixture-api.ts',
      url: `${fixtureApiUrl}/__e2e/ready`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'bunx vite --mode e2e --port=3000 --host=127.0.0.1 --force',
      url: frontendUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
