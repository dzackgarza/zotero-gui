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
  const value = input.trim();
  invariant(value.length > 0, 'DOI resolver input must not be empty');
  return value
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim();
}

const doi = await readStdin();
const response = await fetch(`https://doi.org/${encodeURI(doi)}`, {
  headers: { Accept: 'application/x-bibtex' },
});
invariant(response.ok, `DOI BibTeX export failed with HTTP ${response.status}`);

const bibtex = (await response.text()).trim();
invariant(bibtex.startsWith('@'), 'DOI BibTeX export must return a BibTeX entry');

process.stdout.write(`${bibtex}\n`);
