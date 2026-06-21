import { describe, expect, it } from 'vitest';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { toBibTeX, toFormattedCitation } from './citation';
import { ItemType, ZoteroItem } from '../types';

// A minimal ZoteroItem factory: only the fields under test are interesting;
// the rest are filled with empty collections so the domain shape is honoured.
function makeItem(overrides: Partial<ZoteroItem> & { itemType: ItemType }): ZoteroItem {
  return {
    id: 'test-id',
    creators: [],
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2020-01-01',
    dateModified: '2020-01-01',
    ...overrides,
  };
}

// Re-parse a single serialized BibTeX entry back into CSL-JSON via Citation.js,
// proving the emitted BibTeX is well-formed and preserves the field values.
function reparse(bibtex: string): Record<string, unknown> {
  const data = new Cite(bibtex).data;
  expect(data).toHaveLength(1);
  return data[0] as Record<string, unknown>;
}

function entryType(bibtex: string): string {
  const match = /^@(\w+)\{/.exec(bibtex.trim());
  if (!match) throw new Error(`Not a BibTeX entry: ${bibtex}`);
  return match[1];
}

describe('toBibTeX emits an entry type reflecting the real itemType', () => {
  it('serializes a book as @book (NOT @article) and round-trips title/authors', () => {
    const item = makeItem({
      itemType: 'book',
      title: 'Algebraic Geometry',
      creators: [{ firstName: 'Robin', lastName: 'Hartshorne', creatorType: 'author' }],
      publisher: 'Springer',
      date: '1977',
      isbn: '9780387902449',
    });

    const bibtex = toBibTeX(item);

    // The discriminating claim: the old code hard-coded @article for every
    // item. A correct mapping emits @book here.
    expect(entryType(bibtex)).toBe('book');
    expect(entryType(bibtex)).not.toBe('article');

    const entry = reparse(bibtex);
    expect(entry.title).toBe('Algebraic Geometry');
    expect(entry.author).toEqual([{ family: 'Hartshorne', given: 'Robin' }]);
    expect(entry.type).toBe('book');
  });

  it('serializes a journalArticle as @article preserving container-title/volume/issue/page', () => {
    const item = makeItem({
      itemType: 'journalArticle',
      title: 'Good Reduction of Abelian Varieties',
      creators: [
        { firstName: 'Jean-Pierre', lastName: 'Serre', creatorType: 'author' },
        { firstName: 'John', lastName: 'Tate', creatorType: 'author' },
      ],
      publicationTitle: 'Annals of Mathematics',
      volume: '88',
      issue: '2',
      pages: '492-517',
      date: '1968',
      doi: '10.2307/1970722',
    });

    const bibtex = toBibTeX(item);
    expect(entryType(bibtex)).toBe('article');

    const entry = reparse(bibtex);
    expect(entry['container-title']).toBe('Annals of Mathematics');
    expect(entry.volume).toBe('88');
    expect(entry.issue).toBe('2');
    expect(entry.page).toBe('492-517');
    expect(entry.DOI).toBe('10.2307/1970722');
    expect(entry.author).toEqual([
      { family: 'Serre', given: 'Jean-Pierre' },
      { family: 'Tate', given: 'John' },
    ]);
  });

  it('serializes a conferencePaper as @inproceedings', () => {
    const item = makeItem({
      itemType: 'conferencePaper',
      title: 'Attention Is All You Need',
      creators: [{ firstName: 'Ashish', lastName: 'Vaswani', creatorType: 'author' }],
      publicationTitle: 'Advances in Neural Information Processing Systems',
      date: '2017',
    });

    expect(entryType(toBibTeX(item))).toBe('inproceedings');
  });
});

describe('absent date is omitted, never fabricated as a placeholder', () => {
  // The old App.tsx wrote `(${date || 'N.D.'})` and the old InspectorPanel
  // wrote `year = {${item.date || 'unknown'}}`. A dateless item must produce
  // neither of those fabricated tokens. (The APA style's own lowercase
  // "(n.d.)" marker is the citeproc engine's correct rendering and is NOT
  // owned by this code, so it is deliberately not asserted against.)
  const datelessBook = makeItem({
    itemType: 'book',
    title: 'Untitled Treatise',
    creators: [{ firstName: 'Nicolas', lastName: 'Bourbaki', creatorType: 'author' }],
    publisher: 'Hermann',
  });

  it('toBibTeX omits the year field entirely and emits no "unknown"/"N.D."', () => {
    const bibtex = toBibTeX(datelessBook);
    expect(bibtex).not.toMatch(/year\s*=/);
    expect(bibtex).not.toContain('unknown');
    expect(bibtex).not.toContain('N.D.');
  });

  it('toFormattedCitation emits no fabricated "N.D."/"unknown" tokens', () => {
    const citation = toFormattedCitation(datelessBook);
    expect(citation).not.toContain('N.D.');
    expect(citation).not.toContain('unknown');
  });
});

describe('toFormattedCitation produces a real APA bibliography string', () => {
  it('contains the author surname and the year for a dated item', () => {
    const item = makeItem({
      itemType: 'journalArticle',
      title: 'Good Reduction of Abelian Varieties',
      creators: [
        { firstName: 'Jean-Pierre', lastName: 'Serre', creatorType: 'author' },
        { firstName: 'John', lastName: 'Tate', creatorType: 'author' },
      ],
      publicationTitle: 'Annals of Mathematics',
      date: '1968',
    });

    const citation = toFormattedCitation(item);
    expect(citation.length).toBeGreaterThan(0);
    expect(citation).toContain('Serre');
    expect(citation).toContain('1968');
    expect(citation).toContain('Good Reduction of Abelian Varieties');
  });
});

describe('non-citable item types fail loud rather than defaulting', () => {
  it('throws for an attachment (no bibliographic CSL type, no silent coercion)', () => {
    const attachment = makeItem({ itemType: 'attachment', title: 'scan.pdf' });
    expect(() => toBibTeX(attachment)).toThrow();
    expect(() => toFormattedCitation(attachment)).toThrow();
  });
});
