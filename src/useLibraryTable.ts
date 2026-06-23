import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type Column,
  type ColumnOrderState,
  type ColumnSizingState,
  type SortingState,
  type Table,
  type Updater,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  LOCKED_COLUMN_ID,
  ZOTERO_COLUMNS,
  ColumnLayoutStorageError,
  defaultColumnLayout,
  readColumnLayoutResult,
  writeColumnLayout,
} from './columnModel';
import type { ZoteroItem } from './types';

function applyUpdater<T>(updater: Updater<T>, previous: T): T {
  return typeof updater === 'function' ? (updater as (old: T) => T)(previous) : updater;
}

interface InitialColumnLayout {
  layout: ReturnType<typeof defaultColumnLayout>;
  storageError: ColumnLayoutStorageError | null;
}

export interface LibraryTableState {
  table: Table<ZoteroItem>;
  columnLayoutStorageError: ColumnLayoutStorageError | null;
  resetPersistedColumnLayout: () => void;
}

function readInitialColumnLayout(): InitialColumnLayout {
  const result = readColumnLayoutResult();
  if (result.status === 'storage_error') {
    return { layout: defaultColumnLayout(), storageError: result.error };
  }
  return { layout: result.layout, storageError: null };
}

// Owns the headless table engine for the library view: column visibility,
// order, sizing, and sorting are all TanStack-managed and persisted under the
// existing versioned localStorage key. Invalid storage is returned as an owned
// storage-boundary error so App can render a repair action instead of the
// generic ErrorBoundary.
export function useLibraryTableState(items: ZoteroItem[]): LibraryTableState {
  const initialLayout = useMemo(readInitialColumnLayout, []);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    initialLayout.layout.columnVisibility,
  );
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(initialLayout.layout.columnOrder);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(initialLayout.layout.columnSizing);
  const [sorting, setSorting] = useState<SortingState>([{ id: LOCKED_COLUMN_ID, desc: false }]);
  const [columnLayoutStorageError, setColumnLayoutStorageError] =
    useState<ColumnLayoutStorageError | null>(initialLayout.storageError);

  useEffect(() => {
    if (columnLayoutStorageError !== null) {
      return;
    }
    writeColumnLayout({ columnVisibility, columnOrder, columnSizing });
  }, [columnLayoutStorageError, columnVisibility, columnOrder, columnSizing]);

  const resetPersistedColumnLayout = useCallback(() => {
    const layout = defaultColumnLayout();
    setColumnVisibility(layout.columnVisibility);
    setColumnOrder(layout.columnOrder);
    setColumnSizing(layout.columnSizing);
    writeColumnLayout(layout);
    setColumnLayoutStorageError(null);
  }, []);

  const table = useReactTable<ZoteroItem>({
    data: items,
    columns: ZOTERO_COLUMNS,
    state: { columnVisibility, columnOrder, columnSizing, sorting },
    // The title column is locked visible; reject any attempt to hide it so the
    // select-all/clear and per-column toggles can never drop it.
    onColumnVisibilityChange: updater =>
      setColumnVisibility(previous => ({
        ...applyUpdater(updater, previous),
        [LOCKED_COLUMN_ID]: true,
      })),
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    onSortingChange: setSorting,
    columnResizeMode: 'onChange',
    getRowId: item => item.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return { table, columnLayoutStorageError, resetPersistedColumnLayout };
}

export function useLibraryTable(items: ZoteroItem[]): Table<ZoteroItem> {
  return useLibraryTableState(items).table;
}

// All leaf columns (visible and hidden) in the current columnOrder. The
// context-menu column list needs every column — including hidden ones — laid
// out in the user's chosen order, which getAllLeafColumns (definition order)
// and the header leaf getters (visible only) do not provide together.
export function orderedLeafColumns(table: Table<ZoteroItem>): Column<ZoteroItem, unknown>[] {
  const columns = table.getAllLeafColumns();
  const order = table.getState().columnOrder;
  if (order.length === 0) {
    return columns;
  }
  const byId = new Map(columns.map(column => [column.id, column]));
  const ordered: Column<ZoteroItem, unknown>[] = [];
  for (const id of order) {
    const column = byId.get(id);
    if (column === undefined) {
      throw new Error(`Column order references a column outside the table: ${id}`);
    }
    ordered.push(column);
    byId.delete(id);
  }
  // Any column not named in the order array keeps its definition position last.
  for (const column of columns) {
    if (byId.has(column.id)) {
      ordered.push(column);
    }
  }
  return ordered;
}

// Reset every layout slice back to DEFAULT_COLUMNS. Driven from the context
// menu "Reset" control. Sorting is left to the table's own state.
export function resetColumnLayout(table: Table<ZoteroItem>): void {
  const layout = defaultColumnLayout();
  table.setColumnVisibility(layout.columnVisibility);
  table.setColumnOrder(layout.columnOrder);
  table.setColumnSizing(layout.columnSizing);
}

// Move a column one slot left ("up") or right ("down") in the current order.
// Drives TanStack's columnOrder state — there is no parallel order array.
export function moveColumn(table: Table<ZoteroItem>, columnId: string, direction: 'up' | 'down'): void {
  table.setColumnOrder(previous => {
    const order = previous.length > 0 ? [...previous] : table.getAllLeafColumns().map(column => column.id);
    const index = order.indexOf(columnId);
    if (index === -1) {
      throw new Error(`Column move references a column outside the current layout: ${columnId}`);
    }
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0) {
      throw new Error(`Column move index outside layout: ${index}`);
    }
    if (targetIndex >= order.length) {
      throw new Error(`Column move index outside layout: ${index}`);
    }
    const moved = order[index];
    const displaced = order[targetIndex];
    order[targetIndex] = moved;
    order[index] = displaced;
    return order;
  });
}

// Reorder via header drag: place the dragged column immediately at the dropped
// column's slot. Drives TanStack's columnOrder state.
export function reorderColumn(
  table: Table<ZoteroItem>,
  draggedId: string,
  targetId: string,
): void {
  if (draggedId === targetId) {
    return;
  }
  table.setColumnOrder(previous => {
    const order = previous.length > 0 ? [...previous] : table.getAllLeafColumns().map(column => column.id);
    const draggedIndex = order.indexOf(draggedId);
    const targetIndex = order.indexOf(targetId);
    if (draggedIndex === -1) {
      throw new Error('Column drag state references a column outside the current layout.');
    }
    if (targetIndex === -1) {
      throw new Error('Column drag state references a column outside the current layout.');
    }
    order.splice(draggedIndex, 1);
    order.splice(targetIndex, 0, draggedId);
    return order;
  });
}
