import { useEffect, useState } from 'react';
import { z } from 'zod';

export const APP_THEMES = ['code-dark', 'code-light', 'monokai'] as const;
export type AppTheme = typeof APP_THEMES[number];

const THEME_STORAGE_KEY = 'zotero_theme';
const DEFAULT_APP_THEME: AppTheme = 'code-dark';
const AppThemeSchema = z.enum(APP_THEMES);

export const THEME_CLASSES: Record<AppTheme, {
  app: string;
  subpanel: string;
  table: string;
  workspace: string;
}> = {
  'code-dark': {
    app: 'bg-[#1e1e1e] text-[#cccccc] border-[#2b2b2b] scheme-dark',
    subpanel: 'bg-[#252526] border-r border-[#2b2b2b]',
    table: 'bg-[#1e1e1e] text-[#cccccc] divide-[#2b2b2b]',
    workspace: 'bg-[#1e1e1e]',
  },
  'code-light': {
    app: 'bg-slate-50 text-slate-900 border-zinc-200 scheme-light',
    subpanel: 'bg-zinc-100 border-r border-zinc-200',
    table: 'bg-white text-slate-800 divide-zinc-200',
    workspace: 'bg-slate-950/40',
  },
  monokai: {
    app: 'bg-zinc-950 text-amber-100 border-neutral-800 font-mono',
    subpanel: 'bg-stone-900 border-r border-stone-800',
    table: 'bg-zinc-900 text-stone-250 divide-stone-800',
    workspace: 'bg-slate-950/40',
  },
};

function readStoredTheme(): AppTheme {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === null) {
    return DEFAULT_APP_THEME;
  }
  return AppThemeSchema.parse(storedTheme);
}

export function useThemePreference(): [AppTheme, (theme: AppTheme) => void] {
  const [theme, setTheme] = useState<AppTheme>(readStoredTheme);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}
