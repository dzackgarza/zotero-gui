import { z } from 'zod';
import type {
  ColumnDef,
  ColumnOrderState,
  ColumnSizingState,
  Row,
  RowData,
  VisibilityState,
} from '@tanstack/react-table';
import { clientStorageKey } from './clientStorage';
import { DEFAULT_COLUMNS } from './data/samples';
import { sortableValue, type SortKey } from './librarySelectors';
import { formatCreatorsCompact } from './utils/fuzzy';
import type { ColumnDefinition, ZoteroItem } from './types';

// The single localStorage slot for column layout. Same versioned key the
// hand-rolled engine used, so existing persisted layouts keep loading.
export const COLUMN_STORAGE_KEY = clientStorageKey('columns');

// The one column that must always remain visible (it carries the row-expansion
// affordance and the item title cell). TanStack enforces this via
// enableHiding: false on the title column; this constant documents the rule for
// the persistence layer, which also refuses to hide it.
export const LOCKED_COLUMN_ID: SortKey = 'title';

// Minimum column width floor (px). Matches the previous resize clamp.
export const MIN_COLUMN_WIDTH = 50;

export interface ColumnLayoutState {
  columnVisibility: VisibilityState;
  columnOrder: ColumnOrderState;
  columnSizing: ColumnSizingState;
}

// --- Persistence schema (versioned, schema-validated, FAIL-LOUD) ---------
//
// A stored layout is the three TanStack state slices plus a schema version. A
// malformed or outdated stored value must throw, never silently reset — the
// crash surfaces an upstream/contract change instead of hiding it behind
// defaults. The version is bumped if the persisted shape ever changes.
export const COLUMN_LAYOUT_PERSIST_VERSION = 2;

const StoredColumnLayoutSchema = z
  .object({
    version: z.literal(COLUMN_LAYOUT_PERSIST_VERSION),
    columnVisibility: z.record(z.string(), z.boolean()),
    columnOrder: z.array(z.string()),
    columnSizing: z.record(z.string(), z.number().positive()),
  })
  .strict();

export type StoredColumnLayout = z.infer<typeof StoredColumnLayoutSchema>;

const DEFAULT_COLUMN_IDS: SortKey[] = DEFAULT_COLUMNS.map(column => column.key);

function assertExactColumnOrder(storedOrder: string[], contractIds: ReadonlySet<string>): void {
  const storedOrderIds = new Set(storedOrder);

  if (storedOrder.length !== contractIds.size) {
    throw new Error('Stored column layout order does not match the current column contract.');
  }
  if (storedOrderIds.size !== contractIds.size) {
    throw new Error('Stored column layout order does not match the current column contract.');
  }
  for (const id of contractIds) {
    if (!storedOrderIds.has(id)) {
      throw new Error(`Stored column layout is missing column: ${id}`);
    }
  }
  for (const id of storedOrderIds) {
    if (!contractIds.has(id)) {
      throw new Error(`Stored column layout contains unknown column: ${id}`);
    }
  }
}

function assertKnownColumnKeys(keys: Iterable<string>, contractIds: ReadonlySet<string>, label: string): void {
  for (const id of keys) {
    if (!contractIds.has(id)) {
      throw new Error(`Stored column ${label} references unknown column: ${id}`);
    }
  }
}

export function defaultColumnLayout(): ColumnLayoutState {
  const columnVisibility: VisibilityState = {};
  const columnSizing: ColumnSizingState = {};
  for (const column of DEFAULT_COLUMNS) {
    columnVisibility[column.key] = column.visible;
    if (column.width === undefined) {
      throw new Error(`Default column ${column.key} is missing a width.`);
    }
    columnSizing[column.key] = column.width;
  }
  return {
    columnVisibility,
    columnOrder: [...DEFAULT_COLUMN_IDS],
    columnSizing,
  };
}

