import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBibTeXToMetadata } from '../utils/bibtexParser';
import {
  loadResolverPlugins,
  runResolverPlugin,
  type ResolverExecutionConfig,
  type ResolverPluginConfig,
} from './resolverPlugins';

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'zotero-gui-resolver-'));
}

function writeJson(pathname: string, value: unknown): void {
  writeFileSync(pathname, `${JSON.stringify(value, null, 2)}\n`);
}

function writeScript(dir: string, source: string): string {
  const scriptPath = path.join(dir, `resolver-${randomUUID()}.mjs`);
  writeFileSync(scriptPath, source);
  return scriptPath;
}

function plugin(command: [string, ...string[]]): ResolverPluginConfig {
  return {
    id: 'fixture',
    name: 'Fixture Resolver',
    command,
    acceptedInputs: [{
      id: 'fixture-input',
      label: 'Fixture Input',
      example: 'ISBN 9780262033848',
      pattern: '^ISBN\\s+\\S+$',
    }],
  };
}

function execution(cwd: string): ResolverExecutionConfig {
  return {
    cwd,
    timeoutMs: 1000,
    stdoutByteLimit: 4096,
    stderrByteLimit: 4096,
  };
}

function timeoutExecution(cwd: string): ResolverExecutionConfig {
  return {
    cwd,
    timeoutMs: 20,
    stdoutByteLimit: 4096,
    stderrByteLimit: 4096,
  };
}

function stdoutLimitExecution(cwd: string): ResolverExecutionConfig {
  return {
    cwd,
    timeoutMs: 1000,
    stdoutByteLimit: 32,
    stderrByteLimit: 4096,
  };
}

describe('resolver plugin manifests', () => {
  it('loads UI-safe accepted input descriptors from an explicit manifest', () => {
    const dir = tempDir();
    const scriptPath = writeScript(dir, 'process.stdout.write("@book{ok,title={OK}}\\n");');
    const manifestPath = path.join(dir, 'resolver-plugins.json');
    writeJson(manifestPath, {
      plugins: [plugin([process.execPath, scriptPath])],
    });

    expect(loadResolverPlugins(manifestPath)).toEqual([plugin([process.execPath, scriptPath])]);
  });

  it('rejects duplicate plugin IDs', () => {
    const dir = tempDir();
    const scriptPath = writeScript(dir, 'process.stdout.write("@book{ok,title={OK}}\\n");');
    const manifestPath = path.join(dir, 'resolver-plugins.json');
    const entry = plugin([process.execPath, scriptPath]);
    writeJson(manifestPath, { plugins: [entry, entry] });

    expect(() => loadResolverPlugins(manifestPath)).toThrow(/duplicate resolver plugin id/);
  });

  it('rejects duplicate accepted-input IDs', () => {
    const dir = tempDir();
    const scriptPath = writeScript(dir, 'process.stdout.write("@book{ok,title={OK}}\\n");');
    const manifestPath = path.join(dir, 'resolver-plugins.json');
    const entry = plugin([process.execPath, scriptPath]);
    writeJson(manifestPath, {
      plugins: [
        entry,
        { ...entry, id: 'other', acceptedInputs: entry.acceptedInputs },
      ],
    });

    expect(() => loadResolverPlugins(manifestPath)).toThrow(/duplicate resolver accepted-input id/);
  });

  it('rejects malformed commands and missing accepted-input contracts', () => {
    const dir = tempDir();
    const manifestPath = path.join(dir, 'resolver-plugins.json');
    writeJson(manifestPath, {
      plugins: [{
        id: 'fixture',
        name: 'Fixture Resolver',
        command: [],
      }],
    });

    expect(() => loadResolverPlugins(manifestPath)).toThrow();
  });
});

