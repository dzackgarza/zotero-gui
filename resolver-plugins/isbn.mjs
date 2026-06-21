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

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return normalizeIsbn(input);
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
