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

const OPEN_LIBRARY = 'https://openlibrary.org';
import { readRawStdin } from './utils.mjs';

async function readStdin() {
  const raw = await readRawStdin();
  return normalizeIsbn(raw);
}

const isbn = await readStdin();
const bibkey = `ISBN:${isbn}`;
const url = `${OPEN_LIBRARY}/api/books?bibkeys=${encodeURIComponent(bibkey)}&jscmd=data&format=json`;

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