// Read persisted layout. Returns defaults ONLY when nothing is stored (first
// run). Any stored value that does not match the current contract — wrong
// version, missing/extra column ids, malformed shape — throws loudly.
export function readColumnLayout(): ColumnLayoutState {
  const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
  if (raw === null) {
    return defaultColumnLayout();
  }

  const parsed: unknown = JSON.parse(raw);
  const stored = StoredColumnLayoutSchema.parse(parsed);

  const contractIds = new Set<string>(DEFAULT_COLUMN_IDS);
  assertExactColumnOrder(stored.columnOrder, contractIds);
  assertKnownColumnKeys(Object.keys(stored.columnVisibility), contractIds, 'visibility');
  assertKnownColumnKeys(Object.keys(stored.columnSizing), contractIds, 'sizing');

  // The locked column can never be persisted as hidden.
  const columnVisibility: VisibilityState = { ...stored.columnVisibility, [LOCKED_COLUMN_ID]: true };

  return {
    columnVisibility,
    columnOrder: stored.columnOrder,
    columnSizing: stored.columnSizing,
  };
}

export function writeColumnLayout(state: ColumnLayoutState): void {
  // Persist column widths clamped to the floor. This is the single place the
  // min-width invariant is enforced for storage; TanStack's minSize enforces it
  // again at render. Clamping here keeps persisted widths valid against the
  // strict schema and matches the original Math.max(50, …) resize behavior.
  const flooredSizing: ColumnSizingState = {};
  for (const [id, width] of Object.entries(state.columnSizing)) {
    flooredSizing[id] = Math.max(MIN_COLUMN_WIDTH, width);
  }
  const payload: StoredColumnLayout = {
    version: COLUMN_LAYOUT_PERSIST_VERSION,
    columnVisibility: state.columnVisibility,
    columnOrder: state.columnOrder,
    columnSizing: flooredSizing,
  };
  localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(payload));
}

// --- Cell value projection ------------------------------------------------
//
// The display string for a (item, column) pair. Kept here so both the sortingFn
// and the table cell renderer read columns the same way.
export function cellValue(item: ZoteroItem, columnId: SortKey): string {
  if (columnId === 'creators_compact') {
    return formatCreatorsCompact(item.creators);
  }
  if (columnId === 'tags') {
    return item.tags.join(', ');
  }
  if (columnId === 'notes') {
    return item.notes.map(note => note.note).join('; ');
  }

  const value = item[columnId];
  if (Array.isArray(value)) {
    return value
      .map(entry => (typeof entry === 'string' ? entry : JSON.stringify(entry)))
      .join(', ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return value ? String(value) : '';
}

// --- Sorting function (single comparison source) --------------------------
//
// TanStack sortingFn delegating to sortableValue (librarySelectors). Asc order
// here matches the previous sortLibraryItems ascending order exactly; TanStack
// inverts it for descending and cycles asc -> desc -> none on header clicks.
export function zoteroSortingFn(
  rowA: Row<ZoteroItem>,
  rowB: Row<ZoteroItem>,
  columnId: string,
): number {
  const left = sortableValue(rowA.original, columnId as SortKey);
  const right = sortableValue(rowB.original, columnId as SortKey);
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

// --- Column definitions (derived from DEFAULT_COLUMNS — single source) ----
//
// One ColumnDef per ColumnDefinition. id === key so visibility/order/sizing
// state keys line up with the domain column keys. The title column is locked
// against hiding. Meta carries the human label for the visibility menu and the
// header.
export interface ZoteroColumnMeta {
  label: string;
}

// Type the columnDef.meta slot so the human label is read without casts.
declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> extends ZoteroColumnMeta {
    readonly zoteroColumnMetaTypes?: readonly [TData, TValue];
  }
}

function buildColumnDef(column: ColumnDefinition): ColumnDef<ZoteroItem> {
  return {
    id: column.key,
    accessorFn: item => cellValue(item, column.key),
    header: column.label,
    enableHiding: column.key !== LOCKED_COLUMN_ID,
    sortingFn: zoteroSortingFn,
    size: column.width,
    minSize: MIN_COLUMN_WIDTH,
    meta: { label: column.label } satisfies ZoteroColumnMeta,
  };
}

export const ZOTERO_COLUMNS: ColumnDef<ZoteroItem>[] = DEFAULT_COLUMNS.map(buildColumnDef);
