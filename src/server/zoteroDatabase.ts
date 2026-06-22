import { DatabaseSync } from 'node:sqlite';
import type { LibraryPayload } from '../schemas';
import { loadValidatedLibrary } from './zoteroRepository.js';

export function loadLibraryFromDatabaseUri(databaseUri: string): LibraryPayload {
  const db = new DatabaseSync(databaseUri);
  try {
    return loadValidatedLibrary(db);
  } finally {
    db.close();
  }
}
