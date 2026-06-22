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

function nullableDbText(value: string | null): string {
  if (value === null) return '';
  return value;
}

function optionalDbText(value: string | null): string | undefined {
  if (value === null) return undefined;
  return value;
}

function mapList<K, V>(map: ReadonlyMap<K, V[]>, key: K): V[] {
  const value = map.get(key);
  if (value === undefined) return [];
  return value;
}

function appendToMapList<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
    return;
  }
  list.push(value);
}

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
  // Zotero declares itemAttachments.contentType nullable (contentType TEXT, no
  // NOT NULL), so a real linked-URL attachment can have a NULL contentType. The
  // title is a derived MAX(CASE ... title ...) aggregate that is NULL when the
  // attachment has no title itemData row. Both are modeled as genuinely nullable
  // here so one such real attachment does not fail the whole library load.
  contentType: NullableStringSchema,
  title: NullableStringSchema,
  url: NullableStringSchema,
});

const StandaloneAttachmentRowSchema = z.strictObject({
  itemID: z.number(),
  id: z.string(),
  path: NullableStringSchema,
  contentType: NullableStringSchema,
  title: NullableStringSchema,
  url: NullableStringSchema,
});

const RawCollectionRowSchema = z.strictObject({
  collectionID: z.number(),
  collectionName: z.string(),
  parentCollectionID: z.number().nullable(),
  key: z.string(),
});

