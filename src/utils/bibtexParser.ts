import bibtexParse from 'bibtex-parse-js';
import type { Creator, ItemType } from '../types';

export interface BibTeXItemMetadata {
  itemType: ItemType;
  title: string;
  creators: Creator[];
  date?: string;
  publicationTitle?: string;
  publisher?: string;
  doi?: string;
  isbn?: string;
  url?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  abstractNote?: string;
  citekey?: string;
}

export function parseBibTeXToMetadata(bibtexStr: string): BibTeXItemMetadata {
  const parsed = bibtexParse.toJSON(bibtexStr);
  if (!parsed || parsed.length === 0) {
    throw new Error('Invalid BibTeX input or empty entry list.');
  }
  if (parsed.length !== 1) {
    throw new Error('BibTeX input must contain exactly one entry.');
  }

  const entry = parsed[0];
  const tags = entry.entryTags || {};

  const cleanValue = (val: string | undefined): string => {
    if (!val) return '';
    let s = val.trim();
    while (s.startsWith('{') && s.endsWith('}')) {
      s = s.substring(1, s.length - 1).trim();
    }
    s = s.replace(/\\([&%$#_{}])/g, '$1');
    return s.trim();
  };

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

  const rawAuthors = tags.author || tags.AUTHOR || '';
  const creators = rawAuthors ? rawAuthors.split(/\s+and\s+/i).map(authorStr => {
    const cleanStr = cleanValue(authorStr);
    if (cleanStr.includes(',')) {
      const parts = cleanStr.split(',');
      const lastName = parts[0].trim();
      const firstName = parts.slice(1).join(',').trim();
      return { firstName, lastName, creatorType: 'author' };
    }
    const parts = cleanStr.split(/\s+/);
    const lastName = parts.pop() || '';
    const firstName = parts.join(' ');
    return { firstName, lastName, creatorType: 'author' };
  }) : [];

  const title = cleanValue(tags.title || tags.TITLE);
  const date = cleanValue(tags.year || tags.YEAR || tags.date || tags.DATE);
  const publicationTitle = cleanValue(tags.journal || tags.JOURNAL || tags.booktitle || tags.BOOKTITLE || tags.series);
  const publisher = cleanValue(tags.publisher || tags.PUBLISHER);
  const doi = cleanValue(tags.doi || tags.DOI);
  const isbn = cleanValue(tags.isbn || tags.ISBN);
  const url = cleanValue(tags.url || tags.URL || tags.eprint || tags.EPRINT);
  const volume = cleanValue(tags.volume || tags.VOLUME);
  const issue = cleanValue(tags.number || tags.NUMBER || tags.issue || tags.ISSUE);
  const pages = cleanValue(tags.pages || tags.PAGES);
  const abstractNote = cleanValue(tags.abstract || tags.ABSTRACT);

  if (!title) {
    throw new Error('BibTeX entry must contain a title.');
  }

  return {
    itemType,
    title,
    creators,
    date: date || undefined,
    publicationTitle: publicationTitle || undefined,
    publisher: publisher || undefined,
    doi: doi || undefined,
    isbn: isbn || undefined,
    url: url || undefined,
    volume: volume || undefined,
    issue: issue || undefined,
    pages: pages || undefined,
    abstractNote: abstractNote || undefined,
    citekey: entry.citationKey || undefined,
  };
}
