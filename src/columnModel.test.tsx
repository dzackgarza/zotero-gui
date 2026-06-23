// This suite exercises the localStorage-backed column persistence layer, so it
// is a .tsx file to run under the jsdom test project (DOM storage API).
import { afterEach, describe, expect, it } from 'vitest';
import {
  COLUMN_LAYOUT_PERSIST_VERSION,
  COLUMN_STORAGE_KEY,
  cellValue,
  defaultColumnLayout,
  readColumnLayout,
  readColumnLayoutResult,
  writeColumnLayout,
  zoteroSortingFn,
} from './columnModel';
import { DEFAULT_COLUMNS } from './data/samples';
import type { ZoteroItem } from './types';

function storedLayout(overrides: Record<string, unknown> = {}): string {
  const base = defaultColumnLayout();
  return JSON.stringify({
    version: COLUMN_LAYOUT_PERSIST_VERSION,
    columnVisibility: base.columnVisibility,
    columnOrder: base.columnOrder,
    columnSizing: base.columnSizing,
    ...overrides,
  });
}

function item(id: string, overrides: Partial<ZoteroItem> = {}): ZoteroItem {
  return {
    id,
    itemType: 'book',
    title: id,
    creators: [],
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-01-01T00:00:00Z',
    dateModified: '2026-01-01T00:00:00Z',
    inTrash: false,
    ...overrides,
  };
}

describe('column layout persistence', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('returns defaults only when nothing is stored', () => {
    const layout = readColumnLayout();
    expect(layout.columnOrder).toEqual(DEFAULT_COLUMNS.map(column => column.key));
    expect(layout.columnVisibility.title).toBe(true);
    expect(layout.columnSizing.title).toBe(280);
  });

  it('round-trips a written layout through storage', () => {
    const layout = defaultColumnLayout();
    layout.columnVisibility.doi = true;
    // Swap the last two columns to prove order persists, not just membership.
    const order = [...layout.columnOrder];
    const lastIndex = order.length - 1;
    [order[lastIndex - 1], order[lastIndex]] = [order[lastIndex], order[lastIndex - 1]];
    layout.columnOrder = order;
    layout.columnSizing.publicationTitle = 175;

    writeColumnLayout(layout);
    const restored = readColumnLayout();

    expect(restored.columnVisibility.doi).toBe(true);
    expect(restored.columnSizing.publicationTitle).toBe(175);
    expect(restored.columnOrder).toEqual(order);
  });

  it('clamps persisted widths to the 50px floor', () => {
    const layout = defaultColumnLayout();
    layout.columnSizing.date = 12;
    writeColumnLayout(layout);

    expect(readColumnLayout().columnSizing.date).toBe(50);
  });

  it('never persists the title column as hidden', () => {
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      storedLayout({ columnVisibility: { ...defaultColumnLayout().columnVisibility, title: false } }),
    );
    expect(readColumnLayout().columnVisibility.title).toBe(true);
  });

  it('classifies an outdated schema version instead of resetting', () => {
    localStorage.setItem(COLUMN_STORAGE_KEY, storedLayout({ version: 1 }));
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'outdated_version' },
    });
  });

  it('classifies malformed JSON as invalid storage', () => {
    localStorage.setItem(COLUMN_STORAGE_KEY, '{not valid json');
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'invalid_json' },
    });
  });

  it('classifies an incomplete versioned layout shape', () => {
    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify({ version: COLUMN_LAYOUT_PERSIST_VERSION }));
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'invalid_shape' },
    });
  });

  it('classifies a layout missing a contract column', () => {
    const base = defaultColumnLayout();
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      storedLayout({ columnOrder: base.columnOrder.filter(id => id !== 'doi') }),
    );
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'contract_mismatch' },
    });
  });

  it('classifies a layout naming an unknown column in a state slice', () => {
    const base = defaultColumnLayout();
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      storedLayout({
        columnVisibility: { ...base.columnVisibility, phantomColumn: true },
      }),
    );
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'contract_mismatch' },
    });
  });

  it('migrates the historical hand-rolled array shape', () => {
    const historical = DEFAULT_COLUMNS.map(column => ({
      key: column.key,
      visible: column.key === 'doi' ? true : column.visible,
      width: column.key === 'publicationTitle' ? 175 : column.width,
    }));
    historical.sort((left, right) => {
      if (left.key === 'creators_compact') return -1;
      if (right.key === 'creators_compact') return 1;
      if (left.key === 'title') return -1;
      if (right.key === 'title') return 1;
      return 0;
    });

    localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(historical));

    const migrated = readColumnLayout();

    expect(migrated.columnOrder.slice(0, 2)).toEqual(['creators_compact', 'title']);
    expect(migrated.columnVisibility.doi).toBe(true);
    expect(migrated.columnVisibility.title).toBe(true);
    expect(migrated.columnSizing.publicationTitle).toBe(175);
  });

  it('classifies a partial historical hand-rolled array shape', () => {
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      JSON.stringify([
        { key: 'title', visible: true, width: 280 },
        { key: 'creators_compact', visible: true, width: 180 },
      ]),
    );
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'contract_mismatch' },
    });
  });

  it('classifies a malformed historical hand-rolled array shape', () => {
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      JSON.stringify([{ key: 'title', visible: 'yes', width: 280 }]),
    );
    expect(readColumnLayoutResult()).toMatchObject({
      status: 'storage_error',
      error: { kind: 'invalid_shape' },
    });
  });
});

describe('cell value projection', () => {
  it('formats compact creators, joined tags, and boolean coercion', () => {
    const richItem = item('rich', {
      creators: [
        { firstName: 'Ada', lastName: 'Lovelace', creatorType: 'author' },
        { firstName: 'Alan', lastName: 'Turing', creatorType: 'author' },
      ],
      tags: ['algebra', 'topology'],
      inTrash: true,
    });
    expect(cellValue(richItem, 'creators_compact')).toBe('Lovelace & Turing');
    expect(cellValue(richItem, 'tags')).toBe('algebra, topology');
    expect(cellValue(richItem, 'inTrash')).toBe('Yes');
    expect(cellValue(item('plain', { inTrash: false }), 'inTrash')).toBe('No');
  });
});

describe('zoteroSortingFn', () => {
  function row(it: ZoteroItem) {
    return { original: it } as Parameters<typeof zoteroSortingFn>[0];
  }

  it('compares case-insensitively, ascending, matching sortableValue', () => {
    const apple = row(item('apple', { title: 'apple' }));
    const banana = row(item('banana', { title: 'BANANA' }));
    expect(zoteroSortingFn(apple, banana, 'title')).toBe(-1);
    expect(zoteroSortingFn(banana, apple, 'title')).toBe(1);
    expect(zoteroSortingFn(apple, apple, 'title')).toBe(0);
  });
});
