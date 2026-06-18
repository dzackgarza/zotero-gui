import bibtexParse from 'bibtex-parse-js';
import { ZoteroItem, ItemType } from '../types';

export function parseBibTeXToItem(bibtexStr: string): Partial<ZoteroItem> {
  const parsed = bibtexParse.toJSON(bibtexStr);
  if (!parsed || parsed.length === 0) {
    throw new Error('Invalid BibTeX input or empty entry list.');
  }

  const entry = parsed[0];
  const tags = entry.entryTags || {};

  // Clean values (remove braces, e.g. {My Title} -> My Title)
  const cleanValue = (val: string | undefined): string => {
    if (!val) return '';
    let s = val.trim();
    // Recursively strip outer braces if present
    while (s.startsWith('{') && s.endsWith('}')) {
      s = s.substring(1, s.length - 1).trim();
    }
    // Remove common LaTeX escapes for special characters
    s = s.replace(/\\([&%$#_{}])/g, '$1');
    return s.trim();
  };

  // Map entry type to Zotero ItemType
  let itemType: ItemType = 'journalArticle';
  const rawType = entry.entryType.toLowerCase();
  if (rawType === 'book') {
    itemType = 'book';
  } else if (rawType === 'inproceedings' || rawType === 'proceedings' || rawType === 'conference') {
    itemType = 'conferencePaper';
  } else if (rawType === 'phdthesis' || rawType === 'mastersthesis' || rawType === 'thesis') {
    itemType = 'thesis';
  } else if (rawType === 'techreport') {
    itemType = 'report';
  } else if (rawType === 'patent') {
    itemType = 'patent';
  } else if (rawType === 'misc' || rawType === 'online') {
    itemType = 'webpage';
  }

  // Parse Authors
  const rawAuthors = tags.author || tags.AUTHOR || '';
  const creators = rawAuthors ? rawAuthors.split(/\s+and\s+/i).map(authorStr => {
    const cleanStr = cleanValue(authorStr);
    if (cleanStr.includes(',')) {
      const parts = cleanStr.split(',');
      const lastName = parts[0].trim();
      const firstName = parts.slice(1).join(',').trim();
      return { firstName, lastName, creatorType: 'author' };
    } else {
      const parts = cleanStr.split(/\s+/);
      const lastName = parts.pop() || '';
      const firstName = parts.join(' ');
      return { firstName, lastName, creatorType: 'author' };
    }
  }) : [{ firstName: '', lastName: 'Unknown Author', creatorType: 'author' }];

  // Clean individual tags
  const title = cleanValue(tags.title || tags.TITLE);
  const date = cleanValue(tags.year || tags.YEAR || tags.date || tags.DATE);
  const publicationTitle = cleanValue(tags.journal || tags.JOURNAL || tags.booktitle || tags.BOOKTITLE || tags.series || tags.publisher || tags.PUBLISHER);
  const doi = cleanValue(tags.doi || tags.DOI);
  const isbn = cleanValue(tags.isbn || tags.ISBN);
  const url = cleanValue(tags.url || tags.URL || tags.eprint || tags.EPRINT);
  const volume = cleanValue(tags.volume || tags.VOLUME);
  const issue = cleanValue(tags.number || tags.NUMBER || tags.issue || tags.ISSUE);
  const pages = cleanValue(tags.pages || tags.PAGES);
  const abstractNote = cleanValue(tags.abstract || tags.ABSTRACT);

  // Validate title is present
  if (!title) {
    throw new Error('BibTeX entry must contain a title.');
  }

  return {
    itemType,
    title,
    creators,
    date,
    publicationTitle,
    doi,
    isbn,
    url,
    volume,
    issue,
    pages,
    abstractNote,
    citekey: entry.citationKey || undefined
  };
}
