import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBibTeXToItem } from '../utils/bibtexParser';
import { buildZoteroItemPayload, runResolverPlugin } from './resolverPlugins';

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const fixturePlugin = path.join(thisDir, 'test-fixtures', 'echo-resolver.mjs');

describe('server-owned resolver plugin execution', () => {
  it('feeds a source string to an external script and receives BibTeX', async () => {
    const bibtex = await runResolverPlugin({
      id: 'fixture',
      name: 'Fixture Resolver',
      command: [process.execPath, fixturePlugin],
    }, 'ISBN 9780262033848');

    const item = parseBibTeXToItem(bibtex);

    expect(item.title).toBe('Resolved ISBN 9780262033848');
    expect(item.itemType).toBe('book');
    expect(item.creators).toEqual([
      { firstName: 'Emmy', lastName: 'Noether', creatorType: 'author' },
    ]);
    expect(item.publisher).toBe('Independent Resolver Press');
    expect(item.isbn).toBe('9780262033848');
  });
});

describe('BibTeX ingestion payload mapping', () => {
  it('builds the exact Zotero create-item payload from parsed BibTeX', () => {
    const bibtex = `@article{atiyah1969,
      title = {Algebraic Geometry and Analytic Geometry},
      author = {Atiyah, Michael F. and Hodge, William V. D.},
      journal = {Proceedings of the Edinburgh Mathematical Society},
      year = {1969},
      volume = {17},
      number = {1},
      pages = {1--10},
      doi = {10.1017/S001309150000811X},
      url = {https://doi.org/10.1017/S001309150000811X}
    }`;

    const item = parseBibTeXToItem(bibtex);
    const payload = buildZoteroItemPayload(item, ['42']);

    expect(payload).toEqual({
      itemType: 'journalArticle',
      title: 'Algebraic Geometry and Analytic Geometry',
      creators: [
        { firstName: 'Michael F.', lastName: 'Atiyah', creatorType: 'author' },
        { firstName: 'William V. D.', lastName: 'Hodge', creatorType: 'author' },
      ],
      collections: ['42'],
      tags: [{ tag: 'resolved' }],
      publicationTitle: 'Proceedings of the Edinburgh Mathematical Society',
      volume: '17',
      issue: '1',
      pages: '1--10',
      date: '1969',
      DOI: '10.1017/S001309150000811X',
      url: 'https://doi.org/10.1017/S001309150000811X',
      citationKey: 'atiyah1969',
    });
  });
});
