import { parseStringPromise } from 'xml2js';

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
  const value = input.trim()
    .replace(/^arxiv:/i, '')
    .replace(/^https?:\/\/arxiv\.org\/abs\//i, '')
    .replace(/^https?:\/\/arxiv\.org\/pdf\//i, '')
    .replace(/\.pdf$/i, '')
    .split('?')[0]
    .split('#')[0];
  invariant(value.length > 0, 'arXiv resolver input must not be empty');
  return value;
}

function text(value, message) {
  invariant(Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0, message);
  return value[0].replace(/\s+/g, ' ').trim();
}

const arxivId = await readStdin();
const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(arxivId)}`);
invariant(response.ok, `arXiv lookup failed with HTTP ${response.status}`);

const parsed = await parseStringPromise(await response.text());
const entry = parsed.feed.entry?.[0];
invariant(entry, `arXiv did not return entry ${arxivId}`);

const title = text(entry.title, 'arXiv entry must contain a title');
const published = text(entry.published, 'arXiv entry must contain a publication date');
invariant(Array.isArray(entry.author) && entry.author.length > 0, 'arXiv entry must contain authors');

const authors = entry.author.map(author => {
  const name = text(author.name, 'arXiv author must contain a name');
  const parts = name.split(/\s+/);
  const lastName = parts.pop();
  invariant(lastName, 'arXiv author must contain a last name');
  return `${lastName}, ${parts.join(' ')}`;
}).join(' and ');

process.stdout.write(`@article{arxiv_${arxivId.replace(/[^a-zA-Z0-9]/g, '_')},
  title = {${title}},
  author = {${authors}},
  journal = {arXiv preprint arXiv:${arxivId}},
  year = {${published.substring(0, 4)}},
  url = {https://arxiv.org/abs/${arxivId}}
}`);
