import type { APIRequestContext } from '@playwright/test';
import path from 'node:path';
import { loadAppConfig } from '../../src/server/config.js';

type ScenarioName =
  | 'ready'
  | 'startup-pending'
  | 'library-failure'
  | 'stale-collection-reload'
  | 'startup-recovers'
  | 'attachment-missing-path'
  | 'add-item'
  | 'citation-items'
  | 'toast-timing';

const e2eConfig = loadAppConfig(path.resolve(process.cwd(), 'zotero-gui.e2e.config.json'));
const apiOrigin = `http://127.0.0.1:${e2eConfig.server.port}`;

export function fixtureApiUrl(pathname: string): string {
  return `${apiOrigin}${pathname}`;
}

export async function setFixtureScenario(request: APIRequestContext, scenario: ScenarioName): Promise<void> {
  await request.post(fixtureApiUrl('/__e2e/scenario'), {
    data: { scenario },
  });
}
