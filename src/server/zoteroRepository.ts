import { DatabaseSync } from 'node:sqlite';
import { convert as htmlToText, type HtmlToTextOptions } from 'html-to-text';
import { z } from 'zod';
import { LibraryPayloadSchema } from '../schemas.js';
import type { LibraryPayload } from '../schemas.js';
import {
  ITEM_TYPES,
  type Attachment,
  type Collection,
  type Creator,
  type ItemNote,
  type ItemType,
  type ZoteroItem,
} from '../types.js';

const NullableStringSchema = z.string().nullable();
const CountRowSchema = z.strictObject({ count: z.number() });
const NameRowSchema = z.strictObject({ name: z.string() });
const TableInfoRowSchema = z.strictObject({ name: z.string() }).passthrough();

const RawItemRowSchema = z.strictObject({
  itemID: z.number(),
  id: z.string(),
  itemType: z.string(),
  dateAdded: z.string(),
  dateModified: z.string(),
  title: NullableStringSchema,
  doi: NullableStringSchema,
  url: NullableStringSchema,
  date: NullableStringSchema,
  volume: NullableStringSchema,
  issue: NullableStringSchema,
  pages: NullableStringSchema,
  publisher: NullableStringSchema,
  place: NullableStringSchema,
  publicationTitle: NullableStringSchema,
  abstractNote: NullableStringSchema,
  language: NullableStringSchema,
  isbn: NullableStringSchema,
  issn: NullableStringSchema,
  extra: NullableStringSchema,
  rights: NullableStringSchema,
  archive: NullableStringSchema,
  archiveLocation: NullableStringSchema,
  callNumber: NullableStringSchema,
  accessDate: NullableStringSchema,
  citekey: NullableStringSchema,
  inTrash: z.number(),
});

const CreatorRowSchema = z.strictObject({
  itemID: z.number(),
  firstName: NullableStringSchema,
  lastName: NullableStringSchema,
  creatorType: z.string(),
});

const TagRowSchema = z.strictObject({
  itemID: z.number(),
  name: z.string(),
});

const CollectionMembershipRowSchema = z.strictObject({
  itemID: z.number(),
  collectionID: z.number(),
});

const NoteRowSchema = z.strictObject({
  parentItemID: z.number(),
  itemID: z.number(),
  note: NullableStringSchema,
  dateAdded: z.string(),
  dateModified: z.string(),
});

const AttachmentRowSchema = z.strictObject({
  parentItemID: z.number(),
  id: z.string(),
  path: NullableStringSchema,
  contentType: z.string(),
  title: z.string(),
  url: NullableStringSchema,
});

const StandaloneAttachmentRowSchema = z.strictObject({
  itemID: z.number(),
  id: z.string(),
  path: NullableStringSchema,
  contentType: z.string(),
  title: z.string(),
  url: NullableStringSchema,
});

const RawCollectionRowSchema = z.strictObject({
  collectionID: z.number(),
  collectionName: z.string(),
  parentCollectionID: z.number().nullable(),
  key: z.string(),
});

const REQUIRED_COLUMNS = new Map<string, string[]>([
  ['libraries', ['libraryID', 'type']],
  ['itemTypes', ['itemTypeID', 'typeName']],
  ['items', ['itemID', 'key', 'itemTypeID', 'libraryID', 'dateAdded', 'dateModified']],
  ['fields', ['fieldID', 'fieldName']],
  ['itemDataValues', ['valueID', 'value']],
  ['itemData', ['itemID', 'fieldID', 'valueID']],
  ['deletedItems', ['itemID']],
  ['itemAttachments', ['itemID', 'parentItemID', 'path', 'contentType']],
  ['itemNotes', ['itemID', 'parentItemID', 'note']],
  ['itemAnnotations', ['itemID', 'parentItemID']],
  ['creators', ['creatorID', 'firstName', 'lastName']],
  ['creatorTypes', ['creatorTypeID', 'creatorType']],
  ['itemCreators', ['itemID', 'creatorID', 'creatorTypeID', 'orderIndex']],
  ['tags', ['tagID', 'name']],
  ['itemTags', ['itemID', 'tagID']],
  ['collections', ['collectionID', 'libraryID', 'collectionName', 'parentCollectionID', 'key']],
  ['deletedCollections', ['collectionID']],
  ['collectionItems', ['itemID', 'collectionID']],
]);

