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
export function getStandardCitekey(item: ZoteroItem): string {
  if (!item.creators || item.creators.length === 0) return '';

  const authors = item.creators.filter(c => c.creatorType === 'author');
  const targetCreators = authors.length > 0 ? authors : item.creators;

  const lastNames = targetCreators
    .map(c =>
      (c.lastName || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''),
    )
    .filter(Boolean);

  if (lastNames.length === 0) return '';

  let authorsAlpha = '';
  if (lastNames.length === 1) {
    authorsAlpha = lastNames[0].substring(0, 3);
  } else if (lastNames.length >= 2 && lastNames.length <= 4) {
    authorsAlpha = lastNames.map(name => name[0]).join('');
  } else {
    authorsAlpha = lastNames.slice(0, 3).map(name => name[0]).join('') + '+';
  }

  const dateStr = item.date || '';
  const match = dateStr.match(/\d{4}/);
  const year = match ? match[0] : '';
  const yearSuffix = year ? year.substring(2, 4) : '';

  return authorsAlpha + yearSuffix;
}

export function filterZoteroItems(
  items: ZoteroItem[],
  settings: AdvancedSearchSettings
): ZoteroItem[] {
  const query = settings.query.trim();
  if (!query) return items;

  return items.filter(item => {
    const fieldsToSearch: string[] = [];

    Object.entries(settings.searchFields).forEach(([key, enabled]) => {
      if (!enabled) return;

      if ((key === 'title') && item.title) {
        fieldsToSearch.push(item.title);
      } else if ((key === 'creators_compact' || key === 'authors') && item.creators) {
        item.creators.forEach(c => {
          fieldsToSearch.push(`${c.firstName} ${c.lastName}`);
          fieldsToSearch.push(c.lastName);
        });
      } else if ((key === 'publicationTitle' || key === 'publication') && item.publicationTitle) {
        fieldsToSearch.push(item.publicationTitle);
      } else if ((key === 'abstractNote' || key === 'abstract') && item.abstractNote) {
        fieldsToSearch.push(item.abstractNote);
      } else if (key === 'tags' && item.tags) {
        fieldsToSearch.push(...item.tags);
      } else if (key === 'notes' && item.notes) {
        item.notes.forEach(n => fieldsToSearch.push(n.note));
      } else if ((key === 'date' || key === 'year') && item.date) {
        fieldsToSearch.push(item.date);
      } else {
        const val = item[key as keyof ZoteroItem];
        if (typeof val === 'string') {
          fieldsToSearch.push(val);
        } else if (typeof val === 'number') {
          fieldsToSearch.push(String(val));
        }
      }
    });

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
