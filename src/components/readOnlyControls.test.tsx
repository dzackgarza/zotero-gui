import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import ErrorBoundary from '../ErrorBoundary';
import SidebarCollections from './SidebarCollections';
import InspectorPanel from './InspectorPanel';
import LibraryTable from './LibraryTable';
import { useLibraryTable } from '../useLibraryTable';
import type { AdvancedSearchSettings, Collection, ZoteroItem } from '../types';

// Harness that builds the real headless table engine and renders LibraryTable
// against it, exercising the composed TanStack table rather than a fake.
function LibraryTableHarness({
  items,
  expandedItems,
  onOpenAttachment,
}: {
  items: ZoteroItem[];
  expandedItems: Set<string>;
  onOpenAttachment: (attachmentId: string) => void;
}) {
  const table = useLibraryTable(items);
  return (
    <LibraryTable
      table={table}
      theme="code-dark"
      tableClass=""
      selectedItemId={null}
      expandedItems={expandedItems}
      searchSettings={searchSettings}
      onSelectItem={vi.fn()}
      onOpenAttachment={onOpenAttachment}
      onResetFilters={vi.fn()}
      onToggleExpand={vi.fn()}
    />
  );
}

const searchSettings: AdvancedSearchSettings = {
  query: '',
  matchCase: false,
  fuzzyThreshold: 0.5,
  matchType: 'all',
  searchFields: {
    title: true,
    creators_compact: true,
    publicationTitle: true,
    date: true,
    citekey: true,
  },
};

const collections: Collection[] = [
  { id: 'root', name: 'Root' },
  { id: 'child', name: 'Child', parentId: 'root' },
];

const item: ZoteroItem = {
  id: 'ITEM123',
  itemType: 'journalArticle',
  title: 'Read Mostly Zotero',
  creators: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }],
  publicationTitle: 'Collected Notes',
  date: '1843',
  citekey: 'lovelace1843',
  tags: ['zotero'],
  notes: [{
    id: 'NOTE123',
    note: 'Read this attached Zotero note.\nIt has a second line.',
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-19T00:00:00Z',
  }],
  attachments: [{
    id: 'ATTACH12',
    title: 'Local PDF',
    mimeType: 'application/pdf',
    path: 'storage:paper.pdf',
  }],
  collections: ['child'],
  dateAdded: '2026-06-18T00:00:00Z',
  dateModified: '2026-06-18T00:00:00Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const startupOk = (): Response => jsonResponse({ zotero: { running: true } });

// Representative library payload: one journal article that lives in a real
// Zotero collection key. Driving Add-Item while that collection is selected
// proves the App composes the live collection key into the outbound import
// payload (not a hardcoded empty array).
function libraryWithCollection(): Response {
  return jsonResponse({
    items: [{
      id: 'ITEM_LIB',
      itemType: 'journalArticle',
      title: 'Small gaps between primes',
      creators: [{ firstName: 'James', lastName: 'Maynard', creatorType: 'author' }],
      date: '2015',
      publicationTitle: 'Annals of Mathematics',
      tags: [],
      notes: [],
      attachments: [],
      collections: ['COLL_NT'],
      dateAdded: '2026-06-18T00:00:00Z',
      dateModified: '2026-06-18T00:00:00Z',
    }],
    collections: [{ id: 'COLL_NT', name: 'Number theory', parentId: undefined }],
  });
}

// Representative resolver manifest served at the /api/resolver-plugins seam.
// The id chosen here is what the App must forward verbatim as resolverId; the
// test asserts the captured request carries exactly this id.
function resolverManifest(): Response {
  return jsonResponse([{
    id: 'crossref-doi',
    name: 'Crossref DOI',
    acceptedInputs: [{
      id: 'doi',
      label: 'DOI',
      example: '10.1090/noti1234',
      pattern: '^10\\.',
    }],
  }]);
}

// Valid CreatedItemResponse so the success path runs to completion (modal
// closes, library reloads). A malformed body would fail the schema parse and
// the success branch would never fire.
function createdItemResponse(): Response {
  return jsonResponse({ key: 'NEWKEY01', itemId: 4242, title: 'Resolved Paper' });
}