const REQUIRED_FIELD_NAMES = [
  'title',
  'date',
  'publisher',
  'url',
];

export type ZoteroDatabaseContractErrorKind =
  | 'missing_table'
  | 'missing_column'
  | 'missing_field'
  | 'unsupported_item_type'
  | 'standalone_note'
  | 'broken_link'
  | 'multiple_libraries'
  | 'invalid_rows';

export class ZoteroDatabaseContractError extends Error {
  constructor(
    readonly kind: ZoteroDatabaseContractErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ZoteroDatabaseContractError';
  }
}

const NOTE_TEXT_OPTIONS: HtmlToTextOptions = {
  wordwrap: false,
  selectors: [
    { selector: 'a', options: { ignoreHref: true } },
    { selector: 'img', format: 'skip' },
  ],
};

// Zotero notes are stored as HTML. Convert to plain text with a real HTML
// parser so entities are decoded and script/style content is dropped, then
// collapse whitespace for compact single-line display.
export function noteToPlainText(html: string): string {
  return htmlToText(html, NOTE_TEXT_OPTIONS).replace(/\s+/g, ' ').trim();
}

function cleanDate(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const zeroMatch = raw.match(/^\d{4}-00-00\s+(\d{4})$/);
  if (zeroMatch) return zeroMatch[1];
  const partialZero = raw.match(/^(\d{4})-00-00/);
  if (partialZero) return partialZero[1];
  return raw;
}

function parseItemType(value: unknown): ItemType {
  if (typeof value === 'string' && (ITEM_TYPES as readonly string[]).includes(value)) {
    return value as ItemType;
  }
  throw new ZoteroDatabaseContractError('unsupported_item_type', `Unsupported Zotero item type: ${String(value)}`);
}

function requireZeroCount(db: DatabaseSync, sql: string, message: string): void {
  const row = CountRowSchema.parse(db.prepare(sql).get());
  if (row.count !== 0) {
    throw new ZoteroDatabaseContractError('broken_link', message);
  }
}

function tableColumns(db: DatabaseSync, tableName: string): Set<string> {
  return new Set(z.array(TableInfoRowSchema).parse(db.prepare(`PRAGMA table_info(${tableName})`).all()).map(row => row.name));
}

function assertRequiredTablesAndColumns(db: DatabaseSync): void {
  for (const [tableName, requiredColumns] of REQUIRED_COLUMNS) {
    const columns = tableColumns(db, tableName);
    if (columns.size === 0) {
      throw new ZoteroDatabaseContractError('missing_table', `Zotero DB contract missing table ${tableName}`);
    }
    for (const columnName of requiredColumns) {
      if (!columns.has(columnName)) {
        throw new ZoteroDatabaseContractError('missing_column', `Zotero DB contract missing column ${tableName}.${columnName}`);
      }
    }
  }
}

function assertRequiredFieldNames(db: DatabaseSync): void {
  const names = new Set(z.array(NameRowSchema).parse(db.prepare('SELECT fieldName AS name FROM fields').all()).map(row => row.name));
  for (const fieldName of REQUIRED_FIELD_NAMES) {
    if (!names.has(fieldName)) {
      throw new ZoteroDatabaseContractError('missing_field', `Zotero DB contract missing field ${fieldName}`);
    }
  }
}

function assertObservedItemTypes(db: DatabaseSync): void {
  const rows = z.array(NameRowSchema).parse(db.prepare(`
    SELECT DISTINCT it.typeName AS name
    FROM items i
    JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
    JOIN libraries l ON i.libraryID = l.libraryID
    WHERE l.type != 'feed'
    AND i.itemID NOT IN (
      SELECT itemID FROM itemAttachments WHERE parentItemID IS NOT NULL
      UNION ALL
      SELECT itemID FROM itemNotes WHERE parentItemID IS NOT NULL
      UNION ALL
      SELECT itemID FROM itemAnnotations WHERE parentItemID IS NOT NULL
    )
  `).all());
  for (const row of rows) {
    parseItemType(row.name);
  }
}

