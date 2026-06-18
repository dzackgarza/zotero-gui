# Repository Audit Report: `zotero-gui`

An audit of the `zotero-gui` repository has been conducted to identify structural code quality issues, testing gaps, architectural slop, and hardcoded values that should be externalized to the configuration level.

* * *

## Part 1: Slop Audit Report

### 1. Test Invariant & Async Warning Slop

#### Finding A: Unhandled State Updates (`act(...)` warnings)

* **Location**: [src/App.test.tsx:L26-L33](file:///home/dzack/gitclones/zotero-gui/src/App.test.tsx#L26-L33)
* **Observed Output**:
  ```
  An update to App inside a test was not wrapped in act(...).
  When testing, code that causes React state updates should be wrapped into act(...):
  act(() => { ... });
  ```
* **Slop Pattern**: **Testing/Observability Neglect**. The test mounts `App` and instantly checks for a header element.
  However, the component asynchronously fetches data on mount via `loadFromApi`. Because the test ends immediately without awaiting this promise or verifying the loading state's resolution, the state update fires in the background after the test block finishes, causing vitest/testing-library warnings.

#### Finding B: Mock-First Evasion

* **Location**: [src/App.test.tsx:L21-L24](file:///home/dzack/gitclones/zotero-gui/src/App.test.tsx#L21-L24)
* **Slop Pattern**: **Mock-First Evasion**. The test suite mocks `global.fetch` to return empty datasets.
  While testing UI components without a live backend is standard, the test only verifies that the header text renders and does not assert actual data flow, error paths, or state transitions, serving as "smoke test" scaffolding rather than a rigorous functional proof.

* * *

### 2. Client-Side Simulation & Progress Theater

#### Finding A: Non-Persisted Modification Operations

* **Locations**:
  * [src/App.tsx:L248-L271 (handleAddNewItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L248-L271)
  * [src/App.tsx:L282-L312 (handleDeleteItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L282-L312)
  * [src/App.tsx:L314-L330 (handleDuplicateItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L314-L330)
* **Slop Pattern**: **Progress Theater / Scaffolding**. The frontend UI implements complex local handlers to add mock draft items, duplicate records, and delete/trash items.
  However, there are no endpoints in [src/server/server.ts](file:///home/dzack/gitclones/zotero-gui/src/server/server.ts) to update or delete items in the local SQLite database.
  Refreshing the browser or clicking the "Sync" button silently resets all client changes, creating a simulated UX that does not match actual database reality.

* * *

### 3. Dead Code & Unused Callback Paths

#### Finding A: Unused `onUpdateItem` Prop Pipeline

* **Locations**:
  * [src/App.tsx:L278-L280 (handleUpdateItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L278-L280)
  * [src/App.tsx:L997 (prop passing)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L997)
  * [src/components/InspectorPanel.tsx:L39 & L52 (prop definition)](file:///home/dzack/gitclones/zotero-gui/src/components/InspectorPanel.tsx#L39)
* **Slop Pattern**: **Dead Code Accumulation**. The `onUpdateItem` callback prop is wired from `App` down to `InspectorPanel` to support modifying record fields.
  However, the `InspectorPanel` layout only contains read-only text elements for bibliographic fields and never invokes `onUpdateItem`.

* * *

### 4. Fallback Placeholder Slop

#### Finding A: Injected Default Creator Values

* **Location**: [src/utils/bibtexParser.ts:L58](file:///home/dzack/gitclones/zotero-gui/src/utils/bibtexParser.ts#L58)
* **Slop Pattern**: **Plausible Fixture Injection / Fallback Compulsion**. If a BibTeX source lacks an author, the parser falls back to:
  ```typescript
  [{ firstName: '', lastName: 'Unknown Author', creatorType: 'author' }]
  ```
  Zotero naturally supports items with empty author/creator arrays.
  Injecting a hardcoded `"Unknown Author"` creator is a soft default that pollutes Zotero libraries with artificial creator entries instead of leaving the field clean.

* * *

## Part 2: Configuration Audit Report (Hardcoded Values)

The following parameters are currently hardcoded in source files and should be moved to the configuration/environment level:

### 1. Zotero Local Database Path (`DB_URI`)

* **File**: [src/server/server.ts:L11](file:///home/dzack/gitclones/zotero-gui/src/server/server.ts#L11)
* **Hardcoded Value**: `'file:///home/dzack/Zotero/zotero.sqlite?immutable=1'`
* **Impact**: Restricts the application to a single named user profile (`dzack`), preventing portability.
* **Refactoring Strategy**: Read from `process.env.ZOTERO_DB_PATH` or a user-specific home directory mapping (`path.join(os.homedir(), 'Zotero', 'zotero.sqlite')`).

### 2. Zotero Local Desktop API Endpoint

* **File**: [src/server/resolverPlugins.ts:L160](file:///home/dzack/gitclones/zotero-gui/src/server/resolverPlugins.ts#L160)
* **Hardcoded Value**: `'http://127.0.0.1:23119/api/users/0/items'`
* **Impact**: Assumes Zotero is running on default port `23119` and targets user `0`'s personal library.
  Group libraries or custom port layouts cannot be configured.
* **Refactoring Strategy**: Move to config/environment variables (e.g. `ZOTERO_API_URL` and `ZOTERO_API_TARGET`).

### 3. Server Listener Port

* **File**: [src/server/server.ts:L12](file:///home/dzack/gitclones/zotero-gui/src/server/server.ts#L12)
* **Hardcoded Value**: `3001`
* **Impact**: If port 3001 is bound by another local process, server startup will crash.
* **Refactoring Strategy**: Check `process.env.PORT || 3001`.

### 4. Resolver Plugins Config Path

* **File**: [src/server/server.ts:L13](file:///home/dzack/gitclones/zotero-gui/src/server/server.ts#L13)
* **Hardcoded Value**: `path.resolve(process.cwd(), 'resolver-plugins.json')`
* **Impact**: Prevents locating configuration directories or passing custom resolver setups dynamically.
* **Refactoring Strategy**: Check `process.env.RESOLVER_CONFIG_PATH || 'resolver-plugins.json'`.
# Architectural Slop Audit Report (New Findings)

Based on the initial analysis and the existing `slop-report.md`, here is a synthesized audit of the `zotero-gui` repository.

### 1. High-Severity: Configuration and Data Layer Brittleness

#### Finding: Hardcoded Configuration and Monolithic Data Access

* **Locations**:
  * `src/server/server.ts`: Hardcoded `DB_URI`, `PORT`, and `RESOLVER_CONFIG_PATH`.
  * `src/server/resolverPlugins.ts`: Hardcoded Zotero API endpoint.
  * `src/server/server.ts`: The `queryLibrary` function.
* **Slop Pattern**: **Tight Coupling** and **Accidental Complexity**.
* **Analysis**: The application is fundamentally brittle due to hardcoded paths and a monolithic data access function (`queryLibrary`).
  1. The hardcoded `DB_URI` (`'file:///home/dzack/Zotero/zotero.sqlite?immutable=1'`) makes the application entirely non-portable.
  2. The `queryLibrary` function is a single, massive block of code that directly executes seven complex SQL queries against the Zotero SQLite database and then performs extensive in-memory data shaping.
     This creates an extremely tight coupling to the database schema.
     Any change in the Zotero database will cause this function, and thus the entire application, to fail.
     This is a classic example of a system that is difficult to maintain and impossible to test in isolation.
* **Why it Matters**: This combination of hardcoded values and monolithic data access makes the application a "works on my machine" toy, not a reusable tool.
  It cannot be configured, deployed, or maintained by anyone other than the original author without significant code changes.

### 2. Medium-Severity: Misleading UI and Dead Code

#### Finding: Client-Side Simulation and Dead Prop-Drilling

* **Locations**:
  * `src/App.tsx`: `handleAddNewItem`, `handleDeleteItem`, `handleDuplicateItem` functions.
  * `src/App.tsx` and `src/components/InspectorPanel.tsx`: The `onUpdateItem` prop.
* **Slop Pattern**: **Progress Theater** and **Dead Code Accumulation**.
* **Analysis**: The frontend provides UI controls for adding, deleting, and updating items.
  However, these controls only manipulate local React state.
  There are no backend API endpoints to persist these changes.
  This creates a misleading user experience where all changes are silently lost on refresh.
  The `onUpdateItem` callback is passed down through components but is never called, representing dead code that adds to the cognitive load of maintenance.

### 3. Low-Severity: Data Pollution and Testing Gaps

#### Finding: Fallback Slop and Mock-First Evasion

* **Locations**:
  * `src/utils/bibtexParser.ts`: The fallback to an "Unknown Author" creator.
  * `src/App.test.tsx`: The use of `global.fetch` mocks.
* **Slop Pattern**: **Plausible Fixture Injection** and **Mock-First Evasion**.
* **Analysis**:
  1. Injecting a hardcoded "Unknown Author" when a BibTeX entry lacks one pollutes the Zotero library with artificial data instead of preserving the absence of an author.
  2. The application's primary test suite mocks the API fetch but only asserts that a header renders.
     It does not test any data flow, error handling, or state transitions, making it a smoke test that provides a false sense of security.
     The `act(...)` warnings indicate that asynchronous state updates are not being properly handled in tests.

* * *

## Current Repo Scope Addendum

Scope: current repo only, `/home/dzack/gitclones/zotero-gui`.

This addendum covers the Node/Vite Zotero GUI project, including `package.json`, TS/Vite/Vitest config, `src/server/*`, `src/App.tsx`, components, resolver plugins, and tests.
It does not evaluate the previous Python-shaped project.

## Highest-Risk Issues

### Server Module Has Import-Time Side Effects and No Dependency-Injection Boundary

`src/server/server.ts` does all of this at module top level:

```ts
const DB_URI = 'file:///home/dzack/Zotero/zotero.sqlite?immutable=1';
const PORT = 3001;
const RESOLVER_CONFIG_PATH = path.resolve(process.cwd(), 'resolver-plugins.json');

const db = new DatabaseSync(DB_URI);
const resolverPlugins = loadResolverPlugins(RESOLVER_CONFIG_PATH);
...
app.listen(PORT, ...)
```

This makes the server hard to test in isolation.
Importing the module opens a specific Zotero DB, loads config from the current working directory, constructs global service state, registers routes, and starts listening.
There is no clean way to unit-test route behavior with a fake repository or fake resolver service.

Fix: split into `config.ts`, `zoteroRepository.ts`, `resolverService.ts`, `createApp(deps)`, and `main.ts`. Only `main.ts` should read runtime config, open the real DB, and call `listen`.

### Runtime Version Contract Is Wrong or at Least Unpinned

The README says Node 18+, but the server imports:

```ts
import { DatabaseSync } from 'node:sqlite';
```

Node's official docs say the `node:sqlite` module was added in v22.5.0 and was no longer behind `--experimental-sqlite` in v22.13.0; the current docs still mark it as a release-candidate API. [Node.js][node-sqlite]

`package.json` has no `"engines"` field, and the repo also carries `better-sqlite3` plus `@types/better-sqlite3`, while the actual server uses `node:sqlite`. This is a portability trap: someone can install under the README-stated Node 18 and fail at runtime.

Fix: either require a concrete Node 22+ version in `package.json` and README, or switch consistently to `better-sqlite3`. Do not keep both database stacks unless there is an explicit adapter boundary and tests for both.

### `queryLibrary()` Is a Monolithic, Schema-Coupled Data Layer

`src/server/server.ts` has one large `queryLibrary()` function that performs seven SQL queries over Zotero internals, then performs all mapping, defaults, collection tree handling, notes, attachments, tags, and deleted-item policy inline.

It uses repeated casts:

```ts
.all() as any[];
...
row.itemType as any
```

This creates several long-term problems:

- The code is tightly coupled to Zotero's internal SQLite schema.
- Any schema change breaks a large opaque function.
- The SQL, row-level parsing, domain mapping, and API payload construction are not independently testable.
- There is no fixture DB contract test.
- The frontend receives a supposedly typed `ZoteroItem[]`, but the server never validates its own row-to-domain mapping.

Fix: extract repository methods and typed row mappers.
Use a tiny SQLite fixture DB for integration tests.
Keep pure mapping functions separately testable, for example `mapRawItemRowsToZoteroItems(...)`.

### The Frontend Presents Local-Only Mutations as Database Operations

`src/App.tsx` has handlers for adding, deleting, restoring, duplicating, emptying trash, adding collections, and importing JSON. Most mutate only React state:

```ts
handleAddNewItem
handleDeleteItem
handleRestoreItem
handleDuplicateItem
handleEmptyTrash
onAddCollection
importDatabaseJson
```

The backend exposes only:

```ts
GET  /api/library
GET  /api/resolver-plugins
POST /api/items/from-source
POST /api/items/from-bibtex
```

There are no persistence endpoints for the general UI actions.
A refresh or "reload from Zotero DB" discards the locally simulated operations.
This is not just missing functionality; it creates a false authority model where the UI looks like a database client but is partly a scratchpad.

Fix: choose one model.
Either make the app explicitly read-only except resolver ingestion, or route all mutating operations through backend commands with clear success/failure semantics.

### Collection Recursion Is Rendered, but Filtering and Counting Only Handle One Descendant Level

`SidebarCollections.tsx` recursively renders nested collections.
The add form allows any collection to be selected as a parent, so arbitrary depth is possible.

But both `SidebarCollections.getItemCount()` and `App.getCategorizedItems()` only collect direct children:

```ts
const childCollectionIds = collections
  .filter(c => c.parentId === collectionId)
  .map(c => c.id);

const targetIds = [collectionId, ...childCollectionIds];
```

So a grandchild collection is visible in the tree but not included when filtering/counting a root collection.
This is a concrete subtle bug caused by duplicating domain logic in multiple UI locations.

Fix: create one pure selector, e.g. `getDescendantCollectionIds(collections, rootId)`, and reuse it for counts and filters.

## Modularity and Testability Issues

### `App.tsx` Is a God Component

`src/App.tsx` owns library loading, API parsing, localStorage, theme state, search state, sorting, column persistence, drag/drop column ordering, resize handling, keyboard shortcuts, command definitions, import/export, local CRUD simulation, collection filtering, table rendering, row expansion, context menu rendering, toast state, and modal orchestration.

This makes isolated testing hard.
A change to search logic, table rendering, persistence, or local keyboard shortcuts requires mounting the whole app.

Fix: extract at least `useLibraryApi`, `useColumns`, `useTheme`, `useLibraryFilters`, `useSelection`, `LibraryTable`, `ColumnVisibilityMenu`, `ToastHost`, and `commands.ts`.

### Domain Logic Is Duplicated Between `App.tsx` and `SidebarCollections.tsx`

The same concepts appear in multiple places: duplicates, unfiled items, trash, no PDF, no extraction, nonstandard citekey, collection descendant inclusion.
This is already producing the one-level-descendant bug above.

Fix: create a `librarySelectors.ts` module with pure functions.
Test it with small object fixtures.
Components should call selectors, not reimplement rules.

### Resolver Plugin Execution Is Underspecified

`resolver-plugins.json` configures arbitrary command arrays:

```json
{ "id": "doi", "command": ["node", "resolver-plugins/doi.mjs"] }
```

`runResolverPlugin()` spawns the command with stdin/stdout/stderr but has no timeout, no maximum stdout/stderr size, no controlled cwd, no duplicate plugin-id rejection, and no structured plugin response contract.
It only expects "nonempty BibTeX".

Consequences: a plugin can hang forever, emit unbounded output, behave differently depending on `process.cwd()`, or fail with hard-to-classify errors.
Duplicate plugin IDs are silently resolved by `.find(...)`.

Fix: add a plugin manifest schema, reject duplicate IDs, set an explicit cwd, add timeout and output limits, classify plugin errors, and consider a JSON output contract such as `{ bibtex, diagnostics }`.

### Resolver Tests Hit Live External Services

`src/server/resolverPlugins.test.ts` runs DOI, arXiv, ZBMath, and Library of Congress paths.
Some tests are fixture-based, but others depend on live network behavior.

That gives nondeterministic tests: network, rate limits, upstream metadata changes, and transient service failures become repo failures.
It also makes the resolver architecture harder to refactor because tests are not cleanly divided between parser/unit tests and live smoke tests.

Fix: split tests into fixture unit tests and opt-in live integration tests, e.g. `test:live-resolvers`. The normal `npm test` should not require the internet.

### Global Vitest Config Uses `jsdom` for All Tests

`vitest.config.ts` sets:

```ts
environment: 'jsdom'
```

That environment is appropriate for React tests but not for server/resolver tests using `node:fs`, `node:child_process`, subprocesses, and local server modules.
A single global environment blurs test boundaries.

Fix: use Vitest projects or per-file environment annotations: browser/component tests under `jsdom`, server/resolver tests under `node`.

## Type Safety and Contract Issues

### TypeScript Is Not Strict, and the Code Relies on `any`

`tsconfig.json` omits `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals`, and `noUnusedParameters`. It also enables:

```json
"allowJs": true,
"skipLibCheck": true
```

The code then uses type erasure in important places:

```ts
.all() as any[]
row.itemType as any
DEFAULT_COLUMNS as any[]
ref={inputRef as any}
handleExecute(entry as any)
```

This undermines TypeScript precisely at the repo's riskiest boundaries: DB rows, parsed API payloads, UI config, and command dispatch.

Fix: enable `strict` first, then remove `any` at external boundaries by adding explicit row types and runtime parsers.

### API Payload Validation Is Shallow

`App.tsx` validates `/api/library` only as:

```ts
Array.isArray(payload.items)
Array.isArray(payload.collections)
```

Then it casts:

```ts
items: payload.items as ZoteroItem[]
collections: payload.collections as Collection[]
```

A malformed item with missing `tags`, `attachments`, `collections`, or `creators` can still crash downstream components.
The same problem exists for imported JSON backups.

Fix: define runtime schemas for `ZoteroItem`, `Collection`, `Creator`, `Attachment`, and `ItemNote`. Use the same schemas for server output tests, client API parsing, and JSON import.

### The Domain Type `ItemType` Is Effectively Just `string`

`src/types.ts` defines many literal item types, then ends with:

```ts
| string;
```

This collapses the union's checking value.
Code like `ITEM_TYPE_LABELS[item.itemType]` and item-type-specific UI now has no useful exhaustiveness protection.

Fix: use `type KnownItemType = ...` and represent unknowns explicitly, for example `type ItemType = KnownItemType | { kind: 'unknown'; value: string }`, or keep `itemType: string` and only use known-type guards where needed.

## Smaller but Real Maintainability Problems

### Configuration and Scaffold Drift

The project still has several scaffold residues:

- `package.json` name is `"react-example"`.
- `index.html` title is `"My Google AI Studio App"`.
- `.env.example` documents `GEMINI_API_KEY` and `APP_URL`.
- `metadata.json` claims `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`.
- `package.json` includes `@google/genai`.

None of that matches the actual inspected source.
This increases false configuration surface and makes future contributors chase nonexistent subsystems.

Fix: delete unused Gemini/AI Studio configuration unless it is genuinely part of the product.
Rename the package and HTML title.

### Error Semantics Are Too Coarse

The Express error middleware always returns status 500:

```ts
app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message });
});
```

Validation errors such as "collections must be an array" or "resolver plugin is not configured" should be 400/404-class errors, not server faults.
The client cannot distinguish bad input from infrastructure failure.

Fix: introduce typed errors or an error helper with `statusCode`, and return 400 for request validation, 404 for unknown resolver ID, 502 for upstream resolver/Zotero failures, and 500 for internal bugs.

### `AddByIdentifierModal` Does Not Handle Plugin-List Fetch Failures

The modal loads plugins with:

```ts
fetch('/api/resolver-plugins')
  .then(...)
  .then(setPlugins);
```

There is no `.catch`, no abort on close, and no loading/error state for the plugin list.
A failed `/api/resolver-plugins` call can leave the UI empty or produce an unhandled promise path.

Fix: use an abortable effect with `loading`, `error`, and cleanup.

## Recommended Refactor Order

- Split `server.ts` into an app factory plus bootstrap file.
  That unlocks server tests without touching the real Zotero DB.
- Extract `queryLibrary()` into a repository module with typed row mappers and a fixture SQLite integration test.
- Extract frontend selectors from `App.tsx` and `SidebarCollections.tsx`; fix recursive collection descendant logic there.
- Decide whether the app is read-only or truly mutating.
  Remove simulated CRUD or implement real backend endpoints.
- Harden resolver plugins with timeout/output limits, duplicate-id rejection, controlled cwd, and fixture-first tests.
- Enable strict TypeScript and add runtime schemas at the DB/API/import boundaries.

[node-sqlite]: https://nodejs.org/api/sqlite.html "SQLite | Node.js v26.3.1 Documentation"

## Addendum: Weak Typing, Timid Data Handling, and the Need for Hard Zotero Preflight Assertions

The earlier audit should be corrected in one important respect: close coupling to Zotero's SQLite schema is not itself a design flaw.
For this project, it is the premise.
This is a replacement GUI for Zotero, so it necessarily depends on Zotero's local database schema, item tables, EAV layout, collection structure, attachment representation, note representation, and deleted-item conventions.

The actual flaw is not schema coupling.
The flaw is unasserted schema coupling.

The code currently depends on very specific Zotero database facts while writing as if those facts are merely tentative.
It queries deep internal tables, casts the result to `any[]`, conditionally fills gaps with defaults, and then lets the frontend operate on supposedly well-formed `ZoteroItem` objects.
That is backwards.
If the application requires a known Zotero database shape, it should prove that shape up front, fail immediately if it is absent, and then let the rest of the program assume the database satisfies the declared contract.

The app should not "gracefully handle" an unexpected Zotero schema by returning partial data, fake defaults, empty arrays, or generic 500s. It should reject the environment before the GUI starts.

### Replace Timid Probing with an Explicit Zotero Compatibility Contract

The server should have a startup preflight, for example:

```ts
assertSupportedNodeRuntime();
assertReadableZoteroDatabase(dbPath);
assertZoteroSchemaVersion(db, SUPPORTED_ZOTERO_SCHEMA_RANGE);
assertRequiredTablesExist(db, [
  'items',
  'itemTypes',
  'libraries',
  'itemData',
  'itemDataValues',
  'fields',
  'itemCreators',
  'creators',
  'creatorTypes',
  'itemTags',
  'tags',
  'collectionItems',
  'itemNotes',
  'itemAttachments',
  'collections',
  'deletedItems',
  'deletedCollections',
]);
assertRequiredColumnsExist(db, REQUIRED_ZOTERO_COLUMNS);
assertRequiredFieldNamesExist(db, REQUIRED_FIELD_NAMES);
assertRequiredItemTypesExist(db, REQUIRED_ITEM_TYPES);
assertNoUnsupportedLibraryModes(db);
assertCanRunRepresentativeLibraryQuery(db);
assertCanMapRepresentativeRows(db);
```

After this preflight passes, ordinary code should not keep asking "maybe this table exists," "maybe this field exists," "maybe this row has the expected shape."
Those facts should be established once and treated as invariants.

The contract should be versioned.
The app can declare compatibility with specific Zotero database schema versions or specific Zotero desktop versions.
A startup failure like this is appropriate:

```text
Unsupported Zotero database schema.

Expected:
  schema version: 143-146
  required table: itemAttachments(parentItemID, path, contentType)
  required field names: title, DOI, url, date, publicationTitle, abstractNote, citationKey

Observed:
  schema version: 147
  missing field: citationKey

Refusing to start. Update the compatibility contract or migration layer.
```

This is better than a GUI that loads and then quietly lies.

### The Type Problem Is Not Just "Missing Strict Mode"; It Is Missing Domain Confidence

The code currently weakens the program at the exact boundaries where it should be strongest.

Examples:

```ts
.all() as any[]
row.itemType as any
payload.items as ZoteroItem[]
payload.collections as Collection[]
DEFAULT_COLUMNS as any[]
ref={inputRef as any}
handleExecute(entry as any)
```

These casts say: "the program does not know what it has."
But this app should know exactly what it has, because it is reading a declared Zotero schema after a hard compatibility check.

The desired model is:

```ts
type ZoteroItemRow = {
  itemID: number;
  id: ZoteroKey;
  itemType: ZoteroItemType;
  dateAdded: ZoteroTimestamp;
  dateModified: ZoteroTimestamp;
  title: string;
  inTrash: 0 | 1;
  doi: string | null;
  url: string | null;
  date: string | null;
  // ...
};

function assertZoteroItemRow(row: unknown): asserts row is ZoteroItemRow {
  assertRecord(row);
  assertInteger(row.itemID);
  assertZoteroKey(row.id);
  assertKnownZoteroItemType(row.itemType);
  assertZoteroTimestamp(row.dateAdded);
  assertZoteroTimestamp(row.dateModified);
  assertString(row.title);
  assertOneOf(row.inTrash, [0, 1]);
}
```

Then the mapper can be simple:

```ts
function mapItemRow(row: ZoteroItemRow, related: RelatedItemData): ZoteroItem {
  return {
    id: row.id,
    itemType: row.itemType,
    title: row.title,
    creators: related.creatorsByItemID.mustGet(row.itemID),
    tags: related.tagsByItemID.mustGet(row.itemID),
    notes: related.notesByItemID.mustGet(row.itemID),
    attachments: related.attachmentsByItemID.mustGet(row.itemID),
    collections: related.collectionsByItemID.mustGet(row.itemID),
    dateAdded: row.dateAdded,
    dateModified: row.dateModified,
    inTrash: row.inTrash === 1,
    doi: nullable(row.doi),
    url: nullable(row.url),
    date: nullable(cleanZoteroDate(row.date)),
    // ...
  };
}
```

No `any`. No "best effort."
No accidental undefined paths.
The hard part is establishing the contract; after that, the code should exploit it.

### Stop Injecting Fake Domain Values

The BibTeX parser currently falls back to:

```ts
[{ firstName: '', lastName: 'Unknown Author', creatorType: 'author' }]
```

This is the wrong instinct.
It turns missing data into false data.
Zotero supports items without creators.
If an item has no creators, the value should be `[]`. If the application requires creators for a specific operation, that operation should assert that requirement and fail there.

Likewise:

```ts
title: row.title ?? 'Untitled'
title: row.title ?? row.path ?? 'Attachment'
formatCreatorsFull(...) => 'No Authors'
formatCreatorsCompact(...) => '-'
```

There is a distinction between display placeholders and domain data.
The domain layer should not invent bibliographic facts.
If a title is required by the app's compatibility contract, assert it.
If Zotero allows titleless items and the GUI supports them, represent absence as absence.
Render placeholders only in the view layer.

Correct split:

```ts
// domain
title: ZoteroTitle | null;

// view
renderTitle(item.title ?? 'Untitled');
```

The current code blurs these layers.

### Move Uncertainty to the Boundary; Keep the Core Code Assertive

The current system spreads uncertainty everywhere: optional chaining, `?? []`, `?? undefined`, casts, shallow payload checks, and generic error recovery.
This makes the code longer and less reliable.

A better architecture is:

```text
startup
  load config
  open DB
  run doctor
  construct typed repository

repository
  issue known SQL
  assert row shapes
  return typed domain objects

domain/selectors
  assume valid ZoteroItem objects
  compute views deterministically

frontend
  parse API payload strictly once
  render typed data
```

Then the central code becomes substantially simpler.
For example, after asserting that every `ZoteroItem` always has `tags: string[]`, `collections: string[]`, `attachments: Attachment[]`, and `notes: ItemNote[]`, UI code does not need this pattern:

```ts
item.collections && item.collections.some(...)
item.attachments && item.attachments.some(...)
item.tags && item.tags.includes(...)
```

It can say:

```ts
item.collections.some(...)
item.attachments.some(...)
item.tags.includes(...)
```

That is not cosmetic.
It means the program has a real model.

### The Doctor Should Be a First-Class Subsystem, Not a Few Startup Checks

The app needs an extensive `zotero doctor` layer.
It should be runnable independently, and the server should refuse to start unless it passes.

The doctor should check at least:

Database location and access:

```text
DB path exists
DB opens read-only
DB is not WAL-inconsistent
DB is a Zotero database, not merely a SQLite database
DB schema version is in the supported range
```

Schema structure:

```text
required tables exist
required columns exist with expected affinity/nullability where relevant
required indexes or join keys exist
required field names exist in fields
required item types exist in itemTypes
creator type table contains expected creator types
deleted item/collection tables exist
collection parent links are structurally sane
```

Data assumptions:

```text
item keys are nonempty
library rows exclude feeds as expected
parent/child item relationships are coherent
child attachments have parentItemID
child notes have parentItemID
collectionItems references existing items and collections
creator links reference existing creators and creator types
tag links reference existing tags
```

Query assumptions:

```text
main item query compiles
creator query compiles
tag query compiles
collection-membership query compiles
notes query compiles
attachments query compiles
collections query compiles
all representative rows validate against typed row parsers
```

Application-specific assumptions:

```text
the app's supported item-type set matches observed data, or unknown item types are explicitly modeled
date normalization policy is declared
citation-key source is declared
trash semantics are declared
attachment-path semantics are declared
collection-recursion semantics are declared
```

The doctor should produce a structured report, not an incidental thrown error.
But startup should still fail hard if any required assertion fails.

### Make Impossible States Unrepresentable

Current types allow invalid states too easily.

For example, `ItemType` ends with `| string`, which destroys most of the value of the union.
If unknown Zotero item types are allowed, model that explicitly:

```ts
type KnownZoteroItemType =
  | 'journalArticle'
  | 'book'
  | 'bookSection'
  | 'conferencePaper'
  | 'thesis'
  | 'report'
  | 'webpage';

type ZoteroItemType =
  | { kind: 'known'; value: KnownZoteroItemType }
  | { kind: 'unknown'; value: string };
```

Or, if the doctor rejects unknown item types for now, keep the literal union and assert up front that the database contains only supported item types.

Similarly, collections should not be plain strings everywhere.
Use branded IDs:

```ts
type ItemID = Brand<number, 'ItemID'>;
type CollectionID = Brand<number, 'CollectionID'>;
type ZoteroKey = Brand<string, 'ZoteroKey'>;
type ZoteroTimestamp = Brand<string, 'ZoteroTimestamp'>;
```

Then this kind of accidental mixing becomes harder:

```ts
collections: string[];
id: string;
parentId?: string;
```

Zotero has database integer IDs, Zotero keys, collection IDs, and synthetic UI IDs like `'all'`, `'trash'`, `'duplicates'`. Those should not all be undifferentiated strings.

Use separate types:

```ts
type RealCollectionID = Brand<number, 'RealCollectionID'>;

type VirtualCollectionID =
  | 'all'
  | 'duplicates'
  | 'unfiled'
  | 'trash'
  | 'no-pdf'
  | 'no-extraction'
  | 'nonstandard-citekey';

type SelectedCollectionID = RealCollectionID | VirtualCollectionID;
```

That would prevent large classes of bugs.

### Replace Shallow API Validation with Exact Payload Parsing

The client currently checks only that `items` and `collections` are arrays, then trusts everything inside.
That is not enough.
The API boundary should be just as assertive as the DB boundary.

The client should parse:

```ts
const payload = LibraryPayloadSchema.parse(await response.json());
```

or with hand-written assertion functions:

```ts
const payload = parseLibraryPayloadStrict(await response.json());
```

That parser should validate every item field the frontend assumes.
If an item reaches React, React should not need to defend against malformed `tags`, missing `attachments`, or absent `collections`.

A render error boundary is not a substitute for payload validation.
The boundary should catch programmer errors, not routine malformed data.

### Testing Should Prove the Invariants, Not Mock Around Them

The test suite should be reorganized around contracts.

Needed tests:

```text
doctor accepts fixture DB matching supported Zotero schema
doctor rejects DB missing required table
doctor rejects DB missing required field name
doctor rejects unsupported schema version
doctor rejects broken parent attachment links
main query returns rows accepted by row parser
row parser rejects malformed SQL row
domain mapper preserves null/missing bibliographic values without fake defaults
selectors assume well-formed items and do not defensively probe
frontend rejects malformed /api/library payload before rendering
```

This is more valuable than smoke tests that mock `fetch` and only check that one item title renders.

The project should also have live resolver tests, but those should be opt-in.
The core proof should be local and deterministic.

### Revised Principle for the Project

The intended design principle should be:

```text
Be maximally strict at the Zotero/database/API boundaries.
Be maximally simple inside the application core.
Do not recover from violated invariants.
Do not invent bibliographic data.
Do not represent unknown states as ordinary optional fields.
Do not let React components perform schema discovery.
```

The app should treat the Zotero database as a declared foreign schema with a formal compatibility contract.
Once that contract is validated, the implementation should become less defensive, not more defensive.

The target is not graceful degradation.
The target is correct failure before startup and simple code afterward.

## Design/Layout/Aesthetic Audit: `zotero-gui`

This is based on code inspection, not a rendered screenshot.
The visual risk is still clear from the component code: the app is trying to look like a polished desktop bibliographic IDE, but most of the design system is hand-rolled inside JSX class strings.
That is the main source of "slop look."

The strongest recommendation is not "make it prettier."
It is: stop owning low-level visual and interaction primitives unless they are genuinely Zotero-specific.

### The App Has No Real Design System

`src/index.css` is only:

```css
@import "tailwindcss";
```

There is no token layer for color, spacing, font scale, radius, shadows, density, interaction states, or semantic roles.
Yet the app uses hundreds of raw classes like:

```tsx
bg-[#1e1e1e]
text-[#cccccc]
border-[#2b2b2b]
bg-slate-950
bg-slate-900
text-slate-550
border-slate-805
bg-slate-955
text-red-505
text-sky-450
text-stone-250
py-0.2
```

Some of these look like nonstandard Tailwind utilities.
Since the project has no `@theme` block defining custom token namespaces, many such classes are likely inert or accidental.
Tailwind's current theme system expects custom tokens to be declared explicitly with `@theme`, and those variables drive which utility classes exist; it also documents standard token namespaces for color, font, spacing, radius, shadow, breakpoints, etc. [Tailwind CSS][tailwind-theme]

Professional fix: introduce a minimal token system immediately.

Example target:

```css
@import "tailwindcss";

@theme {
  --color-app-bg: #1e1e1e;
  --color-app-panel: #252526;
  --color-app-panel-raised: #323233;
  --color-app-border: #2b2b2b;
  --color-app-text: #cccccc;
  --color-app-muted: #808080;
  --color-app-accent: #0e639c;

  --spacing-density-row: 1.75rem;
  --radius-control: 0.25rem;
}
```

Then JSX should use semantic utilities or component variants, not raw one-off colors.
Better still: use Radix Themes or shadcn/ui as the design foundation and only override tokens.

Radix Themes is specifically a pre-styled React component library with theme configuration, layout primitives, typography, dark mode, color scales, table, dialog, select, tooltip, etc. [Radix UI][radix-themes]

### The App Uses Radix Primitives but Ignores the Higher-Level Design Layer

The repo already depends on Radix primitives:

```json
@radix-ui/react-accordion
@radix-ui/react-context-menu
@radix-ui/react-dialog
@radix-ui/react-dropdown-menu
@radix-ui/react-select
@radix-ui/react-tabs
@radix-ui/react-tooltip
```

But the components then hand-style every menu, select, tooltip, dialog, and modal.
This is the worst middle ground: the app owns a huge amount of styling surface while still depending on primitives.

Professional fix: choose one of these two paths.

Path A: use Radix Themes.
Replace most hand-styled buttons, dialogs, select menus, tooltips, table wrappers, text, headings, badges, cards, callouts, scroll areas, separators, and icons with Radix Themes components.
Radix Themes provides the theme root, color scales, dark mode, typography, layout primitives, and many pre-styled components out of the box.
[Radix UI][radix-themes]

Path B: use shadcn/ui.
This keeps Tailwind ownership but standardizes component recipes.
It has established components for buttons, command palettes, context menus, dialogs, dropdowns, inputs, sidebars, sheets, tables, tooltips, toasts, resizable panels, etc.; its data-table guide is built around TanStack Table.
[Shadcn][shadcn-data-table]

Do not continue manually styling every primitive in every feature component.

### The Table Is Hand-Rolled Despite Being the App's Central UI

The core app is a dense bibliographic table.
It currently owns:

```text
sorting,
column visibility,
column ordering,
drag/drop,
column resizing,
cell formatting,
row expansion,
attachment/note child rows,
empty states,
selection state,
context menu,
manual widths,
manual sticky headers.
```

This is exactly the domain where hand-rolling is least defensible.

`App.tsx` manually renders a `<table>` and mutates table state through local React state.
That will become increasingly fragile as the app needs pinning, row virtualization, keyboard navigation, multi-select, persistent column state, grouping, collection-filter facets, author/date sorting semantics, and item-specific row actions.

Professional fix: replace the hand-rolled table state machine with TanStack Table or AG Grid.

For a headless, bespoke Zotero-like table, TanStack Table is the natural fit.
Its docs explicitly center column definitions as the data model for sorting, filtering, grouping, display columns, action columns, and formatting; it also has guides for column ordering, sizing, visibility, sorting, filtering, expanding, row selection, and virtualization.
[TanStack Table][tanstack-table-columns]

For a heavier "desktop-grid" replacement with less owned behavior, AG Grid is also reasonable.
Its React grid has built-in modules for column definitions, sizing, moving, pinning, sorting, filtering, row selection, tree data, master/detail, keyboard navigation, accessibility, export, and theming.
[AG Grid][ag-grid-react]

Current hand-rolled table code should be considered prototype code, not a maintainable product foundation.

### The Layout Shell Is Custom When It Should Use a Proven App-Shell Pattern

The app manually constructs:

```text
top fake window bar,
toolbar,
left sidebar,
main table,
right inspector,
modal overlays,
toast,
command palette.
```

The result is visually inconsistent because each region defines its own background, borders, typography, spacing, and theme logic.

Professional fix: adopt an app-shell layout primitive:

For shadcn/ui: `Sidebar`, `Resizable`, `Command`, `Dialog`, `Sheet`, `DropdownMenu`, `ContextMenu`, `Tooltip`, `Sonner`, `Table`.

For Radix Themes: `Theme`, `Flex`, `Grid`, `Box`, `Container`, `Text`, `Heading`, `Button`, `IconButton`, `Card`, `DataList`, `Table`, `Dialog`, `DropdownMenu`, `Tooltip`, `Separator`, `Badge`.

For Zotero specifically, the layout should be specified as a stable shell:

```text
AppShell
  TopMenuBar
  Toolbar
  ResizablePanelGroup
    CollectionSidebar
    LibraryGrid
    InspectorPanel
  StatusBar / ToastViewport
```

The app should not encode the shell ad hoc inside `App.tsx`.

### Theme Handling Is Scattered and Unprofessional

Theme logic appears inside multiple components:

```ts
getThemeClass()
getSubpanelClass()
getTableClass()
getSidebarBg()
getFolderSelectedClass()
getCounterClass()
getPanelBg()
getSubpanelHeaderBg()
getInputClass()
```

This means every component owns its own interpretation of "dark," "light," and "monokai."
That guarantees visual drift.

Radix Themes already provides an appearance model, color scales, gray scales, and dark-mode handling.
Its docs recommend using a theme provider/class switching strategy for system appearance rather than manually threading theme strings everywhere.
[Radix UI][radix-dark-mode]

Professional fix: make theme a root-level concern.
Components should consume semantic variants, not switch on theme names.

Bad pattern:

```ts
theme === 'code-dark' ? 'bg-[#252526]' : 'bg-slate-950/40'
```

Better pattern:

```tsx
<Panel variant="sidebar" />
<TableRow data-selected={isSelected} />
<Button variant="ghost" size="sm" />
```

Then the visual mapping lives in one place.

### The App Has Fake Desktop Chrome

The top bar renders macOS-style dots and menu labels:

```tsx
File Edit View Tools Help
```

But these menu items are inert spans:

```tsx
<span className="hover:text-white cursor-default">File</span>
```

This is unprofessional because it mimics a native application affordance without behavior.
It reads as demo scaffolding.
A bespoke Zotero replacement can have desktop-like density, but fake chrome is not acceptable in a serious app.

Professional fix: either remove it or make it real.

If the app is web-only, use a real toolbar and command menu.

If it is intended to become a desktop app, use Tauri/Electron native menu integration or a real menubar component.
shadcn has a `Menubar`; Radix has a menubar primitive; React Aria also has menu primitives with accessibility behavior.

### Icons and Emojis Are Mixed Inconsistently

The app uses `lucide-react` icons for many controls but also uses emojis for item types:

```tsx
📚
📄
🎤
📝
📎
🗒️
⚠️
```

This creates a nonprofessional visual language.
Emoji rendering varies by OS, size, font fallback, color style, and accessibility output.
It also clashes with the VSCode-style/lucide aesthetic.

Professional fix: use one icon system.
Since the repo already uses `lucide-react`, define an `ItemTypeIcon` component mapping Zotero item types to Lucide icons or a small custom SVG set.
Use badges for item type labels where needed.

### Accessibility Is Inconsistent Because Interaction Behavior Is Hand-Owned

The app uses accessible primitives in places, but then undermines them with manual buttons, clickable spans, custom keyboard handlers, and table rows that behave like selectable controls.

Examples:

Clickable table rows use `onClick` on `<tr>`, but there is no obvious keyboard selection model.

The DOI and URL cells use `<span onClick>` instead of anchors/buttons.

Column headers are draggable, clickable for sorting, and contain resize handles, all manually composed.

The command palette maintains `selectedIndex` manually on top of `cmdk`, mixing two selection systems.

React Aria's value proposition is precisely that components provide built-in behavior, adaptive interactions, accessibility, keyboard support, focus management, and internationalization while allowing custom styles.
[React Spectrum][react-aria]

Professional fix: do not hand-own complex interaction semantics.
Use table/grid libraries and accessible component systems for rows, menus, comboboxes, dialogs, resize handles, drag/drop, and keyboard navigation.
WCAG 2.2 also makes focus visibility and target sizing explicit concerns; the current app leaves those to scattered classes and manual behavior.
[W3C][wcag-quickref]

### Forms Are Hand-Rolled and Weakly Validated

`AddByIdentifierModal`, `AdvancedSearchModal`, and the collection-create form are manually controlled.
Validation is mostly `required`, `trim()`, and local booleans.
Error display is ad hoc.

Professional fix: use a form library plus schema validation.
The obvious stack is React Hook Form plus Zod.
Zod is TypeScript-first, supports static type inference, and explicitly expects TypeScript `strict` mode; it is suited for the "assert data shape once, then trust it" model discussed in the previous addendum.
[Zod][zod]

For this app, schemas should define:

```text
resolver plugin form,
BibTeX ingestion form,
advanced search settings,
column layout persistence,
JSON import payload,
doctor report,
library API payload.
```

### Toasts Are Hand-Rolled

The app has:

```tsx
{toast && (
  <div className="fixed bottom-10 right-4 ...">
    ...
  </div>
)}
```

This owns timing, stacking, motion, accessibility, placement, dismissal, reduced-motion behavior, and live-region semantics.
That is unnecessary.

Professional fix: use Sonner or a design-system toast.
shadcn directly includes Sonner in its component list; Sonner is a dedicated toast library.
[Shadcn][shadcn-data-table]

### Server-State Handling Is Hand-Rolled

`App.tsx` owns loading, fetch, error, reload, and after-create refresh logic:

```ts
const [isLoading, setIsLoading] = useState(true);
const [libraryLoadError, setLibraryLoadError] = useState<Error | null>(null);

const loadFromApi = () => {
  setIsLoading(true);
  fetchLibraryPayload()
    .then(...)
    .catch(...)
};
```

This is not just logic slop; it affects UI polish.
Loading states, stale data, refresh behavior, resolver mutations, retry, cancellation, and optimistic updates will become visible UX problems.

Professional fix: use TanStack Query for server state.
TanStack Query exists specifically to manage fetching, caching, synchronization, stale data, deduping, retries, mutation updates, and async server-state complexity.
[TanStack Query][tanstack-query]

The app should have:

```ts
useLibraryQuery()
useResolverPluginsQuery()
useCreateItemFromIdentifierMutation()
useCreateItemFromBibTeXMutation()
```

Then UI states become standard: pending, error, success, invalidated, refetching.

### The Command Palette Partially Reinvents Command Infrastructure

The app uses `cmdk`, but then wraps it in custom filtering, manual `selectedIndex`, manual keyboard handling, and manually constructed command arrays inside `App.tsx`.

This creates multiple risks: inconsistent keyboard behavior, hard-to-test commands, commands coupled to component closures, and command names/shortcuts not derived from a central registry.

Professional fix: use `cmdk` or shadcn `Command`, but create a real command registry:

```ts
type AppCommand = {
  id: CommandID;
  label: string;
  section: 'Library' | 'View' | 'Columns' | 'Resolver';
  shortcut?: Shortcut;
  enabled: (state: AppState) => boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
};
```

Then the palette renders the registry.
Menus, toolbar buttons, and shortcuts should reuse the same command objects.

### The Inspector Panel Is Too Bespoke and Too Visually Dense

`InspectorPanel.tsx` manually renders every metadata field as repeated blocks:

```tsx
<label>Title</label>
<div>{item.title || 'Untitled'}</div>
...
<label>DOI</label>
<div>{item.doi || '-'}</div>
```

This creates a lot of owned markup, inconsistent spacing, and hardcoded typography.
It also makes future field additions tedious.

Professional fix: use a `DataList`/description-list pattern or a field-rendering registry.

For example:

```ts
const inspectorFields = [
  { key: 'itemType', label: 'Item Type', render: renderItemType },
  { key: 'title', label: 'Title', render: renderTitle },
  { key: 'citekey', label: 'Citation Key', render: renderCitekey },
  ...
];
```

Then render with a standard `MetadataSection` and `MetadataField`. Radix Themes has `DataList`, `Text`, `Badge`, `Code`, `Separator`, and layout primitives that fit this directly.
[Radix UI][radix-themes]

### The App Uses "VSCode Aesthetic" as Styling Copy, Not Design Discipline

A VSCode-like interface can be appropriate: dense, keyboard-first, sidebar/tree/table/inspector, command palette, dark theme.
But the code copies surface traits: dark grays, tiny fonts, faux top bar, palette, dense table.

Professional implementation would instead copy the deeper system:

```text
one command registry,
real keyboard navigation,
real menu actions,
real status bar,
consistent density scale,
real focus model,
real split panels,
centralized theme tokens,
extension/plugin architecture,
diagnostics panel,
settings schema,
view state persistence.
```

Right now, "VSCode style" is mostly arbitrary Tailwind strings.

### Recommended Professional Stack

For this specific app, I would not use a heavy general design system like Material unless the goal is a generic web-app look.
The product is closer to a desktop data-management tool.

Recommended stack:

```text
React + Vite
Tailwind v4 with explicit @theme tokens
shadcn/ui or Radix Themes for components
TanStack Table for the central library grid
TanStack Query for server state
Zod for runtime schemas and config/import validation
React Hook Form for forms
Sonner for toasts
cmdk/shadcn Command for command palette
Resizable panels from shadcn or react-resizable-panels
Lucide icons only; remove emoji icons
```

If the grid becomes the core product and needs spreadsheet-grade interactions, replace TanStack Table with AG Grid Community/Enterprise depending on licensing needs.

### Highest-Value Cleanup Sequence

First: create a real token/theme layer and remove impossible Tailwind classes.
This immediately reduces visual inconsistency.

Second: replace the hand-rolled table with TanStack Table or AG Grid.
This removes the largest design and logic ownership burden.

Third: replace custom toasts, dialogs, buttons, menus, selects, metadata fields, and sidebars with one component system.

Fourth: move commands into a registry used by toolbar, menu, hotkeys, and command palette.

Fifth: move server-state loading/mutation into TanStack Query.

Sixth: replace form ad hoc state with schema-backed forms.

Seventh: remove fake chrome and demo residue: inert menu labels, macOS dots, AI Studio title, Gemini env vars, placeholder "Mock PDF Viewer," and emoji item icons.

The standard is not "make it look less ugly."
The standard is: every repeated visual or interaction pattern must either come from a mature library or from a small local design-system component.
Right now the app owns too much low-level UI behavior and too many raw visual decisions.

[tailwind-theme]: https://tailwindcss.com/docs/theme "Theme variables - Core concepts - Tailwind CSS"
[radix-themes]: https://www.radix-ui.com/themes/docs/overview/getting-started "Getting started - Radix Themes"
[shadcn-data-table]: https://ui.shadcn.com/docs/components/data-table "Data Table - shadcn/ui"
[tanstack-table-columns]: https://tanstack.com/table/latest/docs/guide/column-defs "Columns Guide | TanStack Table Docs"
[ag-grid-react]: https://www.ag-grid.com/react-data-grid/ "React Grid: Quick Start | AG Grid"
[radix-dark-mode]: https://www.radix-ui.com/themes/docs/theme/dark-mode "Dark mode - Radix Themes"
[react-aria]: https://react-spectrum.adobe.com/react-aria/index.html "React Aria"
[wcag-quickref]: https://www.w3.org/WAI/WCAG22/quickref/ "How to Meet WCAG (Quickref Reference)"
[zod]: https://zod.dev/ "Intro | Zod"
[tanstack-query]: https://tanstack.com/query/latest/docs/framework/react/overview "Overview | TanStack Query React Docs"
