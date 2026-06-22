import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import '@citation-js/plugin-csl';
import { ItemType, ZoteroItem, Creator } from '../types';

// Total ItemType -> CSL-JSON `type` map. Citation.js derives the BibTeX entry
// type (@book, @article, @inproceedings, ...) and the APA rendering from this
// CSL `type`, so the entry reflects the item's REAL type rather than a
// hard-coded @article. Every member of the ItemType union must appear here:
// the map is `Record<ItemType, ...>`, so the type checker rejects the file if a
// new item type is added without a deliberate CSL decision.
//
// `attachment` has no bibliographic CSL type — it is a raw file, not a citable
// work. It maps to `null`, and citing one throws (see itemToCsl). This is the
// FAIL-LOUD case the spec requires: no silent coercion to a default type.
const ITEM_TYPE_TO_CSL: Record<ItemType, string | null> = {
  journalArticle: 'article-journal',
  book: 'book',
  bookSection: 'chapter',
  attachment: null,
  conferencePaper: 'paper-conference',
  thesis: 'thesis',
  webpage: 'webpage',
  report: 'report',
  patent: 'patent',
  preprint: 'article-journal',
  manuscript: 'manuscript',
  document: 'document',
  presentation: 'speech',
  magazineArticle: 'article-magazine',
  newspaperArticle: 'article-newspaper',
  blogPost: 'post-weblog',
  forumPost: 'post',
  encyclopediaArticle: 'entry-encyclopedia',
  dictionaryEntry: 'entry-dictionary',
  interview: 'interview',
  film: 'motion_picture',
  tvBroadcast: 'broadcast',
  radioBroadcast: 'broadcast',
  podcast: 'song',
  artwork: 'graphic',
  statute: 'legislation',
  bill: 'bill',
  case: 'legal_case',
  hearing: 'hearing',
  map: 'map',
  computerProgram: 'software',
  email: 'personal_communication',
  letter: 'personal_communication',
  audioRecording: 'song',
  videoRecording: 'motion_picture',
};

interface CslName {
  family: string;
  given: string;
}

// CSL-JSON record. Only the fields this app maps appear; absent fields are
// OMITTED rather than emitted as empty strings or placeholders.
interface CslRecord {
  id?: string;
  type: string;
  title?: string;
  author?: CslName[];
  editor?: CslName[];
  issued?: { 'date-parts': number[][] };
  publisher?: string;
  'container-title'?: string;
  DOI?: string;
  ISBN?: string;
  URL?: string;
  volume?: string;
  issue?: string;
  page?: string;
  'publisher-place'?: string;
}

// Zotero creator roles that CSL distinguishes structurally. Only author/editor
// carry a dedicated CSL name field this app emits; other roles are dropped
// rather than coerced into `author`.
function cslNamesByRole(creators: Creator[]): { author: CslName[]; editor: CslName[] } {
  const author: CslName[] = [];
  const editor: CslName[] = [];
  for (const creator of creators) {
    const name: CslName = { family: creator.lastName, given: creator.firstName };
    const role = creator.creatorType.toLowerCase();
    if (role === 'author') author.push(name);
    else if (role === 'editor') editor.push(name);
    else if (role === 'serieseditor') editor.push(name);
  }
  return { author, editor };
}

// The two conditions under which itemToCsl refuses to produce a citation.
// isCitable and itemToCsl BOTH consult these so the predicate and the throw
// share one source of truth and cannot drift: the predicate is true exactly
// when neither rejection fires.

// A bibliographic citation form exists for this item TYPE. attachment maps to
// null (a raw file, not a citable work); every other ItemType maps to a CSL
// type. This is itemToCsl's first throw condition.
function hasCitableType(item: ZoteroItem): boolean {
  return ITEM_TYPE_TO_CSL[item.itemType] !== null;
}

// The item carries at least one creator CSL recognises as name-bearing
// (author or editor/serieseditor). An item with no author AND no editor —
// whether it has no creators at all, or only non-name-bearing roles like
// translator/contributor/inventor — renders as a nameless entry, which is the
// authorless-citation error the import gate already rejects. This is
// itemToCsl's second throw condition.
function hasNameBearingCreator(item: ZoteroItem): boolean {
  const { author, editor } = cslNamesByRole(item.creators);
  if (author.length > 0) return true;
  return editor.length > 0;
}

// Parse a four-digit year out of the free-form Zotero `date`. If none is
// present the field is OMITTED — the renderer (APA) supplies its own standard
// no-date marker; this code never fabricates 'unknown' or 'N.D.'.
function issuedDateParts(date: string | undefined): { 'date-parts': number[][] } | undefined {
  if (date === undefined) return undefined;
  if (date.length === 0) return undefined;
  const match = /\d{4}/.exec(date);
  if (match === null) return undefined;
  return { 'date-parts': [[Number.parseInt(match[0], 10)]] };
}

