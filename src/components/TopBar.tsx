import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Sliders, Eye, Plus, Info, Check, RefreshCw, Sparkles, Command
} from 'lucide-react';
import { AdvancedSearchSettings, ColumnDefinition } from '../types';

interface TopBarProps {
  searchSettings: AdvancedSearchSettings;
  onChangeSearchSettings: (settings: AdvancedSearchSettings) => void;
  onOpenAdvancedSearch: () => void;
  onOpenPalette: () => void;
  activeCollectionName: string;
  onOpenAddItem: (type: 'journalArticle' | 'book' | 'conferencePaper') => void;
  theme: string;
  setTheme: (t: string) => void;
}

export default function TopBar({
  searchSettings,
  onChangeSearchSettings,
  onOpenAdvancedSearch,
  onOpenPalette,
  activeCollectionName,
  onOpenAddItem,
  theme,
  setTheme
}: TopBarProps) {
  const isScopingApplied = Object.values(searchSettings.searchFields).some(v => !v);

  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const themeRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeRef.current && !themeRef.current.contains(event.target as Node)) {
        setIsThemeOpen(false);
      }
      if (addRef.current && !addRef.current.contains(event.target as Node)) {
        setIsAddOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="h-12 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-3 shrink-0 font-sans text-xs select-none">
      
      {/* Brand logo & path breadcrumbs */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5 font-bold text-slate-100 uppercase tracking-widest text-[11px] shrink-0 border-r border-slate-800 pr-3 mr-1">
          <span className="h-4 w-4 rounded-xs bg-red-600 flex items-center justify-center font-serif text-[10px] text-white">Z</span>
          <span>Zotero VS</span>
        </div>
        
        {/* Breadcrumb representation */}
        <div className="hidden md:flex items-center gap-1 text-[11px] text-slate-400 font-mono font-medium truncate">
          <span>My Library</span>
          <span className="text-slate-650">/</span>
          <span className="text-sky-400 truncate font-semibold">{activeCollectionName}</span>
        </div>
      </div>

      {/* Fuzzy search input and command palette buttons */}
      <div className="flex items-center gap-2 max-w-lg w-full px-2">
        <div className="relative flex-1 flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchSettings.query}
            onChange={e => onChangeSearchSettings({ ...searchSettings, query: e.target.value })}
            placeholder="Search authors, titles, DOI, tags..."
            className="w-full bg-slate-900 border border-slate-800 rounded px-2 pl-8.5 pr-20 py-1 text-slate-100 placeholder:text-slate-550 outline-hidden focus:border-sky-500 hover:border-slate-700 text-xs transition-colors"
          />

          {/* Quick buttons inside search input */}
          <div className="absolute right-1.5 flex items-center gap-1">
            <button
              onClick={onOpenAdvancedSearch}
              title="Advanced Search Scopes"
              className={`p-1 rounded transition-colors ${
                isScopingApplied
                  ? 'text-sky-400 bg-sky-500/10 hover:bg-sky-500/20'
                  : 'text-slate-500 hover:text-slate-200'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
            </button>
            <div className="text-[9px] font-mono font-semibold text-slate-550 bg-slate-950 px-1 rounded-sm border border-slate-805 select-none uppercase">
              {searchSettings.matchType}
            </div>
          </div>
        </div>
      </div>

      {/* Column settings and Theme toggler */}
      <div className="flex items-center gap-1.5">
        
        {/* Add items button dropdown quick-links */}
        <div ref={addRef} className="relative">
          <button
            onClick={() => setIsAddOpen(!isAddOpen)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-2.5 py-1 text-xs font-semibold shadow-sm transition"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Item</span>
          </button>
          
          {isAddOpen && (
            <div className="absolute right-0 top-8.5 z-40 w-40 rounded bg-slate-900 border border-slate-800 p-1 text-xs shadow-xl text-slate-200">
              <button
                onClick={() => {
                  onOpenAddItem('journalArticle');
                  setIsAddOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-slate-800 rounded-sm"
              >
                Journal Article
              </button>
              <button
                onClick={() => {
                  onOpenAddItem('book');
                  setIsAddOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-slate-800 rounded-sm"
              >
                Book
              </button>
              <button
                onClick={() => {
                  onOpenAddItem('conferencePaper');
                  setIsAddOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 hover:bg-slate-800 rounded-sm"
              >
                Conference Paper
              </button>
            </div>
          )}
        </div>

        {/* VSCode Themes Selector */}
        <div ref={themeRef} className="relative">
          <button
            onClick={() => setIsThemeOpen(!isThemeOpen)}
            className="p-1 px-1.5 bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] rounded text-slate-350 hover:text-slate-100 font-mono"
          >
            {theme === 'code-dark' ? 'VS Dark' : theme === 'code-light' ? 'VS Light' : 'Monokai'}
          </button>
          {isThemeOpen && (
            <div className="absolute right-0 top-8.5 z-40 w-32 rounded bg-slate-900 border border-slate-800 p-0.5 text-[10px] font-mono shadow-xl text-slate-300">
              {['code-dark', 'code-light', 'monokai'].map(t => (
                <button
                  key={t}
                  onClick={() => {
                    setTheme(t);
                    setIsThemeOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 hover:bg-slate-800 rounded-sm flex items-center justify-between"
                >
                  <span>{t === 'code-dark' ? 'VSCode Dark' : t === 'code-light' ? 'VSCode Light' : 'Monokai Redux'}</span>
                  {theme === t && <Check className="h-3 w-3 text-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
