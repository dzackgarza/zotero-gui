import { describe, expect, it } from 'vitest';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
// @ts-expect-error: resolver libs are plain .mjs without type declarations.
import { bookBibTeX } from '../resolver-plugins/isbn-lib.mjs';
// @ts-expect-error: resolver libs are plain .mjs without type declarations.
import { articleBibTeX } from '../resolver-plugins/zbmath-lib.mjs';
import { parseBibTeXToMetadata } from './utils/bibtexParser';

// A title loaded with every BibTeX special character that the old hand-rolled
// `{${value}}` interpolation could not escape: braces (including an UNBALANCED
// one, which made the old splicer emit BibTeX that the project gate parser
// rejected with "Token mismatch, expected }"), ampersand, dollar, percent,
// hash, underscore, and backslash.
const HOSTILE_TITLE = 'On {Quantum Groups & $L$-functions: 50% off #1 a_b \\delta Survey';

function reparseSingle(bibtex: string): { title: string; author: Array<{ literal?: string; family?: string }> } {
  const data = new Cite(bibtex).data;
  expect(data).toHaveLength(1);
  return data[0] as { title: string; author: Array<{ literal?: string; family?: string }> };
}

function authorNames(author: Array<{ literal?: string; family?: string }>): string[] {
  return author.map(entry => entry.literal ?? entry.family ?? '');
}

describe('bookBibTeX (ISBN resolver) serializes via Citation.js', () => {
  it('escapes hostile field characters so the entry re-parses to identical values', () => {
    const bibtex = bookBibTeX({
      isbn: '9780387902449',
      title: HOSTILE_TITLE,
      authors: ['Donald E. Knuth', 'Leslie Lamport'],
      publisher: 'Addison-Wesley',
      year: '1984',
    });

    // The project's validation gate must accept the serialized entry.
    expect(() => parseBibTeXToMetadata(bibtex)).not.toThrow();

    // The escaped BibTeX must round-trip back to the EXACT input values,
    // proving the special characters were escaped rather than mangled.
    const entry = reparseSingle(bibtex);
    expect(entry.title).toBe(HOSTILE_TITLE);
    expect(authorNames(entry.author)).toEqual(['Donald E. Knuth', 'Leslie Lamport']);
  });

  it('throws on an authorless book (owner policy: authorless citation is an error)', () => {
    expect(() =>
      bookBibTeX({
        isbn: '9780387902449',
        title: HOSTILE_TITLE,
        authors: [],
        publisher: 'Addison-Wesley',
        year: '1984',
      }),
    ).toThrow();
  });
});

describe('articleBibTeX (zbMath resolver) serializes via Citation.js', () => {
  // Minimal zbMath document shaped exactly as zbmath-lib.mjs reads it, with a
  // hostile title and a journal name carrying an ampersand.
  const zbmathDocument = {
    id: 139246060,
    year: '1968',
    contributors: {
      authors: [{ name: 'Jean-Pierre Serre' }, { name: 'John Tate' }],
    },
    title: { title: HOSTILE_TITLE, subtitle: '' },
    links: [{ type: 'doi', identifier: '10.2307/1970722' }],
    source: {
      pages: '492-517',
      serial: [{ title: 'Annals of Mathematics & Physics', volume: '88', issue: '2' }],
    },
  };

  it('escapes hostile field characters so the article re-parses to identical values', () => {
    const bibtex = articleBibTeX(zbmathDocument, '0139.24606');

    expect(() => parseBibTeXToMetadata(bibtex)).not.toThrow();

    const entry = reparseSingle(bibtex);
    expect(entry.title).toBe(HOSTILE_TITLE);
    expect(authorNames(entry.author)).toEqual(['Jean-Pierre Serre', 'John Tate']);

    // Optional fields the spec requires the article to preserve.
    const data = new Cite(bibtex).data[0] as Record<string, unknown>;
    expect(data['container-title']).toBe('Annals of Mathematics & Physics');
    expect(data.volume).toBe('88');
    expect(data.issue).toBe('2');
    expect(data.page).toBe('492-517');
    expect(data.DOI).toBe('10.2307/1970722');
  });
});
