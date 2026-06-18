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
