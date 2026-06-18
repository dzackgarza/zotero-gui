import React, { useRef, useEffect } from 'react';
import { Eye, Sliders, RotateCcw, CheckSquare, Square, X } from 'lucide-react';
import { ColumnDefinition } from '../types';

interface ColumnsSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnDefinition[];
  onChangeColumns: (columns: ColumnDefinition[]) => void;
  onReset: () => void;
}

export default function ColumnsSelector({
  isOpen,
  onClose,
  columns,
  onChangeColumns,
  onReset
}: ColumnsSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close when clicked outside
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

  const toggleColumn = (key: string) => {
    const updated = columns.map(col => {
      if (col.key === key) {
        return { ...col, visible: !col.visible };
      }
      return col;
    });
    onChangeColumns(updated);
  };

  const setAll = (visible: boolean) => {
    const updated = columns.map(col => {
      // Must keep Title visible to keep table readable
      if (col.key === 'title') return { ...col, visible: true };
      return { ...col, visible };
    });
    onChangeColumns(updated);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="absolute right-0 top-10 z-35 w-64 rounded-md border border-slate-800 bg-slate-900 text-slate-100 shadow-2xl p-3 text-xs"
    >
      <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2 font-semibold">
        <div className="flex items-center gap-1.5 text-slate-300">
          <Eye className="h-4 w-4 text-sky-400" />
          <span>Select Table Columns</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-sm p-0.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Preset Links */}
      <div className="flex items-center justify-between gap-1 mb-2.5 pb-1 border-b border-slate-800/50 text-[10px]">
        <button
          onClick={() => setAll(true)}
          className="text-sky-400 hover:underline"
        >
          Select All
        </button>
        <span className="text-slate-700">|</span>
        <button
          onClick={() => setAll(false)}
          className="text-sky-400 hover:underline"
        >
          Clear (Hide)
        </button>
        <span className="text-slate-700">|</span>
        <button
          onClick={onReset}
          className="text-amber-400 hover:underline flex items-center gap-0.5"
        >
          <RotateCcw className="h-2.5 w-2.5" />
          <span>Reset</span>
        </button>
      </div>

      {/* Checkbox collection */}
      <div className="max-h-56 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-800">
        {columns.map(col => {
          const isTitle = col.key === 'title';
          return (
            <label
              key={col.key}
              className={`flex items-center justify-between px-1.5 py-1 rounded-sm cursor-pointer hover:bg-slate-800/50 select-none ${
                isTitle ? 'opacity-80 cursor-not-allowed text-slate-400' : 'text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={col.visible}
                  disabled={isTitle}
                  onChange={() => toggleColumn(col.key)}
                  className="rounded border-slate-800 bg-slate-950 text-sky-600 focus:ring-0 h-3.5 w-3.5"
                />
                <span className="truncate">{col.label}</span>
              </div>
              <span className="font-mono text-[9px] text-slate-500 uppercase">
                {col.key === 'creators_compact' ? 'creators' : col.key.toString()}
              </span>
            </label>
          );
        })}
      </div>

      <div className="mt-2.5 border-t border-slate-800 pt-2 text-[10px] text-slate-500 leading-tight">
        Title column is pinned. Select other metadata attributes to inspect them side-by-side.
      </div>
    </div>
  );
}
