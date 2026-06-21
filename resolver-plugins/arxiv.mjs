import { invariant, readRawStdin } from './utils.mjs';

// The manifest accepts arXiv URLs whose path tail is matched by `[^\s]+`, so a
// PDF link may legitimately carry a query string or fragment, e.g.
// `https://arxiv.org/pdf/2401.01234.pdf?download=1` or `...#section`. The query
// and fragment must be removed BEFORE the trailing `.pdf` suffix: if `.pdf` is
// stripped first, it is no longer at the end of the string (the `?...`/`#...`
// follows it), so the suffix survives and the extracted id keeps a `.pdf` tail,
// producing a malformed upstream request. Strip query, then fragment, then the
// scheme/prefixes and the `.pdf` suffix, so the id is extracted correctly for
// every accepted URL form.
export function arxivIdFromInput(raw) {
  const id = raw
    .split('?')[0]
    .split('#')[0]
    .replace(/^arxiv:/i, '')
    .replace(/^https?:\/\/arxiv\.org\/abs\//i, '')
    .replace(/^https?:\/\/arxiv\.org\/pdf\//i, '')
    .replace(/\.pdf$/i, '');
  invariant(id.length > 0, 'arXiv resolver input must not be empty');
  return id;
}

if (import.meta.main) {
  const arxivId = arxivIdFromInput(await readRawStdin());
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
}
