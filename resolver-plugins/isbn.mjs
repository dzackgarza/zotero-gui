import { bookBibTeX } from './isbn-lib.mjs';

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readStdin() {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const isbn = input.trim().replace(/^isbn:?\s*/i, '').replace(/[- ]/g, '');
  invariant(isbn.length > 0, 'ISBN resolver input must not be empty');
  return isbn;
}

const isbn = await readStdin();
const query = encodeURIComponent(`bath.ISBN=^${isbn}`);
const response = await fetch(`https://lx2.loc.gov/sru/lcdb?operation=searchRetrieve&version=1.1&query=${query}&maximumRecords=1`);
invariant(response.ok, `Library of Congress ISBN lookup failed with HTTP ${response.status}`);

process.stdout.write(bookBibTeX(await response.text(), isbn));
