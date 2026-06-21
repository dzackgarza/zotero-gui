import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import ErrorBoundary from '../ErrorBoundary';
import SidebarCollections from './SidebarCollections';
import InspectorPanel from './InspectorPanel';
import LibraryTable from './LibraryTable';
import { KEYBOARD_SHORTCUTS } from '../keyboardShortcuts';
import { useLibraryTable } from '../useLibraryTable';
import type { AdvancedSearchSettings, Collection, ZoteroItem } from '../types';

// cmdk's command list relies on these browser APIs that jsdom omits; supplying
// them lets the real command palette render and be driven exactly as the user
// would. This is environment scaffolding, not a stand-in for app behavior.
class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
});
Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

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
      // In-app membership uses the internal numeric collectionID (as a string).
      collections: ['42'],
      dateAdded: '2026-06-18T00:00:00Z',
      dateModified: '2026-06-18T00:00:00Z',
    }],
    // Sidebar selection id (numeric collectionID) is deliberately distinct from
    // the real Zotero collection key, so the import-composition assertion proves
    // the App forwards the key, never the numeric id.
    collections: [{ id: '42', name: 'Number theory', parentId: undefined, key: 'NTKEYAB12' }],
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
    // The import must carry the real Zotero collection key (NTKEYAB12), not the
    // numeric sidebar selection id (42).
    expect(JSON.parse(String(importCall.init.body))).toEqual({
      resolverId: 'crossref-doi',
      input: '10.1090/noti1234',
      collections: ['NTKEYAB12'],
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

  it('copies BibTeX for a citable selected item via the inspector copy action', async () => {
    // Real clipboard surface at the boundary: a writer that records what the
    // user would actually receive. The assertion is on the copied content, not
    // on a spy call count.
    const written: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: (text: string) => { written.push(text); return Promise.resolve(); } },
    });

    render(
      <InspectorPanel
        item={item}
        allItems={[item]}
        onClose={vi.fn()}
        onOpenAttachment={vi.fn()}
        theme="code-dark"
      />,
    );

    const copyButton = screen.getByRole('button', { name: /bibtex/i });
    fireEvent.click(copyButton);

    // The user-visible outcome: a real BibTeX entry carrying the item's author
    // lands on the clipboard. An attachment-style guard that disabled the action
    // for a citable item would leave the clipboard empty and fail here.
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain('Lovelace');
  });

  it('offers no working BibTeX copy action in the inspector for a non-citable attachment', () => {
    // An attachment is a selectable item but has no bibliographic citation form.
    // The inspector must not offer a copy-citation action that, when activated,
    // tries to cite it. A throwing clipboard writer plus captured window errors
    // are the discriminators: were a copy control present and clickable (as in
    // the pre-fix inspector, where the button was always rendered), activating
    // it would call itemToCsl on the attachment and throw.
    let clipboardWrites = 0;
    Object.assign(navigator, {
      clipboard: {
        writeText: () => { clipboardWrites += 1; return Promise.resolve(); },
      },
    });
    const captured: unknown[] = [];
    const onError = (event: ErrorEvent) => { event.preventDefault(); captured.push(event.error ?? event.message); };
    window.addEventListener('error', onError);

    const attachmentItem: ZoteroItem = {
      id: 'ATT_ITEM',
      itemType: 'attachment',
      title: 'Standalone Scan',
      creators: [],
      tags: [],
      notes: [],
      attachments: [],
      collections: [],
      dateAdded: '2026-06-18T00:00:00Z',
      dateModified: '2026-06-18T00:00:00Z',
    };

    render(
      <InspectorPanel
        item={attachmentItem}
        allItems={[attachmentItem]}
        onClose={vi.fn()}
        onOpenAttachment={vi.fn()}
        theme="code-dark"
      />,
    );

    // The inspector still shows the attachment's metadata: it is a valid
    // selection. (The title appears in both the header and the Title detail
    // field, hence getAllByText.)
    expect(screen.getAllByText('Standalone Scan').length).toBeGreaterThan(0);

    // Activate every header action the user could reach except Close. Pre-fix
    // this hits the always-rendered copy button and throws while citing the
    // attachment; post-fix there is no such control to hit.
    const header = screen.getByText('Item Inspector').closest('div')?.parentElement;
    if (header === null || header === undefined) {
      throw new Error('Inspector header region not found.');
    }
    for (const button of within(header).getAllByRole('button')) {
      if (button.textContent?.includes('✕')) continue;
      fireEvent.click(button);
    }

    window.removeEventListener('error', onError);

    // No citation was ever attempted for the non-citable item: nothing was
    // written to the clipboard and no error escaped.
    expect(clipboardWrites).toBe(0);
    expect(captured).toEqual([]);
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

describe('App APA-citation copy command respects item citability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  // Library with two selectable items: one citable journal article and one
  // standalone attachment. Both appear as rows the user can select.
  function citableAndAttachmentLibrary(): Response {
    return jsonResponse({
      items: [
        {
          id: 'CITABLE_ITEM',
          itemType: 'journalArticle',
          title: 'Citable Journal Paper',
          creators: [{ firstName: 'Sophie', lastName: 'Germain', creatorType: 'author' }],
          date: '1816',
          publicationTitle: 'Mémoires',
          tags: [],
          notes: [],
          attachments: [],
          collections: [],
          dateAdded: '2026-06-18T00:00:00Z',
          dateModified: '2026-06-18T00:00:00Z',
        },
        {
          id: 'ATTACHMENT_ITEM',
          itemType: 'attachment',
          title: 'Standalone Attachment File',
          creators: [],
          tags: [],
          notes: [],
          attachments: [],
          collections: [],
          dateAdded: '2026-06-18T00:00:00Z',
          dateModified: '2026-06-18T00:00:00Z',
        },
      ],
      collections: [],
    });
  }

  function renderAppWithCitationLibrary(): void {
    const fetchStub = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/startup') return Promise.resolve(startupOk());
      if (url === '/api/library') return Promise.resolve(citableAndAttachmentLibrary());
      throw new Error(`Unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchStub);
    render(
      <ErrorBoundary>
        <App />
      </ErrorBoundary>,
    );
  }

  async function runCopyApaCommand(): Promise<void> {
    fireEvent.keyDown(window, {
      key: KEYBOARD_SHORTCUTS.openCommandPalette.key,
      ctrlKey: KEYBOARD_SHORTCUTS.openCommandPalette.modifiers.includes('ctrl'),
      shiftKey: KEYBOARD_SHORTCUTS.openCommandPalette.modifiers.includes('shift'),
      altKey: KEYBOARD_SHORTCUTS.openCommandPalette.modifiers.includes('alt'),
      metaKey: KEYBOARD_SHORTCUTS.openCommandPalette.modifiers.includes('meta'),
    });
    fireEvent.click(await screen.findByText('Copy Selected APA Citation'));
  }

  it('copies an APA citation when a citable item is selected', async () => {
    const written: string[] = [];
    Object.assign(navigator, {
      clipboard: { writeText: (text: string) => { written.push(text); return Promise.resolve(); } },
    });
    renderAppWithCitationLibrary();

    // Select the citable journal article, then run the copy-APA command.
    fireEvent.click(await screen.findByText('Citable Journal Paper'));
    await runCopyApaCommand();

    // The real APA citation carrying the author surname reaches the clipboard.
    await waitFor(() => expect(written).toHaveLength(1));
    expect(written[0]).toContain('Germain');
    expect(screen.queryByText('Application Render Error')).not.toBeInTheDocument();
  });

  it('does not throw or copy a citation when a non-citable attachment is selected', async () => {
    // A throwing writer proves the citation action is never invoked for the
    // attachment: were the guard absent, App would call toFormattedCitation on
    // an attachment, which throws (no CSL type).
    Object.assign(navigator, {
      clipboard: {
        writeText: () => { throw new Error('clipboard must not be written for a non-citable item'); },
      },
    });

    // React surfaces an uncaught throw from an event handler as a window
    // 'error' event (via reportError). Recording those events makes the missing
    // guard a deterministic failure here: if copyCitationFormatted invoked the
    // citation util on the attachment, itemToCsl's throw lands in this list.
    const captured: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      event.preventDefault();
      captured.push(event.error ?? event.message);
    };
    window.addEventListener('error', onError);

    renderAppWithCitationLibrary();

    // Select the standalone attachment, then run the copy-APA command.
    fireEvent.click(await screen.findByText('Standalone Attachment File'));
    await runCopyApaCommand();
    // Let any deferred error dispatch flush before asserting.
    await new Promise(resolve => setTimeout(resolve, 0));

    window.removeEventListener('error', onError);

    // The command was a safe no-op for the non-citable selection: no error was
    // raised, and the library stayed rendered (no ErrorBoundary crash screen).
    expect(captured).toEqual([]);
    expect(screen.getAllByText('Standalone Attachment File').length).toBeGreaterThan(0);
    expect(screen.queryByText('Application Render Error')).not.toBeInTheDocument();
  });
});
