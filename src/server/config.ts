import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { KeyboardShortcutsConfigSchema } from '../keyboardShortcutsSchema.js';

export const AppConfigSchema = z.strictObject({
  server: z.strictObject({
    port: z.number().int().positive(),
  }),
  zotero: z.strictObject({
    databaseUri: z.string().min(1),
    storageDir: z.string().min(1),
    importEndpoint: z.string().url(),
  }),
  resolverManifestPath: z.string().min(1),
  resolverExecution: z.strictObject({
    cwd: z.string().min(1),
    timeoutMs: z.number().int().positive(),
    stdoutByteLimit: z.number().int().positive(),
    stderrByteLimit: z.number().int().positive(),
  }),
  keyboardShortcuts: KeyboardShortcutsConfigSchema,
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadAppConfig(configPath: string): AppConfig {
  return AppConfigSchema.parse(JSON.parse(readFileSync(configPath, 'utf8')));
}
