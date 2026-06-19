import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { CreatedItemResponseSchema, LibraryPayloadSchema } from '../schemas.js';
import type { LibraryPayload } from '../schemas.js';
import { ITEM_TYPES, type ZoteroItem, type Collection, type Creator, type ItemNote, type Attachment, type ItemType } from '../types.js';
import {
  pluginAcceptsInput,
  resolverPluginMetadata,
  resolveSourceToZotero,
  type ResolverExecutionConfig,
  type ResolverPluginConfig,
} from './resolverPlugins.js';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Zotero stores dates as "1987-00-00 1987" for year-only entries; extract clean value.
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
  throw new Error(`Unsupported Zotero item type: ${String(value)}`);
}

const NullableStringSchema = z.string().nullable();

const RawItemRowSchema = z.strictObject({
  itemID: z.number(),
  id: z.string(),
  itemType: z.string(),
  dateAdded: NullableStringSchema,
  dateModified: NullableStringSchema,
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
  dateAdded: NullableStringSchema,
  dateModified: NullableStringSchema,
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
});

export function queryLibrary(db: DatabaseSync): LibraryPayload {
  // 1. Main items — EAV pivot via conditional aggregation
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
      -- Exclude child attachments (have a parent item)
      SELECT itemID FROM itemAttachments WHERE parentItemID IS NOT NULL
      UNION ALL
      -- Exclude child notes (have a parent item)
      SELECT itemID FROM itemNotes WHERE parentItemID IS NOT NULL
      UNION ALL
      -- Exclude child annotations (have a parent item)
      SELECT itemID FROM itemAnnotations WHERE parentItemID IS NOT NULL
    )
    AND l.type != 'feed'
    GROUP BY i.itemID
    ORDER BY i.dateAdded DESC
  `).all());

  // 2. All creators ordered by item and position
  const allCreators = z.array(CreatorRowSchema).parse(db.prepare(`
    SELECT ic.itemID, c.firstName, c.lastName, ct.creatorType
    FROM itemCreators ic
    JOIN creators c ON ic.creatorID = c.creatorID
    JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
    ORDER BY ic.itemID, ic.orderIndex
  `).all());

  // 3. All tags
  const allTags = z.array(TagRowSchema).parse(db.prepare(`
    SELECT it2.itemID, t.name
    FROM itemTags it2
    JOIN tags t ON it2.tagID = t.tagID
    ORDER BY it2.itemID
  `).all());

  // 4. Collection memberships
  const allCollMemberships = z.array(CollectionMembershipRowSchema).parse(db.prepare(`
    SELECT itemID, collectionID FROM collectionItems ORDER BY itemID
  `).all());

  // 5. Notes (child note items linked to parent)
  const allNotes = z.array(NoteRowSchema).parse(db.prepare(`
    SELECT n.parentItemID, n.itemID, n.note, i.dateAdded, i.dateModified
    FROM itemNotes n
    JOIN items i ON n.itemID = i.itemID
    WHERE n.parentItemID IS NOT NULL
    ORDER BY n.parentItemID
  `).all());

  // 6. Attachments (child attachment items linked to parent)
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
    GROUP BY a.itemID
    ORDER BY a.itemID
  `).all());

  // 7. Collections tree
  const rawCollections = z.array(RawCollectionRowSchema).parse(db.prepare(`
    SELECT c.collectionID, c.collectionName, c.parentCollectionID
    FROM collections c
    JOIN libraries l ON c.libraryID = l.libraryID
    LEFT JOIN deletedCollections dc ON c.collectionID = dc.collectionID
    WHERE dc.collectionID IS NULL AND l.type != 'feed'
    ORDER BY c.collectionID
  `).all());

  // --- Build lookup maps indexed by itemID ---

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
      note: stripHtml(row.note ?? ''),
      dateAdded: row.dateAdded ?? '',
      dateModified: row.dateModified ?? '',
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

  // --- Assemble final ZoteroItem objects ---

  const items: ZoteroItem[] = rawItems.map(row => ({
    id: row.id,
    itemType: parseItemType(row.itemType),
    title: row.title ?? 'Untitled',
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
    dateAdded: row.dateAdded ?? '',
    dateModified: row.dateModified ?? '',
    inTrash: row.inTrash === 1,
  }));

  // Add sentinel "My Library" root collection then real collections
  const collections: Collection[] = [
    { id: 'all', name: 'My Library' },
    ...rawCollections.map(row => ({
      id: String(row.collectionID),
      name: row.collectionName,
      parentId: row.parentCollectionID != null ? String(row.parentCollectionID) : undefined,
    })),
  ];

  return LibraryPayloadSchema.parse({ items, collections });
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const FromSourceRequestSchema = z.strictObject({
  input: z.string().trim().min(1),
  resolverId: z.string().trim().min(1),
  collections: z.array(z.string().min(1)),
});

export interface AppDeps {
  loadLibrary(): LibraryPayload;
  resolverPlugins: ResolverPluginConfig[];
  resolverExecution: ResolverExecutionConfig;
  importEndpoint: string;
  fetchImpl: typeof fetch;
}

function getResolverPlugin(resolverPlugins: ResolverPluginConfig[], pluginId: string): ResolverPluginConfig {
  const plugin = resolverPlugins.find(candidate => candidate.id === pluginId);
  invariant(plugin, `resolver plugin ${pluginId} is not configured`);
  return plugin;
}

function requireCreatedItem(payload: LibraryPayload, key: string) {
  const item = payload.items.find(candidate => candidate.id === key);
  invariant(item, `created Zotero item ${key} was not visible after import`);
  return item;
}

export function createApp(deps: AppDeps) {
  const app = express();
  app.use(express.json());

  app.get('/api/resolver-plugins', (_req, res) => {
    res.json(deps.resolverPlugins.map(resolverPluginMetadata));
  });

  app.get('/api/library', (_req, res, next) => {
    Promise.resolve()
      .then(() => res.json(LibraryPayloadSchema.parse(deps.loadLibrary())))
      .catch(next);
  });

  app.post('/api/items/from-source', (req, res, next) => {
    Promise.resolve()
      .then(async () => {
        const body = FromSourceRequestSchema.parse(req.body);
        const plugin = getResolverPlugin(deps.resolverPlugins, body.resolverId);
        invariant(pluginAcceptsInput(plugin, body.input), `resolver ${plugin.id} does not accept the supplied input`);
        const result = await resolveSourceToZotero(
          plugin,
          body.input,
          body.collections,
          deps.resolverExecution,
          deps.importEndpoint,
          deps.fetchImpl,
        );
        const item = requireCreatedItem(LibraryPayloadSchema.parse(deps.loadLibrary()), result.item_key);
        res.json(CreatedItemResponseSchema.parse({ key: result.item_key, item }));
      })
      .catch(next);
  });

  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: error.message });
  });

  return app;
}
