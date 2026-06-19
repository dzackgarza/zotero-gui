import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
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
let attachmentOpenLogPath: string;
let attachmentOpenerPath: string;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'zotero-gui-route-'));
}

function writeResolver(dir: string): string {
  const scriptPath = path.join(dir, 'resolver.mjs');
  writeFileSync(scriptPath, 'process.stdout.write("@book{created,title={Created Route Item}}\\n");');
  return scriptPath;
}

function writeAttachmentOpener(dir: string): string {
  const scriptPath = path.join(dir, 'attachment-opener.mjs');
  writeFileSync(scriptPath, `
import { appendFile } from 'node:fs/promises';

await appendFile(process.argv[2], process.argv[3] + '\\n');
`);
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

async function openAttachment(attachmentId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/attachments/${attachmentId}/open`, { method: 'POST' });
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
    attachmentOpenLogPath = path.join(dir, 'opened-attachments.log');
    attachmentOpenerPath = writeAttachmentOpener(dir);
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
      openAttachmentFile: attachment => new Promise<void>((resolve, reject) => {
        if (!attachment.path) {
          reject(new Error(`Attachment ${attachment.id} has no local file path`));
          return;
        }
        execFile(process.execPath, [attachmentOpenerPath, attachmentOpenLogPath, attachment.path], (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
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

  it('opens a loaded attachment through the route launcher boundary', async () => {
    libraryPayload = {
      collections: [{ id: 'all', name: 'My Library' }],
      items: [{
        id: 'ITEM123',
        itemType: 'book',
        title: 'Attachment Route Item',
        creators: [],
        tags: [],
        notes: [],
        attachments: [{
          id: 'ATTACH12',
          title: 'Paper',
          mimeType: 'application/pdf',
          path: '/tmp/zotero-gui-paper.pdf',
        }],
        collections: [],
        dateAdded: '2026-06-20T00:00:00Z',
        dateModified: '2026-06-20T00:00:00Z',
      }],
    };

    const response = await openAttachment('ATTACH12');

    expect(response.status).toBe(204);
    expect(await readFile(attachmentOpenLogPath, 'utf8')).toBe('/tmp/zotero-gui-paper.pdf\n');
  });

  it('rejects unknown attachments and attachments without local paths before launching', async () => {
    libraryPayload = {
      collections: [{ id: 'all', name: 'My Library' }],
      items: [{
        id: 'ITEM123',
        itemType: 'book',
        title: 'Attachment Route Item',
        creators: [],
        tags: [],
        notes: [],
        attachments: [{
          id: 'REMOTE12',
          title: 'Remote Snapshot',
          mimeType: 'text/html',
          url: 'https://example.test/snapshot',
        }],
        collections: [],
        dateAdded: '2026-06-20T00:00:00Z',
        dateModified: '2026-06-20T00:00:00Z',
      }],
    };

    await expectErrorKind(await openAttachment('MISSING12'), 404, 'attachment_not_found');
    await expectErrorKind(await openAttachment('REMOTE12'), 400, 'attachment_path_missing');
  });
});
