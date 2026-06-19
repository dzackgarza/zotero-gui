import { useEffect, useState } from 'react';
import type React from 'react';
import { z } from 'zod';
import { DEFAULT_COLUMNS } from './data/samples';
import type { ColumnDefinition } from './types';

const COLUMN_STORAGE_KEY = 'zotero_columns';

const StoredColumnSchema = z.object({
  key: z.string(),
  visible: z.boolean(),
  width: z.number().positive().optional(),
}).strict();

const StoredColumnsSchema = z.array(StoredColumnSchema).superRefine((columns, ctx) => {
  const seen = new Set<string>();
  for (const [index, column] of columns.entries()) {
    if (seen.has(column.key)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate stored column key: ${column.key}`,
        path: [index, 'key'],
      });
    }
    seen.add(column.key);
  }
});

function readStoredColumns(): ColumnDefinition[] {
  const storedColumns = localStorage.getItem(COLUMN_STORAGE_KEY);
  if (storedColumns === null) {
    return DEFAULT_COLUMNS;
  }

  const parsedJson: unknown = JSON.parse(storedColumns);
  const parsedColumns = StoredColumnsSchema.parse(parsedJson);
  const defaultKeys = new Set(DEFAULT_COLUMNS.map(column => column.key));
  const parsedKeys = new Set(parsedColumns.map(column => column.key));

  if (parsedKeys.size !== defaultKeys.size) {
    throw new Error('Stored column layout does not match the current column contract.');
  }

  for (const key of defaultKeys) {
    if (!parsedKeys.has(key)) {
      throw new Error(`Stored column layout is missing column: ${key}`);
    }
  }

  return parsedColumns.map(column => {
    const defaultColumn = DEFAULT_COLUMNS.find(candidate => candidate.key === column.key);
    if (defaultColumn === undefined) {
      throw new Error(`Stored column layout contains unknown column: ${column.key}`);
    }
    return {
      ...defaultColumn,
      visible: column.key === 'title' ? true : column.visible,
      width: column.width ?? defaultColumn.width,
    };
  });
}

export function useColumnLayout() {
  const [columns, setColumns] = useState<ColumnDefinition[]>(readStoredColumns);
  const [resizingCol, setResizingCol] = useState<ColumnDefinition['key'] | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);
  const [draggedColKey, setDraggedColKey] = useState<ColumnDefinition['key'] | null>(null);

  useEffect(() => {
    localStorage.setItem(
      COLUMN_STORAGE_KEY,
      JSON.stringify(columns.map(column => ({
        key: column.key,
        visible: column.visible,
        width: column.width,
      }))),
    );
  }, [columns]);

  useEffect(() => {
    if (resizingCol === null) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - startX;
      setColumns(previousColumns => previousColumns.map(column =>
        column.key === resizingCol
          ? { ...column, width: Math.max(50, startWidth + delta) }
          : column,
      ));
    };
    const handleMouseUp = () => setResizingCol(null);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, startWidth, startX]);

  const handleColumnDragStart = (event: React.DragEvent, columnKey: ColumnDefinition['key']) => {
    setDraggedColKey(columnKey);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnKey);
  };

  const handleColumnDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleColumnDrop = (event: React.DragEvent, targetColumnKey: ColumnDefinition['key']) => {
    event.preventDefault();
    if (draggedColKey === null || draggedColKey === targetColumnKey) {
      setDraggedColKey(null);
      return;
    }

    setColumns(previousColumns => {
      const draggedIndex = previousColumns.findIndex(column => column.key === draggedColKey);
      const targetIndex = previousColumns.findIndex(column => column.key === targetColumnKey);
      if (draggedIndex === -1 || targetIndex === -1) {
        throw new Error('Column drag state references a column outside the current layout.');
      }

      const updatedColumns = [...previousColumns];
      const [removedColumn] = updatedColumns.splice(draggedIndex, 1);
      if (removedColumn === undefined) {
        throw new Error('Column drag state did not identify a movable column.');
      }
      updatedColumns.splice(targetIndex, 0, removedColumn);
      return updatedColumns;
    });
    setDraggedColKey(null);
  };

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) {
      throw new Error(`Column move index outside layout: ${index}`);
    }
    setColumns(previousColumns => {
      const updatedColumns = [...previousColumns];
      const currentColumn = updatedColumns[index];
      const targetColumn = updatedColumns[newIndex];
      if (currentColumn === undefined || targetColumn === undefined) {
        throw new Error('Column move state references a column outside the current layout.');
      }
      updatedColumns[index] = targetColumn;
      updatedColumns[newIndex] = currentColumn;
      return updatedColumns;
    });
  };

  const toggleColumn = (key: ColumnDefinition['key']) => {
    setColumns(previousColumns => previousColumns.map(column => {
      if (column.key === key) {
        return { ...column, visible: column.key === 'title' ? true : !column.visible };
      }
      return column;
    }));
  };

  const setAllColumns = (visible: boolean) => {
    setColumns(previousColumns => previousColumns.map(column => ({
      ...column,
      visible: column.key === 'title' ? true : visible,
    })));
  };

  const resetColumns = () => {
    setColumns(DEFAULT_COLUMNS);
  };

  const handleResizeStart = (
    event: React.MouseEvent,
    columnKey: ColumnDefinition['key'],
    currentWidth: number,
  ) => {
    event.stopPropagation();
    setResizingCol(columnKey);
    setStartX(event.clientX);
    setStartWidth(currentWidth);
  };

  return {
    columns,
    draggedColKey,
    resizingCol,
    handleColumnDragStart,
    handleColumnDragOver,
    handleColumnDrop,
    handleResizeStart,
    moveColumn,
    resetColumns,
    setAllColumns,
    toggleColumn,
  };
}
