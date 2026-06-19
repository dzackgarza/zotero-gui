import { mkdtempSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LibraryPayload } from '../schemas';
import { createApp } from './server';
import type { ResolverExecutionConfig, ResolverPluginConfig } from './resolverPlugins';

let appServer: Server;
let importServer: Server;
let baseUrl: string;
let importEndpoint: string;
let importMode: 'fail' | 'success' = 'fail';
let libraryPayload: LibraryPayload;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'zotero-gui-route-'));
}

function writeResolver(dir: string): string {
  const scriptPath = path.join(dir, 'resolver.mjs');
  writeFileSync(scriptPath, 'process.stdout.write("@book{created,title={Created Route Item}}\\n");');
  return scriptPath;
}

function plugin(command: [string, ...string[]]): ResolverPluginConfig {
  return {
    id: 'fixture',
    name: 'Fixture Resolver',
    command,
    acceptedInputs: [{
      id: 'fixture-input',
      label: 'Fixture Input',
      example: 'ISBN 9780262033848',
      pattern: '^ISBN\\s+\\S+$',
    }],
  };
}

function execution(cwd: string): ResolverExecutionConfig {
  return {
    cwd,
    timeoutMs: 1000,
    stdoutByteLimit: 4096,
    stderrByteLimit: 4096,
  };
}

async function startServer(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!(address && typeof address === 'object')) {
        throw new Error('test server must bind to a TCP port');
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

async function listenApp(app: ReturnType<typeof createApp>): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!(address && typeof address === 'object')) {
        throw new Error('app server must bind to a TCP port');
      }
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function postFromSource(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/items/from-source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function expectErrorKind(response: Response, status: number, kind: string): Promise<void> {
  expect(response.status).toBe(status);
  const payload = await response.json();
  expect(payload).toMatchObject({ error: { kind } });
}

describe('/api/items/from-source error semantics', () => {
  beforeAll(async () => {
    const dir = tempDir();
    const resolverPath = writeResolver(dir);
    libraryPayload = { items: [], collections: [{ id: 'all', name: 'My Library' }] };

    importServer = http.createServer((_req, res) => {
      if (importMode === 'fail') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('import failed');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        operation: 'import_bibtex',
        stage: 'completed',
        version: 'fixture',
        details: {
          item_count: 1,
          collection_keys: ['all'],
          translator_id: 'fixture-translator',
        },
        item_key: 'NEWKEY',
        item_id: 9001,
        item_keys: ['NEWKEY'],
        item_ids: [9001],
        titles: ['Created Route Item'],
      }));
    });
    const importBaseUrl = await startServer(importServer);
    importEndpoint = `${importBaseUrl}/write`;

    const app = createApp({
      loadLibrary: () => libraryPayload,
      resolverPlugins: [plugin([process.execPath, resolverPath])],
      resolverExecution: execution(dir),
      importEndpoint,
      fetchImpl: fetch,
    });
    const startedApp = await listenApp(app);
    appServer = startedApp.server;
    baseUrl = startedApp.url;
  });

  afterAll(async () => {
    await closeServer(appServer);
    await closeServer(importServer);
  });

  it('classifies invalid request, unknown resolver, and rejected input before resolver execution', async () => {
    await expectErrorKind(await postFromSource({ resolverId: 'fixture', collections: [] }), 400, 'invalid_request');
    await expectErrorKind(
      await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'missing', collections: [] }),
      404,
      'resolver_not_found',
    );
    await expectErrorKind(
      await postFromSource({ input: 'not an isbn', resolverId: 'fixture', collections: [] }),
      400,
      'resolver_input_rejected',
    );
  });

  it('classifies Zotero write failures and created-item visibility failures as upstream boundary errors', async () => {
    importMode = 'fail';
    await expectErrorKind(
      await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: ['all'] }),
      502,
      'upstream_boundary_failed',
    );

    importMode = 'success';
    libraryPayload = { items: [], collections: [{ id: 'all', name: 'My Library' }] };
    await expectErrorKind(
      await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: ['all'] }),
      502,
      'zotero_visibility_failed',
    );
  });
});
