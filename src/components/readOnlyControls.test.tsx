import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TopBar from './TopBar';
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

describe('read-only GUI controls', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('routes the top-bar add control only to identifier ingestion', () => {
    const onOpenAddByIdentifier = vi.fn();

    render(
      <TopBar
        searchSettings={searchSettings}
        onChangeSearchSettings={vi.fn()}
        onOpenAdvancedSearch={vi.fn()}
        onOpenPalette={vi.fn()}
        activeCollectionName="My Library"
        onOpenAddByIdentifier={onOpenAddByIdentifier}
        theme="code-dark"
        setTheme={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

    expect(onOpenAddByIdentifier).toHaveBeenCalledOnce();
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
