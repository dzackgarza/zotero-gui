import { describe, expect, it } from 'vitest';
import {
  countItemsForCollection,
  nonstandardCitekeyItems,
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
  citekey: string | null = id,
): ZoteroItem {
  return {
    id,
    itemType: 'journalArticle',
    title,
    creators: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }],
    publicationTitle: 'Collected Notes',
    date: '1843',
    citekey: citekey === null ? undefined : citekey,
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

  it('accepts generated citekeys with standard disambiguation suffixes', () => {
    const manyAuthorCreators = [
      { firstName: 'Alice', lastName: 'Adams', creatorType: 'author' },
      { firstName: 'Bruno', lastName: 'Baker', creatorType: 'author' },
      { firstName: 'Camille', lastName: 'Clark', creatorType: 'author' },
      { firstName: 'Dorian', lastName: 'Davis', creatorType: 'author' },
      { firstName: 'Emery', lastName: 'Evans', creatorType: 'author' },
    ];
    const moriItems = [
      item('valid-base', 'Mori base citekey', [], [], false, 'Mor19'),
      item('valid-suffix', 'Mori suffix citekey', [], [], false, 'Mor19a'),
      item('valid-uppercase-suffix', 'Mori uppercase suffix citekey', [], [], false, 'MOR19B'),
      item('invalid-full-year', 'Mori full year citekey', [], [], false, 'Mor2019'),
      item('invalid-long-author', 'Mori long author citekey', [], [], false, 'Mori19'),
      item('missing-citekey', 'Mori missing citekey', [], [], false, null),
      item('trashed-invalid', 'Mori trashed citekey', [], [], true, 'Mori2019'),
    ].map(citekeyItem => ({
      ...citekeyItem,
      creators: [{ firstName: 'Shigefumi', lastName: 'Mori', creatorType: 'author' }],
      date: '2019',
    }));
    const citekeyItems = [
      ...moriItems,
      {
        ...item('valid-many-author-suffix', 'Many author suffix citekey', [], [], false, 'abc+20c'),
        creators: manyAuthorCreators,
        date: '2020',
      },
      {
        ...item('invalid-many-author-missing-plus', 'Many author citekey without plus', [], [], false, 'abc20c'),
        creators: manyAuthorCreators,
        date: '2020',
      },
    ];

    expect(nonstandardCitekeyItems(citekeyItems).map(selectedItem => selectedItem.id)).toEqual([
      'invalid-full-year',
      'invalid-long-author',
      'missing-citekey',
      'invalid-many-author-missing-plus',
    ]);
    expect(selectItemsForCollection(citekeyItems, collections, 'nonstandard-citekey').map(selectedItem => selectedItem.id)).toEqual([
      'invalid-full-year',
      'invalid-long-author',
      'missing-citekey',
      'invalid-many-author-missing-plus',
    ]);
  });
});