describe('resolver plugin execution', () => {
  it('routes stdin to a real executable with explicit cwd and ignores diagnostic stderr on success', async () => {
    const dir = tempDir();
    const scriptPath = writeScript(dir, `
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) input += chunk;
console.error('cwd=' + process.cwd());
process.stdout.write(\`@book{fixture,
  title = {Resolved \${input.trim()}},
  author = {Noether, Emmy},
  publisher = {Independent Resolver Press},
  year = {2026},
  isbn = {9780262033848}
}\\n\`);
`);

    const bibtex = await runResolverPlugin(
      plugin([process.execPath, scriptPath]),
      'ISBN 9780262033848',
      execution(dir),
    );

    // The route ships the resolver's RAW BibTeX to Zotero (operation: 'import_bibtex');
    // it must not re-map fields into a bespoke object. Prove the raw entry is preserved
    // verbatim and that parseBibTeXToMetadata is a pure validation gate (no return value
    // to fabricate item types or creators from).
    expect(bibtex).toBe(`@book{fixture,
  title = {Resolved ISBN 9780262033848},
  author = {Noether, Emmy},
  publisher = {Independent Resolver Press},
  year = {2026},
  isbn = {9780262033848}
}
`);
    expect(parseBibTeXToMetadata(bibtex)).toBeUndefined();
  });

  it('rejects unmatched input before spawning the plugin process', async () => {
    const dir = tempDir();
    const markerPath = path.join(dir, 'spawned');
    const scriptPath = writeScript(dir, `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(markerPath)}, 'spawned');`);

    await expect(runResolverPlugin(plugin([process.execPath, scriptPath]), 'not an isbn', execution(dir)))
      .rejects.toThrow(/does not accept/);
    expect(existsSync(markerPath)).toBe(false);
  });

  it('rejects timeout, output-limit, empty, invalid, and multiple-entry output failures', async () => {
    const dir = tempDir();
    const slow = writeScript(dir, 'setTimeout(() => process.stdout.write("@book{late,title={Late}}"), 500);');
    await expect(runResolverPlugin(plugin([process.execPath, slow]), 'ISBN 9780262033848', timeoutExecution(dir)))
      .rejects.toThrow(/timed out/);

    const noisy = writeScript(dir, 'process.stdout.write("@book{big,title={" + "x".repeat(200) + "}}");');
    await expect(runResolverPlugin(plugin([process.execPath, noisy]), 'ISBN 9780262033848', stdoutLimitExecution(dir)))
      .rejects.toThrow(/stdout byte limit/);

    const empty = writeScript(dir, 'process.stdout.write("");');
    await expect(runResolverPlugin(plugin([process.execPath, empty]), 'ISBN 9780262033848', execution(dir)))
      .rejects.toThrow(/empty BibTeX/);

    const invalid = writeScript(dir, 'process.stdout.write("not bibtex");');
    await expect(runResolverPlugin(plugin([process.execPath, invalid]), 'ISBN 9780262033848', execution(dir)))
      .rejects.toThrow(/Invalid BibTeX/);

    const multiple = writeScript(dir, 'process.stdout.write("@book{a,title={A}}\\n@book{b,title={B}}\\n");');
    await expect(runResolverPlugin(plugin([process.execPath, multiple]), 'ISBN 9780262033848', execution(dir)))
      .rejects.toThrow(/exactly one/);
  });
});

describe('parseBibTeXToMetadata validation gate', () => {
  it('accepts a single well-formed @book with a title and at least one author', () => {
    const bibtex = `@book{noether1921,
  title = {Idealtheorie in Ringbereichen},
  author = {Noether, Emmy},
  publisher = {Mathematische Annalen},
  year = {1921}
}`;
    expect(parseBibTeXToMetadata(bibtex)).toBeUndefined();
  });

  it('accepts a single well-formed @article with a title and at least one author', () => {
    const bibtex = `@article{turing1936,
  title = {On Computable Numbers},
  author = {Turing, Alan M.},
  journal = {Proc. London Math. Soc.},
  year = {1936}
}`;
    expect(parseBibTeXToMetadata(bibtex)).toBeUndefined();
  });

  it('does not fabricate an item type for an unrecognized @entrytype — it defers mapping to Zotero', () => {
    // The old hand-rolled mapper silently coerced any unknown @entrytype into
    // itemType: 'journalArticle'. The validation gate must neither reject a
    // well-formed unknown type (Zotero owns item-type mapping) nor return any
    // fabricated metadata. A return value of undefined excludes the old fail-open
    // mapper, which would have returned { itemType: 'journalArticle', ... }.
    const bibtex = `@unrecognizedtype{x2026,
  title = {A Source of an Unmapped Kind},
  author = {Grothendieck, Alexander}
}`;
    expect(parseBibTeXToMetadata(bibtex)).toBeUndefined();
  });

  it('throws when the single entry has no title', () => {
    const bibtex = `@book{notitle,
  author = {Noether, Emmy},
  year = {1921}
}`;
    expect(() => parseBibTeXToMetadata(bibtex)).toThrow(/title/);
  });

  it('throws when the single entry has no author', () => {
    const bibtex = `@book{noauthor,
  title = {A Title Without An Author},
  year = {1921}
}`;
    expect(() => parseBibTeXToMetadata(bibtex)).toThrow(/author/);
  });

  it('throws on malformed BibTeX that yields no parseable entry', () => {
    expect(() => parseBibTeXToMetadata('this is not bibtex at all')).toThrow(/Invalid BibTeX/);
  });

  it('throws when more than one entry is present', () => {
    const bibtex = `@book{a, title = {A}, author = {Aa, A} }
@book{b, title = {B}, author = {Bb, B} }`;
    expect(() => parseBibTeXToMetadata(bibtex)).toThrow(/exactly one/);
  });
});
