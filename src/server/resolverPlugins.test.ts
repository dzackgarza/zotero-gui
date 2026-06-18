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
    const item = parseBibTeXToMetadata(bibtex);

    expect(item).toMatchObject({
      itemType: 'book',
      title: 'Resolved ISBN 9780262033848',
      publisher: 'Independent Resolver Press',
      isbn: '9780262033848',
    });
    expect(item.creators).toEqual([{ firstName: 'Emmy', lastName: 'Noether', creatorType: 'author' }]);
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
