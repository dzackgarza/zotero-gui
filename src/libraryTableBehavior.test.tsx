import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MouseEvent } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { readColumnLayout } from './columnModel';
import LibraryTable from './components/LibraryTable';
import type { AdvancedSearchSettings, ZoteroItem } from './types';
import { useLibraryTable } from './useLibraryTable';

const searchSettings: AdvancedSearchSettings = {
  query: '',
  matchCase: false,
  matchType: 'all',
  searchFields: {
    title: true,
    creators_compact: true,
    publicationTitle: true,
    date: true,
    citekey: true,
  },
};

function selectItemNoop(_id: string): void {}

function openAttachmentNoop(_attachmentId: string): void {}

function resetFiltersNoop(_settings: AdvancedSearchSettings): void {}

function toggleExpandNoop(_id: string, _event: MouseEvent): void {}

function bookItem(id: string, title: string, overrides: Partial<ZoteroItem> = {}): ZoteroItem {
  return {
    id,
    itemType: 'book',
    title,
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

function LibraryTableHarness({ items }: { items: ZoteroItem[] }) {
  const table = useLibraryTable(items);
  return (
    <LibraryTable
      table={table}
      theme="code-dark"
      tableClass=""
      selectedItemId={null}
      expandedItems={new Set()}
      searchSettings={searchSettings}
      onSelectItem={selectItemNoop}
      onOpenAttachment={openAttachmentNoop}
      onResetFilters={resetFiltersNoop}
      onToggleExpand={toggleExpandNoop}
    />
  );
}

function renderTable(items: ZoteroItem[]): void {
  render(
    <LibraryTableHarness items={items} />,
  );
}

function visibleRowTitles(): string[] {
  return Array.from(document.querySelectorAll('tbody tr td:first-child span[title]'))
    .map(node => {
      const title = node.getAttribute('title');
      if (title === null) return '';
      return title;
    });
}

function visibleHeaderLabels(): string[] {
  return Array.from(document.querySelectorAll('thead th')).map(th => {
    if (th.textContent === null) return '';
    return th.textContent.trim();
  });
}

function headerCell(label: string): HTMLElement {
  const header = Array.from(document.querySelectorAll('thead th')).find(
    th => {
      if (th.textContent === null) return false;
      return th.textContent.trim() === label;
    },
  );
  if (header === undefined) {
    throw new Error(`Header not found: ${label}`);
  }
  return header as HTMLElement;
}

describe('library table sorting (composed table)', () => {
  afterEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('cycles a column header asc -> desc -> none and orders rows by sortableValue', async () => {
    renderTable([
      bookItem('mid', 'Mango'),
      bookItem('first', 'Apple'),
      bookItem('last', 'Zucchini'),
    ]);

    // Initial state is title-ascending (seeded sort).
    expect(await screen.findByText('Apple')).toBeInTheDocument();
    expect(visibleRowTitles()).toEqual(['Apple', 'Mango', 'Zucchini']);

    // First click on the already-ascending Title header -> descending.
    fireEvent.click(headerCell('Title'));
    expect(visibleRowTitles()).toEqual(['Zucchini', 'Mango', 'Apple']);

    // Second click -> unsorted: rows fall back to incoming (insertion) order.
    fireEvent.click(headerCell('Title'));
    expect(visibleRowTitles()).toEqual(['Mango', 'Apple', 'Zucchini']);

    // Third click -> ascending again.
    fireEvent.click(headerCell('Title'));
    expect(visibleRowTitles()).toEqual(['Apple', 'Mango', 'Zucchini']);
  });

  it('sorts case-insensitively on a non-title column matching the canonical projection', async () => {
    renderTable([
      bookItem('a', 'Item A', { publicationTitle: 'beta journal' }),
      bookItem('b', 'Item B', { publicationTitle: 'Alpha Journal' }),
      bookItem('c', 'Item C', { publicationTitle: 'Gamma Journal' }),
    ]);

    await screen.findByText('Item A');

    // Click Publication header -> ascending, case-insensitive: alpha < beta < gamma.
    fireEvent.click(headerCell('Publication'));
    expect(visibleRowTitles()).toEqual(['Item B', 'Item A', 'Item C']);
  });
});

describe('library table title lock', () => {
  afterEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('keeps the title column visible and offers no control to hide it', async () => {
    renderTable([bookItem('only', 'Locked Title Item')]);
    await screen.findByText('Locked Title Item');

    // Open the column context menu over the header row.
    fireEvent.contextMenu(headerCell('Title'));

    // The Title visibility checkbox is rendered but disabled (cannot be hidden).
    const titleCheckbox = screen.getByRole('checkbox', { name: 'Title' }) as HTMLInputElement;
    expect(titleCheckbox.checked).toBe(true);
    expect(titleCheckbox.disabled).toBe(true);

    // "Clear (Hide)" hides every other column but must leave Title present.
    fireEvent.click(screen.getByText('Clear (Hide)'));
    expect(visibleHeaderLabels()).toEqual(['Title']);
    expect(screen.getByText('Locked Title Item')).toBeInTheDocument();
  });
});

describe('library table reorder via context menu', () => {
  afterEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('moves a column right via the down control, changing the visible header order', async () => {
    renderTable([bookItem('only', 'Reorder Witness')]);
    await screen.findByText('Reorder Witness');

    expect(visibleHeaderLabels()).toEqual(['Title', 'Creators', 'Type', 'Publication', 'Date', 'Citekey']);

    fireEvent.contextMenu(headerCell('Title'));

    // Move "Creators" down (right) one slot: it should swap with "Type".
    const moveButtons = screen.getAllByTitle('Move column right (down)');
    // Menu lists columns in order; index 1 is Creators (index 0 Title).
    fireEvent.click(moveButtons[1]);

    expect(visibleHeaderLabels()).toEqual(['Title', 'Type', 'Creators', 'Publication', 'Date', 'Citekey']);
  });
});

describe('library table persistence round-trip', () => {
  afterEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('restores visibility, order, and width from localStorage across a remount', async () => {
    renderTable([bookItem('only', 'Persistent Item')]);
    await screen.findByText('Persistent Item');

    fireEvent.contextMenu(headerCell('Title'));

    // Reveal a hidden column (DOI is hidden by default).
    fireEvent.click(screen.getByRole('checkbox', { name: 'DOI' }));
    // Move Creators right one slot.
    fireEvent.click(screen.getAllByTitle('Move column right (down)')[1]);

    // Resize the Publication column through the real resize handle. The drag
    // drives TanStack's columnSizing state, which the persistence effect writes
    // through writeColumnLayout (clamped to the 50px floor).
    const publicationResizeHandle = headerCell('Publication').querySelector('div.cursor-col-resize');
    if (publicationResizeHandle === null) {
      throw new Error('Publication resize handle not found.');
    }
    fireEvent.mouseDown(publicationResizeHandle, { clientX: 200 });
    fireEvent.mouseMove(document, { clientX: 220 });
    fireEvent.mouseUp(document);

    const headerOrderBefore = visibleHeaderLabels();
    expect(headerOrderBefore).toContain('DOI');
    expect(headerOrderBefore.indexOf('Type')).toBeLessThan(headerOrderBefore.indexOf('Creators'));

    // What the live edits persisted to storage (the contract restored on reload).
    const persisted = readColumnLayout();
    expect(persisted.columnVisibility.doi).toBe(true);
    expect(persisted.columnOrder.indexOf('itemType'))
      .toBeLessThan(persisted.columnOrder.indexOf('creators_compact'));
    const persistedWidth = persisted.columnSizing.publicationTitle;
    expect(persistedWidth).toBeGreaterThanOrEqual(50);

    // Remount from the same localStorage (new fetch sequence, same storage).
    cleanup();
    renderTable([bookItem('only', 'Persistent Item')]);
    await screen.findByText('Persistent Item');

    // Visibility restored: DOI still shown. Order restored: Type before Creators.
    const headerOrderAfter = visibleHeaderLabels();
    expect(headerOrderAfter).toContain('DOI');
    expect(headerOrderAfter.indexOf('Type')).toBeLessThan(headerOrderAfter.indexOf('Creators'));

    // Width restored: the rebuilt Publication header carries the persisted width.
    expect(headerCell('Publication').style.width).toBe(`${persistedWidth}px`);
  });
});
