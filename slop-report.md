# Repository Audit Report: `zotero-gui`

An audit of the `zotero-gui` repository has been conducted to identify structural code quality issues, testing gaps, architectural slop, and hardcoded values that should be externalized to the configuration level.

---

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
* **Slop Pattern**: **Testing/Observability Neglect**. The test mounts `App` and instantly checks for a header element. However, the component asynchronously fetches data on mount via `loadFromApi`. Because the test ends immediately without awaiting this promise or verifying the loading state's resolution, the state update fires in the background after the test block finishes, causing vitest/testing-library warnings.

#### Finding B: Mock-First Evasion
* **Location**: [src/App.test.tsx:L21-L24](file:///home/dzack/gitclones/zotero-gui/src/App.test.tsx#L21-L24)
* **Slop Pattern**: **Mock-First Evasion**. The test suite mocks `global.fetch` to return empty datasets. While testing UI components without a live backend is standard, the test only verifies that the header text renders and does not assert actual data flow, error paths, or state transitions, serving as "smoke test" scaffolding rather than a rigorous functional proof.

---

### 2. Client-Side Simulation & Progress Theater
#### Finding A: Non-Persisted Modification Operations
* **Locations**: 
  * [src/App.tsx:L248-L271 (handleAddNewItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L248-L271)
  * [src/App.tsx:L282-L312 (handleDeleteItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L282-L312)
  * [src/App.tsx:L314-L330 (handleDuplicateItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L314-L330)
* **Slop Pattern**: **Progress Theater / Scaffolding**. The frontend UI implements complex local handlers to add mock draft items, duplicate records, and delete/trash items. However, there are no endpoints in [src/server/server.ts](file:///home/dzack/gitclones/zotero-gui/src/server/server.ts) to update or delete items in the local SQLite database. Refreshing the browser or clicking the "Sync" button silently resets all client changes, creating a simulated UX that does not match actual database reality.

---

### 3. Dead Code & Unused Callback Paths
#### Finding A: Unused `onUpdateItem` Prop Pipeline
* **Locations**:
  * [src/App.tsx:L278-L280 (handleUpdateItem)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L278-L280)
  * [src/App.tsx:L997 (prop passing)](file:///home/dzack/gitclones/zotero-gui/src/App.tsx#L997)
  * [src/components/InspectorPanel.tsx:L39 & L52 (prop definition)](file:///home/dzack/gitclones/zotero-gui/src/components/InspectorPanel.tsx#L39)
* **Slop Pattern**: **Dead Code Accumulation**. The `onUpdateItem` callback prop is wired from `App` down to `InspectorPanel` to support modifying record fields. However, the `InspectorPanel` layout only contains read-only text elements for bibliographic fields and never invokes `onUpdateItem`.

---

### 4. Fallback Placeholder Slop
#### Finding A: Injected Default Creator Values
* **Location**: [src/utils/bibtexParser.ts:L58](file:///home/dzack/gitclones/zotero-gui/src/utils/bibtexParser.ts#L58)
* **Slop Pattern**: **Plausible Fixture Injection / Fallback Compulsion**. If a BibTeX source lacks an author, the parser falls back to:
  ```typescript
  [{ firstName: '', lastName: 'Unknown Author', creatorType: 'author' }]
  ```
  Zotero naturally supports items with empty author/creator arrays. Injecting a hardcoded `"Unknown Author"` creator is a soft default that pollutes Zotero libraries with artificial creator entries instead of leaving the field clean.

---

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
* **Impact**: Assumes Zotero is running on default port `23119` and targets user `0`'s personal library. Group libraries or custom port layouts cannot be configured.
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
*   **Locations**:
    *   `src/server/server.ts`: Hardcoded `DB_URI`, `PORT`, and `RESOLVER_CONFIG_PATH`.
    *   `src/server/resolverPlugins.ts`: Hardcoded Zotero API endpoint.
    *   `src/server/server.ts`: The `queryLibrary` function.
*   **Slop Pattern**: **Tight Coupling** and **Accidental Complexity**.
*   **Analysis**: The application is fundamentally brittle due to hardcoded paths and a monolithic data access function (`queryLibrary`).
    1.  The hardcoded `DB_URI` (`'file:///home/dzack/Zotero/zotero.sqlite?immutable=1'`) makes the application entirely non-portable.
    2.  The `queryLibrary` function is a single, massive block of code that directly executes seven complex SQL queries against the Zotero SQLite database and then performs extensive in-memory data shaping. This creates an extremely tight coupling to the database schema. Any change in the Zotero database will cause this function, and thus the entire application, to fail. This is a classic example of a system that is difficult to maintain and impossible to test in isolation.
*   **Why it Matters**: This combination of hardcoded values and monolithic data access makes the application a "works on my machine" toy, not a reusable tool. It cannot be configured, deployed, or maintained by anyone other than the original author without significant code changes.

### 2. Medium-Severity: Misleading UI and Dead Code

#### Finding: Client-Side Simulation and Dead Prop-Drilling
*   **Locations**:
    *   `src/App.tsx`: `handleAddNewItem`, `handleDeleteItem`, `handleDuplicateItem` functions.
    *   `src/App.tsx` and `src/components/InspectorPanel.tsx`: The `onUpdateItem` prop.
*   **Slop Pattern**: **Progress Theater** and **Dead Code Accumulation**.
*   **Analysis**: The frontend provides UI controls for adding, deleting, and updating items. However, these controls only manipulate local React state. There are no backend API endpoints to persist these changes. This creates a misleading user experience where all changes are silently lost on refresh. The `onUpdateItem` callback is passed down through components but is never called, representing dead code that adds to the cognitive load of maintenance.

### 3. Low-Severity: Data Pollution and Testing Gaps

#### Finding: Fallback Slop and Mock-First Evasion
*   **Locations**:
    *   `src/utils/bibtexParser.ts`: The fallback to an "Unknown Author" creator.
    *   `src/App.test.tsx`: The use of `global.fetch` mocks.
*   **Slop Pattern**: **Plausible Fixture Injection** and **Mock-First Evasion**.
*   **Analysis**:
    1.  Injecting a hardcoded "Unknown Author" when a BibTeX entry lacks one pollutes the Zotero library with artificial data instead of preserving the absence of an author.
    2.  The application's primary test suite mocks the API fetch but only asserts that a header renders. It does not test any data flow, error handling, or state transitions, making it a smoke test that provides a false sense of security. The `act(...)` warnings indicate that asynchronous state updates are not being properly handled in tests.
