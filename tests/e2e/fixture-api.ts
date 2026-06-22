import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { z } from 'zod';
import type { LibraryPayload } from '../../src/schemas.js';
import { loadAppConfig } from '../../src/server/config.js';
import { loadResolverPlugins } from '../../src/server/resolverPlugins.js';
import { createApp } from '../../src/server/server.js';

type VersionResponse = 'ok' | 'unavailable' | 'pending';
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

interface ScenarioState {
  name: ScenarioName;
  versionResponses: VersionResponse[];
  versionRequestIndex: number;
  libraryResponses: LibraryPayload[];
  libraryRequestIndex: number;
  libraryFaultMessage: string | null;
  imports: unknown[];
}

const ScenarioRequestSchema = z.strictObject({
  scenario: z.enum([
    'ready',
    'startup-pending',
    'library-failure',
    'stale-collection-reload',
    'startup-recovers',
    'attachment-missing-path',
    'add-item',
    'citation-items',
    'toast-timing',
  ]),
});

function itemBase(id: string, title: string): LibraryPayload['items'][number] {
  return {
    id,
    itemType: 'journalArticle',
    title,
    creators: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }],
    date: '1843',
    publicationTitle: 'Scientific Memoirs',
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-06-21T00:00:00Z',
    dateModified: '2026-06-21T00:00:00Z',
    inTrash: false,
  };
}

function readyLibrary(): LibraryPayload {
  return {
    items: [
      {
        ...itemBase('ITEM_READY', 'Small gaps between primes'),
        creators: [{ firstName: 'James', lastName: 'Maynard', creatorType: 'author' }],
        date: '2015',
        publicationTitle: 'Annals of Mathematics',
        tags: ['prime number'],
        collections: ['42'],
      },
    ],
    collections: [
      { kind: 'library-root', id: 'all', name: 'My Library' },
      { kind: 'real', id: '42', name: 'Number theory', key: 'NTKEYAB12' },
    ],
  };
}

function staleCollectionFirstLibrary(): LibraryPayload {
  const base = itemBase('ITEM_IN', 'Selected Collection Paper');
  return {
    items: [
      { ...base, collections: ['COLL_GONE'] },
      { ...itemBase('ITEM_OTHER', 'Other Library Paper'), collections: [] },
    ],
    collections: [
      { kind: 'library-root', id: 'all', name: 'My Library' },
      { kind: 'real', id: 'COLL_GONE', name: 'Soon Deleted', key: 'GONEKEY1' },
    ],
  };
}

function staleCollectionSecondLibrary(): LibraryPayload {
  return {
    items: [{ ...itemBase('ITEM_OTHER', 'Other Library Paper'), collections: [] }],
    collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
  };
}

function reloadedLibrary(): LibraryPayload {
  return {
    items: [{ ...itemBase('ITEM_RELOADED', 'Reloaded Zotero Item'), itemType: 'book' }],
    collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
  };
}

function attachmentMissingPathLibrary(): LibraryPayload {
  return {
    items: [
      {
        ...itemBase('ITEM_ATT', 'Paper With Attachment'),
        attachments: [{
          id: 'ATT_NOPATH',
          title: 'Linked PDF',
          mimeType: 'application/pdf',
        }],
      },
    ],
    collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
  };
}

function citationLibrary(): LibraryPayload {
  return {
    items: [
      {
        ...itemBase('CITABLE_ITEM', 'Citable Journal Paper'),
        creators: [{ firstName: 'Sophie', lastName: 'Germain', creatorType: 'author' }],
        date: '1816',
        publicationTitle: 'Memoires',
      },
      {
        id: 'ATTACHMENT_ITEM',
        itemType: 'attachment',
        title: 'Standalone Attachment File',
        creators: [],
        tags: [],
        notes: [],
        attachments: [],
        collections: [],
        dateAdded: '2026-06-18T00:00:00Z',
        dateModified: '2026-06-18T00:00:00Z',
        inTrash: false,
      },
    ],
    collections: [{ kind: 'library-root', id: 'all', name: 'My Library' }],
  };
}

