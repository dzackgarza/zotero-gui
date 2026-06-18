import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
        parent: null,
        itemCount: 1,
      }],
    }));

    expect(await screen.findByText('Small gaps between primes')).toBeInTheDocument();
    expect(screen.getByText('Maynard')).toBeInTheDocument();
  });

  it('surfaces /api/library HTTP failures instead of corrupting item state', async () => {
    renderAppWithLibraryResponse(libraryResponse({ error: 'Database query failed' }, 500));

    expect(await screen.findByText('Application Render Error')).toBeInTheDocument();
    expect(screen.getByText('Error: Library API failed with HTTP 500')).toBeInTheDocument();
  });

  it('rejects malformed /api/library payloads before rendering with non-array state', async () => {
    renderAppWithLibraryResponse(libraryResponse({ error: 'Database query failed' }));

    expect(await screen.findByText('Application Render Error')).toBeInTheDocument();
    expect(screen.getByText('Error: Library API payload must contain an items array')).toBeInTheDocument();
  });
});
