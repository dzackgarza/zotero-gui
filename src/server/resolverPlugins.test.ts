import path from 'node:path';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBibTeXToItem } from '../utils/bibtexParser';
import { buildZoteroItemPayload, loadResolverPlugins, parseZoteroCreateResult, runResolverPlugin } from './resolverPlugins';
import type { ResolverPluginConfig } from './resolverPlugins';

interface ZBMathCrossrefFixture {
  zbl: string;
  doi: string;
  zbmath: ZBMathDocumentFixture;
  crossrefBibtex: string;
}

interface ZBMathCrossrefFixtureCorpus {
  records: ZBMathCrossrefFixture[];
}

interface ZBMathDocumentFixture {
  id: number;
  title: { title: string };
  contributors: { authors: Array<{ name: string }> };
  source: {
    pages?: string;
    serial?: ZBMathSourceFixture[];
    series?: ZBMathSourceFixture[];
  };
  year: string;
  links: Array<{ type: string; identifier: string }>;
}

interface ZBMathSourceFixture {
  title: string;
  volume?: string;
  issue?: string;
}

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const fixturePlugin = path.join(thisDir, 'test-fixtures', 'echo-resolver.mjs');

function firstZBMathSource(document: ZBMathDocumentFixture): ZBMathSourceFixture {
  const source = (document.source.serial ?? document.source.series)?.[0];
  if (!source) {
    throw new Error(`ZBMath fixture ${document.id} must contain a serial or series source`);
  }
  return source;
}

function zbmathDoi(document: ZBMathDocumentFixture): string {
  const doi = document.links.find(link => link.type === 'doi')?.identifier;
  if (!doi) {
    throw new Error(`ZBMath fixture ${document.id} must contain a DOI link`);
  }
  return doi;
}

function bracedBibTeXField(bibtex: string, field: string): string {
  const match = new RegExp(`${field}=\\{([^}]*)\\}`, 'i').exec(bibtex);
  if (!match) {
    throw new Error(`Crossref BibTeX fixture must contain ${field}`);
  }
  return match[1];
}

function normalizePageRange(value: string | undefined): string {
  if (!value) {
    throw new Error('page range must be present');
  }
  return value.replaceAll('–', '-');
}

