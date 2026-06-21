import type { Collection, RealCollection } from './types';

// Single source of truth for UI-only "library view" sentinel ids.
//
// These ids name views the UI renders in the sidebar (My Library / All, plus
// the derived diagnostic views). They are NOT real Zotero collection keys:
// no collection with one of these ids exists in the Zotero database. The
// server prepends a synthetic { id: 'all', name: 'My Library' } collection so
// the sidebar can render it, but 'all' is still a view, not a collection.
//
// Every site that needs to know "is this id a view rather than a real
// collection key?" must reference this set instead of re-hardcoding the list.
export const LIBRARY_VIEW_SENTINELS = [
  'all',
  'duplicates',
  'no-pdf',
  'no-extraction',
  'nonstandard-citekey',
] as const;

export type LibraryViewSentinel = (typeof LIBRARY_VIEW_SENTINELS)[number];

const SENTINEL_SET: ReadonlySet<string> = new Set(LIBRARY_VIEW_SENTINELS);

// The id selected by default when the app opens or when a stale selection is
// reconciled: the My Library root view.
export const DEFAULT_LIBRARY_VIEW: LibraryViewSentinel = 'all';

export function isLibraryViewSentinel(id: string): id is LibraryViewSentinel {
  return SENTINEL_SET.has(id);
}

// The REAL Zotero collection matching a selected sidebar id, or undefined when
// the id is a view sentinel or no real collection has that id. The sidebar
// selection id is the internal numeric collectionID (as a string); the matched
// real collection carries the real Zotero collection key in its `key` field,
// which the discriminated Collection type guarantees is present.
function selectedRealCollection(
  collections: readonly Collection[],
  selectedCollectionId: string,
): RealCollection | undefined {
  if (isLibraryViewSentinel(selectedCollectionId)) return undefined;
  return collections.find(
    (collection): collection is RealCollection =>
      collection.kind === 'real' && collection.id === selectedCollectionId,
  );
}

// The value passed to the Add-by-identifier modal as `collections`, which the
// server forwards verbatim as collection_keys to the Zotero write plugin.
//
// The Zotero write plugin requires the REAL Zotero collection key
// (collections.key), not the internal numeric collectionID used as the sidebar
// selection id. So a selected real collection imports into that collection's
// real key. When the active selection is a view sentinel (My Library / All or
// any derived view), or the synthetic library-root collection, import targets
// the library root: the empty array is the real Zotero semantic for "no
// collection". A sentinel id must never reach the write plugin as a key.
//
// A keyless real collection is unrepresentable: the discriminated Collection
// type makes `key` non-optional on the real variant and the schema boundary
// rejects a real collection without a key, so a real collection here always
// carries a forwardable key. There is no keyless-real case to defend at runtime.
export function selectModalImportCollections(
  collections: readonly Collection[],
  selectedCollectionId: string,
): string[] {
  const collection = selectedRealCollection(collections, selectedCollectionId);
  if (collection === undefined) return [];
  return [collection.key];
}

// True when the selected id is a valid selection against the given collections:
// either a view sentinel (always renderable) or a real present collection key.
// A stale selection (a collection key that the live library no longer contains)
// is not valid and must be reconciled before it drives view derivation.
export function isSelectableLibraryView(
  collections: { id: string }[],
  selectedCollectionId: string,
): boolean {
  return isLibraryViewSentinel(selectedCollectionId)
    || collections.some(collection => collection.id === selectedCollectionId);
}

// Reconciles a selected collection id against the live collections. A valid
// selection is returned unchanged; a stale selection (a collection that no
// longer exists after a live reload) is reset to the My Library root view so
// the selection is a correct function of live data before it reaches the
// view-derivation selector.
export function reconcileSelectedLibraryView(
  collections: { id: string }[],
  selectedCollectionId: string,
): string {
  return isSelectableLibraryView(collections, selectedCollectionId)
    ? selectedCollectionId
    : DEFAULT_LIBRARY_VIEW;
}
