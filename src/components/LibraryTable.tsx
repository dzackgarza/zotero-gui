import React, { useState } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  type Cell,
  type Header,
  type Table,
} from '@tanstack/react-table';
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
import { moveColumn, orderedLeafColumns, reorderColumn, resetColumnLayout } from '../useLibraryTable';
import type { AdvancedSearchSettings, ZoteroItem } from '../types';
import type { AppTheme } from '../useThemePreference';
import { doiUrl } from '../utils/doi';

interface LibraryTableProps {
  table: Table<ZoteroItem>;
  theme: AppTheme;
  tableClass: string;
  selectedItemId: string | null;
  expandedItems: Set<string>;
  searchSettings: AdvancedSearchSettings;
  onSelectItem: (id: string) => void;
  onOpenAttachment: (attachmentId: string) => void;
  onResetFilters: (settings: AdvancedSearchSettings) => void;
  onToggleExpand: (id: string, event: React.MouseEvent) => void;
}

function headerSizeStyle(size: number): React.CSSProperties {
  return { width: `${size}px`, minWidth: `${size}px`, maxWidth: `${size}px` };
}

export default function LibraryTable({
  table,
  theme,
  tableClass,
  selectedItemId,
  expandedItems,
  searchSettings,
  onSelectItem,
  onOpenAttachment,
  onResetFilters,
  onToggleExpand,
}: LibraryTableProps) {
  const [draggedColId, setDraggedColId] = useState<string | null>(null);

  const headerGroups = table.getHeaderGroups();
  const rows = table.getRowModel().rows;
  const visibleLeafCount = table.getVisibleLeafColumns().length;
  const menuColumns = orderedLeafColumns(table);

  const renderTitleCell = (item: ZoteroItem, isSelected: boolean) => {
    const hasChildren = item.attachments.length > 0 || item.notes.length > 0;
    const isExpanded = expandedItems.has(item.id);
    return (
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
    );
  };

  const renderBodyCell = (cell: Cell<ZoteroItem, unknown>, isSelected: boolean) => {
    const columnId = cell.column.id;
    const item = cell.row.original;
    const cellVal = String(cell.getValue() ?? '');

    if (columnId === 'title') {
      return renderTitleCell(item, isSelected);
    }
    if (columnId === 'itemType') {
      return (
        <span className="capitalize text-[10px] opacity-80">
          {item.itemType.replace(/([A-Z])/g, ' $1')}
        </span>
      );
    }
    if (columnId === 'doi' && cellVal) {
      return (
        <span className="font-mono text-[10.5px] text-sky-450 hover:underline cursor-pointer" onClick={event => { event.stopPropagation(); window.open(doiUrl(cellVal), '_blank'); }}>
          {cellVal}
        </span>
      );
    }
    if (columnId === 'url' && cellVal) {
      return (
        <span className="font-mono text-emerald-400/80 text-[10px] hover:underline cursor-pointer" onClick={event => { event.stopPropagation(); window.open(cellVal, '_blank'); }}>
          {cellVal}
        </span>
      );
    }
    return (
      <span className={columnId === 'citekey' ? `font-mono text-[10.5px] p-0.5 px-1 border rounded-sm ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-sky-400' : 'bg-slate-950/60 border-slate-900 text-slate-400'}` : ''}>
        {cellVal || '—'}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-800">
      <ContextMenu.Root>
        <table className={`w-full text-left border-collapse text-xs select-none ${tableClass}`}>
          <ContextMenu.Trigger asChild>
            <thead
              className={`sticky top-0 z-10 shadow-xs border-b ${theme === 'code-dark' ? 'bg-[#252526] text-[#808080] border-[#2b2b2b]' : 'bg-slate-900 text-slate-400 border-slate-800'}`}
            >
              {headerGroups.map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header: Header<ZoteroItem, unknown>) => {
                    const sortDirection = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        draggable={true}
                        onDragStart={event => {
                          setDraggedColId(header.column.id);
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', header.column.id);
                        }}
                        onDragOver={event => event.preventDefault()}
                        onDrop={event => {
                          event.preventDefault();
                          if (draggedColId !== null) {
                            reorderColumn(table, draggedColId, header.column.id);
                          }
                          setDraggedColId(null);
                        }}
                        onClick={header.column.getToggleSortingHandler()}
                        className={`relative px-3.5 py-2.5 cursor-grab active:cursor-grabbing font-medium border-r whitespace-nowrap ${
                          theme === 'code-dark'
                            ? 'border-[#2b2b2b] hover:bg-[#323233] text-[#808080]'
                            : theme === 'monokai'
                              ? 'border-[#3e3d32] hover:bg-[#3e3d32] text-[#f8f8f2]'
                              : 'border-slate-850/30 hover:bg-slate-200 text-slate-700 font-mono text-[10px] uppercase tracking-wider'
                        } ${draggedColId === header.column.id ? 'opacity-40' : ''}`}
                        style={headerSizeStyle(header.getSize())}
                      >
                        <div className="flex items-center gap-1.5 justify-between pr-2">
                          <span className="truncate">{header.column.columnDef.meta?.label ?? header.column.id}</span>
                          {sortDirection && (
                            <span>{sortDirection === 'desc' ? <ChevronDown className="h-3.5 w-3.5 text-blue-400 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 text-blue-400 shrink-0" />}</span>
                          )}
                        </div>
                        <div
                          onMouseDown={event => {
                            event.stopPropagation();
                            header.getResizeHandler()(event);
                          }}
                          onClick={event => event.stopPropagation()}
                          className={`absolute right-0 top-0 bottom-0 w-2 cursor-col-resize ${header.column.getIsResizing() ? 'bg-sky-500' : 'hover:bg-sky-500/50'}`}
                          style={{ touchAction: 'none' }}
                        />
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
          </ContextMenu.Trigger>

          <tbody className={`divide-y ${theme === 'code-dark' ? 'divide-[#2b2b2b]' : ''}`}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={visibleLeafCount} className="py-20 text-center text-slate-500 font-sans">
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
              rows.map(row => {
                const item = row.original;
                const isSelected = selectedItemId === item.id;
                const isExpanded = expandedItems.has(item.id);
                const visibleCells = row.getVisibleCells();

                return (
                  <React.Fragment key={row.id}>
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
                      {visibleCells.map(cell => (
                        <td
                          key={cell.id}
                          className={`px-3.5 py-2 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`}
                          style={{ maxWidth: `${cell.column.getSize()}px` }}
                        >
                          {renderBodyCell(cell, isSelected)}
                        </td>
                      ))}
                    </tr>
                    {isExpanded && item.attachments.map(attachment => (
                      <tr key={attachment.id} className={`cursor-default border-b ${theme === 'code-dark' ? 'bg-[#1e1e1e] border-[#2b2b2b] text-[#cccccc]' : 'bg-slate-900/5 border-slate-900/40 text-slate-100'}`}>
                        {visibleCells.map(cell => (
                          <td key={cell.id} className={`px-3.5 py-1.5 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`} style={{ maxWidth: `${cell.column.getSize()}px` }}>
                            {cell.column.id === 'title' ? (
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
                        {visibleCells.map(cell => (
                          <td key={cell.id} className={`px-3.5 py-1.5 truncate text-[11px] font-sans border-r ${theme === 'code-dark' ? 'border-[#2b2b2b]' : 'border-slate-900/40'}`} style={{ maxWidth: `${cell.column.getSize()}px` }}>
                            {cell.column.id === 'title' ? (
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
                onClick={() => table.toggleAllColumnsVisible(true)}
                className="text-sky-400 hover:underline"
              >
                Select All
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => table.toggleAllColumnsVisible(false)}
                className="text-sky-400 hover:underline"
              >
                Clear (Hide)
              </button>
              <span className="text-slate-700">|</span>
              <button
                onClick={() => resetColumnLayout(table)}
                className="text-amber-400 hover:underline flex items-center gap-0.5"
              >
                <RotateCcw className="h-2.5 w-2.5" />
                <span>Reset</span>
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
              {menuColumns.map((column, index) => {
                const canHide = column.getCanHide();
                const label = column.columnDef.meta?.label ?? column.id;
                return (
                  <div
                    key={column.id}
                    className={`flex items-center justify-between px-1.5 py-1 rounded-sm hover:bg-slate-800/50 select-none ${
                      canHide ? 'text-slate-300' : 'opacity-80 text-slate-400'
                    }`}
                  >
                    <label className={`flex items-center gap-2 cursor-pointer flex-1 min-w-0 ${canHide ? '' : 'cursor-not-allowed'}`}>
                      <input
                        type="checkbox"
                        checked={column.getIsVisible()}
                        disabled={!canHide}
                        onChange={column.getToggleVisibilityHandler()}
                        className="rounded border-slate-800 bg-slate-950 text-sky-600 focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                      />
                      <span className="truncate">{label}</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          disabled={index === 0}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveColumn(table, column.id, 'up');
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent ${
                            index === 0 ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title="Move column left (up)"
                        >
                          <ChevronUp className="h-3 w-3 text-slate-400 hover:text-sky-400" />
                        </button>
                        <button
                          disabled={index === menuColumns.length - 1}
                          onClick={event => {
                            event.preventDefault();
                            event.stopPropagation();
                            moveColumn(table, column.id, 'down');
                          }}
                          className={`p-0.5 rounded hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent ${
                            index === menuColumns.length - 1 ? 'cursor-not-allowed' : 'cursor-pointer'
                          }`}
                          title="Move column right (down)"
                        >
                          <ChevronDown className="h-3 w-3 text-slate-400 hover:text-sky-400" />
                        </button>
                      </div>
                      <span className="font-mono text-[9px] text-slate-500 uppercase shrink-0">
                        {column.id === 'creators_compact' ? 'creators' : column.id}
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
