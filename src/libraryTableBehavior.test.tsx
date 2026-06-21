import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import ErrorBoundary from './ErrorBoundary';
import { readColumnLayout } from './columnModel';
import type { ZoteroItem } from './types';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function startupResponse(): Response {
  return jsonResponse({ zotero: { running: true } });
}

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
    ...overrides,
  };
}

// Render App (with the real composed table) feeding it a startup probe followed
// by one /api/library payload. Only the network is stubbed.
function renderApp(items: ZoteroItem[]): void {
  const fetchMock = vi.fn();
  fetchMock.mockResolvedValueOnce(startupResponse());
  fetchMock.mockResolvedValueOnce(jsonResponse({ items, collections: [] }));
  vi.stubGlobal('fetch', fetchMock);
  render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
}

function visibleRowTitles(): string[] {
  return Array.from(document.querySelectorAll('tbody tr td:first-child span[title]'))
    .map(node => node.getAttribute('title') ?? '');
}

function visibleHeaderLabels(): string[] {
  return Array.from(document.querySelectorAll('thead th')).map(th => (th.textContent ?? '').trim());
}

function headerCell(label: string): HTMLElement {
  const header = Array.from(document.querySelectorAll('thead th')).find(
    th => (th.textContent ?? '').trim() === label,
  );
  if (header === undefined) {
    throw new Error(`Header not found: ${label}`);
  }
  return header as HTMLElement;
}

describe('library table sorting (composed table)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    cleanup();
  });

  it('cycles a column header asc -> desc -> none and orders rows by sortableValue', async () => {
    renderApp([
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
    renderApp([
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    cleanup();
  });

  it('keeps the title column visible and offers no control to hide it', async () => {
    renderApp([bookItem('only', 'Locked Title Item')]);
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    cleanup();
  });

  it('moves a column right via the down control, changing the visible header order', async () => {
    renderApp([bookItem('only', 'Reorder Witness')]);
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
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
    cleanup();
  });

  it('restores visibility, order, and width from localStorage across a remount', async () => {
    renderApp([bookItem('only', 'Persistent Item')]);
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
    renderApp([bookItem('only', 'Persistent Item')]);
    await screen.findByText('Persistent Item');

    // Visibility restored: DOI still shown. Order restored: Type before Creators.
    const headerOrderAfter = visibleHeaderLabels();
    expect(headerOrderAfter).toContain('DOI');
    expect(headerOrderAfter.indexOf('Type')).toBeLessThan(headerOrderAfter.indexOf('Creators'));

    // Width restored: the rebuilt Publication header carries the persisted width.
    expect(headerCell('Publication').style.width).toBe(`${persistedWidth}px`);
  });
});
