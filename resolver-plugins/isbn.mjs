import {
  bookBibTeX,
  bookRecord,
  invariant,
  normalizeIsbn,
  recordAuthors,
  recordPublisher,
  recordTitle,
  recordYear,
} from './isbn-lib.mjs';

import { readRawStdin } from './utils.mjs';

async function readStdin() {
  const raw = await readRawStdin();
  return normalizeIsbn(raw);
}

const isbn = await readStdin();
const bibkey = `ISBN:${isbn}`;
const openLibraryBaseUrl = process.argv[2];
invariant(openLibraryBaseUrl, 'ISBN resolver requires the Open Library base URL as argv[2]');
const url = new URL('/api/books', openLibraryBaseUrl);
url.searchParams.set('bibkeys', bibkey);
url.searchParams.set('jscmd', 'data');
url.searchParams.set('format', 'json');

const response = await fetch(url, { headers: { Accept: 'application/json' } });
invariant(response.ok, `Open Library Books API lookup failed for ${isbn} (HTTP ${response.status})`);
const record = bookRecord(await response.json(), isbn);

process.stdout.write(
  bookBibTeX({
    isbn,
    title: recordTitle(record),
    authors: recordAuthors(record),
    publisher: recordPublisher(record),
    year: recordYear(record),
  }),
);
