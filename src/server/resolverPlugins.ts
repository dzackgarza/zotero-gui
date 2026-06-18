import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { Creator, ItemType, ZoteroItem } from '../types';
import { parseBibTeXToItem } from '../utils/bibtexParser';

export type ResolverCommand = [string, ...string[]];

export interface ResolverPluginConfig {
  id: string;
  name: string;
  command: ResolverCommand;
}

export interface ZoteroCreateItemPayload {
  itemType: ItemType;
  title: string;
  creators: Creator[];
  collections: string[];
  tags: Array<{ tag: string }>;
  publicationTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  date?: string;
  publisher?: string;
  place?: string;
  DOI?: string;
  url?: string;
  ISBN?: string;
  ISSN?: string;
  abstractNote?: string;
  citationKey?: string;
}

export interface ZoteroCreateResult {
  key: string;
  data: unknown;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseResolverPluginConfig(value: unknown): ResolverPluginConfig {
  invariant(isRecord(value), 'resolver plugin config entry must be an object');
  invariant(typeof value.id === 'string' && value.id.trim().length > 0, 'resolver plugin id must be a non-empty string');
  invariant(typeof value.name === 'string' && value.name.trim().length > 0, 'resolver plugin name must be a non-empty string');
  invariant(Array.isArray(value.command), 'resolver plugin command must be an array');
  invariant(value.command.length > 0, 'resolver plugin command must not be empty');
  invariant(value.command.every(part => typeof part === 'string' && part.trim().length > 0), 'resolver plugin command entries must be non-empty strings');

  return {
    id: value.id,
    name: value.name,
    command: value.command as ResolverCommand,
  };
}

export function loadResolverPlugins(configPath: string): ResolverPluginConfig[] {
  const raw = JSON.parse(readFileSync(configPath, 'utf8')) as unknown;
  invariant(isRecord(raw), 'resolver plugin config must be an object');
  invariant(Array.isArray(raw.plugins), 'resolver plugin config must contain a plugins array');

  return raw.plugins.map(parseResolverPluginConfig);
}

export function runResolverPlugin(
  plugin: ResolverPluginConfig,
  input: string,
): Promise<string> {
  invariant(plugin.command.length > 0, `resolver ${plugin.id} command must not be empty`);
  invariant(input.trim().length > 0, 'resolver input must not be empty');

  const [command, ...args] = plugin.command;
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(input);

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', code => {
      invariant(code === 0, `resolver ${plugin.id} exited with code ${code}: ${stderr}`);
      invariant(stdout.trim().length > 0, `resolver ${plugin.id} produced empty BibTeX`);
      resolve(stdout);
    });
  });
}

export function buildZoteroItemPayload(
  item: Partial<ZoteroItem>,
  collections: string[],
): ZoteroCreateItemPayload {
  invariant(item.itemType, 'BibTeX item must have an item type');
  invariant(item.title, 'BibTeX item must have a title');
  invariant(item.creators, 'BibTeX item must have creators');

  return {
    itemType: item.itemType,
    title: item.title,
    creators: item.creators,
    collections,
    tags: [{ tag: 'resolved' }],
    ...(item.publicationTitle ? { publicationTitle: item.publicationTitle } : {}),
    ...(item.volume ? { volume: item.volume } : {}),
    ...(item.issue ? { issue: item.issue } : {}),
    ...(item.pages ? { pages: item.pages } : {}),
    ...(item.date ? { date: item.date } : {}),
    ...(item.publisher ? { publisher: item.publisher } : {}),
    ...(item.place ? { place: item.place } : {}),
    ...(item.doi ? { DOI: item.doi } : {}),
    ...(item.url ? { url: item.url } : {}),
    ...(item.isbn ? { ISBN: item.isbn } : {}),
    ...(item.issn ? { ISSN: item.issn } : {}),
    ...(item.abstractNote ? { abstractNote: item.abstractNote } : {}),
    ...(item.citekey ? { citationKey: item.citekey } : {}),
  };
}

export function parseZoteroCreateResult(raw: unknown): ZoteroCreateResult {
  invariant(isRecord(raw), 'Zotero create response must be an object');
  invariant(isRecord(raw.failed), 'Zotero create response must contain failed result map');
  invariant(Object.keys(raw.failed).length === 0, `Zotero item creation failed: ${JSON.stringify(raw.failed)}`);
  invariant(isRecord(raw.successful), 'Zotero create response must contain successful result map');

  const successEntries = Object.values(raw.successful);
  invariant(successEntries.length === 1, 'Zotero create response must contain exactly one created item');

  const created = successEntries[0];
  invariant(isRecord(created), 'Zotero created item result must be an object');
  invariant(typeof created.key === 'string' && created.key.trim().length > 0, 'Zotero created item result must contain a key');

  return {
    key: created.key,
    data: created.data,
  };
}

export async function addBibTeXToZotero(
  bibtex: string,
  collections: string[],
): Promise<ZoteroCreateResult> {
  const item = parseBibTeXToItem(bibtex);
  const payload = buildZoteroItemPayload(item, collections);
  const response = await fetch('http://127.0.0.1:23119/api/users/0/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([payload]),
  });

  invariant(response.ok, `Local Zotero API item creation failed with HTTP ${response.status}: ${await response.text()}`);
  return parseZoteroCreateResult(await response.json());
}

export async function resolveSourceToZotero(
  plugin: ResolverPluginConfig,
  input: string,
  collections: string[],
): Promise<ZoteroCreateResult> {
  const bibtex = await runResolverPlugin(plugin, input);
  return addBibTeXToZotero(bibtex, collections);
}
