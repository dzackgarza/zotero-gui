import * as CSL from 'citeproc';
import Fuse, { type IFuseOptions } from 'fuse.js';
import fold2ascii from 'fold-to-ascii';
import { transliterate } from 'transliteration';
import { ZoteroItem, AdvancedSearchSettings, Creator } from '../types';

const BBT_UNSAFE_CITEKEY_CHARS = /["#%'(),={}~\s\uFFFD]/g;

type CreatorBucket = 'author' | 'editor' | 'translator' | 'collaborator';

function bbtTransliterate(value: string): string {
  return fold2ascii.foldMaintaining(transliterate(value, { unknown: '\uFFFD' }));
}

function stripCreatorName(value: string): string {
  return value.replace(/^"(.*)"$/, '$1');
}

function bbtFamilyName(creator: Creator): string {
  const name = {
    family: stripCreatorName(creator.lastName || ''),
    given: stripCreatorName(creator.firstName || ''),
  };
  CSL.parseParticles(name);
  return bbtTransliterate(name.family);
}

function bbtCreatorBucket(creator: Creator): CreatorBucket {
  const creatorType = creator.creatorType.toLowerCase();

  if (creatorType === 'author') return 'author';
  if (creatorType === 'editor' || creatorType === 'serieseditor') return 'editor';
  if (creatorType === 'translator') return 'translator';
  return 'collaborator';
}

function bbtAuthors(item: ZoteroItem): string[] {
  const buckets: Record<CreatorBucket, string[]> = {
    author: [],
    editor: [],
    translator: [],
    collaborator: [],
  };

  for (const creator of item.creators) {
    const name = bbtFamilyName(creator);
    if (!name) continue;
    buckets[bbtCreatorBucket(creator)].push(name);
  }

  for (const bucket of ['author', 'editor', 'translator', 'collaborator'] as const) {
    if (buckets[bucket].length > 0) return buckets[bucket];
  }

  return [];
}

function bbtAuthorsAlpha(item: ZoteroItem): string {
  const authors = bbtAuthors(item);

  switch (authors.length) {
    case 0:
      return '';
    case 1:
      return authors[0].substring(0, 3);
    case 2:
    case 3:
    case 4:
      return authors.map(author => author.substring(0, 1)).join('');
    default:
      return `${authors.slice(0, 3).map(author => author.substring(0, 1)).join('')}+`;
  }
}

function bbtCleanCitekey(value: string): string {
  return value.replace(BBT_UNSAFE_CITEKEY_CHARS, '').trim();
}

function bbtYearSubstring(item: ZoteroItem): string {
  const year = item.date?.match(/\d{4}/)?.[0] || '';
  return year.slice(2, 6);
}

function fuseOptions(keys: string[], settings: AdvancedSearchSettings): IFuseOptions<ZoteroSearchDocument> {
  return {
    keys,
    threshold: settings.fuzzyThreshold,
    ignoreLocation: true,
    isCaseSensitive: settings.matchCase,
  };
}

/**
 * Mirrors the fixed Better BibTeX formula used by this library: authorsAlpha + year.substring(3,4).
 */
export function getStandardCitekey(item: ZoteroItem): string {
  if (item.creators.length === 0) return '';
  return bbtCleanCitekey(`${bbtAuthorsAlpha(item)}${bbtYearSubstring(item)}`);
}

export interface ZoteroSearchDocument {
  item: ZoteroItem;
  title: string;
  creators_compact: string;
  creators: string;
  publicationTitle: string;
  date: string;
  citekey: string;
  itemType: string;
  volume: string;
  issue: string;
  pages: string;
  publisher: string;
  place: string;
  doi: string;
  url: string;
  isbn: string;
  issn: string;
  accessDate: string;
  language: string;
  abstractNote: string;
  tags: string;
  notes: string;
  dateAdded: string;
  dateModified: string;
  extra: string;
  rights: string;
  archive: string;
  archiveLocation: string;
  callNumber: string;
}

const PALETTE_SEARCH_KEYS = [
  'title',
  'creators_compact',
  'publicationTitle',
  'date',
  'citekey',
] as const;

export function buildZoteroSearchDocuments(items: ZoteroItem[]): ZoteroSearchDocument[] {
  return items.map(item => ({
    item,
    title: item.title,
    creators_compact: formatCreatorsCompact(item.creators),
    creators: formatCreatorsFull(item.creators),
    publicationTitle: item.publicationTitle ?? '',
    date: item.date ?? '',
    citekey: item.citekey ?? '',
    itemType: item.itemType,
    volume: item.volume ?? '',
    issue: item.issue ?? '',
    pages: item.pages ?? '',
    publisher: item.publisher ?? '',
    place: item.place ?? '',
    doi: item.doi ?? '',
    url: item.url ?? '',
    isbn: item.isbn ?? '',
    issn: item.issn ?? '',
    accessDate: item.accessDate ?? '',
    language: item.language ?? '',
    abstractNote: item.abstractNote ?? '',
    tags: item.tags.join(' '),
    notes: item.notes.map(note => note.note).join(' '),
    dateAdded: item.dateAdded,
    dateModified: item.dateModified,
    extra: item.extra ?? '',
    rights: item.rights ?? '',
    archive: item.archive ?? '',
    archiveLocation: item.archiveLocation ?? '',
    callNumber: item.callNumber ?? '',
  }));
}

function enabledSearchKeys(settings: AdvancedSearchSettings): string[] {
  return Object.entries(settings.searchFields)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
}

function rankDocuments(
  documents: ZoteroSearchDocument[],
  query: string,
  keys: string[],
  settings: AdvancedSearchSettings,
): ZoteroSearchDocument[] {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return documents;
  if (keys.length === 0) return [];

  const fuse = new Fuse(documents, fuseOptions(keys, settings));

  if (settings.matchType === 'any') {
    return fuse.search(trimmedQuery).map(result => result.item);
  }

  const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
  const matchingIds = new Set(documents.map(document => document.item.id));
  for (const token of tokens) {
    const tokenMatches = new Set(fuse.search(token).map(result => result.item.item.id));
    for (const id of matchingIds) {
      if (!tokenMatches.has(id)) {
        matchingIds.delete(id);
      }
    }
  }

  return documents.filter(document => matchingIds.has(document.item.id));
}

export function rankZoteroSearchDocumentsForPalette(
  documents: ZoteroSearchDocument[],
  query: string,
): ZoteroSearchDocument[] {
  return rankDocuments(documents, query, [...PALETTE_SEARCH_KEYS], {
    query,
    matchCase: false,
    fuzzyThreshold: 0.35,
    matchType: 'any',
    searchFields: Object.fromEntries(PALETTE_SEARCH_KEYS.map(key => [key, true])),
  });
}

export function filterZoteroItems(
  items: ZoteroItem[],
  settings: AdvancedSearchSettings,
): ZoteroItem[] {
  if (settings.query.trim().length === 0) return items;

  const keys = enabledSearchKeys(settings);
  if (keys.length === 0) return [];

  return rankDocuments(
    buildZoteroSearchDocuments(items),
    settings.query,
    keys,
    settings,
  ).map(document => document.item);
}

/**
 * Render authors list cleanly: e.g. "Vaswani, A. et al." or "Vaswani, Shazeer, Parmar"
 */
export function formatCreatorsCompact(creators: { firstName: string; lastName: string }[]): string {
  if (!creators || creators.length === 0) return '—';
  if (creators.length === 1) return creators[0].lastName;
  if (creators.length === 2) return `${creators[0].lastName} & ${creators[1].lastName}`;
  return `${creators[0].lastName} et al.`;
}

export function formatCreatorsFull(creators: { firstName: string; lastName: string; creatorType: string }[]): string {
  if (!creators || creators.length === 0) return 'No Authors';
  return creators
    .map(c => `${c.lastName}, ${c.firstName} (${c.creatorType})`)
    .join('; ');
}
