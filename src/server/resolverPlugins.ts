import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  AcceptedInputDescriptorSchema,
  ResolverPluginMetadataSchema,
} from '../schemas';
import type { ResolverPluginMetadata } from '../schemas';
import { parseBibTeXToMetadata } from '../utils/bibtexParser';
import { invariant } from '../utils/invariant';


export type ResolverCommand = [string, ...string[]];

export interface AcceptedInputDescriptor {
  id: string;
  label: string;
  example: string;
  pattern: string;
}

export interface ResolverPluginConfig {
  id: string;
  name: string;
  command: ResolverCommand;
  acceptedInputs: AcceptedInputDescriptor[];
}

export interface ResolverExecutionConfig {
  cwd: string;
  timeoutMs: number;
  stdoutByteLimit: number;
  stderrByteLimit: number;
}

export interface ZoteroImportResult {
  success: true;
  operation: 'import_bibtex';
  stage: 'completed';
  version: string;
  details: {
    item_count: number;
    collection_keys: string[];
    translator_id: string;
  };
  item_key: string;
  item_id: number;
  item_keys: string[];
  item_ids: number[];
  titles: string[];
}

const ResolverCommandSchema = z.array(z.string().min(1)).min(1).transform(value => value as ResolverCommand);
const ResolverPluginConfigSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  acceptedInputs: z.array(AcceptedInputDescriptorSchema).min(1),
  command: ResolverCommandSchema,
});
const ResolverPluginManifestSchema = z.strictObject({
  plugins: z.array(ResolverPluginConfigSchema).min(1),
});
const ZoteroImportResultSchema = z.strictObject({
  success: z.literal(true),
  operation: z.literal('import_bibtex'),
  stage: z.literal('completed'),
  version: z.string().min(1),
  details: z.strictObject({
    item_count: z.literal(1),
    collection_keys: z.array(z.string()),
    translator_id: z.string().min(1),
  }),
  item_key: z.string().min(1),
  item_id: z.number().int(),
  item_keys: z.array(z.string().min(1)).length(1),
  item_ids: z.array(z.number().int()).length(1),
  titles: z.array(z.string()).length(1),
});


function rejectDuplicateIds(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    invariant(!seen.has(value), `duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

export function loadResolverPlugins(configPath: string): ResolverPluginConfig[] {
  const manifest = ResolverPluginManifestSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
  rejectDuplicateIds(manifest.plugins.map(plugin => plugin.id), 'resolver plugin id');
  rejectDuplicateIds(
    manifest.plugins.flatMap(plugin => plugin.acceptedInputs.map(input => input.id)),
    'resolver accepted-input id',
  );
  for (const plugin of manifest.plugins) {
    for (const input of plugin.acceptedInputs) {
      new RegExp(input.pattern);
    }
  }
  return manifest.plugins.map(plugin => {
    const command = plugin.command;
    invariant(command, `resolver ${plugin.id} command must be present`);
    return {
      id: plugin.id,
      name: plugin.name,
      command,
      acceptedInputs: plugin.acceptedInputs,
    };
  });
}

export function pluginAcceptsInput(plugin: ResolverPluginConfig, input: string): boolean {
  return plugin.acceptedInputs.some(descriptor => new RegExp(descriptor.pattern, 'i').test(input.trim()));
}

export function resolverPluginMetadata(plugin: ResolverPluginConfig): ResolverPluginMetadata {
  return ResolverPluginMetadataSchema.parse({
    id: plugin.id,
    name: plugin.name,
    acceptedInputs: plugin.acceptedInputs.map(input => AcceptedInputDescriptorSchema.parse(input)),
  });
}

export async function runResolverPlugin(
  plugin: ResolverPluginConfig,
  input: string,
  execution: ResolverExecutionConfig,
): Promise<string> {
  invariant(plugin.command.length > 0, `resolver ${plugin.id} command must not be empty`);
  invariant(input.trim().length > 0, 'resolver input must not be empty');
  invariant(pluginAcceptsInput(plugin, input), `resolver ${plugin.id} does not accept the supplied input`);

  const [command, ...args] = plugin.command;
  const child = spawn(command, args, { cwd: execution.cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(input);

  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error(`resolver ${plugin.id} timed out after ${execution.timeoutMs}ms`));
    }, execution.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > execution.stdoutByteLimit) {
        fail(new Error(`resolver ${plugin.id} exceeded stdout byte limit`));
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > execution.stderrByteLimit) {
        fail(new Error(`resolver ${plugin.id} exceeded stderr byte limit`));
      }
    });
    child.on('error', fail);
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) {
        fail(new Error(`resolver ${plugin.id} exited with code ${code}: ${stderr}`));
        return;
      }
      const bibtex = stdout.trim();
      if (bibtex.length === 0) {
        fail(new Error(`resolver ${plugin.id} produced empty BibTeX`));
        return;
      }
      try {
        parseBibTeXToMetadata(bibtex);
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(`${bibtex}\n`);
    });
  });
}

export async function importBibTeXToZotero(
  bibtex: string,
  collections: string[],
  importEndpoint: string,
  fetchImpl: typeof fetch,
): Promise<ZoteroImportResult> {
  parseBibTeXToMetadata(bibtex);
  const response = await fetchImpl(importEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'import_bibtex',
      bibtex,
      collection_keys: collections,
    }),
  });
  if (!response.ok) {
    throw new Error(`Zotero BibTeX import failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return ZoteroImportResultSchema.parse(await response.json());
}

export async function resolveSourceToZotero(
  plugin: ResolverPluginConfig,
  input: string,
  collections: string[],
  execution: ResolverExecutionConfig,
  importEndpoint: string,
  fetchImpl: typeof fetch,
): Promise<ZoteroImportResult> {
  const bibtex = await runResolverPlugin(plugin, input, execution);
  return importBibTeXToZotero(bibtex, collections, importEndpoint, fetchImpl);
}
