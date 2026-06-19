import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Command, ZoteroItem } from '../types';
import CommandPalette from './CommandPalette';

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
  it('keeps the Ctrl+P opening DOM bounded instead of mounting every database item', () => {
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

    expect(document.querySelectorAll('[cmdk-item]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[cmdk-item]').length).toBeLessThanOrEqual(25);
  });

  it('finds a matching database item outside the opening virtual window', async () => {
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

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Palette Item 99' } });

    expect(await screen.findByText('Palette Item 99')).toBeInTheDocument();
    expect(document.querySelectorAll('[cmdk-item]').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('[cmdk-item]').length).toBeLessThanOrEqual(25);
  });

  it('opens Ctrl+Shift+P against commands without mounting database items', () => {
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
    expect(screen.queryByText('Palette Item 0')).not.toBeInTheDocument();
    expect(document.querySelectorAll('[cmdk-item]').length).toBe(1);
  });
});
