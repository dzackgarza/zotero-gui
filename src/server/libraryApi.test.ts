import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LibraryPayloadSchema } from '../schemas';
import { itemsWithoutPdf } from '../librarySelectors';
import { createApp } from './server';
import { loadValidatedLibrary, ZoteroDatabaseContractError } from './zoteroRepository';

let server: Server;
let baseUrl: string;

function createFixtureDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE libraries (libraryID INTEGER PRIMARY KEY, type TEXT NOT NULL);
    CREATE TABLE itemTypes (itemTypeID INTEGER PRIMARY KEY, typeName TEXT NOT NULL);
    CREATE TABLE items (itemID INTEGER PRIMARY KEY, key TEXT NOT NULL, itemTypeID INTEGER NOT NULL, libraryID INTEGER NOT NULL, dateAdded TEXT NOT NULL, dateModified TEXT NOT NULL);
    CREATE TABLE fields (fieldID INTEGER PRIMARY KEY, fieldName TEXT NOT NULL);
    CREATE TABLE itemDataValues (valueID INTEGER PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE itemData (itemID INTEGER NOT NULL, fieldID INTEGER NOT NULL, valueID INTEGER NOT NULL);
    CREATE TABLE deletedItems (itemID INTEGER PRIMARY KEY);
    CREATE TABLE itemAttachments (itemID INTEGER PRIMARY KEY, parentItemID INTEGER, path TEXT, contentType TEXT);
    CREATE TABLE itemNotes (itemID INTEGER PRIMARY KEY, parentItemID INTEGER, note TEXT);
    CREATE TABLE itemAnnotations (itemID INTEGER PRIMARY KEY, parentItemID INTEGER);
    CREATE TABLE creators (creatorID INTEGER PRIMARY KEY, firstName TEXT NOT NULL, lastName TEXT NOT NULL);
    CREATE TABLE creatorTypes (creatorTypeID INTEGER PRIMARY KEY, creatorType TEXT NOT NULL);
    CREATE TABLE itemCreators (itemID INTEGER NOT NULL, creatorID INTEGER NOT NULL, creatorTypeID INTEGER NOT NULL, orderIndex INTEGER NOT NULL);
    CREATE TABLE tags (tagID INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE itemTags (itemID INTEGER NOT NULL, tagID INTEGER NOT NULL);
    CREATE TABLE collections (collectionID INTEGER PRIMARY KEY, libraryID INTEGER NOT NULL, collectionName TEXT NOT NULL, parentCollectionID INTEGER, key TEXT);
    CREATE TABLE deletedCollections (collectionID INTEGER PRIMARY KEY);
    CREATE TABLE collectionItems (itemID INTEGER NOT NULL, collectionID INTEGER NOT NULL);

    INSERT INTO libraries VALUES (1, 'user'), (2, 'feed');
    INSERT INTO itemTypes VALUES (1, 'book'), (2, 'journalArticle'), (3, 'note'), (4, 'attachment');
    INSERT INTO fields VALUES (1, 'title'), (2, 'date'), (3, 'publisher'), (4, 'url');
    INSERT INTO creatorTypes VALUES (1, 'author');
    INSERT INTO creators VALUES (1, 'Emmy', 'Noether');
    INSERT INTO tags VALUES (1, 'algebraic-geometry'), (2, 'needs-pdf');
    -- Numeric collectionID is deliberately distinct from the alphanumeric real
    -- Zotero key, so a test proving the import boundary carries the key (not the
    -- numeric id) can tell them apart.
    INSERT INTO collections VALUES (100, 1, 'Root Collection', NULL, 'ROOTKEY1'), (101, 1, 'Nested Collection', 100, 'NESTKEY2');

    INSERT INTO items VALUES (1, 'BOOK1234', 1, 1, '2026-01-01 00:00:00', '2026-01-02 00:00:00');
    INSERT INTO itemDataValues VALUES (1, 'Fixture Book'), (2, '2026'), (3, 'Fixture Press'), (4, 'Child Note'), (5, 'Attachment PDF'), (6, 'https://example.test/paper.pdf'), (7, 'Trashed Article'), (8, 'Standalone PDF'), (9, 'https://example.test/standalone.pdf');
    INSERT INTO itemData VALUES (1, 1, 1), (1, 2, 2), (1, 3, 3);
    INSERT INTO itemCreators VALUES (1, 1, 1, 0);
    INSERT INTO itemTags VALUES (1, 1), (1, 2);
    INSERT INTO collectionItems VALUES (1, 101);

    INSERT INTO items VALUES (2, 'NOTE1234', 3, 1, '2026-01-03 00:00:00', '2026-01-04 00:00:00');
    INSERT INTO itemNotes VALUES (2, 1, '<p>Child Note</p>');

    INSERT INTO items VALUES (3, 'ATTACH12', 4, 1, '2026-01-05 00:00:00', '2026-01-06 00:00:00');
    INSERT INTO itemAttachments VALUES (3, 1, 'storage:paper.pdf', 'application/pdf');
    INSERT INTO itemData VALUES (3, 1, 5), (3, 4, 6);

    INSERT INTO items VALUES (5, 'ATTACH99', 4, 1, '2026-01-09 00:00:00', '2026-01-10 00:00:00');
    INSERT INTO itemAttachments VALUES (5, NULL, 'storage:standalone.pdf', 'application/pdf');
    INSERT INTO itemData VALUES (5, 1, 8), (5, 4, 9);

    INSERT INTO items VALUES (4, 'TRASH123', 2, 1, '2026-01-07 00:00:00', '2026-01-08 00:00:00');
    INSERT INTO itemData VALUES (4, 1, 7);
    INSERT INTO deletedItems VALUES (4);
  `);
  return db;
}

// Exercises the single real load path (loadValidatedLibrary) callers use, which
// runs the structural preflight AND the full library pipeline once. A contract
// violation of the given kind must surface as a typed ZoteroDatabaseContractError
// from that one load.
function expectContractFailure(db: DatabaseSync, kind: ZoteroDatabaseContractError['kind']): void {
  try {
    loadValidatedLibrary(db);
  } catch (error) {
    expect(error).toBeInstanceOf(ZoteroDatabaseContractError);
    if (error instanceof ZoteroDatabaseContractError) {
      expect(error.kind).toBe(kind);
    }
    return;
  }
  throw new Error(`expected Zotero DB contract failure ${kind}`);
}

describe('Zotero DB contract preflight', () => {
  it('accepts the supported fixture schema and mapped rows', () => {
    const db = createFixtureDb();
    const payload = loadValidatedLibrary(db);
    expect(payload.items.map(item => item.id)).toEqual(['ATTACH99', 'TRASH123', 'BOOK1234']);
  });

  it('fails before serving when required tables, columns, or field contracts are missing', () => {
    const missingTable = createFixtureDb();
    missingTable.exec('DROP TABLE fields');
    expectContractFailure(missingTable, 'missing_table');

    const missingColumn = createFixtureDb();
    missingColumn.exec(`
      ALTER TABLE items RENAME TO items_old;
      CREATE TABLE items (itemID INTEGER PRIMARY KEY, key TEXT NOT NULL, itemTypeID INTEGER NOT NULL, libraryID INTEGER NOT NULL, dateAdded TEXT NOT NULL);
      INSERT INTO items SELECT itemID, key, itemTypeID, libraryID, dateAdded FROM items_old;
      DROP TABLE items_old;
    `);
    expectContractFailure(missingColumn, 'missing_column');

    const missingField = createFixtureDb();
    missingField.exec("DELETE FROM fields WHERE fieldName = 'url'");
    expectContractFailure(missingField, 'missing_field');
  });

  it('fails before serving on unsupported top-level item types and broken links', () => {
    const unsupportedItemType = createFixtureDb();
    unsupportedItemType.exec(`
      INSERT INTO itemTypes VALUES (99, 'mysteryType');
      INSERT INTO items VALUES (99, 'MYSTERY1', 99, 1, '2026-02-01 00:00:00', '2026-02-02 00:00:00');
    `);
    expectContractFailure(unsupportedItemType, 'unsupported_item_type');

    const brokenCollection = createFixtureDb();
    brokenCollection.exec('UPDATE collections SET parentCollectionID = 999 WHERE collectionID = 101');
    expectContractFailure(brokenCollection, 'broken_link');
  });

  it('fails before serving when representative rows do not match owned row schemas', () => {
    const malformedRows = createFixtureDb();
    // Keep every required column (including key) so the only contract deviation
    // under test is the NULL collectionName, a row-shape violation surfaced by
    // the single library pipeline as invalid_rows (not a missing_column from the
    // structural preflight).
    malformedRows.exec(`
      DELETE FROM collectionItems;
      DELETE FROM collections;
      ALTER TABLE collections RENAME TO collections_old;
      CREATE TABLE collections (collectionID INTEGER PRIMARY KEY, libraryID INTEGER NOT NULL, collectionName TEXT, parentCollectionID INTEGER, key TEXT);
      INSERT INTO collections VALUES (100, 1, NULL, NULL, 'ROOTKEY1');
      DROP TABLE collections_old;
    `);
    expectContractFailure(malformedRows, 'invalid_rows');
  });

  it('maps a top-level item with no title row to an absent title without inventing a placeholder', () => {
    const db = createFixtureDb();
    db.exec(`
      INSERT INTO items VALUES (6, 'NOTITLE1', 1, 1, '2026-03-01 00:00:00', '2026-03-02 00:00:00');
    `);
    const payload = loadValidatedLibrary(db);

    const noTitle = payload.items.find(item => item.id === 'NOTITLE1');
    if (noTitle === undefined) {
      throw new Error('expected the title-less item to survive into the top-level payload');
    }
    expect(noTitle.title).toBeUndefined();
    expect(LibraryPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('fails before serving when a real items date column violates its NOT NULL contract', () => {
    const nullDate = createFixtureDb();
    // Rebuild the items table dropping the dateAdded NOT NULL guard so a null
    // date can be inserted, preserving every existing row so the only contract
    // deviation under test is the null date (not an orphaned child item).
    nullDate.exec(`
      ALTER TABLE items RENAME TO items_old;
      CREATE TABLE items (itemID INTEGER PRIMARY KEY, key TEXT NOT NULL, itemTypeID INTEGER NOT NULL, libraryID INTEGER NOT NULL, dateAdded TEXT, dateModified TEXT NOT NULL);
      INSERT INTO items SELECT itemID, key, itemTypeID, libraryID, dateAdded, dateModified FROM items_old;
      DROP TABLE items_old;
      INSERT INTO items VALUES (7, 'NULLDATE', 1, 1, NULL, '2026-04-02 00:00:00');
    `);
    expectContractFailure(nullDate, 'invalid_rows');
  });

  it('fails before serving when the library contains a standalone note', () => {
    const standaloneNote = createFixtureDb();
    standaloneNote.exec(`
      INSERT INTO items VALUES (8, 'STANDNOT', 3, 1, '2026-05-01 00:00:00', '2026-05-02 00:00:00');
      INSERT INTO itemNotes VALUES (8, NULL, '<p>Orphaned thought</p>');
    `);
    expectContractFailure(standaloneNote, 'standalone_note');
  });

  it('fails before serving when the DB contains more than one non-feed library', () => {
    // The app's item identity is the bare items.key, unique only within a single
    // library, but the library query spans all non-feed libraries. A second
    // non-feed (here, 'group') library makes the bare-key identity ambiguous, so
    // the contract must reject it loudly rather than silently span both.
    const multiLibrary = createFixtureDb();
    multiLibrary.exec("INSERT INTO libraries VALUES (3, 'group')");
    expectContractFailure(multiLibrary, 'multiple_libraries');
  });
});

describe('trashed attachments are excluded from surfacing', () => {
  it('drops a trashed child attachment from its parent and counts the parent as PDF-less', () => {
    const db = createFixtureDb();
    // ATTACH12 is BOOK1234's only (PDF) child attachment in the fixture. Trash it
    // by putting its itemID in deletedItems, exactly as Zotero's Trash does.
    db.exec('INSERT INTO deletedItems VALUES (3)');

    const payload = loadValidatedLibrary(db);
    const book = payload.items.find(item => item.id === 'BOOK1234');
    if (book === undefined) {
      throw new Error('expected BOOK1234 to remain a top-level item');
    }
    // The trashed attachment must not be attached to the parent at all.
    expect(book.attachments).toEqual([]);

    // The no-PDF view counts presence of a PDF attachment; with the only
    // attachment trashed, BOOK1234 has no present PDF and is surfaced as missing.
    const pdfLess = itemsWithoutPdf(payload.items);
    expect(pdfLess.map(item => item.id)).toContain('BOOK1234');
  });

  it('drops a trashed standalone attachment from surfacing', () => {
    const db = createFixtureDb();
    // ATTACH99 (itemID 5) is the fixture's standalone attachment. Trash it.
    db.exec('INSERT INTO deletedItems VALUES (5)');

    const payload = loadValidatedLibrary(db);
    const standalone = payload.items.find(item => item.id === 'ATTACH99');
    if (standalone === undefined) {
      throw new Error('expected the standalone attachment item to remain a top-level item');
    }
    // The trashed standalone attachment must not be surfaced as a present
    // attachment on its own item.
    expect(standalone.attachments).toEqual([]);
  });
});

describe('trashed child notes are excluded from surfacing', () => {
  it('drops a trashed child note from its parent while keeping a non-trashed sibling note', () => {
    const db = createFixtureDb();
    // BOOK1234 (itemID 1) already owns one child note: NOTE1234 (itemID 2).
    // Add a SECOND child note (itemID 9), then trash ONLY the original note by
    // putting its itemID in deletedItems, exactly as Zotero's Trash does. The
    // surviving note proves the query still surfaces non-trashed notes (so the
    // exclusion is targeted, not a blanket drop), and the trashed note proves
    // the deletedItems anti-join is applied symmetrically with attachments.
    db.exec(`
      INSERT INTO itemDataValues VALUES (10, 'Kept Note Body');
      INSERT INTO items VALUES (9, 'NOTE5678', 3, 1, '2026-01-11 00:00:00', '2026-01-12 00:00:00');
      INSERT INTO itemNotes VALUES (9, 1, '<p>Live Note</p>');
      INSERT INTO deletedItems VALUES (2);
    `);

    const payload = loadValidatedLibrary(db);
    const book = payload.items.find(item => item.id === 'BOOK1234');
    if (book === undefined) {
      throw new Error('expected BOOK1234 to remain a top-level item');
    }

    const noteIds = book.notes.map(note => note.id);
    // The trashed note (itemID 2) must be gone; the live note (itemID 9) kept.
    expect(noteIds).toEqual(['9']);
    expect(book.notes[0]?.note).toBe('Live Note');
  });
});

describe('single load runs the library pipeline once', () => {
  it('executes the top-level item query exactly once per validated load', () => {
    const real = createFixtureDb();
    const topLevelItemQueries: string[] = [];
    // Real DatabaseSync wrapped to OBSERVE (not replace) prepared statements:
    // every prepare delegates to the real DB and executes real SQL. We only
    // count preparations of the top-level item SELECT, whose double execution
    // is the exact symptom of validate-then-query running the pipeline twice.
    const observed = new Proxy(real, {
      get(target, property, receiver) {
        if (property === 'prepare') {
          return (sql: string) => {
            if (sql.includes('FROM items i') && sql.includes('AS itemType')) {
              topLevelItemQueries.push(sql);
            }
            return target.prepare(sql);
          };
        }
        return Reflect.get(target, property, receiver) as unknown;
      },
    });

    const payload = loadValidatedLibrary(observed);

    // A correct single-execution load prepares the top-level item query once.
    // The pre-fix validate-then-query path prepared (and ran) it twice.
    expect(topLevelItemQueries).toHaveLength(1);
    // And the single execution still produces the real payload.
    expect(payload.items.map(item => item.id)).toEqual(['ATTACH99', 'TRASH123', 'BOOK1234']);
  });
});

describe('/api/library', () => {
  beforeAll(async () => {
    const db = createFixtureDb();
    const app = createApp({
      loadLibrary: () => loadValidatedLibrary(db),
      resolverPlugins: [],
      resolverExecution: {
        cwd: process.cwd(),
        timeoutMs: 1000,
        stdoutByteLimit: 4096,
        stderrByteLimit: 4096,
      },
      importEndpoint: 'http://127.0.0.1:23119/write',
      fetchImpl: fetch,
      openAttachmentFile: async () => {
        throw new Error('library route test does not launch attachments');
      },
    });
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address();
    if (!(address && typeof address === 'object')) {
      throw new Error('/api/library test server must bind to a TCP port');
    }
    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it('maps fixture SQLite library data through the route payload schema', async () => {
    const response = await fetch(`${baseUrl}/api/library`);
    expect(response.status).toBe(200);
    const payload = LibraryPayloadSchema.parse(await response.json());

    // The sidebar selection id stays the internal numeric collectionID; the real
    // Zotero collection key (collections.key) is published separately as `key`
    // for the import boundary. The synthetic 'all' My Library view has no key.
    expect(payload.collections).toEqual([
      { kind: 'library-root', id: 'all', name: 'My Library' },
      { kind: 'real', id: '100', name: 'Root Collection', key: 'ROOTKEY1' },
      { kind: 'real', id: '101', name: 'Nested Collection', parentId: '100', key: 'NESTKEY2' },
    ]);
    expect(payload.items).toHaveLength(3);
    expect(payload.items[0]).toMatchObject({
      id: 'ATTACH99',
      itemType: 'attachment',
      title: 'Standalone PDF',
      url: 'https://example.test/standalone.pdf',
      attachments: [{
        id: 'ATTACH99',
        title: 'Standalone PDF',
        url: 'https://example.test/standalone.pdf',
        mimeType: 'application/pdf',
        path: 'storage:standalone.pdf',
      }],
    });
    expect(payload.items[1]).toMatchObject({
      id: 'TRASH123',
      itemType: 'journalArticle',
      title: 'Trashed Article',
      inTrash: true,
    });
    expect(payload.items[2]).toMatchObject({
      id: 'BOOK1234',
      itemType: 'book',
      title: 'Fixture Book',
      creators: [{ firstName: 'Emmy', lastName: 'Noether', creatorType: 'author' }],
      tags: ['algebraic-geometry', 'needs-pdf'],
      collections: ['101'],
      notes: [{ id: '2', note: 'Child Note' }],
      attachments: [{
        id: 'ATTACH12',
        title: 'Attachment PDF',
        url: 'https://example.test/paper.pdf',
        mimeType: 'application/pdf',
        path: 'storage:paper.pdf',
      }],
    });
  });
});