// URL-routing fetch stub: the legitimate server-route seam. Each endpoint
// returns its own representative response regardless of call interleaving, and
// every call is recorded so the test can inspect the outbound request the App
// actually composed for the import route.
function installRoutingFetchStub(): Array<{ url: string; init?: RequestInit }> {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchStub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url === '/api/startup') return Promise.resolve(startupOk());
    if (url === '/api/library') return Promise.resolve(libraryWithCollection());
    if (url === '/api/resolver-plugins') return Promise.resolve(resolverManifest());
    if (url === '/api/items/from-source') return Promise.resolve(createdItemResponse());
    throw new Error(`Unexpected fetch to ${url}`);
  });
  vi.stubGlobal('fetch', fetchStub);
  return calls;
}

describe('read-only GUI controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('routes the top-bar Add-Item action through the real identifier-ingestion request', async () => {
    const calls = installRoutingFetchStub();

    render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );

    // Drive the real composition: select a real collection so the import target
    // is a live collection key, then open the Add-Item modal from the top bar.
    fireEvent.click(await screen.findByText('Number theory'));
    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    // The modal must hydrate its plugin options from the resolver seam.
    await screen.findByRole('option', { name: 'Crossref DOI' });
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByRole('combobox'), { target: { value: 'crossref-doi' } });
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '10.1090/noti1234' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Item' }));

    // A correctly-wired App emits exactly one POST to the owned ingestion route.
    // A dead callback, wrong handler, or non-routing path emits none and fails.
    await waitFor(() => {
      expect(
        calls.filter(call => call.url === '/api/items/from-source'),
      ).toHaveLength(1);
    });

    const importCall = calls.find(call => call.url === '/api/items/from-source');
    if (importCall?.init === undefined) {
      throw new Error('Add-Item did not issue an /api/items/from-source request');
    }
    expect(importCall.init.method).toBe('POST');
    expect(JSON.parse(String(importCall.init.body))).toEqual({
      resolverId: 'crossref-doi',
      input: '10.1090/noti1234',
      collections: ['COLL_NT'],
    });

    // Read-only contract: the Add-Item affordance is identifier ingestion only,
    // never a local item-type creation menu.
    expect(screen.queryByText('Journal Article')).not.toBeInTheDocument();
    expect(screen.queryByText('Conference Paper')).not.toBeInTheDocument();
  });

  it('renders collections without a local collection creation callback', () => {
    render(
      <SidebarCollections
        collections={collections}
        selectedCollectionId="root"
        onSelectCollection={vi.fn()}
        items={[item]}
        selectedTag={null}
        onSelectTag={vi.fn()}
        theme="code-dark"
      />,
    );

    expect(screen.getByText('Root')).toBeInTheDocument();
    expect(screen.queryByText('New Collection')).not.toBeInTheDocument();
    expect(screen.queryByText('Unfiled Items')).not.toBeInTheDocument();
    expect(screen.queryByText('Trash bin')).not.toBeInTheDocument();
  });

  it('renders the inspector without local duplicate or trash actions', () => {
    render(
      <InspectorPanel
        item={item}
        allItems={[item]}
        onClose={vi.fn()}
        onOpenAttachment={vi.fn()}
        theme="code-dark"
      />,
    );

    expect(screen.queryByText('Duplicate record')).not.toBeInTheDocument();
    expect(screen.queryByText('Move to Trash')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete permanently')).not.toBeInTheDocument();
  });

  it('renders attached note text and routes inspector attachment opens', () => {
    const onOpenAttachment = vi.fn();

    render(
      <InspectorPanel
        item={item}
        allItems={[item]}
        onClose={vi.fn()}
        onOpenAttachment={onOpenAttachment}
        theme="code-dark"
      />,
    );

    expect(screen.getByText('Attached Note')).toBeInTheDocument();
    expect(screen.getByText(/Read this attached Zotero note/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open/i }));

    expect(onOpenAttachment).toHaveBeenCalledWith('ATTACH12');
  });

  it('launches attachments from expanded library table attachment rows', () => {
    const onOpenAttachment = vi.fn();

    render(
      <LibraryTableHarness
        items={[item]}
        expandedItems={new Set([item.id])}
        onOpenAttachment={onOpenAttachment}
      />,
    );

    fireEvent.click(screen.getByText('Local PDF'));

    expect(onOpenAttachment).toHaveBeenCalledWith('ATTACH12');
  });
});
