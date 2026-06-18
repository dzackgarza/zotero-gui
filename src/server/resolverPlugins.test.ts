import path from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBibTeXToItem } from '../utils/bibtexParser';
import { buildZoteroItemPayload, loadResolverPlugins, parseZoteroCreateResult, runResolverPlugin } from './resolverPlugins';
import type { ResolverPluginConfig } from './resolverPlugins';

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const fixturePlugin = path.join(thisDir, 'test-fixtures', 'echo-resolver.mjs');

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
