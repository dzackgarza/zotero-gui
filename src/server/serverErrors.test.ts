import { mkdtempSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LibraryPayload } from '../schemas';
import type { Collection } from '../types';
import { selectModalImportCollections } from '../libraryViews';
import { createApp } from './server';
import type { ResolverExecutionConfig, ResolverPluginConfig } from './resolverPlugins';

let appServer: Server;
let importServer: Server;
let baseUrl: string;
let importEndpoint: string;
let importMode: 'fail' | 'success' = 'fail';
let libraryPayload: LibraryPayload;
let lastImportCollectionKeys: unknown;
let libraryLoadFault: Error | null = null;
let attachmentOpenLogPath: string;
let attachmentOpenerPath: string;

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'zotero-gui-route-'));
}

function writeResolver(dir: string): string {
  const scriptPath = path.join(dir, 'resolver.mjs');
  writeFileSync(scriptPath, 'process.stdout.write("@book{created,title={Created Route Item},author={Doe, Jane}}\\n");');
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

async function getStartup(): Promise<Response> {
  return fetch(`${baseUrl}/api/startup`);
}

async function expectErrorKind(response: Response, status: number, kind: string): Promise<void> {
  expect(response.status).toBe(status);
  const payload = await response.json();
  expect(payload).toMatchObject({ error: { kind } });
}

async function errorMessage(response: Response, status: number, kind: string): Promise<string> {
  expect(response.status).toBe(status);
  const payload = await response.json() as { error: { kind: string; message: string } };
  expect(payload.error.kind).toBe(kind);
  return payload.error.message;
}

describe('/api/items/from-source error semantics', () => {
  beforeAll(async () => {
    const dir = tempDir();
    const resolverPath = writeResolver(dir);
    attachmentOpenLogPath = path.join(dir, 'opened-attachments.log');
    attachmentOpenerPath = writeAttachmentOpener(dir);
    libraryPayload = { items: [], collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }] };

    importServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk as Buffer));
      req.on('end', () => {
      // Capture the collection_keys the write boundary actually receives, so a
      // test can prove the real Zotero collection key (not a numeric id) reached
      // the write plugin. /version (startup check) sends no body.
      if (chunks.length > 0) {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { collection_keys?: unknown };
        lastImportCollectionKeys = body.collection_keys;
      }
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
    });
    const importBaseUrl = await startServer(importServer);
    importEndpoint = `${importBaseUrl}/write`;

    const app = createApp({
      loadLibrary: () => {
        // A genuine internal fault (a non-ApiError thrown deep in the load path)
        // must still classify as 500. The flag injects exactly that real fault
        // through the real route + error middleware.
        if (libraryLoadFault) throw libraryLoadFault;
        return libraryPayload;
      },
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

  it('reports which from-source invariant failed with a distinct, accurate reason per malformed case', async () => {
    importMode = 'success';
    // Three structurally-distinct malformed requests. Each must surface its OWN
    // accurate invalid_request reason naming the violated invariant, not one
    // shared catch-all message. The proof is twofold: every message names its
    // own field/invariant, AND the three messages are mutually distinct (a
    // single catch-all would make them identical).
    const missingInput = await errorMessage(
      await postFromSource({ resolverId: 'fixture', collections: [] }),
      400,
      'invalid_request',
    );
    const missingResolver = await errorMessage(
      await postFromSource({ input: 'ISBN 9780262033848', collections: [] }),
      400,
      'invalid_request',
    );
    const sentinelKey = await errorMessage(
      await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: ['all'] }),
      400,
      'invalid_request',
    );

    // Each reason names the invariant it violated.
    expect(missingInput).toContain('input');
    expect(missingResolver).toContain('resolverId');
    expect(sentinelKey).toContain('collections');
    // The collection-sentinel reason specifically identifies the sentinel/view
    // misuse, not a generic "bad collections" message.
    expect(sentinelKey.toLowerCase()).toContain('sentinel');

    // The three reasons are mutually distinct: a single catch-all message would
    // make any two of these equal.
    expect(new Set([missingInput, missingResolver, sentinelKey]).size).toBe(3);
  });

  it('checks Zotero write plugin availability before startup succeeds', async () => {
    importMode = 'fail';
    await expectErrorKind(await getStartup(), 502, 'zotero_unavailable');

    importMode = 'success';
    const response = await getStartup();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ zotero: { running: true } });
  });

  it('rejects from-source requests whose collection_keys contain a view sentinel', async () => {
    // A sentinel id ('all' and the derived views) is a UI-only library view, not
    // a real Zotero collection key. The UI must never send one as a collection
    // key; if it does, the server rejects it loudly rather than forwarding a
    // non-existent collection to the Zotero write plugin.
    importMode = 'success';
    for (const sentinel of ['all', 'duplicates', 'no-pdf', 'no-extraction', 'nonstandard-citekey']) {
      await expectErrorKind(
        await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [sentinel] }),
        400,
        'invalid_request',
      );
    }
  });

  it('forwards the real Zotero collection key (not the numeric selection id) to the write boundary', async () => {
    importMode = 'success';
    // A live collections payload: the sidebar selection id is the internal
    // numeric collectionID; the real Zotero key is the separate alphanumeric
    // `key`. The import boundary must carry the key.
    const collections: Collection[] = [
      { kind: 'library-root', id: 'all', name: 'My Library' },
      { kind: 'real', id: '100', name: 'Number Theory', key: 'NTKEY100' },
    ];

    // Selecting the real collection by its numeric selection id resolves to the
    // real key through the same composition the UI uses.
    const realImport = selectModalImportCollections(collections, '100');
    lastImportCollectionKeys = undefined;
    await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: realImport });
    expect(lastImportCollectionKeys).toEqual(['NTKEY100']);
    // The numeric selection id must never reach the write plugin.
    expect(lastImportCollectionKeys).not.toContain('100');

    // A My Library (sentinel) selection imports into the library root: an empty
    // collection list.
    const rootImport = selectModalImportCollections(collections, 'all');
    lastImportCollectionKeys = undefined;
    await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: rootImport });
    expect(lastImportCollectionKeys).toEqual([]);
  });

  it('classifies a malformed JSON request body as a 400 invalid_request, not a 500', async () => {
    importMode = 'success';
    // express.json() throws on an unparseable body. That is a client fault and
    // must classify into the API's 400 invalid_request kind by the error's
    // structural identity, not fall through to the catch-all 500.
    const malformed = await fetch(`${baseUrl}/api/items/from-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ this is not valid json',
    });
    await expectErrorKind(malformed, 400, 'invalid_request');
  });

  it('still classifies a genuine internal fault as a 500 internal_error', async () => {
    // A non-ApiError thrown inside the load path is a server fault and must
    // remain a 500 internal_error: the body-parser 400 reclassification must not
    // swallow real internal faults into a client-error code.
    libraryLoadFault = new Error('synthetic internal fault');
    const response = await fetch(`${baseUrl}/api/library`);
    libraryLoadFault = null;
    await expectErrorKind(response, 500, 'internal_error');
  });

  it('classifies a genuine Zotero write-boundary failure as an upstream boundary error', async () => {
    importMode = 'fail';
    await expectErrorKind(
      await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] }),
      502,
      'upstream_boundary_failed',
    );
  });

  it('returns the created item built from the write-boundary result without re-reading the library', async () => {
    importMode = 'success';
    // The freshly-written key is NOT yet visible in the eventually-consistent
    // library snapshot. Success must be determined solely from the authoritative
    // write-boundary result, never from a racy read-back of loadLibrary().
    libraryPayload = { items: [], collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }] };

    const response = await postFromSource({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      key: 'NEWKEY',
      itemId: 9001,
      title: 'Created Route Item',
    });
  });

  it('opens a loaded attachment through the route launcher boundary', async () => {
    libraryPayload = {
      collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
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
        inTrash: false,
      }],
    };

    const response = await openAttachment('ATTACH12');

    expect(response.status).toBe(204);
    expect(await readFile(attachmentOpenLogPath, 'utf8')).toBe('/tmp/zotero-gui-paper.pdf\n');
  });

  it('rejects unknown attachments and attachments without local paths before launching', async () => {
    libraryPayload = {
      collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
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
        inTrash: false,
      }],
    };

    await expectErrorKind(await openAttachment('MISSING12'), 404, 'attachment_not_found');
    await expectErrorKind(await openAttachment('REMOTE12'), 400, 'attachment_path_missing');
  });
});

// SPEC 6: the from-source route must keep the two failure domains distinct.
// A LOCAL resolver-execution failure (the resolver process times out, exits
// nonzero, produces empty/oversized/invalid BibTeX) is a plugin/local fault; a
// failure of the upstream Zotero write plugin is a different domain. Collapsing
// both into one kind makes a plugin bug indistinguishable from a Zotero-side
// failure at the API. These tests prove each domain surfaces its own kind.
describe('/api/items/from-source distinguishes resolver-execution faults from upstream write faults', () => {
  let healthyImportServer: Server;
  let healthyImportEndpoint: string;
  let domainDir: string;

  function successImportServer(): Server {
    return http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk as Buffer));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          operation: 'import_bibtex',
          stage: 'completed',
          version: 'fixture',
          details: { item_count: 1, collection_keys: [], translator_id: 'fixture-translator' },
          item_key: 'OKKEY', item_id: 1, item_keys: ['OKKEY'], item_ids: [1], titles: ['Resolved'],
        }));
      });
    });
  }

  function failingImportServer(): Server {
    return http.createServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('zotero write plugin exploded');
    });
  }

  async function buildApp(resolverPath: string, endpoint: string): Promise<{ server: Server; url: string }> {
    const app = createApp({
      loadLibrary: () => ({ items: [], collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }] }),
      resolverPlugins: [plugin([process.execPath, resolverPath])],
      resolverExecution: execution(domainDir),
      importEndpoint: endpoint,
      fetchImpl: fetch,
      openAttachmentFile: async () => { throw new Error('not used'); },
    });
    return listenApp(app);
  }

  beforeAll(async () => {
    domainDir = tempDir();
    healthyImportServer = successImportServer();
    healthyImportEndpoint = `${await startServer(healthyImportServer)}/write`;
  });

  afterAll(async () => {
    await closeServer(healthyImportServer);
  });

  it('surfaces a resolver-execution fault as resolver_execution_failed even when Zotero would have accepted the write', async () => {
    // The resolver emits invalid BibTeX, so runResolverPlugin fails LOCALLY before
    // any write is attempted. The import server is healthy (success mode), so the
    // only failing boundary is the local resolver: the route must NOT report this
    // as an upstream Zotero write failure.
    const invalidResolver = path.join(domainDir, 'invalid-resolver.mjs');
    writeFileSync(invalidResolver, 'process.stdout.write("this is not bibtex");');
    const { server, url } = await buildApp(invalidResolver, healthyImportEndpoint);
    const response = await fetch(`${url}/api/items/from-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { kind: 'resolver_execution_failed' } });
    await closeServer(server);
  });

  it('surfaces a resolver nonzero-exit fault as resolver_execution_failed', async () => {
    const crashingResolver = path.join(domainDir, 'crashing-resolver.mjs');
    writeFileSync(crashingResolver, 'process.stderr.write("boom"); process.exit(3);');
    const { server, url } = await buildApp(crashingResolver, healthyImportEndpoint);
    const response = await fetch(`${url}/api/items/from-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { kind: 'resolver_execution_failed' } });
    await closeServer(server);
  });

  it('surfaces a genuine upstream Zotero write fault as upstream_boundary_failed, not as a resolver fault', async () => {
    // The resolver is healthy and produces valid BibTeX; only the Zotero write
    // plugin fails. The route must report the UPSTREAM domain, kept distinct from
    // the local resolver-execution domain.
    const healthyResolver = path.join(domainDir, 'healthy-resolver.mjs');
    writeFileSync(healthyResolver, 'process.stdout.write("@book{ok,title={OK Title},author={Doe, Jane}}\\n");');
    const brokenImport = failingImportServer();
    const brokenEndpoint = `${await startServer(brokenImport)}/write`;
    const { server, url } = await buildApp(healthyResolver, brokenEndpoint);
    const response = await fetch(`${url}/api/items/from-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { kind: 'upstream_boundary_failed' } });
    await closeServer(server);
    await closeServer(brokenImport);
  });

  it('surfaces a TRANSPORT failure of the Zotero write endpoint as upstream_boundary_failed, not internal_error', async () => {
    // The resolver is healthy and produces valid BibTeX, so the local pipeline
    // succeeds. The fault is that the upstream Zotero write endpoint is
    // UNREACHABLE: the fetch to it rejects at the transport layer (connection
    // refused) instead of returning a non-ok HTTP response. A transport failure
    // reaching the upstream write boundary is the SAME fault domain as an HTTP
    // error response from it, so it must surface as upstream_boundary_failed (502)
    // — not collapse into the catch-all internal_error (500), which would mislabel
    // a Zotero-side outage as a local server bug.
    const healthyResolver = path.join(domainDir, 'healthy-resolver-transport.mjs');
    writeFileSync(healthyResolver, 'process.stdout.write("@book{ok,title={OK Title},author={Doe, Jane}}\\n");');

    // Bind a real server to obtain a live ephemeral port, then close it. A fetch
    // to that now-closed port produces a genuine ECONNREFUSED transport rejection
    // at the real boundary — no mock, no fault injection into the route.
    const deadServer = http.createServer();
    const deadBaseUrl = await startServer(deadServer);
    await closeServer(deadServer);
    const unreachableEndpoint = `${deadBaseUrl}/write`;

    const { server, url } = await buildApp(healthyResolver, unreachableEndpoint);
    const response = await fetch(`${url}/api/items/from-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] }),
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { kind: 'upstream_boundary_failed' } });
    await closeServer(server);
  });
});

// The Zotero write-boundary result schema (ZoteroImportResultSchema) guarantees a
// non-empty item_key (z.string().min(1)). That guarantee is exactly what makes the
// diagnostic's old item_keys[0] fallback dead code: by the time the created key is
// read, the schema parse inside importBibTeXToZotero has already rejected any
// result without a non-empty item_key. This test proves the guarantee at the real
// boundary: a write-boundary response carrying an empty item_key must fail loudly
// (the schema parse throws), never silently produce a created item. With that
// guarantee proven, reading result.item_key directly is the only correct read and
// the fallback was unreachable.
describe('/api/items/from-source enforces the write-boundary item_key guarantee', () => {
  let badResultDir: string;

  function emptyKeyImportServer(): Server {
    return http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      // A structurally-valid success response EXCEPT item_key is empty, violating
      // ZoteroImportResultSchema's item_key: z.string().min(1).
      res.end(JSON.stringify({
        success: true,
        operation: 'import_bibtex',
        stage: 'completed',
        version: 'fixture',
        details: { item_count: 1, collection_keys: [], translator_id: 'fixture-translator' },
        item_key: '',
        item_id: 1,
        item_keys: [''],
        item_ids: [1],
        titles: ['Resolved'],
      }));
    });
  }

  beforeAll(() => {
    badResultDir = tempDir();
  });

  it('fails loud (does not return a created item) when the write boundary omits a non-empty item_key', async () => {
    const resolverPath = writeResolver(badResultDir);
    const importServerEmpty = emptyKeyImportServer();
    const endpoint = `${await startServer(importServerEmpty)}/write`;
    const app = createApp({
      loadLibrary: () => ({ items: [], collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }] }),
      resolverPlugins: [plugin([process.execPath, resolverPath])],
      resolverExecution: execution(badResultDir),
      importEndpoint: endpoint,
      fetchImpl: fetch,
      openAttachmentFile: async () => { throw new Error('not used'); },
    });
    const { server, url } = await listenApp(app);

    const response = await fetch(`${url}/api/items/from-source`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: 'ISBN 9780262033848', resolverId: 'fixture', collections: [] }),
    });

    // The malformed result must NOT yield a 200 created-item response: the empty
    // item_key fails the schema parse, so the route surfaces an error rather than
    // a fabricated success. (A schema parse failure is a server-side contract
    // violation -> internal_error 500.)
    expect(response.status).toBe(500);
    const payload = await response.json() as { error: { kind: string }; key?: string };
    expect(payload.error.kind).toBe('internal_error');
    expect(payload.key).toBeUndefined();

    await closeServer(server);
    await closeServer(importServerEmpty);
  });
});

// A LOCAL attachment-open failure (the file is gone at open time, or the local
// launcher exits nonzero) is a server-side LOCAL fault domain. It is NOT the
// upstream Zotero write boundary, which only the from-source import path touches.
// Surfacing a local launcher failure as upstream_boundary_failed (502) would
// mislabel a local file/launcher problem as a Zotero-side outage. These tests
// prove the route classifies an attachment-open launch failure by its real
// (local) fault domain, distinct from the upstream write boundary.
describe('/api/attachments/:id/open surfaces a local launch failure as a local fault, not upstream', () => {
  let faultDir: string;

  // A real local launcher that always exits nonzero: this is the genuine
  // production failure shape (xdg-open could not open the file), driven through
  // the real execFile boundary — no mock, no fault injection into the route.
  function failingLauncherPath(): string {
    const scriptPath = path.join(faultDir, 'failing-launcher.mjs');
    writeFileSync(scriptPath, 'process.stderr.write("launcher could not open file"); process.exit(1);');
    return scriptPath;
  }

  async function buildApp(launcherPath: string): Promise<{ server: Server; url: string }> {
    const app = createApp({
      loadLibrary: () => ({
        collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
        items: [{
          id: 'ITEM_FAULT',
          itemType: 'book',
          title: 'Attachment Fault Item',
          creators: [],
          tags: [],
          notes: [],
          attachments: [{
            id: 'ATTACHFA',
            title: 'Local PDF',
            mimeType: 'application/pdf',
            path: '/tmp/zotero-gui-missing.pdf',
          }],
          collections: [],
          dateAdded: '2026-06-20T00:00:00Z',
          dateModified: '2026-06-20T00:00:00Z',
          inTrash: false,
        }],
      }),
      resolverPlugins: [],
      resolverExecution: execution(faultDir),
      importEndpoint: 'http://127.0.0.1:1/write',
      fetchImpl: fetch,
      // The attachment HAS a local path, so it passes pre-launch validation. The
      // launch itself fails because the real local launcher exits nonzero — a
      // genuine local-fault-domain failure.
      openAttachmentFile: attachment => new Promise<void>((resolve, reject) => {
        if (!attachment.path) {
          reject(new Error(`Attachment ${attachment.id} has no local file path`));
          return;
        }
        execFile(process.execPath, [launcherPath, attachment.path], (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
    });
    return listenApp(app);
  }

  beforeAll(() => {
    faultDir = tempDir();
  });

  it('classifies a local launcher failure as attachment_open_failed (local), never upstream_boundary_failed', async () => {
    const { server, url } = await buildApp(failingLauncherPath());
    const response = await fetch(`${url}/api/attachments/ATTACHFA/open`, { method: 'POST' });
    const payload = await response.json() as { error: { kind: string; message: string } };

    // The fault is local (the launcher exited nonzero), so it must NOT be
    // labeled with the upstream Zotero write boundary kind.
    expect(payload.error.kind).not.toBe('upstream_boundary_failed');
    // It surfaces under the local attachment-open fault kind with a local-fault
    // status (a server-side local operation failed, not a bad upstream gateway).
    expect(payload.error.kind).toBe('attachment_open_failed');
    expect(response.status).toBe(500);
    await closeServer(server);
  });
});
