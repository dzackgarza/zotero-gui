import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KEYBOARD_SHORTCUTS, type KeyboardShortcut } from '../keyboardShortcuts';
import type { Command, ZoteroItem } from '../types';
import CommandPaletteHost from './CommandPaletteHost';

const command: Command = {
  id: 'reload-db',
  name: 'Reload Library from Zotero DB',
  action: () => undefined,
  category: 'Database',
};

const item: ZoteroItem = {
  id: 'ITEM0',
  itemType: 'journalArticle',
  title: 'Palette Item 0',
  creators: [{ firstName: 'James', lastName: 'Author0', creatorType: 'author' }],
  tags: [],
  notes: [],
  attachments: [],
  collections: [],
  dateAdded: '2026-06-18T00:00:00Z',
  dateModified: '2026-06-18T00:00:00Z',
  inTrash: false,
};

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

function keyDownConfiguredShortcut(shortcut: KeyboardShortcut): void {
  const modifiers = new Set(shortcut.modifiers);
  fireEvent.keyDown(window, {
    key: shortcut.key,
    ctrlKey: modifiers.has('ctrl'),
    shiftKey: modifiers.has('shift'),
    altKey: modifiers.has('alt'),
    metaKey: modifiers.has('meta'),
  });
}

describe('CommandPaletteHost keyboard shortcuts', () => {
  it('does not index database items while the palette is closed', async () => {
    let titleReads = 0;
    const indexedItem: ZoteroItem = {
      ...item,
      get title() {
        titleReads += 1;
        return 'Indexed Palette Item';
      },
    };

    render(
      <CommandPaletteHost
        items={[indexedItem]}
        commands={[command]}
        onSelectItem={() => undefined}
      />,
    );

    expect(titleReads).toBe(0);

    keyDownConfiguredShortcut(KEYBOARD_SHORTCUTS.openItemPalette);

    expect(await screen.findByText('Indexed Palette Item')).toBeInTheDocument();
    expect(titleReads).toBeGreaterThan(0);
  });

  it('opens item search with the configured item palette command', async () => {
    render(
      <CommandPaletteHost
        items={[item]}
        commands={[command]}
        onSelectItem={() => undefined}
      />,
    );

    keyDownConfiguredShortcut(KEYBOARD_SHORTCUTS.openItemPalette);

    expect(await screen.findByText('Palette Item 0')).toBeInTheDocument();
  });

  it('opens command search with the configured command palette command', async () => {
    render(
      <CommandPaletteHost
        items={[item]}
        commands={[command]}
        onSelectItem={() => undefined}
      />,
    );

    keyDownConfiguredShortcut(KEYBOARD_SHORTCUTS.openCommandPalette);

    expect(await screen.findByText('Reload Library from Zotero DB')).toBeInTheDocument();
    expect(screen.queryByText('Palette Item 0')).not.toBeInTheDocument();
  });
});
