import { describe, expect, it } from 'vitest';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
// @ts-expect-error: resolver libs are plain .mjs without type declarations.
import { bookBibTeX } from '../resolver-plugins/isbn-lib.mjs';
// @ts-expect-error: resolver libs are plain .mjs without type declarations.
import { articleBibTeX, parseZblNumber } from '../resolver-plugins/zbmath-lib.mjs';
// @ts-expect-error: resolver libs are plain .mjs without type declarations.
import { doiRequestUrl } from '../resolver-plugins/doi.mjs';
// @ts-expect-error: resolver libs are plain .mjs without type declarations.
import { arxivIdFromInput } from '../resolver-plugins/arxiv.mjs';
import { parseBibTeXToMetadata } from './utils/bibtexParser';

// A title loaded with every BibTeX special character: braces (including an
// UNBALANCED one), ampersand, dollar, percent, hash, underscore, and backslash.
// Citation.js's BibTeX output module fully escapes these in string fields such
// as `title`/`publisher` (e.g. `}` -> `\textbraceright{}`) and they round-trip
// cleanly through the project gate parser. Name fields are the exception and are
// covered by the dedicated brace-rejection tests below.
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

  // Citation.js's BibTeX output module escapes braces in the title/publisher
  // fields but emits CSL name fields by wrapping the raw string in `{...}`
  // WITHOUT escaping interior braces. A `}` in an author name therefore yields
  // unbalanced BibTeX ("author = {{Smith }}}") that the gate parser truncates,
  // dropping the title. A brace is never legitimate content in a personal name,
  // so the resolver must reject it loudly rather than emit corrupt BibTeX.
  it('throws on an author name containing a BibTeX brace delimiter', () => {
    expect(() =>
      bookBibTeX({
        isbn: '9780387902449',
        title: 'A Perfectly Fine Title',
        authors: ['Smith }'],
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

  // Same name-field hazard as the ISBN resolver: Citation.js cannot escape a
  // brace inside an author name, so the resolver must reject it loudly.
  it('throws on an author name containing a BibTeX brace delimiter', () => {
    const braceAuthorDocument = {
      ...zbmathDocument,
      contributors: { authors: [{ name: 'Bourbaki }collective{' }] },
    };
    expect(() => articleBibTeX(braceAuthorDocument, '0139.24606')).toThrow();
  });

  // zbMath returns `year` as a free-text string. `Number.parseInt('circa 2019')`
  // is NaN, which the old code serialized as `year = {NaN}`. The resolver must
  // require a real four-digit year and throw when none is present, rather than
  // emitting a NaN year.
  it('throws when the year field contains no four-digit year', () => {
    const noYearDocument = { ...zbmathDocument, year: 'circa nineteen-sixty-eight' };
    expect(() => articleBibTeX(noYearDocument, '0139.24606')).toThrow();
  });

  it('extracts the four-digit year embedded in a free-text year string', () => {
    const messyYearDocument = { ...zbmathDocument, year: 'published 1968 (reprint)' };
    const bibtex = articleBibTeX(messyYearDocument, '0139.24606');
    const data = new Cite(bibtex).data[0] as { issued: { 'date-parts': number[][] } };
    expect(data.issued['date-parts'][0][0]).toBe(1968);
  });
});

describe('doiRequestUrl (DOI resolver) percent-encodes the suffix', () => {
  // A DOI suffix may legitimately contain URI-reserved characters. `encodeURI`
  // leaves `?` and `#` unescaped, so the URL parser reinterprets them as the
  // query/fragment boundary and the suffix is lost from the path, resolving the
  // wrong identifier. The suffix must be percent-encoded so reserved characters
  // travel as path data, while the `10.xxxx/` namespace slash is preserved.
  it('preserves the namespace slash for a simple DOI', () => {
    expect(doiRequestUrl('10.1007/BF01388432')).toBe('https://doi.org/10.1007/BF01388432');
  });

  it('percent-encodes a `?` in the suffix instead of starting a query string', () => {
    const url = doiRequestUrl('10.1234/foo?bar');
    expect(url).toBe('https://doi.org/10.1234/foo%3Fbar');
    // The reserved character must NOT leak into the URL query component.
    expect(new URL(url).search).toBe('');
    expect(new URL(url).pathname).toBe('/10.1234/foo%3Fbar');
  });

  it('percent-encodes a `#` in the suffix instead of starting a fragment', () => {
    const url = doiRequestUrl('10.1234/foo#bar');
    expect(url).toBe('https://doi.org/10.1234/foo%23bar');
    expect(new URL(url).hash).toBe('');
    expect(new URL(url).pathname).toBe('/10.1234/foo%23bar');
  });
});

describe('parseZblNumber (zbMath resolver) strips the AN prefix the server accepts', () => {
  // pluginAcceptsInput tests the manifest pattern with the `i` flag, so the
  // server accepts the zbMATH AN prefix case-insensitively: `AN:`, `An:`, `aN:`,
  // and `an:` are all contract-valid inputs. The plugin must strip the prefix
  // case-insensitively so EVERY accepted input produces the same bare zbMATH
  // number that the resolver sends upstream as `an:<number>`. A lowercase-only
  // strip leaves `AN:0139.24606` intact, which is re-sent as `an:AN:0139.24606`
  // and never resolves.
  it('yields the same bare number for every accepted case of the bare AN prefix', () => {
    const bare = parseZblNumber('an:0139.24606');
    expect(bare).toBe('0139.24606');
    expect(parseZblNumber('AN:0139.24606')).toBe(bare);
    expect(parseZblNumber('An:0139.24606')).toBe(bare);
    expect(parseZblNumber('aN:0139.24606')).toBe(bare);
  });

  it('strips an uppercase/mixed AN prefix from the `?q=` URL form too', () => {
    const fromLower = parseZblNumber('https://zbmath.org/?q=an:0787.14001');
    expect(fromLower).toBe('0787.14001');
    expect(parseZblNumber('https://zbmath.org/?q=AN:0787.14001')).toBe(fromLower);
    expect(parseZblNumber('https://zbmath.org/?q=An:0787.14001')).toBe(fromLower);
  });

  it('leaves an already-bare number unchanged', () => {
    expect(parseZblNumber('0139.24606')).toBe('0139.24606');
  });
});

describe('arxivIdFromInput (arXiv resolver) normalizes every accepted URL form', () => {
  // The manifest accepts both bare IDs and arXiv URLs whose path tail is matched
  // by `[^\s]+`, so a PDF link may carry a `.pdf` suffix plus a query string or
  // fragment. The query/fragment must be removed BEFORE the `.pdf` suffix: if
  // `.pdf` is stripped first it is no longer at the end of the string and
  // survives, leaving a malformed id like `2401.01234.pdf` that fails the
  // upstream request. Every accepted form must extract the same bare id.
  it.each([
    ['2401.01234', '2401.01234'],
    ['arXiv:2401.01234', '2401.01234'],
    ['https://arxiv.org/abs/2401.01234', '2401.01234'],
    ['https://arxiv.org/pdf/2401.01234', '2401.01234'],
    ['https://arxiv.org/pdf/2401.01234.pdf', '2401.01234'],
    ['https://arxiv.org/pdf/2401.01234.pdf?download=1', '2401.01234'],
    ['https://arxiv.org/pdf/2401.01234.pdf#section', '2401.01234'],
    ['https://arxiv.org/abs/math.AG/0601001', 'math.AG/0601001'],
  ])('extracts %s -> %s', (input, expected) => {
    expect(arxivIdFromInput(input)).toBe(expected);
  });
});
