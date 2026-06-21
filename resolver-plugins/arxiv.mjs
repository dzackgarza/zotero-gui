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
// The manifest accepts old-style IDs (e.g. `math.AG/0601001`), whose `/` is part
// of the identifier, not a path separator. encodeURIComponent escapes it to
// `%2F`. Verified against arxiv.org: `https://arxiv.org/bibtex/math.AG%2F0601001`
// returns HTTP 200 with the same BibTeX as the raw-slash form, so encoding the
// slash is correct and deterministic for both new- and old-style IDs.
const response = await fetch(`https://arxiv.org/bibtex/${encodeURIComponent(arxivId)}`);
invariant(response.ok, `arXiv BibTeX export failed with HTTP ${response.status}`);

const bibtex = (await response.text()).trim();
invariant(bibtex.startsWith('@'), 'arXiv BibTeX export must return a BibTeX entry');

process.stdout.write(`${bibtex}\n`);
