import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { clientStorageKey } from './clientStorage';
import { DEFAULT_COLUMNS } from './data/samples';
import { PALETTE_SEARCH_KEYS } from './utils/fuzzy';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function libraryResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function startupResponse(status = 200, kind = 'zotero_unavailable'): Response {
  if (status === 200) {
    return new Response(JSON.stringify({ zotero: { running: true } }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({
    error: {
      kind,
      message: 'Zotero write plugin version check failed with HTTP 502',
    },
  }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderAppWithFetchResponses(...responses: Response[]): void {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

function renderAppWithLibraryResponse(response: Response): void {
  renderAppWithFetchResponses(startupResponse(), response);
}

describe('App library loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows a spinner while the initial database load is pending', () => {
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)));
    render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('status', { name: /loading zotero database/i })).toBeInTheDocument();
    expect(screen.getByText('Loading Zotero database')).toBeInTheDocument();
  });

  it('renders Zotero library items returned by /api/library', async () => {
    renderAppWithLibraryResponse(libraryResponse({
      items: [{
        id: 'ITEM123',
        itemType: 'journalArticle',
        title: 'Small gaps between primes',
        creators: [{ firstName: 'James', lastName: 'Maynard', creatorType: 'author' }],
        date: '2015',
        publicationTitle: 'Annals of Mathematics',
        tags: ['prime number'],
        notes: [],
        attachments: [],
        collections: ['COLL123'],
        dateAdded: '2026-06-18T00:00:00Z',
        dateModified: '2026-06-18T00:00:00Z',
      }],
      collections: [{
        id: 'COLL123',
        name: 'Number theory',
        parentId: undefined,
      }],
    }));

    expect(await screen.findByText('Small gaps between primes')).toBeInTheDocument();
    expect(screen.getByText('Maynard')).toBeInTheDocument();
  });

  it('fails loud on outdated persisted column state instead of silently resetting', () => {
    // A column layout persisted by an earlier schema (the old hand-rolled
    // array-of-columns shape) under the live storage key no longer matches the
    // current versioned contract. No-fallback policy: this must surface the
    // ErrorBoundary, not silently revert to DEFAULT_COLUMNS — a silent reset
    // would discard the user's saved layout and hide the contract break.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    localStorage.setItem(clientStorageKey('columns'), JSON.stringify([
      { key: 'title', visible: true, width: 280 },
      { key: 'creators_compact', visible: true, width: 180 },
    ]));

    renderAppWithLibraryResponse(libraryResponse({
      items: [{
        id: 'ITEM123',
        itemType: 'book',
        title: 'Persisted State Regression',
        creators: [],
        tags: [],
        notes: [],
        attachments: [],
        collections: [],
        dateAdded: '2026-06-18T00:00:00Z',
        dateModified: '2026-06-18T00:00:00Z',
      }],
      collections: [],
    }));

    expect(screen.getByText('Application Render Error')).toBeInTheDocument();
    expect(screen.queryByText('Persisted State Regression')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('surfaces /api/library HTTP failures instead of corrupting item state', async () => {
    renderAppWithLibraryResponse(libraryResponse({
      error: {
        kind: 'internal_error',
        message: 'Database query failed',
      },
    }, 500));

    expect(await screen.findByText('Zotero Library Load Failed')).toBeInTheDocument();
    expect(screen.getByText('Database query failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload library/i })).toBeInTheDocument();
  });

  it('rejects malformed /api/library payloads before rendering with non-array state', async () => {
    renderAppWithLibraryResponse(libraryResponse({ error: 'Database query failed' }));

    expect(await screen.findByText('Zotero Library Load Failed')).toBeInTheDocument();
    expect(screen.getByText(/items/)).toBeInTheDocument();
  });

  it('reconciles a stale selected collection after a reload drops it instead of crashing', async () => {
    const itemInCollection = {
      itemType: 'journalArticle' as const,
      creators: [],
      tags: [],
      notes: [],
      attachments: [],
      dateAdded: '2026-06-21T00:00:00Z',
      dateModified: '2026-06-21T00:00:00Z',
    };

    renderAppWithFetchResponses(
      // Initial load: a collection the user can select.
      startupResponse(),
      libraryResponse({
        items: [
          { ...itemInCollection, id: 'ITEM_IN', title: 'Selected Collection Paper', collections: ['COLL_GONE'] },
          { ...itemInCollection, id: 'ITEM_OTHER', title: 'Other Library Paper', collections: [] },
        ],
        collections: [{ id: 'COLL_GONE', name: 'Soon Deleted', parentId: undefined }],
      }),
      // Reload triggered by the sync button: the previously-selected collection
      // no longer exists in the live library.
      startupResponse(),
      libraryResponse({
        items: [
          { ...itemInCollection, id: 'ITEM_OTHER', title: 'Other Library Paper', collections: [] },
        ],
        collections: [],
      }),
    );

    // Select the collection that will be dropped by the reload.
    fireEvent.click(await screen.findByText('Soon Deleted'));
    expect(await screen.findByText('Selected Collection Paper')).toBeInTheDocument();

    // Trigger the live reload that drops the selected collection.
    fireEvent.click(screen.getByRole('button', { name: /sync library now/i }));

    // The stale selection must reconcile to My Library (All) and render the
    // surviving library, never surface the ErrorBoundary crash screen.
    expect(await screen.findByText('Other Library Paper')).toBeInTheDocument();
    expect(screen.queryByText('Application Render Error')).not.toBeInTheDocument();
  });

  it('reloads the library after Zotero is started', async () => {
    renderAppWithFetchResponses(
      startupResponse(502),
      startupResponse(),
      libraryResponse({
        items: [{
          id: 'ITEM123',
          itemType: 'book',
          title: 'Reloaded Zotero Item',
          creators: [],
          tags: [],
          notes: [],
          attachments: [],
          collections: [],
          dateAdded: '2026-06-21T00:00:00Z',
          dateModified: '2026-06-21T00:00:00Z',
        }],
        collections: [],
      }),
    );

    expect(await screen.findByText('Zotero is not running')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /reload library/i }));

    expect(await screen.findByText('Reloaded Zotero Item')).toBeInTheDocument();
  });
});

