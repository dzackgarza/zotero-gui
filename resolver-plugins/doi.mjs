import { invariant, readRawStdin } from './utils.mjs';

// A DOI is `<namespace>/<suffix>` where the namespace is the registrant prefix
// (`10.xxxx`) and the suffix is opaque registrant-assigned text that may contain
// URI-reserved characters such as `?` and `#`. `encodeURI` does NOT escape those
// reserved characters, so `https://doi.org/${encodeURI(doi)}` lets a `?`/`#` in
// the suffix start the URL query/fragment, dropping the rest of the identifier
// from the path and resolving the wrong DOI. Percent-encode the suffix with
// encodeURIComponent so reserved characters travel as path data, while leaving
// the single namespace slash in place. doi.org resolves the encoded suffix as a
// path segment (CrossRef itself percent-encodes the slash internally:
// `https://doi.org/10.1007/BF01388432` resolves via
// `api.crossref.org/v1/works/10.1007%2FBF01388432/transform`).
export function doiRequestUrl(doi) {
  const slash = doi.indexOf('/');
  invariant(slash > 0, 'DOI must contain a namespace separator slash');
  const namespace = doi.slice(0, slash);
  const suffix = doi.slice(slash + 1);
  invariant(suffix.length > 0, 'DOI must contain a suffix after the namespace slash');
  return `https://doi.org/${namespace}/${encodeURIComponent(suffix)}`;
}

async function readStdin() {
  const raw = await readRawStdin();
  invariant(raw.length > 0, 'DOI resolver input must not be empty');
  return raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
    .trim();
}

if (import.meta.main) {
  const doi = await readStdin();
  const response = await fetch(doiRequestUrl(doi), {
    headers: { Accept: 'application/x-bibtex' },
  });
  invariant(response.ok, `DOI BibTeX export failed with HTTP ${response.status}`);

  const bibtex = (await response.text()).trim();
  invariant(bibtex.startsWith('@'), 'DOI BibTeX export must return a BibTeX entry');

  process.stdout.write(`${bibtex}\n`);
}
