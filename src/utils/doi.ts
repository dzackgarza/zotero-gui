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
