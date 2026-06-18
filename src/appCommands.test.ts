import { describe, expect, it, vi } from 'vitest';
import { createAppCommands } from './appCommands';

describe('app command definitions', () => {
  it('exposes read-only commands and omits local mutation actions', () => {
    const commands = createAppCommands({
      reloadFromDb: vi.fn(),
      setTheme: vi.fn(),
      exportDatabaseJson: vi.fn(),
      copyCitationFormatted: vi.fn(),
      showAllColumns: vi.fn(),
      resetColumns: vi.fn(),
    });

    const commandIds = commands.map(command => command.id);

    expect(commandIds).toEqual([
      'reload-db',
      'theme-dark',
      'theme-light',
      'theme-monokai',
      'export-json',
      'citation-apa',
      'cols-show-all',
      'cols-reset',
    ]);
  });
});
