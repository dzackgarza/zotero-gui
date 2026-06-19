import type { Command } from './types';
import type { AppTheme } from './useThemePreference';

export interface AppCommandDeps {
  reloadFromDb: () => void;
  setTheme: (theme: AppTheme) => void;
  exportDatabaseJson: () => void;
  copyCitationFormatted: () => void;
  showAllColumns: () => void;
  resetColumns: () => void;
}

export function createAppCommands({
  reloadFromDb,
  setTheme,
  exportDatabaseJson,
  copyCitationFormatted,
  showAllColumns,
  resetColumns,
}: AppCommandDeps): Command[] {
  return [
    {
      id: 'reload-db',
      name: 'Reload Library from Zotero DB',
      action: reloadFromDb,
      category: 'Database',
    },
    {
      id: 'theme-dark',
      name: 'Activate VSCode Slate Dark Mode',
      action: () => setTheme('code-dark'),
      category: 'System',
    },
    {
      id: 'theme-light',
      name: 'Activate VSCode Classic Light Mode',
      action: () => setTheme('code-light'),
      category: 'System',
    },
    {
      id: 'theme-monokai',
      name: 'Activate Monokai Terminal Mode',
      action: () => setTheme('monokai'),
      category: 'System',
    },
    {
      id: 'export-json',
      name: 'Export Stored Database Backup (JSON)',
      shortcut: 'Ctrl+Shift+E',
      action: exportDatabaseJson,
      category: 'Database',
    },
    {
      id: 'citation-apa',
      name: 'Copy Selected APA Citation',
      action: copyCitationFormatted,
      category: 'Database',
    },
    {
      id: 'cols-show-all',
      name: 'Select All Optional Columns',
      action: showAllColumns,
      category: 'Columns',
    },
    {
      id: 'cols-reset',
      name: 'Reset Columns to Default System Layout',
      action: resetColumns,
      category: 'Columns',
    },
  ];
}
