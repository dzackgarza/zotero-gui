export const ITEM_TYPES = [
  'journalArticle',
  'book',
  'bookSection',
  'attachment',
  'conferencePaper',
  'thesis',
  'webpage',
  'report',
  'patent',
  'preprint',
  'manuscript',
  'document',
  'presentation',
  'magazineArticle',
  'newspaperArticle',
  'blogPost',
  'forumPost',
  'encyclopediaArticle',
  'dictionaryEntry',
  'interview',
  'film',
  'tvBroadcast',
  'radioBroadcast',
  'podcast',
  'artwork',
  'statute',
  'bill',
  'case',
  'hearing',
  'map',
  'computerProgram',
  'email',
  'letter',
  'audioRecording',
  'videoRecording',
] as const;

export type ItemType = typeof ITEM_TYPES[number];

const ITEM_TYPE_LABEL_MAP: Record<ItemType, string> = {
  journalArticle: 'Journal Article',
  book: 'Book',
  bookSection: 'Book Section',
  attachment: 'Attachment',
  conferencePaper: 'Conference Paper',
  thesis: 'Thesis',
  webpage: 'Webpage',
  report: 'Report',
  patent: 'Patent',
  preprint: 'Preprint',
  manuscript: 'Manuscript',
  document: 'Document',
  presentation: 'Presentation',
  magazineArticle: 'Magazine Article',
  newspaperArticle: 'Newspaper Article',
  blogPost: 'Blog Post',
  forumPost: 'Forum Post',
  encyclopediaArticle: 'Encyclopedia Article',
  dictionaryEntry: 'Dictionary Entry',
  interview: 'Interview',
  film: 'Film',
  tvBroadcast: 'TV Broadcast',
  radioBroadcast: 'Radio Broadcast',
  podcast: 'Podcast',
  artwork: 'Artwork',
  statute: 'Statute',
  bill: 'Bill',
  case: 'Case',
  hearing: 'Hearing',
  map: 'Map',
  computerProgram: 'Software',
  email: 'Email',
  letter: 'Letter',
  audioRecording: 'Audio Recording',
  videoRecording: 'Video Recording',
};

export function getItemTypeLabel(type: ItemType): string {
  return ITEM_TYPE_LABEL_MAP[type];
}

export interface Creator {
  firstName: string;
  lastName: string;
  creatorType: string; // Zotero has: author, editor, translator, inventor, seriesEditor, contributor, bookAuthor, etc.
}

export interface Attachment {
  id: string;
  title: string;
  url?: string;
  mimeType: string;
  path?: string;
}

export interface ItemNote {
  id: string;
  note: string;
  dateAdded: string;
  dateModified: string;
}

export interface ZoteroItem {
  id: string;
  itemType: ItemType;
  title?: string;
  creators: Creator[];
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  date?: string; // Date or year
  publisher?: string;
  place?: string;
  doi?: string;
  url?: string;
  isbn?: string;
  issn?: string;
  accessDate?: string;
  archive?: string;
  archiveLocation?: string;
  callNumber?: string;
  language?: string;
  rights?: string;
  extra?: string;
  abstractNote?: string;
  citekey?: string;
  tags: string[];
  notes: ItemNote[];
  attachments: Attachment[];
  collections: string[]; // List of collection IDs it belongs to
  dateAdded: string;
  dateModified: string;
  inTrash?: boolean;
}

// A collection is one of two genuinely different kinds, distinguished by `kind`:
//
//  - The synthetic 'all' My Library root VIEW the server prepends so the sidebar
//    can render it. It is not a real Zotero collection, so it has no real Zotero
//    key and no parent.
//  - A REAL Zotero collection, which always carries its real Zotero collection
//    key (collections.key). The import boundary forwards this key verbatim to the
//    Zotero write plugin as a collection_keys entry; sidebar selection and in-app
//    membership/filtering use the internal numeric collectionID (as a string) via
//    `id`.
//
// Modeling these as a discriminated union makes a keyless real collection
// unrepresentable: `key` is non-optional on the real variant, so a real
// collection missing its key is a compile-time error rather than a value the
// import path must defend against at runtime.

interface CollectionBase {
  id: string;
  name: string;
  icon?: string;
}

export interface LibraryRootCollection extends CollectionBase {
  kind: 'library-root';
}

export interface RealCollection extends CollectionBase {
  kind: 'real';
  parentId?: string; // For nested sub-collections
  // Real Zotero collection key (collections.key), required on every real
  // collection. Used only at the import boundary.
  key: string;
}

export type Collection = LibraryRootCollection | RealCollection;

// Columns definition for table Customization
export interface ColumnDefinition {
  key: keyof ZoteroItem | 'creators_compact';
  label: string;
  visible: boolean;
  width?: number; // width in px
}

// Advanced Search parameters
export interface AdvancedSearchSettings {
  query: string;
  matchCase: boolean;
  matchType: 'all' | 'any'; // AND vs OR logic
  searchFields: Record<string, boolean>;
}

export interface Command {
  id: string;
  name: string;
  shortcut?: string;
  action: () => void;
  category?: string;
}
