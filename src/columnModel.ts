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

export type ColumnLayoutStorageErrorKind =
  | 'invalid_json'
  | 'invalid_shape'
  | 'outdated_version'
  | 'contract_mismatch';

export class ColumnLayoutStorageError extends Error {
  readonly kind: ColumnLayoutStorageErrorKind;
  readonly cause: unknown;

  constructor(kind: ColumnLayoutStorageErrorKind, message: string, cause: unknown) {
    super(message);
    this.name = 'ColumnLayoutStorageError';
    this.kind = kind;
    this.cause = cause;
  }
}

export type ColumnLayoutReadResult =
  | { status: 'ready'; layout: ColumnLayoutState }
  | { status: 'storage_error'; error: ColumnLayoutStorageError };

type StoredJsonParseResult =
  | { status: 'parsed'; parsed: unknown }
  | { status: 'storage_error'; error: ColumnLayoutStorageError };

// --- Persistence schema (versioned, schema-validated) --------------------
//
// A stored layout is the three TanStack state slices plus a schema version. A
// malformed stored value becomes a ColumnLayoutStorageError, never a silent
// reset. The version is bumped if the persisted shape ever changes. The one
// admitted unversioned shape is the hand-rolled column array written by this
// app before the TanStack migration; it is parsed explicitly and converted at
// this boundary.
export const COLUMN_LAYOUT_PERSIST_VERSION = 2;

const HistoricalStoredColumnSchema = z.strictObject({
  key: z.string(),
  visible: z.boolean(),
  width: z.number().positive(),
});

const HistoricalStoredColumnsSchema = z.array(HistoricalStoredColumnSchema);

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
const StoredColumnLayoutVersionProbeSchema = z.object({ version: z.unknown() }).passthrough();

function storageReadError(
  kind: ColumnLayoutStorageErrorKind,
  cause: unknown,
): ColumnLayoutStorageError {
  return new ColumnLayoutStorageError(kind, 'Stored column layout could not be read.', cause);
}

function contractMismatchError(cause: unknown): ColumnLayoutStorageError {
  return storageReadError('contract_mismatch', cause);
}

function ready(layout: ColumnLayoutState): ColumnLayoutReadResult {
  return { status: 'ready', layout };
}

function storageError(kind: ColumnLayoutStorageErrorKind, cause: unknown): ColumnLayoutReadResult {
  return { status: 'storage_error', error: storageReadError(kind, cause) };
}

function parsedJson(parsed: unknown): StoredJsonParseResult {
  return { status: 'parsed', parsed };
}

function parsedJsonError(kind: ColumnLayoutStorageErrorKind, cause: unknown): StoredJsonParseResult {
  return { status: 'storage_error', error: storageReadError(kind, cause) };
}

function columnOrderContractError(
  storedOrder: string[],
  contractIds: ReadonlySet<string>,
): ColumnLayoutStorageError | null {
  const storedOrderIds = new Set(storedOrder);

  if (storedOrder.length !== contractIds.size) {
    return contractMismatchError('order length mismatch');
  }
  if (storedOrderIds.size !== contractIds.size) {
    return contractMismatchError('duplicate column ids');
  }
  for (const id of contractIds) {
    if (!storedOrderIds.has(id)) {
      return contractMismatchError(`missing column: ${id}`);
    }
  }
  for (const id of storedOrderIds) {
    if (!contractIds.has(id)) {
      return contractMismatchError(`unknown column: ${id}`);
    }
  }
  return null;
}

function knownColumnKeysError(
  keys: Iterable<string>,
  contractIds: ReadonlySet<string>,
  label: string,
): ColumnLayoutStorageError | null {
  for (const id of keys) {
    if (!contractIds.has(id)) {
      return contractMismatchError(`${label} references unknown column: ${id}`);
    }
  }
  return null;
}

