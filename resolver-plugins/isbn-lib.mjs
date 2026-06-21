export function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function normalizeIsbn(input) {
  const isbn = input.trim().replace(/^isbn:?\s*/i, '').replace(/[-\s]/g, '');
  invariant(isbn.length > 0, 'ISBN resolver input must not be empty');
  return isbn;
}

function text(value, message) {
  invariant(typeof value === 'string' && value.trim().length > 0, message);
  return value.replace(/\s+/g, ' ').trim();
}

export function editionTitle(edition) {
  const main = text(edition.title, 'Open Library edition must contain a title');
  if (typeof edition.subtitle === 'string' && edition.subtitle.trim().length > 0) {
    return `${main}: ${text(edition.subtitle, 'Open Library subtitle must be text')}`;
  }
  return main;
}

export function editionPublisher(edition) {
  invariant(
    Array.isArray(edition.publishers) && edition.publishers.length > 0,
    'Open Library edition must contain a publisher',
  );
  return text(edition.publishers[0], 'Open Library publisher must be text');
}

export function editionYear(edition) {
  invariant(
    typeof edition.publish_date === 'string',
    'Open Library edition must contain a publish_date',
  );
  const match = /\d{4}/.exec(edition.publish_date);
  invariant(match, 'Open Library publish_date must contain a four-digit year');
  return match[0];
}

export function editionAuthorKeys(edition) {
  invariant(
    Array.isArray(edition.authors) && edition.authors.length > 0,
    'Open Library edition must contain authors',
  );
  return edition.authors.map(author => {
    invariant(
      author && typeof author.key === 'string' && author.key.length > 0,
      'Open Library author entry must contain a key',
    );
    return author.key;
  });
}

export function authorName(record) {
  return text(record.name, 'Open Library author record must contain a name');
}

export function bookBibTeX({ isbn, title, authors, publisher, year }) {
  invariant(authors.length > 0, 'ISBN resolver must resolve at least one author');
  const fields = [
    ['title', title],
    ['author', authors.join(' and ')],
    ['publisher', publisher],
    ['year', year],
    ['isbn', isbn],
  ];
  const body = fields.map(([name, value]) => `  ${name} = {${value}}`).join(',\n');
  return `@book{isbn_${isbn},\n${body}\n}`;
}