type RawItemRow = z.infer<typeof RawItemRowSchema>;
type CreatorRow = z.infer<typeof CreatorRowSchema>;
type TagRow = z.infer<typeof TagRowSchema>;
type CollectionMembershipRow = z.infer<typeof CollectionMembershipRowSchema>;
type NoteRow = z.infer<typeof NoteRowSchema>;
type AttachmentRow = z.infer<typeof AttachmentRowSchema>;
type StandaloneAttachmentRow = z.infer<typeof StandaloneAttachmentRowSchema>;
type RawCollectionRow = z.infer<typeof RawCollectionRowSchema>;

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
    options?: ErrorOptions,
  ) {
    super(message, options);
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

// Startup preflight: open the configured DB and validate ONLY the structural
// Zotero DB contract, failing loud on a contract-violating DB. It deliberately
// does NOT run the full library query pipeline (queryLibrary): startup only needs
// to prove the DB satisfies the contract, and the per-request /api/library path
// materializes the actual payload. Running the full pipeline at startup would
// execute and discard the entire library on boot, duplicating the work the first
// request already performs.
export function assertDatabaseContractFromUri(databaseUri: string): void {
  const db = new DatabaseSync(databaseUri);
  try {
    assertZoteroDatabaseContract(db);
  } finally {
    db.close();
  }
}

// One load that both validates the Zotero DB contract AND returns the payload in
// a single execution of the full library pipeline. Structural contract
// violations surface as their typed kinds from the preflight. The catch below
// classifies only by the real error type, never by message text:
//   - a typed ZoteroDatabaseContractError (e.g. unsupported_item_type from the
//     row mapping) is re-thrown with its real kind;
//   - a Zod row-shape failure is the one genuine 'invalid_rows' case, wrapped
//     with the original ZodError retained as `cause` so the failed-field
//     diagnostics are not erased;
//   - any other domain (a SQLite runtime fault, a third-party crash) is NOT a
//     row-shape contract violation and propagates AS-IS, preserving its real
//     type and cause for downstream classification rather than being flattened
//     into 'invalid_rows'.
// The pipeline (queryLibrary) executes exactly once per call.
export function loadValidatedLibrary(db: DatabaseSync): LibraryPayload {
  assertStructuralContract(db);
  try {
    return queryLibrary(db);
  } catch (error) {
    if (error instanceof ZoteroDatabaseContractError) {
      throw error;
    }
    if (error instanceof z.ZodError) {
      throw new ZoteroDatabaseContractError('invalid_rows', error.message, { cause: error });
    }
    throw error;
  }
}

const RAW_ITEMS_SQL = `
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
`;

const CREATORS_SQL = `
  SELECT ic.itemID, c.firstName, c.lastName, ct.creatorType
  FROM itemCreators ic
  JOIN creators c ON ic.creatorID = c.creatorID
  JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
  ORDER BY ic.itemID, ic.orderIndex
`;

const TAGS_SQL = `
  SELECT it2.itemID, t.name
  FROM itemTags it2
  JOIN tags t ON it2.tagID = t.tagID
  ORDER BY it2.itemID
`;

const COLLECTION_MEMBERSHIPS_SQL = 'SELECT itemID, collectionID FROM collectionItems ORDER BY itemID';

const NOTES_SQL = `
  SELECT n.parentItemID, n.itemID, n.note, i.dateAdded, i.dateModified
  FROM itemNotes n
  JOIN items i ON n.itemID = i.itemID
  WHERE n.parentItemID IS NOT NULL
  AND n.itemID NOT IN (SELECT itemID FROM deletedItems)
  ORDER BY n.parentItemID
`;

const CHILD_ATTACHMENTS_SQL = `
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
`;

const STANDALONE_ATTACHMENTS_SQL = `
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
`;

const COLLECTIONS_SQL = `
  SELECT c.collectionID, c.collectionName, c.parentCollectionID, c.key
  FROM collections c
  JOIN libraries l ON c.libraryID = l.libraryID
  LEFT JOIN deletedCollections dc ON c.collectionID = dc.collectionID
  WHERE dc.collectionID IS NULL AND l.type != 'feed'
  ORDER BY c.collectionID
`;

function readRows<T>(db: DatabaseSync, schema: z.ZodType<T>, sql: string): T[] {
  return z.array(schema).parse(db.prepare(sql).all());
}

function creatorsByItem(rows: CreatorRow[]): Map<number, Creator[]> {
  const creatorsByItem = new Map<number, Creator[]>();
  for (const row of rows) {
    appendToMapList(creatorsByItem, row.itemID, {
      firstName: nullableDbText(row.firstName),
      lastName: nullableDbText(row.lastName),
      creatorType: row.creatorType,
    });
  }
  return creatorsByItem;
}

function tagsByItem(rows: TagRow[]): Map<number, string[]> {
  const tagsByItem = new Map<number, string[]>();
  for (const row of rows) {
    appendToMapList(tagsByItem, row.itemID, row.name);
  }
  return tagsByItem;
}

function collectionIdsByItem(rows: CollectionMembershipRow[]): Map<number, string[]> {
  const collsByItem = new Map<number, string[]>();
  for (const row of rows) {
    appendToMapList(collsByItem, row.itemID, String(row.collectionID));
  }
  return collsByItem;
}

function notesByItem(rows: NoteRow[]): Map<number, ItemNote[]> {
  const notesByItem = new Map<number, ItemNote[]>();
  for (const row of rows) {
    appendToMapList(notesByItem, row.parentItemID, {
      id: String(row.itemID),
      note: noteToPlainText(nullableDbText(row.note)),
      dateAdded: row.dateAdded,
      dateModified: row.dateModified,
    });
  }
  return notesByItem;
}

function attachmentFromRow(row: Pick<AttachmentRow, 'contentType' | 'id' | 'path' | 'title' | 'url'>): Attachment {
  return {
    id: row.id,
    // A NULL title (no title row) / NULL contentType (nullable Zotero column)
    // carries through as an absent value, never a fabricated placeholder.
    title: optionalDbText(row.title),
    url: optionalDbText(row.url),
    mimeType: optionalDbText(row.contentType),
    path: optionalDbText(row.path),
  };
}

function attachmentsByItem(childRows: AttachmentRow[], standaloneRows: StandaloneAttachmentRow[]): Map<number, Attachment[]> {
  const attachsByItem = new Map<number, Attachment[]>();
  for (const row of childRows) {
    appendToMapList(attachsByItem, row.parentItemID, attachmentFromRow(row));
  }
  for (const row of standaloneRows) {
    attachsByItem.set(row.itemID, [attachmentFromRow(row)]);
  }
  return attachsByItem;
}

function mapItem(
  row: RawItemRow,
  creators: ReadonlyMap<number, Creator[]>,
  tags: ReadonlyMap<number, string[]>,
  notes: ReadonlyMap<number, ItemNote[]>,
  attachments: ReadonlyMap<number, Attachment[]>,
  collections: ReadonlyMap<number, string[]>,
): ZoteroItem {
  return {
    id: row.id,
    itemType: parseItemType(row.itemType),
    title: optionalDbText(row.title),
    creators: mapList(creators, row.itemID),
    publicationTitle: optionalDbText(row.publicationTitle),
    volume: optionalDbText(row.volume),
    issue: optionalDbText(row.issue),
    pages: optionalDbText(row.pages),
    date: cleanDate(row.date),
    publisher: optionalDbText(row.publisher),
    place: optionalDbText(row.place),
    doi: optionalDbText(row.doi),
    url: optionalDbText(row.url),
    isbn: optionalDbText(row.isbn),
    issn: optionalDbText(row.issn),
    accessDate: optionalDbText(row.accessDate),
    archive: optionalDbText(row.archive),
    archiveLocation: optionalDbText(row.archiveLocation),
    callNumber: optionalDbText(row.callNumber),
    language: optionalDbText(row.language),
    rights: optionalDbText(row.rights),
    extra: optionalDbText(row.extra),
    abstractNote: optionalDbText(row.abstractNote),
    citekey: optionalDbText(row.citekey),
    tags: mapList(tags, row.itemID),
    notes: mapList(notes, row.itemID),
    attachments: mapList(attachments, row.itemID),
    collections: mapList(collections, row.itemID),
    dateAdded: row.dateAdded,
    dateModified: row.dateModified,
    inTrash: row.inTrash === 1,
  };
}

function mapCollections(rows: RawCollectionRow[]): Collection[] {
  return [
    // Synthetic My Library root VIEW: not a real Zotero collection, so no key.
    { kind: 'library-root', id: 'all', name: 'My Library' },
    ...rows.map((row): Collection => ({
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
}

export function queryLibrary(db: DatabaseSync): LibraryPayload {
  const creators = creatorsByItem(readRows(db, CreatorRowSchema, CREATORS_SQL));
  const tags = tagsByItem(readRows(db, TagRowSchema, TAGS_SQL));
  const notes = notesByItem(readRows(db, NoteRowSchema, NOTES_SQL));
  const attachments = attachmentsByItem(
    readRows(db, AttachmentRowSchema, CHILD_ATTACHMENTS_SQL),
    readRows(db, StandaloneAttachmentRowSchema, STANDALONE_ATTACHMENTS_SQL),
  );
  const collections = collectionIdsByItem(readRows(db, CollectionMembershipRowSchema, COLLECTION_MEMBERSHIPS_SQL));
  const items = readRows(db, RawItemRowSchema, RAW_ITEMS_SQL)
    .map(row => mapItem(row, creators, tags, notes, attachments, collections));

  return LibraryPayloadSchema.parse({
    items,
    collections: mapCollections(readRows(db, RawCollectionRowSchema, COLLECTIONS_SQL)),
  });
}
