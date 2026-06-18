import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import TopBar from './TopBar';
import SidebarCollections from './SidebarCollections';
import InspectorPanel from './InspectorPanel';
import type { AdvancedSearchSettings, Collection, ZoteroItem } from '../types';

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
  notes: [],
  attachments: [],
  collections: ['child'],
  dateAdded: '2026-06-18T00:00:00Z',
  dateModified: '2026-06-18T00:00:00Z',
};

describe('read-only GUI controls', () => {
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
  });

  it('renders the inspector without local duplicate or trash actions', () => {
    render(
      <InspectorPanel
        item={item}
        allItems={[item]}
        onClose={vi.fn()}
        theme="code-dark"
      />,
    );

    const header = screen.getByText('Item Inspector').closest('div');
    if (!header) {
      throw new Error('Inspector header not found');
    }

    expect(within(header.parentElement ?? header).getAllByRole('button')).toHaveLength(2);
    expect(screen.queryByText('Duplicate record')).not.toBeInTheDocument();
    expect(screen.queryByText('Move to Trash')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete permanently')).not.toBeInTheDocument();
  });
});
