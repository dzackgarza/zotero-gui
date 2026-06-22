import bibtexParse, { type BibTeXEntry } from 'bibtex-parse-js';

const INVALID_SINGLE_ENTRY = 'Invalid BibTeX input or empty entry list.';

function requireSingleEntry(bibtexStr: string): BibTeXEntry {
  const parsed = bibtexParse.toJSON(bibtexStr);
  if (!Array.isArray(parsed)) {
    throw new Error(INVALID_SINGLE_ENTRY);
  }
  if (parsed.length === 0) {
    throw new Error(INVALID_SINGLE_ENTRY);
  }
  if (parsed.length !== 1) {
    throw new Error('BibTeX input must contain exactly one entry.');
  }
  const entry = parsed[0];
  if (entry === undefined) {
    throw new Error(INVALID_SINGLE_ENTRY);
  }
  return entry;
}

function presentValue(val: string | undefined): string {
  if (val === undefined) return '';
  if (val.length === 0) return '';
  let s = val.trim();
  while (s.startsWith('{') && s.endsWith('}')) {
    s = s.substring(1, s.length - 1).trim();
  }
  return s.trim();
}

function bibtexTag(tags: Record<string, string>, lowerName: string, upperName: string): string | undefined {
  const lowerValue = tags[lowerName];
  if (lowerValue !== undefined) return lowerValue;
  return tags[upperName];
}

function hasBibtexTagValue(tags: Record<string, string>, lowerName: string, upperName: string): boolean {
  return presentValue(bibtexTag(tags, lowerName, upperName)).length > 0;
}

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
 *   - at least one NAME-BEARING creator (author OR editor).
 *
 * The name-bearing-creator rule is the SAME contract the citation layer enforces
 * (citation.ts: itemToCsl / isCitable / hasNameBearingCreator, which treat an
 * item with at least one author OR editor as citable). An edited volume (editor
 * present, no author) is bibliographically valid and citable, so it must also be
 * importable. Requiring an author here would reject a record the app can cite,
 * leaving the two owned contracts in disagreement. The gate is NOT weakened to
 * accept truly nameless records: a record with neither author nor editor still
 * fails loudly.
 *
 * There is no fail-open default item type: an unrecognized @entrytype is not
 * coerced into anything here. Mapping it is Zotero's responsibility.
 */
export function parseBibTeXToMetadata(bibtexStr: string): void {
  const tags = requireSingleEntry(bibtexStr).entryTags;
  if (!hasBibtexTagValue(tags, 'title', 'TITLE')) {
    throw new Error('BibTeX entry must contain a title.');
  }

  if (!hasBibtexTagValue(tags, 'author', 'AUTHOR') && !hasBibtexTagValue(tags, 'editor', 'EDITOR')) {
    throw new Error('BibTeX entry must contain at least one name-bearing creator (author or editor).');
  }
}
