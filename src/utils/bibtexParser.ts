import bibtexParse from 'bibtex-parse-js';

/**
 * Strict validation gate for resolver/import BibTeX before it is handed to Zotero.
 *
 * The route ships the RAW BibTeX string to Zotero via operation: 'import_bibtex';
 * Zotero is the importer and owns all field cleanup, author splitting, field
 * aliasing, and item-type mapping. This function therefore does NOT map BibTeX
 * into a bespoke object — it only asserts the invariants the route requires
 * before delegating to Zotero, and throws loudly on any violation:
 *   - exactly one parseable entry,
 *   - a non-empty title,
 *   - at least one author.
 *
 * There is no fail-open default item type: an unrecognized @entrytype is not
 * coerced into anything here. Mapping it is Zotero's responsibility.
 */
export function parseBibTeXToMetadata(bibtexStr: string): void {
  const parsed = bibtexParse.toJSON(bibtexStr);
  if (!parsed || parsed.length === 0) {
    throw new Error('Invalid BibTeX input or empty entry list.');
  }
  if (parsed.length !== 1) {
    throw new Error('BibTeX input must contain exactly one entry.');
  }

  const tags = parsed[0].entryTags || {};

  const presentValue = (val: string | undefined): string => {
    if (!val) return '';
    let s = val.trim();
    while (s.startsWith('{') && s.endsWith('}')) {
      s = s.substring(1, s.length - 1).trim();
    }
    return s.trim();
  };

  if (!presentValue(tags.title || tags.TITLE)) {
    throw new Error('BibTeX entry must contain a title.');
  }

  if (!presentValue(tags.author || tags.AUTHOR)) {
    throw new Error('BibTeX entry must contain at least one author.');
  }
}
