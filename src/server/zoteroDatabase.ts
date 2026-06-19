import { DatabaseSync } from 'node:sqlite';
import type { LibraryPayload } from '../schemas';
import { assertZoteroDatabaseContract, queryLibrary } from './zoteroRepository.js';

export function loadLibraryFromDatabaseUri(databaseUri: string): LibraryPayload {
  const db = new DatabaseSync(databaseUri);
  try {
    assertZoteroDatabaseContract(db);
    return queryLibrary(db);
  } finally {
    db.close();
  }
}
