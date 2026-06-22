// Build the doi.org resolver URL for a DOI shown in the library table.
//
// A DOI is `<namespace>/<suffix>` where the namespace is the registrant prefix
// (`10.xxxx`) and the suffix is opaque registrant-assigned text that may contain
// URI-reserved characters such as `?` and `#`. Raw interpolation
// (`https://doi.org/${doi}`) — and even encodeURI — leaves those reserved
// characters unescaped, so a `?`/`#` in the suffix starts the URL
// query/fragment and drops the rest of the identifier from the path, opening the
// wrong DOI. Percent-encode the suffix with encodeURIComponent so reserved
// characters travel as path data, while leaving the single namespace slash in
// place. doi.org resolves the encoded suffix as a path segment.
//
// This mirrors the encoding rule the DOI resolver uses for its content-
// negotiation request (resolver-plugins/doi.mjs, the Node subprocess world);
// the two live in separate runtime worlds (browser bundle vs. Node CLI) and so
// each owns its small copy of this rule rather than the frontend importing
// resolver-subprocess code.
export function doiUrl(doi: string): string {
  const slash = doi.indexOf('/');
  if (slash <= 0) {
    throw new Error(`DOI must contain a namespace separator slash: ${doi}`);
  }
  const namespace = doi.slice(0, slash);
  const suffix = doi.slice(slash + 1);
  if (suffix.length === 0) {
    throw new Error(`DOI must contain a suffix after the namespace slash: ${doi}`);
  }
  return `https://doi.org/${namespace}/${encodeURIComponent(suffix)}`;
}
