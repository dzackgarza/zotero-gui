import { describe, expect, it } from 'vitest';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { isCitable, toBibTeX, toFormattedCitation } from './citation';
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

describe('copying a citation requires a name-bearing creator', () => {
  // The user story: pressing "copy citation"/"copy BibTeX" for an item whose
  // only creator is a non-author/non-editor role (translator, contributor,
  // inventor, …) must fail loudly. Such an item has no bibliographic name, so
  // the rendered citation would be nameless — the same authorless-citation error
  // the import gate (parseBibTeXToMetadata) already rejects. The copy path must
  // not silently emit a degenerate, nameless citation, and must not invent a
  // placeholder author.
  it('throws when the only creator is a translator (no author, no editor)', () => {
    const translatorOnly = makeItem({
      itemType: 'book',
      title: 'The Iliad',
      creators: [{ firstName: 'Emily', lastName: 'Wilson', creatorType: 'translator' }],
      publisher: 'Norton',
      date: '2023',
    });

    // Both copy entrypoints inherit the throw from itemToCsl.
    expect(() => toBibTeX(translatorOnly)).toThrow();
    expect(() => toFormattedCitation(translatorOnly)).toThrow();
  });

  it('throws when the only creator is a contributor (no author, no editor)', () => {
    const contributorOnly = makeItem({
      itemType: 'journalArticle',
      title: 'A Survey of Heights',
      creators: [{ firstName: 'Joseph', lastName: 'Silverman', creatorType: 'contributor' }],
      publicationTitle: 'Surveys in Number Theory',
      date: '2010',
    });

    expect(() => toBibTeX(contributorOnly)).toThrow();
    expect(() => toFormattedCitation(contributorOnly)).toThrow();
  });

  it('renders an item that has an author (the citation carries the surname)', () => {
    const authored = makeItem({
      itemType: 'book',
      title: 'Algebraic Number Theory',
      creators: [{ firstName: 'Jürgen', lastName: 'Neukirch', creatorType: 'author' }],
      publisher: 'Springer',
      date: '1999',
    });

    expect(toBibTeX(authored)).toContain('Neukirch');
    expect(toFormattedCitation(authored)).toContain('Neukirch');
  });

  it('renders an edited volume that has an editor but no author', () => {
    // An edited volume is bibliographically VALID: the editor is the
    // name-bearing creator. It must still render — only the truly nameless
    // case throws.
    const editedVolume = makeItem({
      itemType: 'book',
      title: 'The Princeton Companion to Mathematics',
      creators: [{ firstName: 'Timothy', lastName: 'Gowers', creatorType: 'editor' }],
      publisher: 'Princeton University Press',
      date: '2008',
    });

    expect(toBibTeX(editedVolume)).toContain('Gowers');
    expect(toFormattedCitation(editedVolume)).toContain('Gowers');
  });
});

describe('isCitable distinguishes works that have a bibliographic form', () => {
  // The citability predicate the UI consults to decide whether to offer the
  // copy-citation actions. It is the type-level inverse of itemToCsl's
  // throw-for-non-citable-type branch: a citable type renders, an attachment
  // (a raw file, not a citable work) does not.
  it('is true for a bibliographic work type and false for an attachment', () => {
    const book = makeItem({ itemType: 'book', title: 'Citable Work' });
    const attachment = makeItem({ itemType: 'attachment', title: 'scan.pdf' });

    expect(isCitable(book)).toBe(true);
    expect(isCitable(attachment)).toBe(false);
  });

  it('agrees with itemToCsl: a non-citable type throws and a citable type renders', () => {
    // Prove the predicate is the same throw-vs-render decision, not an
    // independent hardcoded list. Each item carries a real author so only the
    // TYPE-level decision is exercised (the nameless-creator throw is separate).
    const probe = (itemType: ItemType): ZoteroItem => makeItem({
      itemType,
      title: 'Probe Title',
      creators: [{ firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' }],
    });

    // The non-citable type: isCitable false, and rendering it throws.
    const attachment = probe('attachment');
    expect(isCitable(attachment)).toBe(false);
    expect(() => toBibTeX(attachment)).toThrow();

    // Citable types: isCitable true, and rendering them does NOT throw.
    for (const itemType of ['journalArticle', 'book', 'conferencePaper', 'thesis', 'webpage'] as const) {
      const item = probe(itemType);
      expect(isCitable(item), `${itemType} must be citable`).toBe(true);
      expect(() => toBibTeX(item), `${itemType} must render`).not.toThrow();
    }
  });
});
