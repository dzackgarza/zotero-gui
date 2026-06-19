import * as CSL from 'citeproc';
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

/**
 * Fuzzy match score calculation (simple Jaro-Winkler like subsequence score or token subset check)
 */
export function fuzzyMatches(text: string, query: string, matchCase: boolean = false): boolean {
  if (!query) return true;
  if (!text) return false;

  let t = matchCase ? text : text.toLowerCase();
  let q = matchCase ? query : query.toLowerCase();

  // If query is an exact substring, easily return true
  if (t.includes(q)) return true;

  // Word token checking (all words must match partially)
  const queryTokens = q.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;

  return queryTokens.every(token => t.includes(token));
}

/**
 * Mirrors the fixed Better BibTeX formula used by this library: authorsAlpha + year.substring(3,4).
 */
export function getStandardCitekey(item: ZoteroItem): string {
  if (item.creators.length === 0) return '';
  return bbtCleanCitekey(`${bbtAuthorsAlpha(item)}${bbtYearSubstring(item)}`);
}

export function filterZoteroItems(
  items: ZoteroItem[],
  settings: AdvancedSearchSettings
): ZoteroItem[] {
  const query = settings.query.trim();
  if (!query) return items;

  return items.filter(item => {
    const fieldsToSearch: string[] = [];

    Object.entries(settings.searchFields).forEach(([key, enabled]) => {
      if (!enabled) return;

      if ((key === 'title') && item.title) {
        fieldsToSearch.push(item.title);
      } else if ((key === 'creators_compact' || key === 'authors') && item.creators) {
        item.creators.forEach(c => {
          fieldsToSearch.push(`${c.firstName} ${c.lastName}`);
          fieldsToSearch.push(c.lastName);
        });
      } else if ((key === 'publicationTitle' || key === 'publication') && item.publicationTitle) {
        fieldsToSearch.push(item.publicationTitle);
      } else if ((key === 'abstractNote' || key === 'abstract') && item.abstractNote) {
        fieldsToSearch.push(item.abstractNote);
      } else if (key === 'tags' && item.tags) {
        fieldsToSearch.push(...item.tags);
      } else if (key === 'notes' && item.notes) {
        item.notes.forEach(n => fieldsToSearch.push(n.note));
      } else if ((key === 'date' || key === 'year') && item.date) {
        fieldsToSearch.push(item.date);
      } else {
        const val = item[key as keyof ZoteroItem];
        if (typeof val === 'string') {
          fieldsToSearch.push(val);
        } else if (typeof val === 'number') {
          fieldsToSearch.push(String(val));
        }
      }
    });

    // Evaluate match logic: 'all' (AND) vs 'any' (OR)
    if (settings.matchType === 'all') {
      const queryTokens = settings.query.split(/\s+/).filter(Boolean);
      return queryTokens.every(token => {
        return fieldsToSearch.some(field => fuzzyMatches(field, token, settings.matchCase));
      });
    } else {
      return fieldsToSearch.some(field => fuzzyMatches(field, query, settings.matchCase));
    }
  });
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
