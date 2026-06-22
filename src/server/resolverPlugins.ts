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


// A LOCAL resolver-executor failure: the resolver process was rejected, timed
// out, exited nonzero, produced empty/oversized output, or produced BibTeX that
// failed the import-gate validation. This is a plugin/local fault domain, kept
// type-distinct from an upstream Zotero write-plugin failure so the API boundary
// can classify by real type rather than collapsing both into one kind.
export class ResolverExecutionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResolverExecutionError';
  }
}

// An UPSTREAM Zotero write-plugin failure: the resolver produced valid BibTeX and
// the local pipeline succeeded, but the Zotero import endpoint itself rejected or
// failed the write. Distinct from ResolverExecutionError so a Zotero-side fault
// is never mistaken for a local plugin bug at the API boundary.
export class ZoteroImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ZoteroImportError';
  }
}

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
      fail(new ResolverExecutionError(`resolver ${plugin.id} timed out after ${execution.timeoutMs}ms`));
    }, execution.timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (Buffer.byteLength(stdout, 'utf8') > execution.stdoutByteLimit) {
        fail(new ResolverExecutionError(`resolver ${plugin.id} exceeded stdout byte limit`));
      }
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
      if (Buffer.byteLength(stderr, 'utf8') > execution.stderrByteLimit) {
        fail(new ResolverExecutionError(`resolver ${plugin.id} exceeded stderr byte limit`));
      }
    });
    // A spawn/process-level error (e.g. the executable cannot be launched) is
    // also a local resolver-execution fault. Preserve the original OS error as
    // `cause` so its real diagnostic signal is not lost.
    child.on('error', error => fail(new ResolverExecutionError(`resolver ${plugin.id} failed to execute: ${error.message}`, { cause: error })));
    child.on('close', code => {
      if (settled) return;
      if (code !== 0) {
        fail(new ResolverExecutionError(`resolver ${plugin.id} exited with code ${code}: ${stderr}`));
        return;
      }
      const bibtex = stdout.trim();
      if (bibtex.length === 0) {
        fail(new ResolverExecutionError(`resolver ${plugin.id} produced empty BibTeX`));
        return;
      }
      try {
        parseBibTeXToMetadata(bibtex);
      } catch (error) {
        // Invalid BibTeX produced by the resolver is a local resolver-execution
        // fault, not an upstream Zotero failure. Keep the validation error's real
        // message and cause; only the domain type is added.
        fail(new ResolverExecutionError(error instanceof Error ? error.message : String(error), { cause: error }));
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
  // The fetch to the Zotero write endpoint is the upstream boundary. It can fail
  // in two ways that are the SAME fault domain: (a) it returns a non-ok HTTP
  // response, or (b) it REJECTS at the transport layer (endpoint unreachable:
  // connection refused, DNS failure, timeout). Both mean the upstream Zotero call
  // failed, so both must surface as ZoteroImportError — otherwise a raw transport
  // rejection escapes the instanceof classification at the API boundary and is
  // mislabeled as a local internal_error (500) instead of upstream (502). The
  // .catch scope is the fetch CALL ONLY, so a local fault (the parse above, the
  // result-schema parse below) is never mislabeled as upstream; the original
  // transport error is preserved as `cause` so its diagnostic signal is not lost.
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
  }).catch((error: Error) => {
    throw new ZoteroImportError(`Zotero BibTeX import endpoint unreachable: ${error.message}`, { cause: error });
  });
  if (!response.ok) {
    throw new ZoteroImportError(`Zotero BibTeX import failed with HTTP ${response.status}: ${await response.text()}`);
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
