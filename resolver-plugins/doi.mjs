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

// The manifest accepts a DOI bare (`10.x/suffix`) or as a `doi.org`/`dx.doi.org`
// URL, with the suffix matched by `\S+`. The two forms must be normalized
// DIFFERENTLY, because `?` and `#` mean opposite things in each:
//
//   - In a URL-form input (`https://doi.org/10.x/foo?utm_source=x#sec`), `?`/`#`
//     are URL delimiters introducing the query and fragment. They are NOT part of
//     the DOI and must be removed, or doiRequestUrl percent-encodes them into the
//     identifier (`foo%3Futm_source%3Dx`) and resolves the wrong DOI.
//   - In a BARE DOI (`10.1234/foo?bar`), the suffix is OPAQUE registrant text:
//     the DOI/Handle syntax permits `?` and `#` as legitimate suffix characters.
//     Stripping them truncates a real identifier and resolves a different record.
//
// So query/fragment removal is correct ONLY for the URL form. The URL is parsed
// with the URL constructor so `.pathname` is taken WITHOUT the query/fragment;
// then the doi.org/dx.doi.org leading-slash + host is removed. A bare DOI is
// passed through intact (trimmed only). The scheme check is case-insensitive
// because pluginAcceptsInput matches the manifest pattern with the `i` flag, so
// `HTTPS://doi.org/...` is a contract-valid URL input that must take the URL
// branch (not be mistaken for a bare DOI). (The namespace slash of the bare DOI
// is left untouched here; doiRequestUrl owns the suffix percent-encoding.)
const URL_SCHEME = /^https?:\/\//i;

// The manifest host (`(?:dx\.)?doi\.org`) is matched case-insensitively by
// pluginAcceptsInput, so `doi.org` and `dx.doi.org` in any case are the only
// contract-valid hosts. Only these hosts make `url.pathname` a DOI: for any other
// host the pathname is just that site's path, and taking it as a DOI fabricates a
// bogus identifier from a stranger's URL. The host is compared exactly (not by
// substring) against `url.hostname`, which excludes the port; a substring test
// would wrongly accept `doi.org.evil.com` or `notdoi.org`.
const DOI_HOSTS = new Set(['doi.org', 'dx.doi.org']);

export function doiFromInput(raw) {
  const trimmed = raw.trim();
  let doi;
  if (URL_SCHEME.test(trimmed)) {
    const url = new URL(trimmed);
    // The host is what makes `url.pathname` a DOI. Validate it before trusting the
    // path: only doi.org/dx.doi.org URLs carry a DOI in their path. `url.hostname`
    // is the host without any port, lowercased by the URL parser, so it compares
    // exactly against the canonical hosts regardless of input case.
    invariant(
      DOI_HOSTS.has(url.hostname),
      `DOI URL host must be doi.org or dx.doi.org, got: ${url.hostname}`,
    );
    // url.pathname is the decoded path WITHOUT query/fragment, with a leading
    // slash. Strip the leading slash to yield the bare DOI. A `?`/`#` in the path
    // here came from the URL's query/fragment delimiters, so they are correctly
    // absent from url.pathname.
    doi = url.pathname.replace(/^\//, '');
  } else {
    doi = trimmed;
  }
  invariant(doi.length > 0, 'DOI resolver input must not be empty');
  return doi;
}

if (import.meta.main) {
  const doi = doiFromInput(await readRawStdin());
  const response = await fetch(doiRequestUrl(doi), {
    headers: { Accept: 'application/x-bibtex' },
  });
  invariant(response.ok, `DOI BibTeX export failed with HTTP ${response.status}`);

  const bibtex = (await response.text()).trim();
  invariant(bibtex.startsWith('@'), 'DOI BibTeX export must return a BibTeX entry');

  process.stdout.write(`${bibtex}\n`);
}