describe('server-owned resolver plugin execution', () => {
  it('loads resolver commands from an explicit config file', () => {
    const configDir = mkdtempSync(path.join(tmpdir(), 'zotero-gui-resolvers-'));
    const configPath = path.join(configDir, 'resolver-plugins.json');
    writeFileSync(configPath, JSON.stringify({
      plugins: [{
        id: 'fixture',
        name: 'Fixture Resolver',
        command: [process.execPath, fixturePlugin],
      }],
    }));

    const plugins = loadResolverPlugins(configPath);

    expect(plugins).toEqual([{
      id: 'fixture',
      name: 'Fixture Resolver',
      command: [process.execPath, fixturePlugin],
    }]);
  });

  it('declares the ZBMath resolver as a configured plugin', () => {
    const plugins = loadResolverPlugins(path.join(thisDir, '..', '..', 'resolver-plugins.json'));

    expect(plugins.find(plugin => plugin.id === 'zbmath')).toEqual({
      id: 'zbmath',
      name: 'ZBMath Resolver',
      command: ['node', 'resolver-plugins/zbmath.mjs'],
    });
  });

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

  it('runs the DOI plugin through DOI content-negotiated BibTeX', async () => {
    const plugin = {
      id: 'doi',
      name: 'DOI Resolver',
      command: [process.execPath, path.join(thisDir, '..', '..', 'resolver-plugins', 'doi.mjs')],
    } satisfies ResolverPluginConfig;
    const bibtex = await runResolverPlugin(plugin, 'https://doi.org/10.1016/S0019-9958(65)90241-X');

    expect(bracedBibTeXField(bibtex, 'DOI').toLowerCase()).toBe('10.1016/s0019-9958(65)90241-x');
    expect(bracedBibTeXField(bibtex, 'title')).toBe('Fuzzy sets');
    expect(bracedBibTeXField(bibtex, 'journal')).toBe('Information and Control');
    expect(bracedBibTeXField(bibtex, 'year')).toBe('1965');
    expect(bracedBibTeXField(bibtex, 'pages')).toBe('338–353');
  });

  it('runs the ISBN plugin through Zotero-priority Library of Congress lookup', async () => {
    const fixturePath = path.join(thisDir, 'test-fixtures', 'library-of-congress-isbn-0838985890.xml');
    const { bookBibTeX } = await import(pathToFileURL(path.join(thisDir, '..', '..', 'resolver-plugins', 'isbn-lib.mjs')).href) as {
      bookBibTeX: (xmlText: string, isbn: string) => string;
    };
    const bibtex = bookBibTeX(readFileSync(fixturePath, 'utf8'), '0838985890');
    const item = parseBibTeXToItem(bibtex);

    expect(item).toMatchObject({
      itemType: 'book',
      title: 'Zotero: a guide for librarians, researchers, and educators',
      publisher: 'Association of College and Research Libraries',
      date: '2011',
      isbn: '9780838985892 0838985890',
    });
    expect(item.creators).toEqual([
      { firstName: 'Jason', lastName: 'Puckett', creatorType: 'author' },
    ]);
  });

  it('runs the arXiv plugin through arXiv BibTeX export', async () => {
    const plugin = {
      id: 'arxiv',
      name: 'arXiv Resolver',
      command: [process.execPath, path.join(thisDir, '..', '..', 'resolver-plugins', 'arxiv.mjs')],
    } satisfies ResolverPluginConfig;
    const bibtex = await runResolverPlugin(plugin, 'https://arxiv.org/abs/1706.03762');

    expect(bracedBibTeXField(bibtex, 'title')).toBe('Attention Is All You Need');
    expect(bracedBibTeXField(bibtex, 'eprint')).toBe('1706.03762');
    expect(bracedBibTeXField(bibtex, 'archivePrefix')).toBe('arXiv');
    expect(bracedBibTeXField(bibtex, 'primaryClass')).toBe('cs.CL');
    expect(bracedBibTeXField(bibtex, 'url')).toBe('https://arxiv.org/abs/1706.03762');
  });

  it('runs the ZBMath plugin from both accepted user inputs to canonical BibTeX', async () => {
    const plugin = {
      id: 'zbmath',
      name: 'ZBMath Resolver',
      command: [process.execPath, path.join(thisDir, '..', '..', 'resolver-plugins', 'zbmath.mjs')],
    } satisfies ResolverPluginConfig;
    const urlBibtex = await runResolverPlugin(plugin, 'https://zbmath.org/?q=an:0125.10303');
    const rawBibtex = await runResolverPlugin(plugin, '0125.10303');

    expect(rawBibtex).toBe(urlBibtex);

    const item = parseBibTeXToItem(urlBibtex);

    expect(item).toMatchObject({
      itemType: 'journalArticle',
      title: 'Kriterien für die Projektivität vollständiger abstrakter algebraischer Mannigfaltigkeiten',
      publicationTitle: 'Izvestiya Akademii Nauk SSSR. Seriya Matematicheskaya',
      volume: '28',
      pages: '179-224',
      date: '1964',
    });
    expect(item.creators).toEqual([
      { firstName: 'B. G.', lastName: 'Moĭshezon', creatorType: 'author' },
    ]);
    expect(urlBibtex).toContain('zblnumber = {0125.10303}');
    expect(urlBibtex).toContain('zbmath = {3202953}');
  });

  it('reconstructs 15 DOI-backed ZBMath fixtures against source-owned metadata', async () => {
    const fixturePath = path.join(thisDir, 'test-fixtures', 'zbmath-crossref-fixtures.json');
    const corpus = JSON.parse(readFileSync(fixturePath, 'utf8')) as ZBMathCrossrefFixtureCorpus;
    const { articleBibTeX } = await import(pathToFileURL(path.join(thisDir, '..', '..', 'resolver-plugins', 'zbmath-lib.mjs')).href) as {
      articleBibTeX: (document: ZBMathDocumentFixture, zblNumber: string) => string;
    };

    expect(corpus.records.map(record => record.zbl)).toEqual([
      '0139.24606',
      '1092.91524',
      '1154.94303',
      '1368.05139',
      '1226.05223',
      '1051.81505',
      '0914.53047',
      '0661.17013',
      '1417.37129',
      '0202.55202',
      '0219.65008',
      '0990.94509',
      '1306.81030',
      '1205.82086',
      '0914.53048',
    ]);

    for (const record of corpus.records) {
      const bibtex = articleBibTeX(record.zbmath, record.zbl);
      const item = parseBibTeXToItem(bibtex);
      const source = firstZBMathSource(record.zbmath);
      const zblDoi = zbmathDoi(record.zbmath);

      expect(zblDoi.toLowerCase()).toBe(record.doi.toLowerCase());
      expect(item.title).toBe(record.zbmath.title.title);
      expect(item.publicationTitle).toBe(source.title);
      expect(item.date).toBe(record.zbmath.year);
      expect(item.doi?.toLowerCase()).toBe(record.doi.toLowerCase());
      expect(bibtex).toContain(`zblnumber = {${record.zbl}}`);
      expect(bibtex).toContain(`zbmath = {${record.zbmath.id}}`);

      const crossrefDoi = bracedBibTeXField(record.crossrefBibtex, 'DOI');
      const crossrefYear = bracedBibTeXField(record.crossrefBibtex, 'year');
      const crossrefVolume = bracedBibTeXField(record.crossrefBibtex, 'volume');
      const crossrefPages = bracedBibTeXField(record.crossrefBibtex, 'pages');

      expect(crossrefDoi.toLowerCase()).toBe(record.doi.toLowerCase());
      expect(crossrefYear).toBe(record.zbmath.year);
      expect(item.volume).toBe(crossrefVolume);
      expect(normalizePageRange(item.pages)).toContain(normalizePageRange(crossrefPages));
    }
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

  it('accepts Zotero create responses with a successful result map', () => {
    expect(parseZoteroCreateResult({
      successful: {
        0: {
          key: 'ABCD1234',
          data: { title: 'Created item' },
        },
      },
      failed: {},
    })).toEqual({
      key: 'ABCD1234',
      data: { title: 'Created item' },
    });
  });
});
