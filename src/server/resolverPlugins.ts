import { spawn } from 'node:child_process';
import type { Creator, ItemType, ZoteroItem } from '../types';

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

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
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
