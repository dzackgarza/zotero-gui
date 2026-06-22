import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const CONFIG_PATH = new URL('../zotero-gui.config.json', import.meta.url);
const METADATA_PATH = new URL('../node_modules/.vite/deps/_metadata.json', import.meta.url);

const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
assert.equal(typeof config.diagnostics?.viteDevServer, 'string', 'diagnostics.viteDevServer must be configured');
const devServer = config.diagnostics.viteDevServer;

async function assertServed(pathname) {
  const response = await fetch(new URL(pathname, devServer));
  assert.equal(response.status, 200, `${pathname} returned HTTP ${response.status}`);
}

const metadata = JSON.parse(await readFile(METADATA_PATH, 'utf8'));
const optimizedFiles = Object.values(metadata.optimized).map((entry) => `/node_modules/.vite/deps/${entry.file}`);

assert.ok(optimizedFiles.length > 0, 'Vite optimized dependency metadata is empty');

await assertServed('/');
await assertServed('/src/main.tsx');

for (const file of optimizedFiles) {
  await assertServed(file);
}

console.log(`Verified ${optimizedFiles.length} optimized Vite dependencies from ${devServer}`);
