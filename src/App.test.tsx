import { fireEvent, render, screen } from '@testing-library/react';
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
