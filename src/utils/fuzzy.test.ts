import { describe, expect, it } from 'vitest';
import type { AdvancedSearchSettings, Creator, ZoteroItem } from '../types';
import {
  PALETTE_SEARCH_KEYS,
  buildZoteroSearchDocuments,
  filterZoteroItems,
  rankZoteroSearchDocumentsForPalette,
} from './fuzzy';

function item(
  id: string,
  title: string,
  citekey: string,
  overrides: Partial<ZoteroItem> = {},
): ZoteroItem {
  const defaultCreators: Creator[] = [
    { firstName: 'Arthur', lastName: 'Coble', creatorType: 'author' },
  ];
  return {
    id,
    itemType: 'book',
    title,
    citekey,
    creators: defaultCreators,
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-18T00:00:00Z',
    ...overrides,
  };
}

function advancedSettings(
  query: string,
  matchType: 'all' | 'any',
  searchFields: Record<string, boolean>,
): AdvancedSearchSettings {
  return {
    query,
    matchCase: false,
    fuzzyThreshold: 0.3,
    matchType,
    searchFields,
  };
}

describe('palette fuzzy ranking', () => {
  it('uses fzf-style subsequence matching across palette fields', () => {
    const documents = buildZoteroSearchDocuments([
      item('coble', 'Algebraic Geometry and Theta Functions', 'Cob29'),
      item('topology', 'Algebraic Topology', 'Hat02'),
    ]);

    expect(rankZoteroSearchDocumentsForPalette(documents, 'agtf')[0]?.item.id).toBe('coble');
    expect(rankZoteroSearchDocumentsForPalette(documents, 'Cob29')[0]?.item.id).toBe('coble');
  });

  // The palette mode reads the same projection + the canonical key contract.
  // A field outside PALETTE_SEARCH_KEYS (e.g. abstractNote) must NOT be
  // searchable in the palette, even though it is part of the projection.
  it('only ranks over the canonical palette key set, not the full projection', () => {
    const documents = buildZoteroSearchDocuments([
      item('with-abstract', 'Unrelated Heading', 'Xyz01', {
        abstractNote: 'distinctiveabstracttoken',
      }),
    ]);

    // Subsequence over title/creators/publication/date/citekey hits nothing,
    // because the matching token lives only in a non-palette field.
    expect(rankZoteroSearchDocumentsForPalette(documents, 'distinctiveabstracttoken')).toEqual([]);
  });
});

describe('advanced search ranking', () => {
  // The 'all' and 'any' modes diverge on the SAME query, fields, and
  // threshold. 'all' tokenizes and intersects per-token Fuse matches;
  // 'any' runs the whole query as a single Fuse search. The two items and a
  // 0.3 threshold are chosen (against observed Fuse behavior) so the result
  // sets differ, making the matchType contract falsifiable.
  const RANKING_ITEMS = [
    item('riemann', 'Riemann Surfaces and Theta Functions', 'Rie01'),
    item('theta-lat', 'Theta Functions of Lattices', 'The02'),
  ];

  // matchType 'all' is token-AND: every whitespace token must match the item.
  // 'theta' matches both titles; 'lattices' matches only theta-lat, so the
  // intersection is exactly theta-lat.
  it('intersects per-token matches under matchType "all"', () => {
    const settings = advancedSettings('theta lattices', 'all', { title: true });

    const matched = filterZoteroItems(RANKING_ITEMS, settings).map(result => result.id);

    expect(matched).toEqual(['theta-lat']);
  });

  // matchType 'any' runs the whole query as one Fuse search; at threshold 0.3
  // the concatenated 'theta lattices' fuzzy-matches neither title, so the same
  // query that yields theta-lat under 'all' yields nothing under 'any'. This
  // pins that the two modes are genuinely distinct, not aliases.
  it('searches the whole query as one match under matchType "any"', () => {
    const settings = advancedSettings('theta lattices', 'any', { title: true });

    const matched = filterZoteroItems(RANKING_ITEMS, settings).map(result => result.id);

    expect(matched).toEqual([]);
  });

  // Field scoping is honored: a token present only in an unsearched field must
  // not produce a match.
  it('restricts matching to the enabled search fields', () => {
    const items = [
      item('scoped', 'Plain Title', 'Cit99', { abstractNote: 'hiddenscopetoken' }),
    ];

    const titleOnly = filterZoteroItems(
      items,
      advancedSettings('hiddenscopetoken', 'all', { title: true }),
    );
    expect(titleOnly).toEqual([]);

    const abstractEnabled = filterZoteroItems(
      items,
      advancedSettings('hiddenscopetoken', 'all', { abstractNote: true }),
    ).map(result => result.id);
    expect(abstractEnabled).toEqual(['scoped']);
  });

  // The missing/unsupported-field throw must remain: enabling a field that is
  // not part of the projection contract fails loudly rather than silently
  // ignoring the field.
  it('throws on an unsupported search field instead of silently ignoring it', () => {
    const items = [item('any', 'Any Title', 'Any01')];
    const settings = advancedSettings('any', 'all', { notARealField: true });

    expect(() => filterZoteroItems(items, settings)).toThrowError(
      /Unsupported Zotero search field: notARealField/,
    );
  });
});

describe('canonical search key contract', () => {
  // Both engines and App's default scope read this one source. This pins its
  // membership so a desync (e.g. App re-listing a divergent default) is a
  // visible, deliberate change to the contract here, not a silent drift.
  it('owns the default searchable field set', () => {
    expect([...PALETTE_SEARCH_KEYS]).toEqual([
      'title',
      'creators_compact',
      'publicationTitle',
      'date',
      'citekey',
    ]);
  });
});
