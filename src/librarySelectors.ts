import type { AdvancedSearchSettings, Collection, ZoteroItem } from './types';
import { filterZoteroItems, formatCreatorsCompact, getStandardCitekey } from './utils/fuzzy';

export type SortKey = keyof ZoteroItem | 'creators_compact';

export interface VisibleLibraryItemsInput {
  items: ZoteroItem[];
  collections: Collection[];
  selectedCollectionId: string;
  selectedTag: string | null;
  searchSettings: AdvancedSearchSettings;
  sortKey: SortKey;
  sortDesc: boolean;
}

export function activeLibraryItems(items: ZoteroItem[]): ZoteroItem[] {
  return items.filter(item => !item.inTrash);
}

export function collectionDescendantIds(collections: Collection[], collectionId: string): Set<string> {
  const descendants = new Set<string>();
  const pending = [collectionId];

  while (pending.length > 0) {
    const parentId = pending.pop();
    if (!parentId) {
      throw new Error('Collection traversal reached an empty collection id');
    }

    const children = collections.filter(collection => collection.parentId === parentId);
    children.forEach(child => {
      if (descendants.has(child.id)) {
        throw new Error(`Collection cycle detected at ${child.id}`);
      }
      descendants.add(child.id);
      pending.push(child.id);
    });
  }

  return descendants;
}

export function collectionAndDescendantIds(collections: Collection[], collectionId: string): Set<string> {
  return new Set([collectionId, ...collectionDescendantIds(collections, collectionId)]);
}

export function itemIsInCollectionTree(
  item: ZoteroItem,
  collections: Collection[],
  collectionId: string,
): boolean {
  const collectionIds = collectionAndDescendantIds(collections, collectionId);
  return item.collections.some(itemCollectionId => collectionIds.has(itemCollectionId));
}

export function duplicateItems(items: ZoteroItem[]): ZoteroItem[] {
  const active = activeLibraryItems(items);
  const titleCounts = new Map<string, number>();

  active.forEach(item => {
    const normalizedTitle = item.title.trim().toLowerCase();
    titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) ?? 0) + 1);
  });

  return active.filter(item => {
    const count = titleCounts.get(item.title.trim().toLowerCase());
    if (count === undefined) {
      throw new Error(`Missing duplicate count for item ${item.id}`);
    }
    return count > 1;
  });
}

export function itemsWithoutPdf(items: ZoteroItem[]): ZoteroItem[] {
  return activeLibraryItems(items).filter(item => {
    const hasPdf = item.attachments.some(attachment =>
      attachment.path?.toLowerCase().endsWith('.pdf')
      || attachment.title?.toLowerCase().includes('.pdf')
      || attachment.mimeType === 'application/pdf'
    );
    return !hasPdf;
  });
}

export function itemsWithoutExtraction(items: ZoteroItem[]): ZoteroItem[] {
  return activeLibraryItems(items).filter(item => {
    const hasExtraction = item.attachments.some(attachment =>
      attachment.title?.toLowerCase().includes('extracted.md')
      || attachment.path?.toLowerCase().includes('extracted.md')
    );
    return !hasExtraction;
  });
}

export function nonstandardCitekeyItems(items: ZoteroItem[]): ZoteroItem[] {
  return activeLibraryItems(items).filter(item => {
    const standard = getStandardCitekey(item).toLowerCase().trim();
    const citekey = item.citekey?.toLowerCase().trim();

    if (!standard || !citekey) return true;

    const suffix = citekey.slice(standard.length);
    const matchesStandard = citekey === standard || (citekey.startsWith(standard) && /^[a-z]$/.test(suffix));

    return !matchesStandard;
  });
}

export function selectItemsForCollection(
  items: ZoteroItem[],
  collections: Collection[],
  collectionId: string,
): ZoteroItem[] {
  switch (collectionId) {
    case 'all':
      return activeLibraryItems(items);
    case 'duplicates':
      return duplicateItems(items);
    case 'no-pdf':
      return itemsWithoutPdf(items);
    case 'no-extraction':
      return itemsWithoutExtraction(items);
    case 'nonstandard-citekey':
      return nonstandardCitekeyItems(items);
    default:
      if (!collections.some(collection => collection.id === collectionId)) {
        throw new Error(`Unknown library view or collection id: ${collectionId}`);
      }
      return activeLibraryItems(items).filter(item =>
        itemIsInCollectionTree(item, collections, collectionId)
      );
  }
}

export function countItemsForCollection(
  items: ZoteroItem[],
  collections: Collection[],
  collectionId: string,
): number {
  return selectItemsForCollection(items, collections, collectionId).length;
}

export function selectTagCloud(items: ZoteroItem[], limit: number): [string, number][] {
  const tagCounts = new Map<string, number>();

  activeLibraryItems(items).forEach(item => {
    item.tags.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    });
  });

  return Array.from(tagCounts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit);
}

function sortableValue(item: ZoteroItem, sortKey: SortKey): string {
  if (sortKey === 'creators_compact') {
    return formatCreatorsCompact(item.creators).toLowerCase();
  }

  const value = item[sortKey];
  if (Array.isArray(value)) {
    return value
      .map(entry => typeof entry === 'string' ? entry : JSON.stringify(entry))
      .join(' ')
      .toLowerCase();
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  return value ? String(value).toLowerCase() : '';
}

export function sortLibraryItems(items: ZoteroItem[], sortKey: SortKey, sortDesc: boolean): ZoteroItem[] {
  return [...items].sort((left, right) => {
    const leftValue = sortableValue(left, sortKey);
    const rightValue = sortableValue(right, sortKey);

    if (leftValue < rightValue) {
      return sortDesc ? 1 : -1;
    }
    if (leftValue > rightValue) {
      return sortDesc ? -1 : 1;
    }
    return 0;
  });
}

export function selectVisibleLibraryItems({
  items,
  collections,
  selectedCollectionId,
  selectedTag,
  searchSettings,
  sortKey,
  sortDesc,
}: VisibleLibraryItemsInput): ZoteroItem[] {
  const selectedItems = selectItemsForCollection(items, collections, selectedCollectionId);
  const tagFilteredItems = selectedTag
    ? selectedItems.filter(item => item.tags.includes(selectedTag))
    : selectedItems;
  const searchFilteredItems = filterZoteroItems(tagFilteredItems, searchSettings);

  return sortLibraryItems(searchFilteredItems, sortKey, sortDesc);
}
