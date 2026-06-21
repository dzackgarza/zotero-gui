import { z } from 'zod';
import { ITEM_TYPES } from './types';

export const ItemTypeSchema = z.enum(ITEM_TYPES);

export const CreatorSchema = z.strictObject({
  firstName: z.string(),
  lastName: z.string(),
  creatorType: z.string(),
});

export const ItemNoteSchema = z.strictObject({
  id: z.string(),
  note: z.string(),
  dateAdded: z.string(),
  dateModified: z.string(),
});

export const AttachmentSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  url: z.string().optional(),
  mimeType: z.string(),
  path: z.string().optional(),
});

export const CollectionSchema = z.strictObject({
  id: z.string(),
  name: z.string(),
  parentId: z.string().optional(),
  icon: z.string().optional(),
});

export const ZoteroItemSchema = z.strictObject({
  id: z.string(),
  itemType: ItemTypeSchema,
  title: z.string().optional(),
  creators: z.array(CreatorSchema),
  publicationTitle: z.string().optional(),
  volume: z.string().optional(),
  issue: z.string().optional(),
  pages: z.string().optional(),
  date: z.string().optional(),
  publisher: z.string().optional(),
  place: z.string().optional(),
  doi: z.string().optional(),
  url: z.string().optional(),
  isbn: z.string().optional(),
  issn: z.string().optional(),
  accessDate: z.string().optional(),
  archive: z.string().optional(),
  archiveLocation: z.string().optional(),
  callNumber: z.string().optional(),
  language: z.string().optional(),
  rights: z.string().optional(),
  extra: z.string().optional(),
  abstractNote: z.string().optional(),
  citekey: z.string().optional(),
  tags: z.array(z.string()),
  notes: z.array(ItemNoteSchema),
  attachments: z.array(AttachmentSchema),
  collections: z.array(z.string()),
  dateAdded: z.string(),
  dateModified: z.string(),
  inTrash: z.boolean().optional(),
});

export const LibraryPayloadSchema = z.strictObject({
  items: z.array(ZoteroItemSchema),
  collections: z.array(CollectionSchema),
});

export const StartupStatusSchema = z.strictObject({
  zotero: z.strictObject({
    running: z.literal(true),
  }),
});

export const ApiErrorResponseSchema = z.strictObject({
  error: z.strictObject({
    kind: z.string().min(1),
    message: z.string().min(1),
  }),
});

export const AcceptedInputDescriptorSchema = z.strictObject({
  id: z.string().min(1),
  label: z.string().min(1),
  example: z.string().min(1),
  pattern: z.string().min(1),
});

export const ResolverPluginMetadataSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  acceptedInputs: z.array(AcceptedInputDescriptorSchema).min(1),
});

export const ResolverPluginMetadataListSchema = z.array(ResolverPluginMetadataSchema);

// Built solely from the authoritative Zotero write-boundary result
// (item_key / item_id / titles[0]). The route does not re-read the
// eventually-consistent library snapshot to confirm the write, so this
// response carries only what the write boundary itself returns.
export const CreatedItemResponseSchema = z.strictObject({
  key: z.string().min(1),
  itemId: z.number().int(),
  title: z.string(),
});

export type LibraryPayload = z.infer<typeof LibraryPayloadSchema>;
export type StartupStatus = z.infer<typeof StartupStatusSchema>;
export type ResolverPluginMetadata = z.infer<typeof ResolverPluginMetadataSchema>;
export type CreatedItemResponse = z.infer<typeof CreatedItemResponseSchema>;