function assertCoherentLinks(db: DatabaseSync): void {
  requireZeroCount(db, `
    SELECT COUNT(*) AS count
    FROM itemAttachments a
    LEFT JOIN items child ON child.itemID = a.itemID
    LEFT JOIN items parent ON parent.itemID = a.parentItemID
    WHERE child.itemID IS NULL OR (a.parentItemID IS NOT NULL AND parent.itemID IS NULL)
  `, 'Zotero DB contract has broken attachment parent links');

  requireZeroCount(db, `
    SELECT COUNT(*) AS count
    FROM itemNotes n
    LEFT JOIN items child ON child.itemID = n.itemID
    LEFT JOIN items parent ON parent.itemID = n.parentItemID
    WHERE child.itemID IS NULL OR (n.parentItemID IS NOT NULL AND parent.itemID IS NULL)
  `, 'Zotero DB contract has broken note parent links');

  requireZeroCount(db, `
    SELECT COUNT(*) AS count
    FROM collections child
    LEFT JOIN collections parent ON parent.collectionID = child.parentCollectionID
    WHERE child.parentCollectionID IS NOT NULL AND parent.collectionID IS NULL
  `, 'Zotero DB contract has broken collection parent links');

  requireZeroCount(db, `
    SELECT COUNT(*) AS count
    FROM collectionItems ci
    LEFT JOIN items i ON i.itemID = ci.itemID
    LEFT JOIN collections c ON c.collectionID = ci.collectionID
    WHERE i.itemID IS NULL OR c.collectionID IS NULL
  `, 'Zotero DB contract has broken collection item links');
}

// This app's item identity is the bare Zotero item key (items.key), which is
// unique only WITHIN a single Zotero library. The library query spans all
// non-feed libraries, so more than one non-feed library makes the bare-key
// identity ambiguous (two libraries can each hold a distinct item with the same
// key). The app's identity model is only valid for a single non-feed library,
// so this asserts that assumption loudly rather than silently spanning multiple
// libraries with an ambiguous identity.
function assertSingleNonFeedLibrary(db: DatabaseSync): void {
  const row = CountRowSchema.parse(
    db.prepare("SELECT COUNT(*) AS count FROM libraries WHERE type != 'feed'").get(),
  );
  if (row.count !== 1) {
    throw new ZoteroDatabaseContractError(
      'multiple_libraries',
      `Zotero DB contract: app requires exactly one non-feed library for bare-key item identity, found ${row.count}`,
    );
  }
}

function assertNoStandaloneNotes(db: DatabaseSync): void {
  const row = CountRowSchema.parse(
    db.prepare('SELECT COUNT(*) AS count FROM itemNotes WHERE parentItemID IS NULL').get(),
  );
  if (row.count !== 0) {
    throw new ZoteroDatabaseContractError(
      'standalone_note',
      'Zotero DB contract: library contains standalone notes, which are unsupported by this app',
    );
  }
}

// Structural preflight: schema shape, field contracts, item-type support, link
// coherence, single-library identity, and standalone-note rejection. These are
// cheap PRAGMA/COUNT/DISTINCT probes only. The expensive full library pipeline
// (queryLibrary) is NOT run here: contract validation and payload production are
// a single pipeline execution in loadValidatedLibrary, so a normal load no
// longer runs the query set twice.
function assertStructuralContract(db: DatabaseSync): void {
  assertRequiredTablesAndColumns(db);
  assertRequiredFieldNames(db);
  assertSingleNonFeedLibrary(db);
  assertNoStandaloneNotes(db);
  assertObservedItemTypes(db);
  assertCoherentLinks(db);
}

export function assertZoteroDatabaseContract(db: DatabaseSync): void {
  assertStructuralContract(db);
}

