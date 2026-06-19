import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LibraryPayloadSchema } from '../schemas';
import { createApp } from './server';
import { assertZoteroDatabaseContract, queryLibrary, ZoteroDatabaseContractError } from './zoteroRepository';

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
    CREATE TABLE collections (collectionID INTEGER PRIMARY KEY, libraryID INTEGER NOT NULL, collectionName TEXT NOT NULL, parentCollectionID INTEGER);
    CREATE TABLE deletedCollections (collectionID INTEGER PRIMARY KEY);
    CREATE TABLE collectionItems (itemID INTEGER NOT NULL, collectionID INTEGER NOT NULL);

    INSERT INTO libraries VALUES (1, 'user');
    INSERT INTO itemTypes VALUES (1, 'book'), (2, 'journalArticle'), (3, 'note'), (4, 'attachment');
    INSERT INTO fields VALUES (1, 'title'), (2, 'date'), (3, 'publisher'), (4, 'url');
    INSERT INTO creatorTypes VALUES (1, 'author');
    INSERT INTO creators VALUES (1, 'Emmy', 'Noether');
    INSERT INTO tags VALUES (1, 'algebraic-geometry'), (2, 'needs-pdf');
    INSERT INTO collections VALUES (100, 1, 'Root Collection', NULL), (101, 1, 'Nested Collection', 100);

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

function expectContractFailure(db: DatabaseSync, kind: ZoteroDatabaseContractError['kind']): void {
  try {
    assertZoteroDatabaseContract(db);
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
    assertZoteroDatabaseContract(db);
    const payload = queryLibrary(db);
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
    malformedRows.exec(`
      DELETE FROM collectionItems;
      DELETE FROM collections;
      ALTER TABLE collections RENAME TO collections_old;
      CREATE TABLE collections (collectionID INTEGER PRIMARY KEY, libraryID INTEGER NOT NULL, collectionName TEXT, parentCollectionID INTEGER);
      INSERT INTO collections VALUES (100, 1, NULL, NULL);
      DROP TABLE collections_old;
    `);
    expectContractFailure(malformedRows, 'invalid_rows');
  });
});

describe('/api/library', () => {
  beforeAll(async () => {
    const db = createFixtureDb();
    assertZoteroDatabaseContract(db);
    const app = createApp({
      loadLibrary: () => queryLibrary(db),
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

    expect(payload.collections).toEqual([
      { id: 'all', name: 'My Library' },
      { id: '100', name: 'Root Collection' },
      { id: '101', name: 'Nested Collection', parentId: '100' },
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