describe('App default search-field scoping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // Desync guard: App seeds AdvancedSearchSettings.searchFields from the single
  // canonical key source (PALETTE_SEARCH_KEYS in utils/fuzzy). This proves the
  // *rendered* default-enabled scope equals that source exactly. If a future
  // edit re-hardcodes a divergent default field list in App (the banned
  // split-truth), the checked checkboxes in the Advanced Search modal will no
  // longer match the canonical source and this test fails.
  it('seeds the advanced-search default scope from the canonical palette key source', async () => {
    renderAppWithLibraryResponse(libraryResponse({
      items: [{
        id: 'ITEM_SCOPE',
        itemType: 'journalArticle',
        title: 'Scope Seeding Witness',
        creators: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }],
        date: '1843',
        publicationTitle: 'Scientific Memoirs',
        tags: [],
        notes: [],
        attachments: [],
        collections: [],
        dateAdded: '2026-06-21T00:00:00Z',
        dateModified: '2026-06-21T00:00:00Z',
      }],
      collections: [],
    }));

    await screen.findByText('Scope Seeding Witness');

    fireEvent.click(screen.getByRole('button', { name: /advanced search scopes/i }));

    const canonical = new Set<string>(PALETTE_SEARCH_KEYS);
    // Every default column must render a scope checkbox whose checked state
    // equals canonical membership — no more, no less.
    for (const column of DEFAULT_COLUMNS) {
      const checkbox = screen.getByRole('checkbox', { name: column.label });
      expect(
        (checkbox as HTMLInputElement).checked,
        `Default scope for "${column.label}" (${column.key}) must equal canonical membership`,
      ).toBe(canonical.has(column.key));
    }

    // The enabled scope is exactly the canonical key set (e.g. exactly 5
    // fields), so a re-hardcoded list with extra/missing fields cannot pass.
    const checkedLabels = DEFAULT_COLUMNS
      .filter(column => (screen.getByRole('checkbox', { name: column.label }) as HTMLInputElement).checked)
      .map(column => column.key);
    expect(new Set(checkedLabels)).toEqual(canonical);
  });
});
