import { describe, expect, it } from 'vitest';
import { CollectionSchema } from './schemas';
import {
  LIBRARY_VIEW_SENTINELS,
  isLibraryViewSentinel,
  reconcileSelectedLibraryView,
  selectModalImportCollections,
} from './libraryViews';
import type { Collection } from './types';

// The sidebar selection id is the internal numeric collectionID (as a string);
// the real Zotero collection key is the separate alphanumeric `key`. They are
// deliberately distinct here so the import-boundary test proves it carries the
// key, never the selection id.
const collections: Collection[] = [
  // The server prepends this synthetic My Library view as a fake collection.
  { kind: 'library-root', id: 'all', name: 'My Library' },
  { kind: 'real', id: '100', name: 'Number theory', key: 'NTKEY100' },
  { kind: 'real', id: '101', name: 'Geometry', parentId: '100', key: 'GEOKEY101' },
];

describe('library view sentinels', () => {
  it('classifies every sidebar view id as a sentinel and real selection ids as non-sentinels', () => {
    for (const sentinel of LIBRARY_VIEW_SENTINELS) {
      expect(isLibraryViewSentinel(sentinel)).toBe(true);
    }
    expect(isLibraryViewSentinel('100')).toBe(false);
    expect(isLibraryViewSentinel('101')).toBe(false);
  });
});

describe('selectModalImportCollections', () => {
  it('imports to the library root (no collection) for the default My Library view', () => {
    // 'all' is present in collections only as the synthetic My Library view, so
    // the membership check alone would wrongly forward it; it must yield [].
    expect(selectModalImportCollections(collections, 'all')).toEqual([]);
  });

  it('imports to the library root for every derived view sentinel', () => {
    expect(selectModalImportCollections(collections, 'duplicates')).toEqual([]);
    expect(selectModalImportCollections(collections, 'no-pdf')).toEqual([]);
    expect(selectModalImportCollections(collections, 'no-extraction')).toEqual([]);
    expect(selectModalImportCollections(collections, 'nonstandard-citekey')).toEqual([]);
  });

  it('imports into the selected collection using its real Zotero key, not the numeric selection id', () => {
    // Selection id 100 -> real key NTKEY100; selection id 101 -> real key
    // GEOKEY101. The numeric id must never be what is forwarded.
    expect(selectModalImportCollections(collections, '100')).toEqual(['NTKEY100']);
    expect(selectModalImportCollections(collections, '101')).toEqual(['GEOKEY101']);
  });

  it('imports to the library root when the selection is not a present collection', () => {
    expect(selectModalImportCollections(collections, '999')).toEqual([]);
  });

  it('rejects a real collection without a key at the schema boundary, so a keyless real collection never reaches the import path', () => {
    // The previously-optional key let a keyless real collection flow to the
    // import boundary, where only a runtime guard stopped it. The discriminated
    // contract now rejects it at the parse boundary: a real collection missing
    // its key fails to parse, so it can never reach selectModalImportCollections.
    // (A keyless real collection is also a compile-time error: the literal
    // `{ kind: 'real', id, name }` does not type-check because `key` is required.)
    const keylessReal = { kind: 'real', id: '100', name: 'Keyless Collection' };
    const result = CollectionSchema.safeParse(keylessReal);
    expect(result.success).toBe(false);

    // The synthetic library-root view legitimately has no key and parses fine.
    const libraryRoot = { kind: 'library-root', id: 'all', name: 'My Library' };
    expect(CollectionSchema.safeParse(libraryRoot).success).toBe(true);

    // A real collection WITH a key parses, and the parsed value carries the key
    // to the import boundary verbatim.
    const realWithKey = CollectionSchema.parse({
      kind: 'real',
      id: '100',
      name: 'Number theory',
      key: 'NTKEY100',
    });
    expect(selectModalImportCollections([realWithKey], '100')).toEqual(['NTKEY100']);
  });
});

describe('reconcileSelectedLibraryView', () => {
  it('keeps a valid real collection selection unchanged', () => {
    expect(reconcileSelectedLibraryView(collections, '101')).toBe('101');
  });

  it('keeps every view sentinel selection unchanged', () => {
    for (const sentinel of LIBRARY_VIEW_SENTINELS) {
      expect(reconcileSelectedLibraryView(collections, sentinel)).toBe(sentinel);
    }
  });

  it('resets a stale collection selection to the My Library root view', () => {
    const afterReload: Collection[] = [
      { kind: 'library-root', id: 'all', name: 'My Library' },
      { kind: 'real', id: '100', name: 'Number theory', key: 'NTKEY100' },
    ];
    // 101 was dropped by the reload; the stale id must reconcile to 'all'.
    expect(reconcileSelectedLibraryView(afterReload, '101')).toBe('all');
  });
});
