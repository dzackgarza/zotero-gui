import { useEffect, type MouseEvent } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import SidebarCollections from './SidebarCollections';
import InspectorPanel from './InspectorPanel';
import LibraryTable from './LibraryTable';
import { useLibraryTable } from '../useLibraryTable';
import type { AdvancedSearchSettings, Collection, ZoteroItem } from '../types';

const originalWindowOpen = window.open;
const originalClipboard = navigator.clipboard;

function noop(): void {}

function selectItemNoop(_id: string): void {}

function selectCollectionNoop(_id: string): void {}

function selectTagNoop(_tag: string | null): void {}

function openAttachmentNoop(_attachmentId: string): void {}

function resetFiltersNoop(_settings: AdvancedSearchSettings): void {}

function toggleExpandNoop(_id: string, _event: MouseEvent): void {}

function openAttachmentRecorder(): { calls: string[]; fn: (attachmentId: string) => void } {
  const calls: string[] = [];
  return {
    calls,
    fn: (attachmentId: string) => {
      calls.push(attachmentId);
    },
  };
}

function installWindowOpenRecorder(opened: string[]): void {
  Object.defineProperty(window, 'open', {
    configurable: true,
    value: (url?: string | URL) => {
      opened.push(String(url));
      return null;
    },
  });
}

function installClipboardWriter(writeText: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

function restoreClipboard(): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: originalClipboard,
  });
}

function errorEventPayload(event: ErrorEvent): unknown {
  if (event.error !== undefined && event.error !== null) return event.error;
  return event.message;
}

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
      onSelectItem={selectItemNoop}
      onOpenAttachment={onOpenAttachment}
      onResetFilters={resetFiltersNoop}
      onToggleExpand={toggleExpandNoop}
    />
  );
}

// Harness that renders the real LibraryTable with the DOI column made visible
// through the table's own visibility API (the same state path the context-menu
// toggle drives), so the rendered DOI cell and its click handler are the real
// production cell, not a stand-in. A user who has enabled the DOI column and
// clicks a DOI is exactly this path.
function DoiCellHarness({ items }: { items: ZoteroItem[] }) {
  const table = useLibraryTable(items);
  useEffect(() => {
    table.setColumnVisibility(previous => ({ ...previous, doi: true }));
  }, [table]);
  return (
    <LibraryTable
      table={table}
      theme="code-dark"
      tableClass=""
      selectedItemId={null}
      expandedItems={new Set()}
      searchSettings={searchSettings}
      onSelectItem={selectItemNoop}
      onOpenAttachment={openAttachmentNoop}
      onResetFilters={resetFiltersNoop}
      onToggleExpand={toggleExpandNoop}
    />
  );
}

function itemWithDoi(id: string, doi: string): ZoteroItem {
  return {
    id,
    itemType: 'journalArticle',
    title: `Paper ${id}`,
    creators: [],
    doi,
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-18T00:00:00Z',
    inTrash: false,
  };
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
  { kind: 'real', id: 'root', name: 'Root', key: 'ROOTKEY' },
  { kind: 'real', id: 'child', name: 'Child', parentId: 'root', key: 'CHILDKEY' },
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
  inTrash: false,
};

describe('read-only GUI controls', () => {
  afterEach(() => {
    restoreClipboard();
    localStorage.clear();
  });

  it('renders collections without a local collection creation callback', () => {
    render(
      <SidebarCollections
        collections={collections}
        selectedCollectionId="root"
        onSelectCollection={selectCollectionNoop}
        items={[item]}
        selectedTag={null}
        onSelectTag={selectTagNoop}
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
        onClose={noop}
        onOpenAttachment={openAttachmentNoop}
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
    installClipboardWriter((text: string) => {
      written.push(text);
      return Promise.resolve();
    });

    render(
      <InspectorPanel
        item={item}
        allItems={[item]}
        onClose={noop}
        onOpenAttachment={openAttachmentNoop}
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
    installClipboardWriter(() => {
      clipboardWrites += 1;
      return Promise.resolve();
    });
    const captured: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      event.preventDefault();
      captured.push(errorEventPayload(event));
    };
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
      inTrash: false,
    };

    render(
      <InspectorPanel
        item={attachmentItem}
        allItems={[attachmentItem]}
        onClose={noop}
        onOpenAttachment={openAttachmentNoop}
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
    if (header === null) {
      throw new Error('Inspector header region not found.');
    }
    if (header === undefined) {
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
    const onOpenAttachment = openAttachmentRecorder();

    render(
      <InspectorPanel
        item={item}
        allItems={[item]}
        onClose={noop}
        onOpenAttachment={onOpenAttachment.fn}
        theme="code-dark"
      />,
    );

    expect(screen.getByText('Attached Note')).toBeInTheDocument();
    expect(screen.getByText(/Read this attached Zotero note/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /open/i }));

    expect(onOpenAttachment.calls).toEqual(['ATTACH12']);
  });

  it('launches attachments from expanded library table attachment rows', () => {
    const onOpenAttachment = openAttachmentRecorder();

    render(
      <LibraryTableHarness
        items={[item]}
        expandedItems={new Set([item.id])}
        onOpenAttachment={onOpenAttachment.fn}
      />,
    );

    fireEvent.click(screen.getByText('Local PDF'));

    expect(onOpenAttachment.calls).toEqual(['ATTACH12']);
  });
});

describe('library table DOI cell opens a correctly-encoded doi.org URL', () => {
  afterEach(() => {
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: originalWindowOpen,
    });
    localStorage.clear();
  });

  // The user-visible outcome: clicking a DOI opens the DOI's resolver page. The
  // URL the browser is navigated to is what the user actually lands on, so the
  // assertion is on the argument the cell passes to window.open. A DOI suffix may
  // legitimately contain a URI-reserved character; raw interpolation
  // (`https://doi.org/${doi}`) lets that character start the URL query/fragment,
  // so the browser opens the wrong identifier. The cell must percent-encode the
  // suffix (sharing the resolver's single encoding rule) while preserving the
  // structural namespace slash.

  it('opens a plain DOI unchanged so a normal identifier still resolves', () => {
    const opened: string[] = [];
    installWindowOpenRecorder(opened);

    render(<DoiCellHarness items={[itemWithDoi('PLAIN', '10.1090/noti1234')]} />);

    fireEvent.click(screen.getByText('10.1090/noti1234'));

    expect(opened).toEqual(['https://doi.org/10.1090/noti1234']);
  });

  it('percent-encodes a reserved character in the suffix so the right DOI is opened', () => {
    const opened: string[] = [];
    installWindowOpenRecorder(opened);

    render(<DoiCellHarness items={[itemWithDoi('RESERVED', '10.1234/foo?bar')]} />);

    fireEvent.click(screen.getByText('10.1234/foo?bar'));

    // The reserved `?` must travel as path data, not start a query string. Raw
    // interpolation (the pre-fix cell) would open `https://doi.org/10.1234/foo?bar`,
    // whose URL parser drops `bar` into the query and loses it from the path —
    // resolving the wrong identifier.
    expect(opened).toHaveLength(1);
    const opened0 = new URL(opened[0]);
    expect(opened0.pathname).toBe('/10.1234/foo%3Fbar');
    expect(opened0.search).toBe('');
  });
});
