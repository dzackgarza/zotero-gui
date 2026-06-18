import { ZoteroItem, AdvancedSearchSettings } from '../types';

/**
 * Fuzzy match score calculation (simple Jaro-Winkler like subsequence score or token subset check)
 */
export function fuzzyMatches(text: string, query: string, matchCase: boolean = false): boolean {
  if (!query) return true;
  if (!text) return false;

  let t = matchCase ? text : text.toLowerCase();
  let q = matchCase ? query : query.toLowerCase();

  // If query is an exact substring, easily return true
  if (t.includes(q)) return true;

  // Word token checking (all words must match partially)
  const queryTokens = q.split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;

  return queryTokens.every(token => t.includes(token));
}

/**
 * Performs comprehensive scoped filtering on items based on search configs
 */
export function filterZoteroItems(
  items: ZoteroItem[],
  settings: AdvancedSearchSettings
): ZoteroItem[] {
  const query = settings.query.trim();
  if (!query) return items;

  return items.filter(item => {
    const fieldsToSearch: string[] = [];

    if (settings.searchFields.title && item.title) {
      fieldsToSearch.push(item.title);
    }

    if (settings.searchFields.authors) {
      item.creators.forEach(c => {
        fieldsToSearch.push(`${c.firstName} ${c.lastName}`);
        fieldsToSearch.push(c.lastName);
      });
    }

    if (settings.searchFields.publication && item.publicationTitle) {
      fieldsToSearch.push(item.publicationTitle);
    }

    if (settings.searchFields.abstract && item.abstractNote) {
      fieldsToSearch.push(item.abstractNote);
    }

    if (settings.searchFields.doi && item.doi) {
      fieldsToSearch.push(item.doi);
    }

    if (settings.searchFields.tags && item.tags) {
      fieldsToSearch.push(...item.tags);
    }

    if (settings.searchFields.notes && item.notes) {
      item.notes.forEach(n => fieldsToSearch.push(n.note));
    }

    if (settings.searchFields.year && item.date) {
      fieldsToSearch.push(item.date);
    }

    if (settings.searchFields.url && item.url) {
      fieldsToSearch.push(item.url);
    }

    // Evaluate match logic: 'all' (AND) vs 'any' (OR)
    if (settings.matchType === 'all') {
      const queryTokens = settings.query.split(/\s+/).filter(Boolean);
      return queryTokens.every(token => {
        return fieldsToSearch.some(field => fuzzyMatches(field, token, settings.matchCase));
      });
    } else {
      return fieldsToSearch.some(field => fuzzyMatches(field, query, settings.matchCase));
    }
  });
}

/**
 * Render authors list cleanly: e.g. "Vaswani, A. et al." or "Vaswani, Shazeer, Parmar"
 */
export function formatCreatorsCompact(creators: { firstName: string; lastName: string }[]): string {
  if (!creators || creators.length === 0) return '—';
  if (creators.length === 1) return creators[0].lastName;
  if (creators.length === 2) return `${creators[0].lastName} & ${creators[1].lastName}`;
  return `${creators[0].lastName} et al.`;
}

export function formatCreatorsFull(creators: { firstName: string; lastName: string; creatorType: string }[]): string {
  if (!creators || creators.length === 0) return 'No Authors';
  return creators
    .map(c => `${c.lastName}, ${c.firstName} (${c.creatorType})`)
    .join('; ');
}
