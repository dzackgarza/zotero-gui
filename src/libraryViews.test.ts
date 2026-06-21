import { describe, expect, it } from 'vitest';
import {
  LIBRARY_VIEW_SENTINELS,
  isLibraryViewSentinel,
  reconcileSelectedLibraryView,
  selectModalImportCollections,
} from './libraryViews';
import type { Collection } from './types';

const collections: Collection[] = [
  // The server prepends this synthetic My Library view as a fake collection.
  { id: 'all', name: 'My Library' },
  { id: 'COLL123', name: 'Number theory' },
  { id: 'COLL456', name: 'Geometry', parentId: 'COLL123' },
];

describe('library view sentinels', () => {
  it('classifies every sidebar view id as a sentinel and real keys as non-sentinels', () => {
    for (const sentinel of LIBRARY_VIEW_SENTINELS) {
      expect(isLibraryViewSentinel(sentinel)).toBe(true);
    }
    expect(isLibraryViewSentinel('COLL123')).toBe(false);
    expect(isLibraryViewSentinel('COLL456')).toBe(false);
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

  it('imports into the selected real collection key', () => {
    expect(selectModalImportCollections(collections, 'COLL123')).toEqual(['COLL123']);
    expect(selectModalImportCollections(collections, 'COLL456')).toEqual(['COLL456']);
  });

  it('imports to the library root when the selection is not a present collection', () => {
    expect(selectModalImportCollections(collections, 'GONE999')).toEqual([]);
  });
});

describe('reconcileSelectedLibraryView', () => {
  it('keeps a valid real collection selection unchanged', () => {
    expect(reconcileSelectedLibraryView(collections, 'COLL456')).toBe('COLL456');
  });

  it('keeps every view sentinel selection unchanged', () => {
    for (const sentinel of LIBRARY_VIEW_SENTINELS) {
      expect(reconcileSelectedLibraryView(collections, sentinel)).toBe(sentinel);
    }
  });

  it('resets a stale collection selection to the My Library root view', () => {
    const afterReload: Collection[] = [
      { id: 'all', name: 'My Library' },
      { id: 'COLL123', name: 'Number theory' },
    ];
    // COLL456 was dropped by the reload; the stale id must reconcile to 'all'.
    expect(reconcileSelectedLibraryView(afterReload, 'COLL456')).toBe('all');
  });
});
