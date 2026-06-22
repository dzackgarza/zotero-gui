import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { loadLibraryFromDatabaseUri } from './zoteroDatabase';

function createMutableFixtureDb(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'zotero-gui-db-loader-'));
  const dbPath = path.join(dir, 'zotero.sqlite');
  const db = new DatabaseSync(dbPath);
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

    INSERT INTO libraries VALUES (1, 'user');
    INSERT INTO itemTypes VALUES (1, 'book');
    INSERT INTO fields VALUES (1, 'title'), (2, 'date'), (3, 'publisher'), (4, 'url');
    INSERT INTO creatorTypes VALUES (1, 'author');
    INSERT INTO creators VALUES (1, 'Emmy', 'Noether');
    INSERT INTO items VALUES (1, 'BOOK1234', 1, 1, '2026-01-01 00:00:00', '2026-01-02 00:00:00');
    INSERT INTO itemDataValues VALUES (1, 'Before Write'), (2, 'After Write'), (3, '2026'), (4, 'Fixture Press');
    INSERT INTO itemData VALUES (1, 1, 1), (1, 2, 3), (1, 3, 4);
    INSERT INTO itemCreators VALUES (1, 1, 1, 0);
  `);
  db.close();
  return dbPath;
}

function replaceTitle(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  db.exec('UPDATE itemData SET valueID = 2 WHERE itemID = 1 AND fieldID = 1');
  db.close();
}

describe('Zotero DB loader', () => {
  it('opens a fresh immutable connection for each read so writes become visible', () => {
    const dbPath = createMutableFixtureDb();
    const dbUri = `file://${dbPath}?immutable=1`;

    expect(loadLibraryFromDatabaseUri(dbUri).items[0]?.title).toBe('Before Write');
    replaceTitle(dbPath);
    expect(loadLibraryFromDatabaseUri(dbUri).items[0]?.title).toBe('After Write');
  });
});
