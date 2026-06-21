import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Command, ZoteroItem } from '../types';
import CommandPalette, { PALETTE_RESULT_LIMIT } from './CommandPalette';

// The user-visible item rows render their title text "Palette Item <n>"; this
// matcher counts what the user actually sees, not third-party cmdk DOM nodes.
const PALETTE_ITEM_ROW = /Palette Item \d+/;

const command: Command = {
  id: 'reload-db',
  name: 'Reload Library from Zotero DB',
  action: () => undefined,
  category: 'Database',
};

function databaseItem(index: number): ZoteroItem {
  return {
    id: `ITEM${index}`,
    itemType: 'journalArticle',
    title: `Palette Item ${index}`,
    creators: [{ firstName: 'James', lastName: `Author${index}`, creatorType: 'author' }],
    tags: [],
    notes: [],
    attachments: [],
    collections: [],
    dateAdded: '2026-06-18T00:00:00Z',
    dateModified: '2026-06-18T00:00:00Z',
  };
}

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
});

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  configurable: true,
  value: () => undefined,
});

describe('CommandPalette command-mode opening', () => {
  it('bounds the visible item rows on open by the owned palette result limit', () => {
    const items = Array.from({ length: 100 }, (_, index) => databaseItem(index));

    render(
      <CommandPalette
        isOpen
        items={items}
        commands={[command]}
        onClose={() => undefined}
        onSelectItem={() => undefined}
      />,
    );

    // The user must see at least one result but never more than the owned
    // PALETTE_RESULT_LIMIT, even though 100 items were supplied. A palette that
    // mounts every item on open exceeds the bound and fails here.
    const visibleRows = screen.getAllByText(PALETTE_ITEM_ROW);
    expect(visibleRows.length).toBeGreaterThan(0);
    expect(visibleRows.length).toBeLessThanOrEqual(PALETTE_RESULT_LIMIT);
  });

  it('finds a matching database item outside the opening bounded result set', async () => {
    const items = Array.from({ length: 100 }, (_, index) => databaseItem(index));

    render(
      <CommandPalette
        isOpen
        items={items}
        commands={[command]}
        onClose={() => undefined}
        onSelectItem={() => undefined}
      />,
    );

    // Item 99 is outside the opening bounded slice; typing its title must still
    // surface it as a visible result, proving search ranks the full set rather
    // than only the opening window.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Palette Item 99' } });

    expect(await screen.findByText('Palette Item 99')).toBeInTheDocument();
    expect(screen.getAllByText(PALETTE_ITEM_ROW).length).toBeLessThanOrEqual(PALETTE_RESULT_LIMIT);
  });

  it('opens command mode showing the command and zero item rows', () => {
    const items = Array.from({ length: 100 }, (_, index) => databaseItem(index));

    render(
      <CommandPalette
        isOpen
        initialInput=">"
        items={items}
        commands={[command]}
        onClose={() => undefined}
        onSelectItem={() => undefined}
      />,
    );

    expect(screen.getByText('Reload Library from Zotero DB')).toBeInTheDocument();
    // Command mode renders commands only — no database item rows are visible.
    expect(screen.queryAllByText(PALETTE_ITEM_ROW)).toHaveLength(0);
  });
});
