import * as CSL from 'citeproc';
import fold2ascii from 'fold-to-ascii';
import { Fzf } from 'fzf';
import { transliterate } from 'transliteration';
import { ZoteroItem, AdvancedSearchSettings, Creator } from '../types';

const BBT_UNSAFE_CITEKEY_CHARS = /["#%'(),={}~\s]/g;

type CreatorBucket = 'author' | 'editor' | 'translator' | 'collaborator';

/**
 * Mirrors Better BibTeX's `clean` transliteration outcome: a name is folded to
 * ASCII, and any character that has no ASCII transliteration does not appear in
 * the derived key. BBT's source achieves this by emitting a U+FFFD replacement
 * sentinel for unknowns and including U+FFFD in its unsafe-character class so
 * the sentinel is later stripped (formatter.ts: `unsafechars = citekeyUnsafeChars
 * + '\uFFFD'`; `citekey.replace(this.re.unsafechars, '')`).
 *
 * We produce the same documented OUTCOME (untransliterable characters omitted)
 * but via an explicit, named omission at the transliteration step
 * (`unknown: ''`) rather than a silent sentinel round-trip. The sentinel path
 * was lossy in two ways this avoids: a multi-code-unit untransliterable
 * character (e.g. U+1D54F, a surrogate pair) corrupted the surrounding ASCII
 * prefix, and a literal U+FFFD already in the source data was stripped
 * indistinguishably from a transliteration miss. Omitting at the transliteration
 * step makes the drop deterministic and keeps the surrounding transliterable
 * letters intact, so U+FFFD is no longer part of the unsafe-character class.
 */
function bbtTransliterate(value: string): string {
  return fold2ascii.foldMaintaining(transliterate(value, { unknown: '' }));
}

function stripCreatorName(value: string): string {
  return value.replace(/^"(.*)"$/, '$1');
}

function bbtFamilyName(creator: Creator): string {
  const name = {
    family: stripCreatorName(creator.lastName),
    given: stripCreatorName(creator.firstName),
  };
  CSL.parseParticles(name);
  return bbtTransliterate(name.family);
}

function bbtCreatorBucket(creator: Creator): CreatorBucket {
  const creatorType = creator.creatorType.toLowerCase();

  if (creatorType === 'author') return 'author';
  if (creatorType === 'editor') return 'editor';
  if (creatorType === 'serieseditor') return 'editor';
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
  if (item.date === undefined) return '';
  const match = item.date.match(/\d{4}/);
  if (match === null) return '';
  return match[0].slice(2, 6);
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
  // Title is legitimately absent for titleless items (the real DB has them).
  // The projection must not fabricate an empty-string title token: an absent
  // title contributes no title term but the item stays searchable by its other
  // fields. Keep this optional so a missing title is a representable data state,
  // not a silent '' default.
  title?: string;
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

type ZoteroSearchKey = Exclude<keyof ZoteroSearchDocument, 'item'>;

const SEARCH_DOCUMENT_KEYS = new Set<ZoteroSearchKey>([
  'title',
  'creators_compact',
  'creators',
  'publicationTitle',
  'date',
  'citekey',
  'itemType',
  'volume',
  'issue',
  'pages',
  'publisher',
  'place',
  'doi',
  'url',
  'isbn',
  'issn',
  'accessDate',
  'language',
  'abstractNote',
  'tags',
  'notes',
  'dateAdded',
  'dateModified',
  'extra',
  'rights',
  'archive',
  'archiveLocation',
  'callNumber',
]);

/**
 * The single source of truth for the "default searchable fields" contract.
 *
 * This is the canonical key subset for two distinct, explicitly-owned ranking
 * modes that both project items through {@link buildZoteroSearchDocuments} and
 * both validate against {@link SEARCH_DOCUMENT_KEYS}:
 *
 *   - The command palette (single-token fzf subsequence ranking, e.g. 'agtf'
 *     matches "Algebraic Geometry and Theta Functions") — see
 *     {@link rankPaletteDocuments}.
 *   - Advanced search's *default* enabled fields (per-whitespace-token fzf
 *     matching combined with token all/any) — App seeds
   *     AdvancedSearchSettings.searchFields from {@link DEFAULT_SEARCH_FIELDS}.
 *
 * Both modes run on the same fuzzy engine (fzf); they differ only in how the
 * query is tokenized and combined (palette: the whole query as one
 * subsequence; advanced search: each whitespace token matched independently
 * and AND/OR-combined). Neither mode owns its own key list: both read this
 * one. Any consumer that needs "the fields searched by default" must derive
 * from here — re-listing the keys elsewhere reintroduces the split-truth this
 * constant exists to eliminate.
 */
export const PALETTE_SEARCH_KEYS = [
  'title',
  'creators_compact',
  'publicationTitle',
  'date',
  'citekey',
] as const;

/**
 * Whether a projection key is in the canonical default-searchable set.
 * App seeds the advanced-search default field toggles from this predicate so
 * the palette key contract and the advanced-search defaults cannot diverge.
 */
export const DEFAULT_SEARCH_FIELDS: ReadonlySet<string> = new Set(PALETTE_SEARCH_KEYS);

function optionalSearchFieldText(value: string | undefined): string {
  if (value === undefined) return '';
  return value;
}

export function buildZoteroSearchDocuments(items: ZoteroItem[]): ZoteroSearchDocument[] {
  return items.map(item => ({
    item,
    title: item.title,
    // The `creators_compact` key is the canonical searchable creator field
    // (it is the creator key in PALETTE_SEARCH_KEYS and the advanced-search
    // column). Its searchable value is the FULL creator text (every creator's
    // first and last name) so a user can find an item by any creator at any
    // position — NOT formatCreatorsCompact's "Lastname et al." display form,
    // which only names the leading author. Display/sort read
    // formatCreatorsCompact directly (columnModel / sortableValue), so they
    // are unaffected by this projection.
    creators_compact: creatorsSearchText(item.creators),
    creators: formatCreatorsFull(item.creators),
    publicationTitle: optionalSearchFieldText(item.publicationTitle),
    date: optionalSearchFieldText(item.date),
    citekey: optionalSearchFieldText(item.citekey),
    itemType: item.itemType,
    volume: optionalSearchFieldText(item.volume),
    issue: optionalSearchFieldText(item.issue),
    pages: optionalSearchFieldText(item.pages),
    publisher: optionalSearchFieldText(item.publisher),
    place: optionalSearchFieldText(item.place),
    doi: optionalSearchFieldText(item.doi),
    url: optionalSearchFieldText(item.url),
    isbn: optionalSearchFieldText(item.isbn),
    issn: optionalSearchFieldText(item.issn),
    accessDate: optionalSearchFieldText(item.accessDate),
    language: optionalSearchFieldText(item.language),
    abstractNote: optionalSearchFieldText(item.abstractNote),
    tags: item.tags.join(' '),
    notes: item.notes.map(note => note.note).join(' '),
    dateAdded: item.dateAdded,
    dateModified: item.dateModified,
    extra: optionalSearchFieldText(item.extra),
    rights: optionalSearchFieldText(item.rights),
    archive: optionalSearchFieldText(item.archive),
    archiveLocation: optionalSearchFieldText(item.archiveLocation),
    callNumber: optionalSearchFieldText(item.callNumber),
  }));
}

function enabledSearchKeys(settings: AdvancedSearchSettings): string[] {
  return Object.entries(settings.searchFields)
    .filter(([, enabled]) => enabled)
    .map(([key]) => key);
}

function searchKey(value: string): ZoteroSearchKey {
  if (SEARCH_DOCUMENT_KEYS.has(value as ZoteroSearchKey)) return value as ZoteroSearchKey;
  throw new Error(`Unsupported Zotero search field: ${value}`);
}

function searchText(document: ZoteroSearchDocument, keys: ZoteroSearchKey[]): string {
  // Absent fields (e.g. a titleless item's title) contribute no term rather
  // than a fabricated empty token.
  return keys
    .map(key => document[key])
    .filter((value): value is string => value !== undefined)
    .join(' ');
}

function rankDocuments(
  documents: ZoteroSearchDocument[],
  query: string,
  keys: ZoteroSearchKey[],
  settings: AdvancedSearchSettings,
): ZoteroSearchDocument[] {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return documents;
  if (keys.length === 0) return [];

  const fzf = new Fzf(documents, {
    selector: document => searchText(document, keys),
    casing: settings.matchCase ? 'case-sensitive' : 'case-insensitive',
    normalize: true,
  });

  // One fuzzy engine (fzf) for both modes. Each whitespace token is matched
  // independently; "all" keeps items every token matches (token-AND), "any"
  // keeps items at least one token matches (token-OR).
  const tokens = trimmedQuery.split(/\s+/).filter(Boolean);
  const matchesByToken = tokens.map(token => new Set(fzf.find(token).map(result => result.item.item.id)));
  const matchesItem = settings.matchType === 'any'
    ? (id: string): boolean => matchesByToken.some(ids => ids.has(id))
    : (id: string): boolean => matchesByToken.every(ids => ids.has(id));

  return documents.filter(document => matchesItem(document.item.id));
}

export function rankZoteroSearchDocumentsForPalette(
  documents: ZoteroSearchDocument[],
  query: string,
): ZoteroSearchDocument[] {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return documents;

  const keys = PALETTE_SEARCH_KEYS.map(searchKey);
  const fzf = new Fzf(documents, {
    selector: document => searchText(document, keys),
    casing: 'case-insensitive',
    normalize: true,
  });

  return fzf.find(trimmedQuery).map(result => result.item);
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
    keys.map(searchKey),
    settings,
  ).map(document => document.item);
}

/**
 * Render authors list cleanly: e.g. "Vaswani, A. et al." or "Vaswani, Shazeer, Parmar"
 */
export function formatCreatorsCompact(creators: { firstName: string; lastName: string }[]): string {
  if (creators.length === 0) return '—';
  if (creators.length === 1) return creators[0].lastName;
  if (creators.length === 2) return `${creators[0].lastName} & ${creators[1].lastName}`;
  return `${creators[0].lastName} et al.`;
}

export function formatCreatorsFull(creators: { firstName: string; lastName: string; creatorType: string }[]): string {
  if (creators.length === 0) return 'No Authors';
  return creators
    .map(c => `${c.lastName}, ${c.firstName} (${c.creatorType})`)
    .join('; ');
}

/**
 * The searchable text for an item's creators: every creator's first and last
 * name, at any list position. This is the projection value indexed under the
 * `creators_compact` search key (see {@link buildZoteroSearchDocuments}).
 *
 * It is deliberately distinct from {@link formatCreatorsCompact}, which is the
 * DISPLAY/SORT form ("Lastname et al.") and names only the leading author.
 * Indexing the compact display form made non-leading co-authors and given
 * names unsearchable; the search projection reads this fuller text instead so
 * a user can find an item by ANY creator's name. The single source of truth
 * for "what creator text is searchable" lives here.
 */
export function creatorsSearchText(creators: { firstName: string; lastName: string }[]): string {
  return creators
    .flatMap(creator => [creator.firstName, creator.lastName])
    .filter(name => name.length > 0)
    .join(' ');
}
