import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import ErrorBoundary from './ErrorBoundary';

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

function renderAppWithLibraryResponse(response: Response): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

describe('App library loading', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
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

  it('ignores unversioned persisted column state from earlier browser sessions', async () => {
    localStorage.setItem('zotero_columns', JSON.stringify([
      { key: 'title', label: 'Title', visible: true, width: 280 },
      { key: 'creators_compact', label: 'Creators', visible: true, width: 180 },
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

    expect(await screen.findByText('Persisted State Regression')).toBeInTheDocument();
  });

  it('surfaces /api/library HTTP failures instead of corrupting item state', async () => {
    renderAppWithLibraryResponse(libraryResponse({ error: 'Database query failed' }, 500));

    expect(await screen.findByText('Zotero Library Load Failed')).toBeInTheDocument();
    expect(screen.getByText('Library API failed with HTTP 500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload library/i })).toBeInTheDocument();
  });

  it('rejects malformed /api/library payloads before rendering with non-array state', async () => {
    renderAppWithLibraryResponse(libraryResponse({ error: 'Database query failed' }));

    expect(await screen.findByText('Zotero Library Load Failed')).toBeInTheDocument();
    expect(screen.getByText(/items/)).toBeInTheDocument();
  });
});
