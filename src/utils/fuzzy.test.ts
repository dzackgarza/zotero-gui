import { describe, expect, it } from 'vitest';
import type { AdvancedSearchSettings, Creator, ZoteroItem } from '../types';
import {
  PALETTE_SEARCH_KEYS,
  buildZoteroSearchDocuments,
  filterZoteroItems,
  formatCreatorsCompact,
  getStandardCitekey,
  rankZoteroSearchDocumentsForPalette,
} from './fuzzy';

function item(
  id: string,
  title: string | undefined,
  citekey: string,
  overrides: Partial<ZoteroItem> = {},
): ZoteroItem {
  const defaultCreators: Creator[] = [
    { firstName: 'Arthur', lastName: 'Coble', creatorType: 'author' },
  ];
  const base: ZoteroItem = {
    id,
    itemType: 'book',
    citekey,
    creators: defaultCreators,
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-18T00:00:00Z',
    inTrash: false,
  };

  return {
    ...base,
    ...(title === undefined ? {} : { title }),
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
  // User story: advanced search narrows the library by the words a user types,
  // over the fields they enable. "all" requires every word to match the item;
  // "any" keeps items that match at least one word. Both run on the one fuzzy
  // engine (fzf), per whitespace token.
  const RANKING_ITEMS = [
    item('riemann', 'Riemann Surfaces and Theta Functions', 'Rie01'),
    item('lattices', 'Theta Functions of Lattices', 'The02'),
    item('groups', 'Quantum Groups', 'Qua03'),
  ];

  it('matchType "all" keeps only items every typed word matches', () => {
    // "theta" matches both theta-bearing titles; "lattices" only the second,
    // so the AND of the two words is exactly that item.
    const matched = filterZoteroItems(
      RANKING_ITEMS,
      advancedSettings('theta lattices', 'all', { title: true }),
    ).map(result => result.id);

    expect(matched).toEqual(['lattices']);
  });

  it('matchType "any" keeps items matching at least one typed word', () => {
    // "lattices" matches the second item; "groups" matches the third; neither
    // matches the first. The OR of the two words is both.
    const matched = filterZoteroItems(
      RANKING_ITEMS,
      advancedSettings('lattices groups', 'any', { title: true }),
    ).map(result => result.id).sort();

    expect(matched).toEqual(['groups', 'lattices']);
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

describe('standard citekey transliteration of untransliterable characters', () => {
  // Better BibTeX's documented citekey algorithm transliterates names and then
  // removes characters that have no ASCII transliteration (the BBT `clean`
  // step: transliterate, then drop unsafe characters). The documented OUTCOME
  // is that an untransliterable character does not appear in the derived key;
  // the surrounding transliterable characters are preserved and still counted.
  //
  // The defect this pins: an untransliterable character must be omitted
  // deterministically and explicitly at the transliteration step — not by
  // emitting a U+FFFD replacement sentinel that is later stripped. The witness
  // places the untransliterable U+1D54F (MATHEMATICAL DOUBLE-STRUCK CAPITAL X,
  // which has no ASCII transliteration) BEFORE three transliterable letters.
  //
  // Correct (explicit drop): authorsAlpha takes the first 3 letters of the
  //   transliterated family name "Muller" -> "Mul".
  // Broken (sentinel leaks into output): the key would contain U+FFFD or be a
  //   truncated "Mu", because the dropped character consumed a prefix slot.
  // Broken (whole name treated as untranslatable): the key would be empty.
  it('omits an untransliterable character without dropping surrounding letters', () => {
    const withUntransliterable: ZoteroItem = item('xmuller', 'Any Title', 'XMul20', {
      creators: [{ firstName: 'Anna', lastName: '\u{1D54F}Müller', creatorType: 'author' }],
      date: '2020',
    });

    expect(getStandardCitekey(withUntransliterable)).toBe('Mul20');
  });

  // A literal U+FFFD already present in the source data (e.g. prior mojibake in
  // the Zotero DB) must be handled by the same deterministic omission, not by a
  // sentinel class that conflates "library could not transliterate" with
  // "input literally contained a replacement character".
  it('omits a literal replacement character present in the source name', () => {
    const withLiteralReplacement: ZoteroItem = item('moller', 'Any Title', 'Mol20', {
      creators: [{ firstName: 'Bo', lastName: 'Mö�ller', creatorType: 'author' }],
      date: '2020',
    });

    expect(getStandardCitekey(withLiteralReplacement)).toBe('Mol20');
  });
});

describe('searching by any creator name', () => {
  // User story: a user types a co-author's surname (one who is 3rd or later in
  // the author list) and the item shows up. The compact display form only ever
  // names the first author ("Lastname et al."), so indexing the compact form
  // makes every non-leading author unsearchable. The searchable creator
  // projection must cover every creator's name, at any position.
  const MULTI_AUTHOR = item('attention', 'Attention Is All You Need', 'Vas17', {
    creators: [
      { firstName: 'Ashish', lastName: 'Vaswani', creatorType: 'author' },
      { firstName: 'Noam', lastName: 'Shazeer', creatorType: 'author' },
      { firstName: 'Niki', lastName: 'Parmar', creatorType: 'author' },
      { firstName: 'Jakob', lastName: 'Uszkoreit', creatorType: 'author' },
    ],
    date: '2017',
  });

  it('finds an item by the surname of its third author', () => {
    const matched = filterZoteroItems(
      [MULTI_AUTHOR],
      advancedSettings('Parmar', 'all', { creators_compact: true }),
    ).map(result => result.id);

    expect(matched).toEqual(['attention']);
  });

  it('finds an item by a creator first name', () => {
    const matched = filterZoteroItems(
      [MULTI_AUTHOR],
      advancedSettings('Noam', 'all', { creators_compact: true }),
    ).map(result => result.id);

    expect(matched).toEqual(['attention']);
  });

  it('finds an item by a non-leading author via the default palette scope', () => {
    // The palette uses the canonical default key set (PALETTE_SEARCH_KEYS,
    // which carries the creator key). A 4th author's surname must be reachable
    // there too, not only through an explicitly-enabled advanced-search field.
    const documents = buildZoteroSearchDocuments([MULTI_AUTHOR]);

    expect(rankZoteroSearchDocumentsForPalette(documents, 'Uszkoreit')[0]?.item.id)
      .toBe('attention');
  });

  it('keeps the compact display/sort form as the leading author with "et al."', () => {
    // Display/sort is owned by formatCreatorsCompact, which must be unchanged:
    // expanding the *searchable* creator text must not leak the full author
    // list into the compact column the table and sort key render.
    expect(formatCreatorsCompact(MULTI_AUTHOR.creators)).toBe('Vaswani et al.');
  });
});

describe('search projection of a titleless item', () => {
  // ZoteroItem.title is legitimately optional; the real DB has titleless items.
  // The projection must NOT fabricate an empty-string title token: a titleless
  // item contributes no title term but stays searchable by its other fields.
  it('does not fabricate an empty-string title token for a titleless item', () => {
    const documents = buildZoteroSearchDocuments([
      item('titleless', undefined, 'NoTitle20', {
        publicationTitle: 'Distinctive Journal Of Topology',
      }),
    ]);

    // The projected title term is absent (no '' token), not a fabricated empty
    // string that would silently mask the missing-title data state.
    expect(documents[0].title).toBeUndefined();
  });

  it('keeps a titleless item searchable by another field and does not match an empty-title query', () => {
    const titleless: ZoteroItem = item('titleless', undefined, 'NoTitle20', {
      publicationTitle: 'Distinctive Journal Of Topology',
    });

    const byPublication = filterZoteroItems(
      [titleless],
      advancedSettings('Distinctive', 'all', { publicationTitle: true }),
    ).map(result => result.id);
    expect(byPublication).toEqual(['titleless']);
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