const SCENARIO_FACTORIES: Record<ScenarioName, () => ScenarioState> = {
  ready: () => scenario('ready', ['ok'], [readyLibrary()], null),
  'startup-pending': () => scenario('startup-pending', ['pending'], [], null),
  'library-failure': () => scenario('library-failure', ['ok'], [], 'Database query failed'),
  'stale-collection-reload': () => scenario('stale-collection-reload', ['ok', 'ok'], [staleCollectionFirstLibrary(), staleCollectionSecondLibrary()], null),
  'startup-recovers': () => scenario('startup-recovers', ['unavailable', 'ok'], [reloadedLibrary()], null),
  'attachment-missing-path': () => scenario('attachment-missing-path', ['ok'], [attachmentMissingPathLibrary(), attachmentMissingPathLibrary()], null),
  'add-item': () => scenario('add-item', ['ok', 'ok'], [readyLibrary(), readyLibrary()], null),
  'citation-items': () => scenario('citation-items', ['ok'], [citationLibrary()], null),
  'toast-timing': () => scenario('toast-timing', ['ok'], [citationLibrary()], null),
};

function scenario(
  name: ScenarioName,
  versionResponses: VersionResponse[],
  libraryResponses: LibraryPayload[],
  libraryFaultMessage: string | null,
): ScenarioState {
  return {
    name,
    versionResponses,
    versionRequestIndex: 0,
    libraryResponses,
    libraryRequestIndex: 0,
    libraryFaultMessage,
    imports: [],
  };
}

let activeScenario = SCENARIO_FACTORIES.ready();

function nextVersionResponse(): VersionResponse {
  const response = activeScenario.versionResponses[activeScenario.versionRequestIndex];
  if (response === undefined) {
    throw new Error(`Scenario ${activeScenario.name} has no remaining startup response.`);
  }
  activeScenario.versionRequestIndex += 1;
  return response;
}

function nextLibraryPayload(): LibraryPayload {
  if (activeScenario.libraryFaultMessage !== null) {
    throw new Error(activeScenario.libraryFaultMessage);
  }
  const payload = activeScenario.libraryResponses[activeScenario.libraryRequestIndex];
  if (payload === undefined) {
    throw new Error(`Scenario ${activeScenario.name} has no remaining library response.`);
  }
  activeScenario.libraryRequestIndex += 1;
  return payload;
}

function versionRoute(_req: Request, res: Response): void {
  const response = nextVersionResponse();
  if (response === 'pending') {
    return;
  }
  if (response === 'unavailable') {
    res.status(502).type('text/plain').send('zotero unavailable');
    return;
  }
  res.type('text/plain').send('fixture-version');
}

function writeRoute(req: Request, res: Response): void {
  activeScenario.imports.push(req.body);
  res.json({
    success: true,
    operation: 'import_bibtex',
    stage: 'completed',
    version: 'fixture',
    details: {
      item_count: 1,
      collection_keys: ['NTKEYAB12'],
      translator_id: 'fixture-translator',
    },
    item_key: 'NEWKEY01',
    item_id: 4242,
    item_keys: ['NEWKEY01'],
    item_ids: [4242],
    titles: ['Resolved Paper'],
  });
}

const config = loadAppConfig(path.resolve(process.cwd(), 'zotero-gui.e2e.config.json'));
const fixture = express();
const resolverPlugins = loadResolverPlugins(config.resolverManifestPath);

fixture.get('/__e2e/ready', (_req, res) => {
  res.json({ ready: true });
});

fixture.post('/__e2e/scenario', express.json(), (req, res) => {
  const request = ScenarioRequestSchema.parse(req.body);
  activeScenario = SCENARIO_FACTORIES[request.scenario]();
  res.json({ scenario: request.scenario });
});

fixture.get('/__e2e/imports', (_req, res) => {
  res.json({ imports: activeScenario.imports });
});

fixture.get('/version', versionRoute);
fixture.post('/write', express.json(), writeRoute);
fixture.use(createApp({
  loadLibrary: nextLibraryPayload,
  resolverPlugins,
  resolverExecution: config.resolverExecution,
  importEndpoint: config.zotero.importEndpoint,
  fetchImpl: fetch,
  openAttachmentFile: async () => {
    throw new Error('fixture attachment opener should not run for missing-path scenarios');
  },
}));

fixture.listen(config.server.port, '127.0.0.1', () => {
  console.log(`Zotero GUI e2e fixture API -> http://127.0.0.1:${config.server.port}`);
});
