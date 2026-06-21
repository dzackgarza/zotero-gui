import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import type { LibraryPayload } from '../schemas.js';
import { CONFIG_PATH, loadAppConfig } from './config.js';
import { loadResolverPlugins } from './resolverPlugins.js';
import { createApp } from './server.js';
import { loadLibraryFromDatabaseUri } from './zoteroDatabase.js';

type Attachment = LibraryPayload['items'][number]['attachments'][number];

function resolveAttachmentFilePath(storageDir: string, attachment: Attachment): string {
  if (!attachment.path) {
    throw new Error(`Attachment ${attachment.id} has no local file path`);
  }

  if (attachment.path.startsWith('storage:')) {
    const storageFilename = attachment.path.slice('storage:'.length);
    return path.join(storageDir, attachment.id, storageFilename);
  }

  if (path.isAbsolute(attachment.path)) {
    return attachment.path;
  }

  throw new Error(`Attachment ${attachment.id} has unsupported Zotero path ${attachment.path}`);
}

async function openAttachmentFile(storageDir: string, attachment: Attachment): Promise<void> {
  const filePath = resolveAttachmentFilePath(storageDir, attachment);
  await access(filePath);
  await new Promise<void>((resolve, reject) => {
    execFile('xdg-open', [filePath], (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

const config = loadAppConfig(CONFIG_PATH);
loadLibraryFromDatabaseUri(config.zotero.databaseUri);
const resolverPlugins = loadResolverPlugins(config.resolverManifestPath);
const app = createApp({
  loadLibrary: () => loadLibraryFromDatabaseUri(config.zotero.databaseUri),
  resolverPlugins,
  resolverExecution: config.resolverExecution,
  importEndpoint: config.zotero.importEndpoint,
  fetchImpl: fetch,
  openAttachmentFile: attachment => openAttachmentFile(config.zotero.storageDir, attachment),
});

app.listen(config.server.port, () => {
  console.log(`Zotero API server -> http://localhost:${config.server.port}`);
});
