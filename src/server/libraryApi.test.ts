import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from './server';

let server: Server;
let baseUrl: string;

describe('/api/library', () => {
  beforeAll(async () => {
    server = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    const address = server.address();
    if (!(address && typeof address === 'object')) {
      throw new Error('/api/library test server must bind to a TCP port');
    }
    baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it('returns the live Zotero library payload expected by the app', async () => {
    const response = await fetch(`${baseUrl}/api/library`);
    const payload = await response.json() as unknown;

    expect(response.status).toBe(200);
    expect(payload).toHaveProperty('items');
    expect(payload).toHaveProperty('collections');

    const library = payload as { items: unknown; collections: unknown };
    expect(Array.isArray(library.items)).toBe(true);
    expect(Array.isArray(library.collections)).toBe(true);
    expect(library.collections).toContainEqual({ id: 'all', name: 'My Library' });
  });
});
