import {
  authorName,
  bookBibTeX,
  editionAuthorKeys,
  editionPublisher,
  editionTitle,
  editionYear,
  invariant,
  normalizeIsbn,
} from './isbn-lib.mjs';

const OPEN_LIBRARY = 'https://openlibrary.org';

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return normalizeIsbn(input);
}

async function fetchJson(url, message) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  invariant(response.ok, `${message} (HTTP ${response.status})`);
  return response.json();
}

const isbn = await readStdin();
const edition = await fetchJson(
  `${OPEN_LIBRARY}/isbn/${isbn}.json`,
  `Open Library has no record for ISBN ${isbn}`,
);

const authors = [];
for (const key of editionAuthorKeys(edition)) {
  const record = await fetchJson(
    `${OPEN_LIBRARY}${key}.json`,
    `Open Library author lookup failed for ${key}`,
  );
  authors.push(authorName(record));
}

process.stdout.write(
  bookBibTeX({
    isbn,
    title: editionTitle(edition),
    authors,
    publisher: editionPublisher(edition),
    year: editionYear(edition),
  }),
);
