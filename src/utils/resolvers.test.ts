import { describe, it, expect, vi } from 'vitest';
import { registry, doiResolver, isbnResolver, arxivResolver, zbmathResolver, mathscinetResolver, MetadataResolverPlugin } from './resolvers';
import { parseBibTeXToItem } from './bibtexParser';

describe('BibTeX Parser semantic mapping & validation', () => {
  it('correctly parses and validates a valid BibTeX string', () => {
    const bibtex = `@article{test_key,
      title = {The Title of the Paper},
      author = {Knuth, Donald E. and Landin, Peter J.},
      journal = {Journal of Functional Programming},
      year = {1990},
      doi = {10.1017/S095679680000001X}
    }`;
    const item = parseBibTeXToItem(bibtex);
    expect(item.itemType).toBe('journalArticle');
    expect(item.title).toBe('The Title of the Paper');
    expect(item.creators).toEqual([
      { firstName: 'Donald E.', lastName: 'Knuth', creatorType: 'author' },
      { firstName: 'Peter J.', lastName: 'Landin', creatorType: 'author' }
    ]);
    expect(item.date).toBe('1990');
    expect(item.publicationTitle).toBe('Journal of Functional Programming');
    expect(item.doi).toBe('10.1017/S095679680000001X');
  });

  it('fails loudly when required title field is missing', () => {
    const bibtex = `@article{test_key,
      author = {Knuth, Donald E.},
      year = {1990}
    }`;
    expect(() => parseBibTeXToItem(bibtex)).toThrow('BibTeX entry must contain a title.');
  });
});

describe('Resolver Plugin Patterns', () => {
  it('doiResolver pattern matches standard DOI formats', () => {
    expect(doiResolver.pattern.test('10.1145/3318464.3389700')).toBe(true);
    expect(doiResolver.pattern.test('https://doi.org/10.1145/3318464.3389700')).toBe(true);
    expect(doiResolver.pattern.test('http://dx.doi.org/10.1145/3318464.3389700')).toBe(true);
    expect(doiResolver.pattern.test('not-a-doi')).toBe(false);
  });

  it('isbnResolver pattern matches ISBN formats', () => {
    expect(isbnResolver.pattern.test('9780262033848')).toBe(true);
    expect(isbnResolver.pattern.test('0262033844')).toBe(true);
    expect(isbnResolver.pattern.test('isbn:9780262033848')).toBe(true);
    expect(isbnResolver.pattern.test('isbn 9780262033848')).toBe(true);
    expect(isbnResolver.pattern.test('not-an-isbn')).toBe(false);
  });

  it('arxivResolver pattern matches arXiv IDs and links', () => {
    expect(arxivResolver.pattern.test('1706.03762')).toBe(true);
    expect(arxivResolver.pattern.test('arxiv:1706.03762')).toBe(true);
    expect(arxivResolver.pattern.test('https://arxiv.org/abs/1706.03762')).toBe(true);
    expect(arxivResolver.pattern.test('https://arxiv.org/pdf/1706.03762.pdf')).toBe(true);
  });

  it('zbmathResolver pattern matches zbmath patterns', () => {
    expect(zbmathResolver.pattern.test('1234.56789')).toBe(true);
    expect(zbmathResolver.pattern.test('zbl 1234.56789')).toBe(true);
    expect(zbmathResolver.pattern.test('https://zbmath.org/an/1234.56789')).toBe(true);
  });

  it('mathscinetResolver pattern matches MathSciNet patterns', () => {
    expect(mathscinetResolver.pattern.test('2050123')).toBe(true);
    expect(mathscinetResolver.pattern.test('mr:2050123')).toBe(true);
    expect(mathscinetResolver.pattern.test('https://mathscinet.ams.org/mathscinet-mref?mr=2050123')).toBe(true);
  });
});

describe('Resolver Registry Extensibility', () => {
  it('supports registering and resolving with a dynamic new plugin', async () => {
    const customResolver: MetadataResolverPlugin = {
      id: 'custom_test',
      name: 'Custom Test Resolver',
      pattern: /^custom-id-\d+$/i,
      async resolve(input: string): Promise<string> {
        return `@book{custom_${input},
          title = {Custom Book Title for ${input}},
          author = {Tester, Arthur},
          year = {2026}
        }`;
      }
    };

    registry.register(customResolver);

    // Verify it is part of all plugins
    const all = registry.getAllPlugins();
    expect(all.some(p => p.id === 'custom_test')).toBe(true);

    // Verify pattern matching narrows to custom plugin
    const matching = registry.getMatchingPlugins('custom-id-12345');
    expect(matching).toHaveLength(1);
    expect(matching[0].id).toBe('custom_test');

    // Verify resolve
    const bibtex = await registry.resolveWithPlugin('custom_test', 'custom-id-12345');
    const item = parseBibTeXToItem(bibtex);
    expect(item.title).toBe('Custom Book Title for custom-id-12345');
    expect(item.creators).toEqual([{ firstName: 'Arthur', lastName: 'Tester', creatorType: 'author' }]);
  });
});
