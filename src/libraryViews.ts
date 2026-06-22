import type { Collection, RealCollection } from './types';

// Single source of truth for UI-only "library view" sentinel ids and their
// active-view display names.
//
// These ids name views the UI renders in the sidebar (My Library / All, plus
// the derived diagnostic views). They are NOT real Zotero collection keys:
// no collection with one of these ids exists in the Zotero database. The
// server prepends a synthetic { id: 'all', name: 'My Library' } collection so
// the sidebar can render it, but 'all' is still a view, not a collection.
//
// The display name is the title shown for the active view (e.g. the TopBar's
// active-collection name). Pairing each id with its name here means the
// sentinel id list and the name list cannot diverge: the id set is DERIVED from
// the keys of this map, so there is exactly one place that enumerates the
// sentinels. Every site that needs "is this id a view?" or "what is this view
// called?" must reference this map instead of re-hardcoding either list.
const LIBRARY_VIEW_SENTINEL_NAMES = {
  all: 'My Library',
  duplicates: 'Duplicate Entries',
  'no-pdf': 'No PDF Attachment',
  'no-extraction': 'No Extraction',
  'nonstandard-citekey': 'Nonstandard Citation Key',
} as const;

export type LibraryViewSentinel = keyof typeof LIBRARY_VIEW_SENTINEL_NAMES;

export const LIBRARY_VIEW_SENTINELS = Object.keys(
  LIBRARY_VIEW_SENTINEL_NAMES,
) as readonly LibraryViewSentinel[];

const SENTINEL_SET: ReadonlySet<string> = new Set(LIBRARY_VIEW_SENTINELS);

// The id selected by default when the app opens or when a stale selection is
// reconciled: the My Library root view.
export const DEFAULT_LIBRARY_VIEW: LibraryViewSentinel = 'all';

export function isLibraryViewSentinel(id: string): id is LibraryViewSentinel {
  return SENTINEL_SET.has(id);
}

// The display name of the active view: a sentinel's name from the single source
// above, or a present real collection's own name. An id that is neither a known
// sentinel nor a present collection is an invariant violation (the same id set
// selectItemsForCollection accepts), so it FAILS LOUD instead of silently
// labelling an unhandled id as "My Library" and masking the missing case.
export function selectActiveViewName(
  collections: readonly { id: string; name: string }[],
  selectedCollectionId: string,
): string {
  if (isLibraryViewSentinel(selectedCollectionId)) {
    return LIBRARY_VIEW_SENTINEL_NAMES[selectedCollectionId];
  }
  const found = collections.find(collection => collection.id === selectedCollectionId);
  if (found === undefined) {
    throw new Error(
      `Cannot name unknown library view or collection id: ${selectedCollectionId}`,
    );
  }
  return found.name;
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
  if (isLibraryViewSentinel(selectedCollectionId)) return [];
  const collection = collections.find(
    (candidate): candidate is RealCollection =>
      candidate.kind === 'real' && candidate.id === selectedCollectionId,
  );
  if (collection === undefined) return [];
  return [collection.key];
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
  if (isLibraryViewSentinel(selectedCollectionId)) return selectedCollectionId;
  if (collections.some(collection => collection.id === selectedCollectionId)) return selectedCollectionId;
  return DEFAULT_LIBRARY_VIEW;
}
