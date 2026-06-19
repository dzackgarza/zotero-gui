import React from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileText,
  Mic,
  NotebookText,
  Paperclip,
  StickyNote,
  Eye,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { formatCreatorsCompact } from '../utils/fuzzy';
import type { AdvancedSearchSettings, ColumnDefinition, ZoteroItem } from '../types';
import type { SortKey } from '../librarySelectors';
import type { AppTheme } from '../useThemePreference';

interface LibraryTableProps {
  columns: ColumnDefinition[];
  items: ZoteroItem[];
  theme: AppTheme;
  tableClass: string;
  selectedItemId: string | null;
  expandedItems: Set<string>;
  sortKey: SortKey;
  sortDesc: boolean;
  draggedColKey: string | null;
  resizingCol: string | null;
  searchSettings: AdvancedSearchSettings;
  onSelectItem: (id: string) => void;
  onOpenAttachment: (attachmentId: string) => void;
  onResetFilters: (settings: AdvancedSearchSettings) => void;
  onToggleExpand: (id: string, event: React.MouseEvent) => void;
  onColumnDragStart: (event: React.DragEvent, columnKey: ColumnDefinition['key']) => void;
  onColumnDragOver: (event: React.DragEvent, columnKey: ColumnDefinition['key']) => void;
  onColumnDrop: (event: React.DragEvent, columnKey: ColumnDefinition['key']) => void;
  onHeaderSort: (key: SortKey) => void;
  onResizeStart: (event: React.MouseEvent, columnKey: ColumnDefinition['key'], currentWidth: number) => void;
  onToggleColumn: (key: ColumnDefinition['key']) => void;
  onSetAllColumns: (visible: boolean) => void;
  onResetColumns: () => void;
  onMoveColumn: (index: number, direction: 'up' | 'down') => void;
}

