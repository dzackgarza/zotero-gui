import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import type { ZoteroItem, Collection, Creator, ItemNote, Attachment } from '../types.js';

const DB_URI = 'file:///home/dzack/Zotero/zotero.sqlite?immutable=1';
const PORT = 3001;

const db = new DatabaseSync(DB_URI);

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

function queryLibrary(): { items: ZoteroItem[]; collections: Collection[] } {
  // 1. Main items — EAV pivot via conditional aggregation
  const rawItems = db.prepare(`
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
  `).all() as any[];

  // 2. All creators ordered by item and position
  const allCreators = db.prepare(`
    SELECT ic.itemID, c.firstName, c.lastName, ct.creatorType
    FROM itemCreators ic
    JOIN creators c ON ic.creatorID = c.creatorID
    JOIN creatorTypes ct ON ic.creatorTypeID = ct.creatorTypeID
    ORDER BY ic.itemID, ic.orderIndex
  `).all() as any[];

  // 3. All tags
  const allTags = db.prepare(`
    SELECT it2.itemID, t.name
    FROM itemTags it2
    JOIN tags t ON it2.tagID = t.tagID
    ORDER BY it2.itemID
  `).all() as any[];

  // 4. Collection memberships
  const allCollMemberships = db.prepare(`
    SELECT itemID, collectionID FROM collectionItems ORDER BY itemID
  `).all() as any[];

  // 5. Notes (child note items linked to parent)
  const allNotes = db.prepare(`
    SELECT n.parentItemID, n.itemID, n.note, i.dateAdded, i.dateModified
    FROM itemNotes n
    JOIN items i ON n.itemID = i.itemID
    WHERE n.parentItemID IS NOT NULL
    ORDER BY n.parentItemID
  `).all() as any[];

  // 6. Attachments (child attachment items linked to parent)
  const allAttachments = db.prepare(`
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
  `).all() as any[];

  // 7. Collections tree
  const rawCollections = db.prepare(`
    SELECT c.collectionID, c.collectionName, c.parentCollectionID
    FROM collections c
    JOIN libraries l ON c.libraryID = l.libraryID
    LEFT JOIN deletedCollections dc ON c.collectionID = dc.collectionID
    WHERE dc.collectionID IS NULL AND l.type != 'feed'
    ORDER BY c.collectionID
  `).all() as any[];

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
      title: row.title ?? row.path ?? 'Attachment',
      url: row.url ?? undefined,
      mimeType: row.contentType ?? '',
      path: row.path ?? undefined,
    });
    attachsByItem.set(row.parentItemID, list);
  }

  // --- Assemble final ZoteroItem objects ---

  const items: ZoteroItem[] = rawItems.map((row: any) => ({
    id: row.id,
    itemType: row.itemType as any,
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
    ...rawCollections.map((row: any) => ({
      id: String(row.collectionID),
      name: row.collectionName,
      parentId: row.parentCollectionID != null ? String(row.parentCollectionID) : undefined,
    })),
  ];

  return { items, collections };
}

// Cache the result — DB is read-only and Zotero won't change it mid-session.
// Invalidate by restarting the server.
let cached: ReturnType<typeof queryLibrary> | null = null;

function getLibrary() {
  if (!cached) {
    console.log('Loading library from Zotero DB...');
    const start = Date.now();
    cached = queryLibrary();
    console.log(`Loaded ${cached.items.length} items, ${cached.collections.length} collections in ${Date.now() - start}ms`);
  }
  return cached;
}

const app = express();
app.use(express.json());

app.get('/api/config', (_req, res) => {
  let user_id = process.env.ZOTERO_USER_ID;
  if (!user_id) {
    try {
      const users = db.prepare('SELECT userID FROM users LIMIT 1').all() as any[];
      if (users && users.length > 0) {
        user_id = String(users[0].userID);
      }
    } catch (err) {
      console.error('Failed to query userID from users table:', err);
    }
  }
  res.json({
    apiKey: process.env.ZOTERO_API_KEY || '',
    userId: user_id || ''
  });
});

app.get('/api/library', (_req, res) => {
  res.json(getLibrary());
});

app.listen(PORT, () => {
  console.log(`Zotero API server → http://localhost:${PORT}`);
  // Warm the cache immediately on startup
  getLibrary();
});
