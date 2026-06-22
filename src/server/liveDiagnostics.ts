import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { CONFIG_PATH, loadAppConfig, type AppConfig } from './config.js';
import {
  importBibTeXToZotero,
  loadResolverPlugins,
  runResolverPlugin,
  type ResolverPluginConfig,
} from './resolverPlugins.js';
import { loadValidatedLibrary, queryLibrary } from './zoteroRepository.js';

type DiagnosticCommand = 'doctor' | 'resolvers' | 'add-item';

function diagnosticCommand(): DiagnosticCommand {
  const command = process.argv[2];
  if (command === 'doctor') return command;
  if (command === 'resolvers') return command;
  if (command === 'add-item') return command;
  throw new Error('Usage: tsx src/server/liveDiagnostics.ts doctor|resolvers|add-item');
}

async function requireWritePluginVersion(config: AppConfig): Promise<void> {
  const versionUrl = new URL('/version', config.zotero.importEndpoint);
  const response = await fetch(versionUrl);
  if (!response.ok) {
    throw new Error(`Zotero write plugin version check failed with HTTP ${response.status}`);
  }
  console.log(`Zotero write plugin version: ${await response.text()}`);
}

function assertConfiguredDatabase(config: AppConfig): void {
  const db = new DatabaseSync(config.zotero.databaseUri);
  try {
    const library = loadValidatedLibrary(db);
    console.log(`Zotero DB contract ok: ${library.items.length} items, ${library.collections.length} collections`);
  } finally {
    db.close();
  }
}

async function runDoctor(config: AppConfig): Promise<ResolverPluginConfig[]> {
  assertConfiguredDatabase(config);
  const resolverPlugins = loadResolverPlugins(config.resolverManifestPath);
  console.log(`Resolver manifest ok: ${resolverPlugins.length} plugins`);
  await requireWritePluginVersion(config);
  return resolverPlugins;
}

async function runResolverDiagnostics(config: AppConfig): Promise<void> {
  const resolverPlugins = await runDoctor(config);
  for (const plugin of resolverPlugins) {
    const example = plugin.acceptedInputs[0]?.example;
    if (example === undefined) {
      throw new Error(`Resolver ${plugin.id} has no accepted input example`);
    }
    const bibtex = await runResolverPlugin(plugin, example, config.resolverExecution);
    console.log(`Resolver ${plugin.id} produced ${Buffer.byteLength(bibtex, 'utf8')} BibTeX bytes`);
  }
}

function reloadItem(config: AppConfig, key: string) {
  const db = new DatabaseSync(config.zotero.databaseUri);
  try {
    return queryLibrary(db).items.find(item => item.id === key);
  } finally {
    db.close();
  }
}

async function runAddItemDiagnostic(config: AppConfig): Promise<void> {
  await runDoctor(config);
  const title = `Zotero GUI Live Diagnostic ${new Date().toISOString()}`;
  const bibtex = `@article{zotero_gui_live_diagnostic,
  title = {${title}},
  author = {Zotero GUI Diagnostic},
  journal = {Local Write Boundary Diagnostics},
  year = {2026}
}`;

  const result = await importBibTeXToZotero(bibtex, [], config.zotero.importEndpoint, fetch);
  // ZoteroImportResultSchema guarantees a non-empty item_key (z.string().min(1)),
  // validated inside importBibTeXToZotero before this point, so the created key is
  // read directly from that guaranteed field. No item_keys[0] fallback: it was
  // unreachable dead defense behind the schema guarantee.
  const key = result.item_key;
  await delay(1500);
  const item = reloadItem(config, key);
  if (item === undefined) {
    throw new Error(`Created item ${key} was not visible after Zotero settled`);
  }
  if (item.title !== title) {
    throw new Error(`Created item ${key} had unexpected title: ${item.title}`);
  }
  console.log(`Live add-item visible in Zotero DB: ${key}`);
}

async function main(): Promise<void> {
  const config = loadAppConfig(CONFIG_PATH);
  const command = diagnosticCommand();
  if (command === 'doctor') {
    await runDoctor(config);
    return;
  }
  if (command === 'resolvers') {
    await runResolverDiagnostics(config);
    return;
  }
  await runAddItemDiagnostic(config);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