function layoutFromHistoricalColumns(
  parsed: unknown[],
  contractIds: ReadonlySet<string>,
): ColumnLayoutReadResult {
  const historicalResult = HistoricalStoredColumnsSchema.safeParse(parsed);
  if (!historicalResult.success) {
    return storageError('invalid_shape', historicalResult.error);
  }
  const storedColumns = historicalResult.data;
  const columnOrder = storedColumns.map(column => column.key);
  const orderError = columnOrderContractError(columnOrder, contractIds);
  if (orderError !== null) {
    return { status: 'storage_error', error: orderError };
  }

  const columnVisibility: VisibilityState = {};
  const columnSizing: ColumnSizingState = {};
  for (const column of storedColumns) {
    columnVisibility[column.key] = column.key === LOCKED_COLUMN_ID ? true : column.visible;
    columnSizing[column.key] = Math.max(MIN_COLUMN_WIDTH, column.width);
  }

  return {
    status: 'ready',
    layout: {
      columnVisibility,
      columnOrder,
      columnSizing,
    },
  };
}

function parseStoredJson(raw: string): StoredJsonParseResult {
  try {
    return parsedJson(JSON.parse(raw));
  } catch (error) {
    return parsedJsonError('invalid_json', error);
  }
}

function versionedLayoutContractError(
  stored: StoredColumnLayout,
  contractIds: ReadonlySet<string>,
): ColumnLayoutStorageError | null {
  const orderError = columnOrderContractError(stored.columnOrder, contractIds);
  if (orderError !== null) {
    return orderError;
  }
  const visibilityError = knownColumnKeysError(
    Object.keys(stored.columnVisibility),
    contractIds,
    'visibility',
  );
  if (visibilityError !== null) {
    return visibilityError;
  }
  return knownColumnKeysError(Object.keys(stored.columnSizing), contractIds, 'sizing');
}

function layoutFromVersionedObject(
  parsed: unknown,
  contractIds: ReadonlySet<string>,
): ColumnLayoutReadResult {
  const versionProbe = StoredColumnLayoutVersionProbeSchema.safeParse(parsed);
  if (versionProbe.success && versionProbe.data.version !== COLUMN_LAYOUT_PERSIST_VERSION) {
    return storageError('outdated_version', versionProbe.data.version);
  }

  const storedResult = StoredColumnLayoutSchema.safeParse(parsed);
  if (!storedResult.success) {
    return storageError('invalid_shape', storedResult.error);
  }
  const stored = storedResult.data;
  const contractError = versionedLayoutContractError(stored, contractIds);
  if (contractError !== null) {
    return { status: 'storage_error', error: contractError };
  }

  // The locked column can never be persisted as hidden.
  return ready({
    columnVisibility: { ...stored.columnVisibility, [LOCKED_COLUMN_ID]: true },
    columnOrder: stored.columnOrder,
    columnSizing: stored.columnSizing,
  });
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

export function readColumnLayoutResult(): ColumnLayoutReadResult {
  const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
  if (raw === null) {
    return ready(defaultColumnLayout());
  }

  const parsedResult = parseStoredJson(raw);
  if (parsedResult.status === 'storage_error') {
    return { status: 'storage_error', error: parsedResult.error };
  }
  const parsed = parsedResult.parsed;
  const contractIds = new Set<string>(DEFAULT_COLUMN_IDS);
  if (Array.isArray(parsed)) {
    return layoutFromHistoricalColumns(parsed, contractIds);
  }
  return layoutFromVersionedObject(parsed, contractIds);
}

// Read persisted layout. Returns defaults ONLY when nothing is stored (first
// run). Historical app-owned array storage is migrated exactly. Any other
// stored value that does not match the current contract — wrong version,
// missing/extra column ids, malformed shape — is routed as an owned storage
// boundary error.
export function readColumnLayout(): ColumnLayoutState {
  const result = readColumnLayoutResult();
  if (result.status === 'storage_error') {
    throw result.error;
  }
  return result.layout;
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
