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

// Real collection keys present in the live collection list, excluding the
// synthetic view sentinels. A view sentinel ('all', 'duplicates', ...) is
// never a real Zotero collection key even though the server prepends a
// synthetic { id: 'all' } collection for sidebar rendering.
function isRealCollectionKey(collections: { id: string }[], id: string): boolean {
  return !isLibraryViewSentinel(id) && collections.some(collection => collection.id === id);
}

// The value passed to the Add-by-identifier modal as `collections`, which the
// server forwards verbatim as collection_keys to the Zotero write plugin.
//
// When the active selection is a real collection key, import targets that
// collection. When the active selection is a view sentinel (My Library / All
// or any derived view), import targets the library root: the empty array is
// the real Zotero semantic for "no collection". A sentinel id must never reach
// the write plugin as a collection key.
export function selectModalImportCollections(
  collections: { id: string }[],
  selectedCollectionId: string,
): string[] {
  return isRealCollectionKey(collections, selectedCollectionId) ? [selectedCollectionId] : [];
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
