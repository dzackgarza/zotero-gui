import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Terminal, Search, BookOpen, Settings, Eye, RefreshCw, Trash2, ShieldAlert, Key } from 'lucide-react';
import { ZoteroItem, Command } from '../types';
import { formatCreatorsCompact } from '../utils/fuzzy';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: ZoteroItem[];
  onSelectItem: (id: string) => void;
  commands: Command[];
}

export default function CommandPalette({
  isOpen,
  onClose,
  items,
  onSelectItem,
  commands
}: CommandPaletteProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInput('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  // Keyboard navigation inside palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      e.preventDefault();
    } else if (e.key === 'ArrowDown') {
      setSelectedIndex(prev => Math.min(prev + 1, filteredList.length - 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setSelectedIndex(prev => Math.max(prev - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (filteredList[selectedIndex]) {
        handleExecute(filteredList[selectedIndex]);
      }
      e.preventDefault();
    }
  };

  const isCommandMode = input.startsWith('>');
  const searchString = isCommandMode ? input.slice(1).trim() : input.trim();

  // Filter lists based on type of entry
  const getFilteredList = () => {
    if (isCommandMode) {
      const q = searchString.toLowerCase();
      return commands
        .filter(c => c.name.toLowerCase().includes(q) || (c.category && c.category.toLowerCase().includes(q)))
        .map(c => ({ type: 'command' as const, data: c, key: `cmd-${c.id}` }));
    } else {
      if (!searchString) {
        // Show recent / first 6 items
        return items
          .filter(item => !item.inTrash)
          .slice(0, 6)
          .map(item => ({ type: 'item' as const, data: item, key: `item-${item.id}` }));
      }
      const q = searchString.toLowerCase();
      return items
        .filter(item => !item.inTrash)
        .filter(item => {
          const authString = item.creators.map(c => `${c.firstName} ${c.lastName}`).join(' ');
          return (
            item.title.toLowerCase().includes(q) ||
            authString.toLowerCase().includes(q) ||
            (item.citekey && item.citekey.toLowerCase().includes(q)) ||
            (item.publicationTitle && item.publicationTitle.toLowerCase().includes(q))
          );
        })
        .slice(0, 8)
        .map(item => ({ type: 'item' as const, data: item, key: `item-${item.id}` }));
    }
  };

  const filteredList = getFilteredList();

  const handleExecute = (entry: { type: 'command'; data: Command } | { type: 'item'; data: ZoteroItem }) => {
    if (entry.type === 'command') {
      entry.data.action();
    } else {
      onSelectItem(entry.data.id);
    }
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-xs pt-16 font-sans">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            ref={containerRef}
            className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 text-slate-100 shadow-2xl shadow-black/80"
          >
            {/* Input field */}
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-3">
              {isCommandMode ? (
                <Terminal className="h-5 w-5 text-emerald-400" />
              ) : (
                <Search className="h-5 w-5 text-slate-400" />
              )}
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => {
                  setInput(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search database items or type '>' for commands..."
                className="w-full bg-transparent text-sm text-slate-100 outline-hidden placeholder:text-slate-500"
              />
            </div>

            {/* Results */}
            <div className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {filteredList.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  No matching {isCommandMode ? 'commands' : 'documents'} found.
                </div>
              ) : (
                filteredList.map((entry, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <div
                      key={entry.key}
                      onClick={() => handleExecute(entry as any)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`flex items-center justify-between gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-600 text-white'
                          : 'hover:bg-slate-800/80 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {entry.type === 'command' ? (
                          <div className="shrink-0 flex items-center justify-center">
                            {entry.data.category === 'Columns' && <Eye className="h-4 w-4" />}
                            {entry.data.category === 'Database' && <RefreshCw className="h-4 w-4" />}
                            {entry.data.category === 'System' && <Settings className="h-4 w-4" />}
                            {entry.data.category !== 'Columns' && entry.data.category !== 'Database' && entry.data.category !== 'System' && (
                              <Terminal className="h-4 w-4" />
                            )}
                          </div>
                        ) : (
                          <BookOpen className="h-4 w-4 text-sky-400 shrink-0" />
                        )}

                        <div className="truncate text-xs">
                          {entry.type === 'command' ? (
                            <span className="font-mono">
                              {entry.data.category ? `${entry.data.category}: ` : ''}
                              <strong className={`${isSelected ? 'text-white' : 'text-slate-100'}`}>
                                {entry.data.name}
                              </strong>
                            </span>
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-100 truncate max-w-sm">
                                {entry.data.title}
                              </span>
                              <span className={`text-[10px] ${isSelected ? 'text-blue-105' : 'text-slate-550'} mt-0.5`}>
                                {formatCreatorsCompact(entry.data.creators)} • {entry.data.date || 'No Date'} • {entry.data.citekey}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {entry.type === 'command' && entry.data.shortcut && (
                        <div className={`rounded-sm font-mono text-[9px] px-1.5 py-0.5 border ${
                          isSelected
                            ? 'bg-blue-700 border-blue-500 text-white'
                            : 'bg-slate-950 border-slate-800 text-slate-400'
                        }`}>
                          {entry.data.shortcut}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Hint footer */}
            <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950 px-3 py-1.5 font-mono text-[10px] text-slate-500">
              <div className="flex items-center gap-1.5">
                <span>Navigate:</span>
                <span className="rounded bg-slate-800 px-1 py-0.2 border border-slate-700 text-slate-400">↑↓</span>
                <span>Select:</span>
                <span className="rounded bg-slate-800 px-1 py-0.2 border border-slate-700 text-slate-400">Enter</span>
              </div>
              <div>
                {isCommandMode ? (
                  <span>Type queries to search items</span>
                ) : (
                  <span>Prefix with <span className="text-emerald-400 font-bold">&gt;</span> for commands</span>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
