import { describe, expect, it } from 'vitest';
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
  { id: 'all', name: 'My Library' },
  { id: '100', name: 'Number theory', key: 'NTKEY100' },
  { id: '101', name: 'Geometry', parentId: '100', key: 'GEOKEY101' },
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

  it('fails loud when a selected real collection has no resolvable Zotero key', () => {
    const keyless: Collection[] = [
      { id: 'all', name: 'My Library' },
      { id: '100', name: 'Keyless Collection' },
    ];
    expect(() => selectModalImportCollections(keyless, '100')).toThrow();
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
      { id: 'all', name: 'My Library' },
      { id: '100', name: 'Number theory', key: 'NTKEY100' },
    ];
    // 101 was dropped by the reload; the stale id must reconcile to 'all'.
    expect(reconcileSelectedLibraryView(afterReload, '101')).toBe('all');
  });
});
