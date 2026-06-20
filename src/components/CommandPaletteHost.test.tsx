import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

describe('CommandPaletteHost keyboard shortcuts', () => {
  it('opens item search with Alt+P', async () => {
    render(
      <CommandPaletteHost
        items={[item]}
        commands={[command]}
        onSelectItem={() => undefined}
      />,
    );

    fireEvent.keyDown(window, { key: 'p', altKey: true });

    expect(await screen.findByText('Palette Item 0')).toBeInTheDocument();
  });

  it('opens command search with Alt+Shift+P', async () => {
    render(
      <CommandPaletteHost
        items={[item]}
        commands={[command]}
        onSelectItem={() => undefined}
      />,
    );

    fireEvent.keyDown(window, { key: 'p', altKey: true, shiftKey: true });

    expect(await screen.findByText('Reload Library from Zotero DB')).toBeInTheDocument();
    expect(screen.queryByText('Palette Item 0')).not.toBeInTheDocument();
  });
});
