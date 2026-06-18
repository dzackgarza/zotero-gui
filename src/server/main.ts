import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { loadAppConfig } from './config.js';
import { loadResolverPlugins } from './resolverPlugins.js';
import { createApp, queryLibrary } from './server.js';

const CONFIG_PATH = path.resolve(process.cwd(), 'zotero-gui.config.json');

const config = loadAppConfig(CONFIG_PATH);
const db = new DatabaseSync(config.zotero.databaseUri);
const resolverPlugins = loadResolverPlugins(config.resolverManifestPath);
const app = createApp({
  loadLibrary: () => queryLibrary(db),
  resolverPlugins,
  resolverExecution: config.resolverExecution,
  importEndpoint: config.zotero.importEndpoint,
  fetchImpl: fetch,
});

app.listen(config.server.port, () => {
  console.log(`Zotero API server -> http://localhost:${config.server.port}`);
});