// One load that both validates the Zotero DB contract AND returns the payload in
// a single execution of the full library pipeline. Structural contract
// violations surface as their typed kinds from the preflight; row-shape
// violations during the single queryLibrary run surface as 'invalid_rows'. The
// pipeline (queryLibrary) executes exactly once per call.
export function loadValidatedLibrary(db: DatabaseSync): LibraryPayload {
  assertStructuralContract(db);
  try {
    return queryLibrary(db);
  } catch (error) {
    if (error instanceof ZoteroDatabaseContractError) {
      throw error;
    }
    throw new ZoteroDatabaseContractError('invalid_rows', error instanceof Error ? error.message : String(error));
  }
}

export function queryLibrary(db: DatabaseSync): LibraryPayload {
  const rawItems = z.array(RawItemRowSchema).parse(db.prepare(`
    SELECT
      i.itemID,
      i.key                                                                          AS id,
      it.typeName                                                                    AS itemType,
      i.dateAdded,
      i.dateModified,
      MAX(CASE WHEN f.fieldName = 'title'          THEN idv.value END)              AS title,
      MAX(CASE WHEN f.fieldName IN ('DOI','doi')   THEN idv.value END)              AS doi,
      MAX(CASE WHEN f.fieldName = 'url'            THEN idv.value END)              AS url,
      MAX(CASE WHEN f.fieldName = 'date'           THEN idv.value END)              AS date,
      MAX(CASE WHEN f.fieldName = 'volume'         THEN idv.value END)              AS volume,
      MAX(CASE WHEN f.fieldName = 'issue'          THEN idv.value END)              AS issue,
      MAX(CASE WHEN f.fieldName = 'pages'          THEN idv.value END)              AS pages,
      MAX(CASE WHEN f.fieldName = 'publisher'      THEN idv.value END)              AS publisher,
      MAX(CASE WHEN f.fieldName = 'place'          THEN idv.value END)              AS place,
      MAX(CASE WHEN f.fieldName IN (
        'publicationTitle','bookTitle','conferenceName',
        'websiteTitle','encyclopediaTitle','dictionaryTitle',
        'forumTitle','blogTitle','programTitle'
      )                                            THEN idv.value END)              AS publicationTitle,
      MAX(CASE WHEN f.fieldName = 'abstractNote'   THEN idv.value END)              AS abstractNote,
      MAX(CASE WHEN f.fieldName = 'language'       THEN idv.value END)              AS language,
      MAX(CASE WHEN f.fieldName IN ('ISBN','isbn') THEN idv.value END)              AS isbn,
      MAX(CASE WHEN f.fieldName IN ('ISSN','issn') THEN idv.value END)              AS issn,
      MAX(CASE WHEN f.fieldName = 'extra'          THEN idv.value END)              AS extra,
      MAX(CASE WHEN f.fieldName = 'rights'         THEN idv.value END)              AS rights,
      MAX(CASE WHEN f.fieldName = 'archive'        THEN idv.value END)              AS archive,
      MAX(CASE WHEN f.fieldName = 'archiveLocation' THEN idv.value END)             AS archiveLocation,
      MAX(CASE WHEN f.fieldName = 'callNumber'     THEN idv.value END)              AS callNumber,
      MAX(CASE WHEN f.fieldName = 'accessDate'     THEN idv.value END)              AS accessDate,
      MAX(CASE WHEN f.fieldName = 'citationKey'    THEN idv.value END)              AS citekey,
      CASE WHEN di.itemID IS NOT NULL THEN 1 ELSE 0 END                             AS inTrash
    FROM items i
    JOIN itemTypes it ON i.itemTypeID = it.itemTypeID
    JOIN libraries l ON i.libraryID = l.libraryID
    LEFT JOIN itemData id2 ON i.itemID = id2.itemID
    LEFT JOIN fields f ON id2.fieldID = f.fieldID
    LEFT JOIN itemDataValues idv ON id2.valueID = idv.valueID
    LEFT JOIN deletedItems di ON i.itemID = di.itemID
    WHERE i.itemID NOT IN (
      SELECT itemID FROM itemAttachments WHERE parentItemID IS NOT NULL
      UNION ALL
      SELECT itemID FROM itemNotes WHERE parentItemID IS NOT NULL
      UNION ALL
      SELECT itemID FROM itemAnnotations WHERE parentItemID IS NOT NULL
    )
    AND l.type != 'feed'
    GROUP BY i.itemID
    ORDER BY i.dateAdded DESC
  `).all());

  const allCreators = z.array(CreatorRowSchema).parse(db.prepare(`
    SELECT ic.itemID, c.firstName, c.lastName, ct.creatorType
    FROM itemCreators ic
    JOIN creators c ON ic.creatorID = c.creatorID
    JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
    ORDER BY ic.itemID, ic.orderIndex
  `).all());

  const allTags = z.array(TagRowSchema).parse(db.prepare(`
    SELECT it2.itemID, t.name
    FROM itemTags it2
    JOIN tags t ON it2.tagID = t.tagID
    ORDER BY it2.itemID
  `).all());

  const allCollMemberships = z.array(CollectionMembershipRowSchema).parse(db.prepare(`
    SELECT itemID, collectionID FROM collectionItems ORDER BY itemID
  `).all());

  const allNotes = z.array(NoteRowSchema).parse(db.prepare(`
    SELECT n.parentItemID, n.itemID, n.note, i.dateAdded, i.dateModified
    FROM itemNotes n
    JOIN items i ON n.itemID = i.itemID
    WHERE n.parentItemID IS NOT NULL
    AND n.itemID NOT IN (SELECT itemID FROM deletedItems)
    ORDER BY n.parentItemID
  `).all());

  const allAttachments = z.array(AttachmentRowSchema).parse(db.prepare(`
    SELECT
      a.parentItemID,
      i.key                                                        AS id,
      a.path,
      a.contentType,
      MAX(CASE WHEN f.fieldName = 'title' THEN idv.value END)     AS title,
      MAX(CASE WHEN f.fieldName = 'url'   THEN idv.value END)     AS url
    FROM itemAttachments a
    JOIN items i ON a.itemID = i.itemID
    LEFT JOIN itemData id2 ON a.itemID = id2.itemID
    LEFT JOIN fields f ON id2.fieldID = f.fieldID
    LEFT JOIN itemDataValues idv ON id2.valueID = idv.valueID
    WHERE a.parentItemID IS NOT NULL
    AND a.itemID NOT IN (SELECT itemID FROM deletedItems)
    GROUP BY a.itemID
    ORDER BY a.parentItemID
  `).all());

  const standaloneAttachments = z.array(StandaloneAttachmentRowSchema).parse(db.prepare(`
    SELECT
      a.itemID,
      i.key                                                        AS id,
      a.path,
      a.contentType,
      MAX(CASE WHEN f.fieldName = 'title' THEN idv.value END)     AS title,
      MAX(CASE WHEN f.fieldName = 'url'   THEN idv.value END)     AS url
    FROM itemAttachments a
    JOIN items i ON a.itemID = i.itemID
    LEFT JOIN itemData id2 ON a.itemID = id2.itemID
    LEFT JOIN fields f ON id2.fieldID = f.fieldID
    LEFT JOIN itemDataValues idv ON id2.valueID = idv.valueID
    WHERE a.parentItemID IS NULL
    AND a.itemID NOT IN (SELECT itemID FROM deletedItems)
    GROUP BY a.itemID
    ORDER BY a.itemID
  `).all());

  const rawCollections = z.array(RawCollectionRowSchema).parse(db.prepare(`
    SELECT c.collectionID, c.collectionName, c.parentCollectionID, c.key
    FROM collections c
    JOIN libraries l ON c.libraryID = l.libraryID
    LEFT JOIN deletedCollections dc ON c.collectionID = dc.collectionID
    WHERE dc.collectionID IS NULL AND l.type != 'feed'
    ORDER BY c.collectionID
  `).all());

  const creatorsByItem = new Map<number, Creator[]>();
  for (const row of allCreators) {
    const list = creatorsByItem.get(row.itemID) ?? [];
    list.push({ firstName: row.firstName ?? '', lastName: row.lastName ?? '', creatorType: row.creatorType });
    creatorsByItem.set(row.itemID, list);
  }

  const tagsByItem = new Map<number, string[]>();
  for (const row of allTags) {
    const list = tagsByItem.get(row.itemID) ?? [];
    list.push(row.name);
    tagsByItem.set(row.itemID, list);
  }

  const collsByItem = new Map<number, string[]>();
  for (const row of allCollMemberships) {
    const list = collsByItem.get(row.itemID) ?? [];
    list.push(String(row.collectionID));
    collsByItem.set(row.itemID, list);
  }

  const notesByItem = new Map<number, ItemNote[]>();
  for (const row of allNotes) {
    const list = notesByItem.get(row.parentItemID) ?? [];
    list.push({
      id: String(row.itemID),
      note: noteToPlainText(row.note ?? ''),
      dateAdded: row.dateAdded,
      dateModified: row.dateModified,
    });
    notesByItem.set(row.parentItemID, list);
  }

  const attachsByItem = new Map<number, Attachment[]>();
  for (const row of allAttachments) {
    const list = attachsByItem.get(row.parentItemID) ?? [];
    list.push({
      id: row.id,
      title: row.title,
      url: row.url ?? undefined,
      mimeType: row.contentType,
      path: row.path ?? undefined,
    });
    attachsByItem.set(row.parentItemID, list);
  }
  for (const row of standaloneAttachments) {
    attachsByItem.set(row.itemID, [{
      id: row.id,
      title: row.title,
      url: row.url ?? undefined,
      mimeType: row.contentType,
      path: row.path ?? undefined,
    }]);
  }

  const items: ZoteroItem[] = rawItems.map(row => ({
    id: row.id,
    itemType: parseItemType(row.itemType),
    title: row.title ?? undefined,
    creators: creatorsByItem.get(row.itemID) ?? [],
    publicationTitle: row.publicationTitle ?? undefined,
    volume: row.volume ?? undefined,
    issue: row.issue ?? undefined,
    pages: row.pages ?? undefined,
    date: cleanDate(row.date),
    publisher: row.publisher ?? undefined,
    place: row.place ?? undefined,
    doi: row.doi ?? undefined,
    url: row.url ?? undefined,
    isbn: row.isbn ?? undefined,
    issn: row.issn ?? undefined,
    accessDate: row.accessDate ?? undefined,
    archive: row.archive ?? undefined,
    archiveLocation: row.archiveLocation ?? undefined,
    callNumber: row.callNumber ?? undefined,
    language: row.language ?? undefined,
    rights: row.rights ?? undefined,
    extra: row.extra ?? undefined,
    abstractNote: row.abstractNote ?? undefined,
    citekey: row.citekey ?? undefined,
    tags: tagsByItem.get(row.itemID) ?? [],
    notes: notesByItem.get(row.itemID) ?? [],
    attachments: attachsByItem.get(row.itemID) ?? [],
    collections: collsByItem.get(row.itemID) ?? [],
    dateAdded: row.dateAdded,
    dateModified: row.dateModified,
    inTrash: row.inTrash === 1,
  }));

  const collections: Collection[] = [
    // Synthetic My Library root VIEW: not a real Zotero collection, so no key.
    { kind: 'library-root', id: 'all', name: 'My Library' },
    ...rawCollections.map((row): Collection => ({
      kind: 'real',
      id: String(row.collectionID),
      name: row.collectionName,
      parentId: row.parentCollectionID != null ? String(row.parentCollectionID) : undefined,
      // Real Zotero collection key (collections.key), required on every real
      // collection. The sidebar selection and in-app membership/filtering use the
      // internal numeric `id`; the import boundary must instead carry this key,
      // which is what the Zotero write plugin requires as a collection_keys entry.
      key: row.key,
    })),
  ];

  return LibraryPayloadSchema.parse({ items, collections });
}
