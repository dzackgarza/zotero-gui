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

const arxivId = await readStdin();
const response = await fetch(`https://arxiv.org/bibtex/${encodeURIComponent(arxivId)}`);
invariant(response.ok, `arXiv BibTeX export failed with HTTP ${response.status}`);

const bibtex = (await response.text()).trim();
invariant(bibtex.startsWith('@'), 'arXiv BibTeX export must return a BibTeX entry');

process.stdout.write(`${bibtex}\n`);
