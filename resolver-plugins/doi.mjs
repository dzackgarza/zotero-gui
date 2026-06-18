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

function formatAuthors(authors) {
  invariant(Array.isArray(authors) && authors.length > 0, 'Crossref work must contain authors');
  return authors.map(author => {
    invariant(typeof author.family === 'string' && author.family.length > 0, 'Crossref author must contain family name');
    const given = typeof author.given === 'string' ? author.given : '';
    return `${author.family}, ${given}`;
  }).join(' and ');
}

const doi = await readStdin();
const response = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
invariant(response.ok, `Crossref lookup failed with HTTP ${response.status}`);

const data = await response.json();
const work = data.message;
invariant(work && Array.isArray(work.title) && typeof work.title[0] === 'string', 'Crossref work must contain a title');
invariant(Array.isArray(work['container-title']) && typeof work['container-title'][0] === 'string', 'Crossref work must contain a container title');
invariant(work.published && Array.isArray(work.published['date-parts']), 'Crossref work must contain publication date parts');

const title = work.title[0];
const authors = formatAuthors(work.author);
const journal = work['container-title'][0];
const year = String(work.published['date-parts'][0][0]);
const key = `doi_${doi.replace(/[^a-zA-Z0-9]/g, '_')}`;

process.stdout.write(`@article{${key},
  title = {${title}},
  author = {${authors}},
  journal = {${journal}},
  year = {${year}},
  doi = {${doi}}
}`);