// The plain-string CSL fields this app maps. Constraining the key to these
// names lets assignIfPresent write through `record[key] = value` with no cast:
// every member is a `string | undefined` property of CslRecord.
type CslStringField =
  | 'title'
  | 'publisher'
  | 'container-title'
  | 'DOI'
  | 'ISBN'
  | 'URL'
  | 'volume'
  | 'issue'
  | 'page'
  | 'publisher-place';

function assignIfPresent(record: CslRecord, key: CslStringField, value: string | undefined): void {
  if (value !== undefined && value.trim().length > 0) {
    record[key] = value;
  }
}

const CSL_STRING_FIELDS: readonly [CslStringField, (item: ZoteroItem) => string | undefined][] = [
  ['title', item => item.title],
  ['publisher', item => item.publisher],
  ['container-title', item => item.publicationTitle],
  ['DOI', item => item.doi],
  ['ISBN', item => item.isbn],
  ['URL', item => item.url],
  ['volume', item => item.volume],
  ['issue', item => item.issue],
  ['page', item => item.pages],
  ['publisher-place', item => item.place],
];

function requireCslType(item: ZoteroItem): string {
  const cslType = ITEM_TYPE_TO_CSL[item.itemType];
  if (cslType === null) {
    throw new Error(`Item type "${item.itemType}" has no bibliographic citation form.`);
  }
  return cslType;
}

function requireCslNames(item: ZoteroItem): { author: CslName[]; editor: CslName[] } {
  const names = cslNamesByRole(item.creators);
  if (names.author.length > 0) {
    return names;
  }
  if (names.editor.length > 0) {
    return names;
  }

  const label = item.title === undefined ? item.id : item.title;
  throw new Error(
    item.creators.length === 0
      ? `Item "${label}" has no creators; a citation requires at least one name-bearing creator (author or editor).`
      : `Item "${label}" has creators but none are name-bearing; a citation requires at least one author or editor.`,
  );
}

function assignCslNames(record: CslRecord, names: { author: CslName[]; editor: CslName[] }): void {
  if (names.author.length > 0) record.author = names.author;
  if (names.editor.length > 0) record.editor = names.editor;
}

function assignCslStrings(record: CslRecord, item: ZoteroItem): void {
  for (const [key, readValue] of CSL_STRING_FIELDS) {
    assignIfPresent(record, key, readValue(item));
  }
}

// Whether a citation can actually be produced for this item. This is the exact
// inverse of every condition under which itemToCsl throws: it consults the SAME
// hasCitableType and hasNameBearingCreator predicates itemToCsl uses to decide
// whether to throw, so the predicate and the throw share one source of truth
// and cannot drift. The UI consults this to decide whether to offer the
// copy-citation actions; because it agrees with itemToCsl, the UI never offers
// an action that would then throw uncaught. (A citable TYPE whose only creator
// is a non-name-bearing role — translator, contributor, inventor, … — is NOT
// citable: itemToCsl would throw on it, so isCitable returns false.)
export function isCitable(item: ZoteroItem): boolean {
  return hasCitableType(item) && hasNameBearingCreator(item);
}

// Map a ZoteroItem to a single CSL-JSON record. This is the ONE place the
// domain item is translated; both toBibTeX and toFormattedCitation consume it.
export function itemToCsl(item: ZoteroItem): CslRecord {
  const record: CslRecord = { type: requireCslType(item) };

  // Use the item's real citekey when present; otherwise let Citation.js
  // generate the entry key. No bespoke citekey algorithm here.
  if (item.citekey !== undefined && item.citekey.trim().length > 0) {
    record.id = item.citekey.trim();
  }

  assignCslNames(record, requireCslNames(item));

  const issued = issuedDateParts(item.date);
  if (issued) record.issued = issued;

  assignCslStrings(record, item);

  return record;
}

// BibTeX entry whose @entrytype reflects the item's real itemType. Throws (via
// itemToCsl) for non-citable item types.
export function toBibTeX(item: ZoteroItem): string {
  return new Cite([itemToCsl(item)]).format('bibtex').trim();
}

// APA bibliography string in plain text. Throws (via itemToCsl) for non-citable
// item types.
export function toFormattedCitation(item: ZoteroItem): string {
  return new Cite([itemToCsl(item)])
    .format('bibliography', { format: 'text', style: 'apa', lang: 'en-US' })
    .trim();
}
