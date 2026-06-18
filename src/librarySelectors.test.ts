import { describe, expect, it } from 'vitest';
import {
  countItemsForCollection,
  selectItemsForCollection,
  selectVisibleLibraryItems,
} from './librarySelectors';
import type { AdvancedSearchSettings, Collection, ZoteroItem } from './types';

function searchSettings(query: string): AdvancedSearchSettings {
  return {
    query,
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
}

function item(
  id: string,
  title: string,
  collections: string[],
  tags: string[],
  inTrash: boolean,
): ZoteroItem {
  return {
    id,
    itemType: 'journalArticle',
    title,
    creators: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }],
    publicationTitle: 'Collected Notes',
    date: '1843',
    citekey: id,
    tags,
    notes: [],
    attachments: [],
    collections,
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-18T00:00:00Z',
    inTrash,
  };
}

describe('library selectors', () => {
  const collections: Collection[] = [
    { id: 'root', name: 'Root' },
    { id: 'child', name: 'Child', parentId: 'root' },
    { id: 'grandchild', name: 'Grandchild', parentId: 'child' },
    { id: 'sibling', name: 'Sibling' },
  ];

  const items: ZoteroItem[] = [
    item('root-item', 'Root Algebra', ['root'], ['algebra'], false),
    item('child-item', 'Child Algebra', ['child'], ['algebra'], false),
    item('grandchild-item', 'Grandchild Topology', ['grandchild'], ['topology'], false),
    item('sibling-item', 'Sibling Analysis', ['sibling'], ['analysis'], false),
    item('trashed-grandchild-item', 'Deleted Algebra', ['grandchild'], ['algebra'], true),
  ];

  it('selects collection descendants through grandchildren and uses the same count path', () => {
    const selected = selectItemsForCollection(items, collections, 'root');

    expect(selected.map(selectedItem => selectedItem.id)).toEqual([
      'root-item',
      'child-item',
      'grandchild-item',
    ]);
    expect(countItemsForCollection(items, collections, 'root')).toBe(selected.length);
  });

  it('applies collection tree, tag, search, and sort in one selector path', () => {
    const selected = selectVisibleLibraryItems({
      items,
      collections,
      selectedCollectionId: 'root',
      selectedTag: 'algebra',
      searchSettings: searchSettings('algebra'),
      sortKey: 'title',
      sortDesc: true,
    });

    expect(selected.map(selectedItem => selectedItem.id)).toEqual([
      'root-item',
      'child-item',
    ]);
  });
});
