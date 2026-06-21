import React, { useState, useLayoutEffect, useRef, useMemo } from 'react';
import { Terminal, Search, BookOpen, Settings, Eye, RefreshCw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { ZoteroItem, Command } from '../types';
import {
  buildZoteroSearchDocuments,
  formatCreatorsCompact,
  rankZoteroSearchDocumentsForPalette,
  type ZoteroSearchDocument,
} from '../utils/fuzzy';
import { Command as CmdK } from 'cmdk';

export const PALETTE_RESULT_LIMIT = 25;

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
  const opensCommandMode = initialInput === '>';
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'items' | 'commands'>(opensCommandMode ? 'commands' : 'items');
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (isOpen) {
      setMode(opensCommandMode ? 'commands' : 'items');
      setQuery(opensCommandMode ? '' : (initialInput ?? ''));
      inputRef.current?.focus();
    }
  }, [isOpen, opensCommandMode, initialInput]);

  const searchableDocuments = useMemo(
    () => buildZoteroSearchDocuments(items.filter(item => !item.inTrash)),
    [items],
  );

  const rankedItemDocuments = useMemo(
    () => rankZoteroSearchDocumentsForPalette(searchableDocuments, query),
    [query, searchableDocuments],
  );

  const visibleItemDocuments = useMemo(
    () => rankedItemDocuments.slice(0, PALETTE_RESULT_LIMIT),
    [rankedItemDocuments],
  );

  const handleInputChange = (value: string) => {
    if (value.startsWith('>')) {
      setMode('commands');
      setQuery(value.slice(1));
      return;
    }
    setQuery(value);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
      event.preventDefault();
      return;
    }

    if (event.key === '>' && mode === 'items' && query.length === 0) {
      setMode('commands');
      event.preventDefault();
      return;
    }

    if (event.key === 'Backspace' && mode === 'commands' && query.length === 0) {
      setMode('items');
    }
  };

  const handleCommand = (command: Command) => {
    command.action();
    onClose();
  };

  const handleItem = (item: ZoteroItem) => {
    onSelectItem(item.id);
    onClose();
  };

  const renderCommandIcon = (command: Command) => {
    if (command.category === 'Columns') return <Eye className="h-4 w-4" />;
    if (command.category === 'Database') return <RefreshCw className="h-4 w-4" />;
    if (command.category === 'System') return <Settings className="h-4 w-4" />;
    return <Terminal className="h-4 w-4" />;
  };

  const renderCommandItem = (command: Command) => (
    <CmdK.Item
      key={command.id}
      value={command.name}
      onSelect={() => handleCommand(command)}
      className="flex items-center justify-between gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors text-slate-300 data-[selected=true]:bg-blue-600 data-[selected=true]:text-white"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="shrink-0 flex items-center justify-center">
          {renderCommandIcon(command)}
        </div>
        <span className="truncate text-xs font-mono">
          {command.category ? `${command.category}: ` : ''}
          <strong className="text-slate-100 group-data-[selected=true]:text-white">
            {command.name}
          </strong>
        </span>
      </div>

      {command.shortcut && (
        <div className="rounded-sm font-mono text-[9px] px-1.5 py-0.5 border bg-slate-950 border-slate-800 text-slate-400">
          {command.shortcut}
        </div>
      )}
    </CmdK.Item>
  );

  const renderItem = ({ item }: ZoteroSearchDocument) => (
    <CmdK.Item
      key={item.id}
      value={item.id}
      onSelect={() => handleItem(item)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 cursor-pointer transition-colors text-slate-300 data-[selected=true]:bg-blue-600 data-[selected=true]:text-white"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <BookOpen className="h-4 w-4 text-sky-400 shrink-0" />
        <div className="flex flex-col min-w-0 text-xs">
          <span className={`font-semibold truncate max-w-sm ${item.title === undefined ? 'italic text-slate-500' : 'text-slate-100'}`}>
            {item.title ?? '(no title)'}
          </span>
          <span className="text-[10px] text-slate-550 mt-0.5 truncate">
            {formatCreatorsCompact(item.creators)} | {item.date || 'No Date'} | {item.citekey}
          </span>
        </div>
      </div>
    </CmdK.Item>
  );

  return (
    <Dialog.Root modal={false} open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" />
        <Dialog.Content
          onOpenAutoFocus={(event) => event.preventDefault()}
          className="fixed inset-x-0 top-[10%] z-50 flex justify-center pointer-events-none outline-hidden"
        >
          <CmdK
            label="Command Palette"
            shouldFilter={false}
            className="w-full max-w-xl overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900 text-slate-100 shadow-2xl shadow-black/80 pointer-events-auto outline-hidden"
          >
            <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-3">
              {mode === 'commands' ? (
                <Terminal className="h-5 w-5 text-emerald-400" />
              ) : (
                <Search className="h-5 w-5 text-slate-400" />
              )}
              <CmdK.Input
                ref={inputRef}
                value={query}
                onValueChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'commands' ? 'Run command' : 'Search database items'}
                className="w-full bg-transparent text-sm text-slate-100 outline-hidden placeholder:text-slate-550 border-0 focus:ring-0 p-0"
              />
            </div>

            <CmdK.List className="max-h-72 overflow-y-auto p-1.5 scrollbar-thin scrollbar-thumb-slate-800">
              <CmdK.Empty className="py-8 text-center text-xs text-slate-550">
                No matching {mode === 'commands' ? 'commands' : 'documents'} found.
              </CmdK.Empty>

              {mode === 'commands'
                ? commands.map(renderCommandItem)
                : visibleItemDocuments.map(renderItem)}
            </CmdK.List>
          </CmdK>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
