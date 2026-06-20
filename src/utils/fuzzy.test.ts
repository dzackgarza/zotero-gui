import { describe, expect, it } from 'vitest';
import type { ZoteroItem } from '../types';
import { buildZoteroSearchDocuments, rankZoteroSearchDocumentsForPalette } from './fuzzy';

function item(id: string, title: string, citekey: string): ZoteroItem {
  return {
    id,
    itemType: 'book',
    title,
    citekey,
    creators: [{ firstName: 'Arthur', lastName: 'Coble', creatorType: 'author' }],
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-18T00:00:00Z',
  };
}

describe('palette fuzzy ranking', () => {
  it('uses fzf-style subsequence matching across palette fields', () => {
    const documents = buildZoteroSearchDocuments([
      item('coble', 'Algebraic Geometry and Theta Functions', 'Cob29'),
      item('topology', 'Algebraic Topology', 'Hat02'),
    ]);

    expect(rankZoteroSearchDocumentsForPalette(documents, 'agtf')[0]?.item.id).toBe('coble');
    expect(rankZoteroSearchDocumentsForPalette(documents, 'Cob29')[0]?.item.id).toBe('coble');
  });
});
