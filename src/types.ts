export type ItemType =
  | 'journalArticle'
  | 'book'
  | 'bookSection'
  | 'conferencePaper'
  | 'thesis'
  | 'webpage'
  | 'report'
  | 'patent'
  | 'preprint'
  | 'manuscript'
  | 'document'
  | 'presentation'
  | 'magazineArticle'
  | 'newspaperArticle'
  | 'blogPost'
  | 'forumPost'
  | 'encyclopediaArticle'
  | 'dictionaryEntry'
  | 'interview'
  | 'film'
  | 'tvBroadcast'
  | 'radioBroadcast'
  | 'podcast'
  | 'artwork'
  | 'statute'
  | 'bill'
  | 'case'
  | 'hearing'
  | 'map'
  | 'computerProgram'
  | 'email'
  | 'letter'
  | 'audioRecording'
  | 'videoRecording'
  | string; // catch-all for future Zotero types

const ITEM_TYPE_LABEL_MAP: Record<string, string> = {
  journalArticle: 'Journal Article',
  book: 'Book',
  bookSection: 'Book Section',
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

export function getItemTypeLabel(type: string): string {
  return ITEM_TYPE_LABEL_MAP[type] ?? type.replace(/([A-Z])/g, ' $1').trim();
}

// Keep for backward-compat usage sites that reference ITEM_TYPE_LABELS
export const ITEM_TYPE_LABELS = ITEM_TYPE_LABEL_MAP;

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
  title: string;
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

export interface Collection {
  id: string;
  name: string;
  parentId?: string; // For nested sub-collections
  icon?: string;
}

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
  fuzzyThreshold: number; // 0 (strict) to 1 (very broad/fuzzy)
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
