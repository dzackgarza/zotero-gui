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

function formatAuthors(authors) {
  invariant(Array.isArray(authors) && authors.length > 0, 'OpenLibrary book must contain authors');
  return authors.map(author => {
    invariant(typeof author.name === 'string' && author.name.trim().length > 0, 'OpenLibrary author must contain a name');
    const parts = author.name.trim().split(/\s+/);
    const lastName = parts.pop();
    invariant(lastName, 'OpenLibrary author must contain a last name');
    return `${lastName}, ${parts.join(' ')}`;
  }).join(' and ');
}

const isbn = await readStdin();
const response = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
invariant(response.ok, `OpenLibrary lookup failed with HTTP ${response.status}`);

const data = await response.json();
const book = data[`ISBN:${isbn}`];
invariant(book, `OpenLibrary did not return ISBN ${isbn}`);
invariant(typeof book.title === 'string' && book.title.length > 0, 'OpenLibrary book must contain a title');
invariant(Array.isArray(book.publishers) && book.publishers.length > 0, 'OpenLibrary book must contain publishers');
invariant(typeof book.publish_date === 'string' && book.publish_date.length > 0, 'OpenLibrary book must contain a publish date');

const authors = formatAuthors(book.authors);
const publisher = book.publishers.map(publisherEntry => {
  invariant(typeof publisherEntry.name === 'string' && publisherEntry.name.length > 0, 'OpenLibrary publisher must contain a name');
  return publisherEntry.name;
}).join(', ');

process.stdout.write(`@book{isbn_${isbn},
  title = {${book.title}},
  author = {${authors}},
  publisher = {${publisher}},
  year = {${book.publish_date}},
  isbn = {${isbn}}
}`);
