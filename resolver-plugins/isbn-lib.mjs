import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import { invariant, text } from './utils.mjs';
export { invariant };

export function normalizeIsbn(input) {
  const isbn = input.trim().replace(/^isbn:?\s*/i, '').replace(/[-\s]/g, '');
  invariant(isbn.length > 0, 'ISBN resolver input must not be empty');
  return isbn;
}

// Citation.js's BibTeX output module escapes braces in string fields (title,
// publisher) but emits CSL name fields by wrapping the raw value in `{...}`
// WITHOUT escaping interior braces. A `{`/`}` inside an author name therefore
// produces unbalanced BibTeX (e.g. `author = {{Smith }}}`) that the validation
// gate truncates, silently dropping the title. A brace is never legitimate
// content in a personal name, so reject it loudly rather than emit corrupt
// BibTeX. This is not a sanitizing replace: the input is invalid and fails.
function citeName(name) {
  const value = text(name, 'ISBN resolver author name must be text');
  invariant(
    !value.includes('{') && !value.includes('}'),
    `ISBN resolver author name must not contain a BibTeX brace delimiter: ${value}`,
  );
  return value;
}

// Open Library Books API (jscmd=data) returns one object keyed by the requested
// bibkey, with author names, publishers, and date inline — a single fetch.
export function bookRecord(payload, isbn) {
  invariant(payload && typeof payload === 'object', 'Open Library returned no payload');
  const record = payload[`ISBN:${isbn}`];
  invariant(record && typeof record === 'object', `Open Library has no record for ISBN ${isbn}`);
  return record;
}

export function recordTitle(record) {
  const main = text(record.title, 'Open Library record must contain a title');
  if (typeof record.subtitle === 'string' && record.subtitle.trim().length > 0) {
    return `${main}: ${text(record.subtitle, 'Open Library subtitle must be text')}`;
  }
  return main;
}

export function recordPublisher(record) {
  invariant(
    Array.isArray(record.publishers) && record.publishers.length > 0,
    'Open Library record must contain a publisher',
  );
  return text(record.publishers[0]?.name, 'Open Library publisher must contain a name');
}

export function recordYear(record) {
  invariant(
    typeof record.publish_date === 'string',
    'Open Library record must contain a publish_date',
  );
  const match = /\d{4}/.exec(record.publish_date);
  invariant(match, 'Open Library publish_date must contain a four-digit year');
  return match[0];
}

export function recordAuthors(record) {
  invariant(
    Array.isArray(record.authors) && record.authors.length > 0,
    'Open Library record must contain authors',
  );
  return record.authors.map(author => text(author?.name, 'Open Library author must contain a name'));
}

export function bookBibTeX({ isbn, title, authors, publisher, year }) {
  invariant(authors.length > 0, 'ISBN resolver must resolve at least one author');
  const cite = new Cite([
    {
      'citation-key': `isbn_${isbn}`,
      type: 'book',
      title,
      author: authors.map(name => ({ literal: citeName(name) })),
      publisher,
      issued: { 'date-parts': [[Number.parseInt(year, 10)]] },
      ISBN: isbn,
    },
  ]);
  return cite.format('bibtex').trim();
}