export default function LibraryTable({
  columns,
  items,
  theme,
  tableClass,
  selectedItemId,
  expandedItems,
  sortKey,
  sortDesc,
  draggedColKey,
  resizingCol,
  searchSettings,
  onSelectItem,
  onOpenAttachment,
  onResetFilters,
  onToggleExpand,
  onColumnDragStart,
  onColumnDragOver,
  onColumnDrop,
  onHeaderSort,
  onResizeStart,
  onToggleColumn,
  onSetAllColumns,
  onResetColumns,
  onMoveColumn,
}: LibraryTableProps) {
  const visibleColumns = columns.filter(column => column.visible);

  return (
    <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-800">
      <ContextMenu.Root>
        <table className={`w-full text-left border-collapse text-xs select-none ${tableClass}`}>
          <ContextMenu.Trigger asChild>
            <thead
              className={`sticky top-0 z-10 shadow-xs border-b ${theme === 'code-dark' ? 'bg-[#252526] text-[#808080] border-[#2b2b2b]' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
            >
              <tr>
                {visibleColumns.map(column => {
                  const isSorting = sortKey === column.key;
                  return (
                    <th
                      key={column.key}
                      draggable={true}
                      onDragStart={event => onColumnDragStart(event, column.key)}
                      onDragOver={event => onColumnDragOver(event, column.key)}
                      onDrop={event => onColumnDrop(event, column.key)}
                      onClick={() => onHeaderSort(column.key)}
                      className={`relative px-3.5 py-2.5 cursor-grab active:cursor-grabbing font-medium border-r whitespace-nowrap ${
                        theme === 'code-dark'
                          ? 'border-[#2b2b2b] hover:bg-[#323233] text-[#808080]'
                          : theme === 'monokai'
                            ? 'border-[#3e3d32] hover:bg-[#3e3d32] text-[#f8f8f2]'
                            : 'border-slate-850/30 hover:bg-slate-200 text-slate-700 font-mono text-[10px] uppercase tracking-wider'
                      } ${draggedColKey === column.key ? 'opacity-40' : ''}`}
                      style={{
                        width: column.width ? `${column.width}px` : 'auto',
                        minWidth: column.width ? `${column.width}px` : 'auto',
                        maxWidth: column.width ? `${column.width}px` : 'none',
                      }}
                    >
                      <div className="flex items-center gap-1.5 justify-between pr-2">
                        <span className="truncate">{column.label}</span>
                        {isSorting && (
                          <span>{sortDesc ? <ChevronDown className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />}</span>
                        )}
                      </div>
                      <div
                        onMouseDown={event => {
                          event.stopPropagation();
                          onResizeStart(event, column.key, column.width || 150);
                        }}
                        className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize ${resizingCol === column.key ? 'bg-sky-500' : 'hover:bg-sky-500/50'}`}
                        style={{ touchAction: 'none' }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
          </ContextMenu.Trigger>

          <tbody className={`divide-y ${theme === 'code-dark' ? 'divide-[#2b2b2b]' : ''}`}>
            {items.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length} className="py-20 text-center text-slate-500 font-sans">
                  <Layers className="h-10 w-10 text-slate-800 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-400">Library is empty or filter returned zero matches.</p>
                  <button
                    onClick={() => onResetFilters({ ...searchSettings, query: '' })}
                    className="mt-3 px-3 py-1 bg-sky-600/20 text-sky-400 border border-sky-500/20 rounded hover:bg-sky-500/10 text-[10px] font-mono"
                  >
                    Reset Active Filters
                  </button>
                </td>
              </tr>
            ) : (
              items.map(item => {
                const isSelected = selectedItemId === item.id;
                const hasChildren = item.attachments.length > 0 || item.notes.length > 0;
                const isExpanded = expandedItems.has(item.id);

                return (
                  <React.Fragment key={item.id}>
                    <tr
                      onClick={() => onSelectItem(item.id)}
                      className={`cursor-default transition-colors border-b ${
                        theme === 'code-dark'
                          ? isSelected
                            ? 'bg-[#37373d] text-white font-medium border-[#2b2b2b]'
                            : 'even:bg-[#1e1e1e] hover:bg-[#2a2d2e] border-[#2b2b2b] text-[#cccccc]'
                          : isSelected
                            ? 'bg-blue-600/15 text-slate-100 font-medium border-slate-900/40'
                            : 'even:bg-slate-900/15 hover:bg-slate-850/40 border-slate-900/40'
                      }`}
                    >
                      {visibleColumns.map(column => {
                        let cellVal = '';

                        if (column.key === 'creators_compact') {
                          cellVal = formatCreatorsCompact(item.creators);
                        } else if (column.key === 'tags') {
                          cellVal = item.tags.join(', ');
                        } else if (column.key === 'notes') {
                          cellVal = item.notes.map(note => note.note).join('; ');
                        } else {
                          const value = item[column.key];
                          if (Array.isArray(value)) {
                            cellVal = value
                              .map(entry => typeof entry === 'string' ? entry : JSON.stringify(entry))
                              .join(', ');
                          } else if (typeof value === 'boolean') {
                            cellVal = value ? 'Yes' : 'No';
                          } else {
                            cellVal = value ? String(value) : '';
                          }
                        }

                        return (
                          <td
                            key={column.key}
                            className={`px-3.5 py-2 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`}
                            style={{ maxWidth: column.width ? `${column.width}px` : '20rem' }}
                          >
                            {column.key === 'title' ? (
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-4 flex justify-center items-center shrink-0">
                                  {hasChildren && (
                                    <div onClick={event => onToggleExpand(item.id, event)} className="cursor-pointer hover:bg-white/10 rounded">
                                      {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    </div>
                                  )}
                                </div>
                                <span className="shrink-0 bg-transparent text-slate-400">
                                  {item.itemType === 'book' && <BookOpen className="h-3.5 w-3.5" />}
                                  {item.itemType === 'journalArticle' && <FileText className="h-3.5 w-3.5" />}
                                  {item.itemType === 'conferencePaper' && <Mic className="h-3.5 w-3.5" />}
                                  {item.itemType !== 'book' && item.itemType !== 'journalArticle' && item.itemType !== 'conferencePaper' && <NotebookText className="h-3.5 w-3.5" />}
                                </span>
                                <span className={`truncate font-medium ${theme === 'code-dark' ? (isSelected ? 'text-white' : 'text-[#cccccc]') : 'text-slate-100'}`} title={item.title}>
                                  {item.title || 'Untitled Record'}
                                </span>
                              </div>
                            ) : column.key === 'itemType' ? (
                              <span className="capitalize text-[10px] opacity-80">
                                {item.itemType.replace(/([A-Z])/g, ' $1')}
                              </span>
                            ) : column.key === 'doi' && cellVal ? (
                              <span className="font-mono text-[10.5px] text-sky-450 hover:underline cursor-pointer" onClick={event => { event.stopPropagation(); window.open(`https://doi.org/${cellVal}`, '_blank'); }}>
                                {cellVal}
                              </span>
                            ) : column.key === 'url' && cellVal ? (
                              <span className="font-mono text-emerald-400/80 text-[10px] hover:underline cursor-pointer" onClick={event => { event.stopPropagation(); window.open(cellVal, '_blank'); }}>
                                {cellVal}
                              </span>
                            ) : (
                              <span className={column.key === 'citekey' ? `font-mono text-[10.5px] p-0.5 px-1 border rounded-sm ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-sky-400' : 'bg-slate-950/60 border-slate-900 text-slate-400'}` : ''}>
                                {cellVal || '—'}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && item.attachments.map(attachment => (
                      <tr key={attachment.id} className={`cursor-default border-b ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-[#cccccc]' : 'bg-slate-900/5 border-slate-900/40 text-slate-100'}`}>
                        {visibleColumns.map(column => (
                          <td key={column.key} className={`px-3.5 py-1.5 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`} style={{ maxWidth: column.width ? `${column.width}px` : '20rem' }}>
                            {column.key === 'title' ? (
                              <button
                                type="button"
                                onClick={event => {
                                  event.stopPropagation();
                                  onOpenAttachment(attachment.id);
                                }}
                                className="flex min-w-0 items-center gap-2 pl-6 text-left hover:text-sky-400"
                              >
                                <Paperclip className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                                <span className="truncate opacity-80" title={attachment.title}>{attachment.title}</span>
                              </button>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {isExpanded && item.notes.map(note => (
                      <tr key={note.id} className={`cursor-default border-b ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-[#cccccc]' : 'bg-slate-900/5 border-slate-900/40 text-slate-100'}`}>
                        {visibleColumns.map(column => (
                          <td key={column.key} className={`px-3.5 py-1.5 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`} style={{ maxWidth: column.width ? `${column.width}px` : '20rem' }}>
                            {column.key === 'title' ? (
                              <div className="flex items-center gap-2 pl-6">
                                <StickyNote className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                <span className="truncate opacity-80" title={note.note}>{note.note}</span>
                              </div>
                            ) : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>

        <ContextMenu.Portal>
          <ContextMenu.Content className="z-50 w-64 rounded-md border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl p-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 font-semibold">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Eye className="h-4 w-4 text-sky-400" />
                <span>Visible Columns</span>
              </div>
            </div>

            <div className="flex items-center justify-between gap-1 mb-2.5 pb-1 border-b border-slate-800/50 text-[10px]">
              <button
                onClick={() => onSetAllColumns(true)}
                className="text-sky-400 hover:underline"
              >
                Select All
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => onSetAllColumns(false)}
                className="text-sky-400 hover:underline"
              >
                Clear (Hide)
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={onResetColumns}
                className="text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Reset</span>
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {columns.map((column, index) => {
                const isTitle = column.key === 'title';
                return (
                  <div
                    key={column.key}
                    className={`flex items-center justify-between px-1.5 py-1 rounded-sm hover:bg-slate-800/50 select-none ${
                      isTitle ? 'opacity-80 text-slate-400' : 'text-slate-300'
                    }`}
                  >
                    <label className={`flex items-center gap-2 cursor-pointer flex-1 min-w-0 ${isTitle ? 'cursor-not-allowed' : ''}`}>
                      <input
                        type="checkbox"
                        checked={column.visible}
                        disabled={isTitle}
                        onChange={() => onToggleColumn(column.key)}
                        className="rounded border-slate-800 bg-slate-950 text-sky-600 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="truncate">{column.label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          disabled={index === 0}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            onMoveColumn(index, 'up');
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent ${
                            index === 0 ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title="Move column left (up)"
                        >
                          <ChevronUp className="h-3 w-3 text-slate-400 hover:text-sky-400" />
                        </button>
                        <button
                          disabled={index === columns.length - 1}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            onMoveColumn(index, 'down');
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent ${
                            index === columns.length - 1 ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title="Move column right (down)"
                        >
                          <ChevronDown className="h-3 w-3 text-slate-400 hover:text-sky-400" />
                        </button>
                      </div>
                      <span className="font-mono text-[9px] text-slate-500 uppercase shrink-0">
                        {column.key === 'creators_compact' ? 'creators' : column.key.toString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  );
}
