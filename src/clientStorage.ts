export const CLIENT_STORAGE_SCHEMA_VERSION = 1;

export function clientStorageKey(name: string): string {
  return `zotero-gui:${name}:v${CLIENT_STORAGE_SCHEMA_VERSION}`;
}
