import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Terminal, Search, BookOpen, Settings, Eye, RefreshCw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { ZoteroItem, Command } from '../types';
import { formatCreatorsCompact } from '../utils/fuzzy';
import { Command as CmdK } from 'cmdk';
import Fuse from 'fuse.js';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  initialInput?: string;
  items: ZoteroItem[];
  onSelectItem: (id: string) => void;
  commands: Command[];
}

export default function CommandPalette({
  isOpen,
  onClose,
  initialInput,
  items,
  onSelectItem,
  commands
}: CommandPaletteProps) {
  const [input, setInput] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setInput(initialInput || '');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialInput]);

  // Index items for fuzzy searching synchronously with useMemo
  const fuse = useMemo(() => {
    return new Fuse(items.filter(item => !item.inTrash), {
      keys: [
        { name: 'title', weight: 0.5 },
        { name: 'creators.lastName', weight: 0.3 },
        { name: 'creators.firstName', weight: 0.1 },
        { name: 'citekey', weight: 0.3 },
        { name: 'publicationTitle', weight: 0.2 }
      ],
      threshold: 0.4
    });
  }, [items]);

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

  // Filter lists based on type of entry synchronously with useMemo
  const filteredList = useMemo(() => {
    if (isCommandMode) {
      const q = searchString.toLowerCase();
      return commands
        .filter(c => c.name.toLowerCase().includes(q) || (c.category && c.category.toLowerCase().includes(q)))
        .map(c => ({ type: 'command' as const, data: c, key: `cmd-${c.id}` }));
    } else {
      if (!searchString) {
        return items
          .filter(item => !item.inTrash)
          .map(item => ({ type: 'item' as const, data: item, key: `item-${item.id}` }));
      }
      const results = fuse.search(searchString);
      return results.map(r => ({ type: 'item' as const, data: r.item, key: `item-${r.item.id}` }));
    }
  }, [isCommandMode, searchString, commands, items, fuse]);

  const handleExecute = (entry: { type: 'command'; data: Command } | { type: 'item'; data: ZoteroItem }) => {
    if (entry.type === 'command') {
      entry.data.action();
    } else {
      onSelectItem(entry.data.id);
    }
    onClose();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" />
        <Dialog.Content className="fixed inset-x-0 top-[10%] z-50 flex justify-center pointer-events-none outline-hidden">
          <CmdK
            label="Command Palette"
            shouldFilter={false}
            filter={() => 1}
            className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 text-slate-100 shadow-2xl shadow-black/80 pointer-events-auto outline-hidden"
          >
            {/* Input field */}
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-3">
              {isCommandMode ? (
                <Terminal className="h-5 w-5 text-emerald-400" />
              ) : (
                <Search className="h-5 w-5 text-slate-400" />
              )}
              <CmdK.Input
                ref={inputRef}
                value={input}
                onValueChange={(v) => {
                  setInput(v);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Search database items or type '>' for commands..."
                className="w-full bg-transparent text-sm text-slate-100 outline-hidden placeholder:text-slate-550 border-0 focus:ring-0 p-0"
              />
            </div>

            {/* Results */}
            <CmdK.List className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              {filteredList.length === 0 ? (
                <CmdK.Empty className="py-8 text-center text-xs text-slate-550">
                  No matching {isCommandMode ? 'commands' : 'documents'} found.
                </CmdK.Empty>
              ) : (
                filteredList.map((entry, index) => {
                  const isSelected = index === selectedIndex;
                  return (
                    <CmdK.Item
                      key={entry.key}
                      value={entry.key}
                      onSelect={() => handleExecute(entry)}
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
                              <span className={`text-[10px] ${isSelected ? 'text-blue-100' : 'text-slate-550'} mt-0.5`}>
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
                    </CmdK.Item>
                  );
                })
              )}
            </CmdK.List>

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
          </CmdK>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
