# Policy-Aligned Slop Report: `zotero-gui`

This report is the current remediation source for `zotero-gui`. It replaces the earlier accumulated audit text, which mixed useful findings with stale portability, environment-variable, smoke-test, and generic design-system recommendations.

The app is bespoke software for one local Zotero setup.
The goal is not portability, graceful degradation, or broad product hardening.
The goal is a read-mostly Zotero GUI with one owned write path:

- user supplies an identifier or source string;
- a configured resolver plugin converts that string to exactly one BibTeX entry;
- the server validates that BibTeX;
- the server sends it to the configured Zotero local write plugin endpoint;
- the server reloads the created item from Zotero and returns the visible item.

Every other Zotero metadata mutation is out of scope unless a new write boundary is explicitly designed and proved.

## Policy Frame

Use this report with these rules.

- Required runtime values belong in `zotero-gui.config.json`, validated at startup.
  Do not replace config with `process.env` chains, `os.homedir()` discovery, port defaults, or "if available" probing.
- The GUI reads Zotero metadata.
  It may add an item only through the resolver to BibTeX to Zotero local write plugin path.
- The app must fail loudly on malformed config, unsupported Zotero DB shape, invalid resolver output, unsupported item types, and failed Zotero write visibility.
- The app must not write Zotero SQLite directly.
- Tests that use mocks, shape checks, text-only assertions, status-only assertions, or visibility-only assertions do not prove the main contract.
- Live external checks belong in explicit diagnostic recipes.
  Normal `just test` must use local fixtures and real process or route boundaries.
- Unknown Zotero item types must fail until deliberately admitted to the owned union.
  Do not model unknown item types as ordinary strings.
- Duplicate detection and deduplication are out of scope for add-item proof.
  A successful add proof means the newly created Zotero item becomes visible through the read API after Zotero settles.

## Stale Frames Removed From The Earlier Report

The earlier report identified real symptoms but sometimes named the wrong obligation.
Do not implement these stale remediations.

| Earlier frame | Why it is wrong | Correct frame |
| --- | --- | --- |
| Move hardcoded paths to environment variables or `os.homedir()` | This creates ambient discovery and runtime defaults. | Require a complete checked-in config file and validate it before startup. |
| Use `process.env.PORT \|\| 3001` | This is a runtime default and a branch around required config. | The server port is required config. If it is wrong, startup fails. |
| Solve DB path issues as portability problems | This is single-user bespoke software. | The real problem is an undeclared runtime contract. |
| Treat mocked UI tests as standard component proof | Mocks do not prove the app boundary. | Component tests may exist, but proof must cross owned route/process/schema boundaries. |
| Put live resolver checks in normal tests or call them smoke tests | Live network checks are nondeterministic; smoke labels launder weak proof. | Keep local fixture proof in `just test`; make live diagnostics explicit and opt-in. |
| Model unknown Zotero item types as `string` | This hides unsupported data behind normal execution. | Admit observed item types deliberately, or fail. |
| Adopt a "professional stack" wholesale | Generic stack adoption is not a proof obligation. | Use mature dependencies only where they reduce current owned complexity. |
| Keep JSON import or direct BibTeX import as implied workflows | Those workflows undermine the read-mostly boundary unless explicitly retained. | The owned add path is source string to resolver plugin to BibTeX to Zotero write endpoint. |

## Already Addressed

These findings are no longer open in the same form.

- The server has a `createApp(deps)` boundary, and startup logic is isolated in `src/server/main.ts`.
- Runtime config is parsed with a strict Zod schema from `zotero-gui.config.json`.
- Generic local-only item CRUD controls and command-palette actions were removed.
- The add workflow now uses `/api/items/from-source` with `{ input, resolverId, collections }`.
- Resolver plugins declare IDs, names, commands, and accepted input descriptors.
- Resolver execution uses explicit cwd, timeout, stdout/stderr byte limits, stdin input, and exactly-one-BibTeX validation.
- `/api/resolver-plugins` returns UI-safe plugin metadata.
- `/api/items/from-bibtex` is not public.
- Frontend library loading parses the `/api/library` payload with Zod before state enters React.
- `ItemType` no longer collapses to `string`; unsupported types fail.
- Standalone Zotero attachment items are now admitted and mapped instead of crashing `/api/library`.
- Shared selectors own collection descendants, trash, duplicates, unfiled, missing PDF, missing extraction, nonstandard citekey, search, and sorting.
- Fixture SQLite route coverage proves `/api/library` mapping for real rows, nested collections, tags, notes, child attachments, trash, and standalone attachments.
- Read-only UI coverage checks that the local-only mutation controls are absent.
- The live Zotero add-item proof passed only after the installed local write plugin exposed the required write operation.

These completed items do not close the remaining obligations below.

## Open Findings

### Zotero DB Contract Is Still Implicit

**Evidence**

- `queryLibrary()` still issues a large set of Zotero SQLite queries and maps rows in one place.
- The app now fails when it sees unsupported data, as the standalone attachment incident showed, but there is no first-class preflight that checks the required DB contract before the server starts serving requests.

**Real problem**

The app depends on a declared foreign schema but validates that schema incidentally while serving `/api/library`. That pushes environment faults into request-time 500s and makes each new observed Zotero shape a runtime surprise.

**Required correction**

Add a `zotero doctor` or equivalent preflight subsystem that runs before `listen`. It must verify the configured DB opens through the declared immutable URI, is a Zotero DB, has the required tables, required columns, required item types, required field names, coherent parent-child links, coherent collections, and representative rows accepted by the row parsers.

After preflight passes, core mapping code should assume the declared contract.
Do not add defensive fallbacks around every query.

**Proof gate**

- A fixture DB with the supported shape passes preflight and `/api/library`.
- Fixture DBs with missing required tables, missing required fields, unsupported item types, broken parent links, and malformed representative rows fail before the app starts serving.
- The live configured Zotero DB passes preflight before the server listens.

### `queryLibrary()` Still Owns Too Much

**Evidence**

- `src/server/server.ts` still contains SQL, row parsing, domain mapping, collection semantics, trash semantics, notes, attachments, and API payload construction in `queryLibrary()`.

**Real problem**

The route boundary is now testable, but the Zotero repository boundary is still too large to reason about.
The standalone attachment bug was a mapping-contract miss inside this monolith.

**Required correction**

Extract a Zotero repository layer and row mapper layer.
Keep SQL row schemas close to the queries.
Keep domain mappers close to the `ZoteroItem` contract.
Keep route code responsible only for HTTP wiring and payload parsing.

This is not a request for generic architecture.
It is a request to make the Zotero DB contract explicit enough that future observed schema gaps do not require editing a single opaque function.

**Proof gate**

- Existing fixture route tests still pass through `createApp(deps)`.
- New mapper tests use real row-shaped fixture data and assert exact Zotero item output.
- No mapper test asserts only shape, count, or non-null existence.

### Runtime SQLite Contract Is Split

**Evidence**

- The server imports `node:sqlite`.
- `package.json` also declares `better-sqlite3` and `@types/better-sqlite3`.
- `package.json` pins Node to `25.8.2`, but README still describes Node.js 18 or higher.

**Real problem**

The project currently has two database dependency stories.
That is not a portability issue.
It is an ownership issue: one runtime contract must be authoritative.

**Required correction**

Choose one SQLite boundary.
If the project keeps `node:sqlite`, remove unused `better-sqlite3` dependencies and make Node `25.8.2` the single documented runtime.
If the project switches to `better-sqlite3`, remove `node:sqlite` imports and stop requiring the Node-owned SQLite surface.

Do not keep both without an explicit adapter and proof for both.

**Proof gate**

- `just lint`, `just test`, and `just build` pass under the declared Node runtime.
- Dependency and README claims match the runtime actually imported by server code.

### Error Semantics Are Too Coarse

**Evidence**

- Express middleware currently converts every thrown error to HTTP 500.

**Real problem**

The API cannot distinguish invalid user input, unknown resolver IDs, resolver process failure, Zotero write failure, malformed Zotero responses, and internal bugs.
This does not require graceful recovery, but it does require honest failure classification at the HTTP boundary.

**Required correction**

Introduce structured error classes or a single typed error boundary.
Validation errors should be client errors.
Unknown resolver IDs should be not-found errors.
Resolver process failures and Zotero write failures should be upstream boundary errors.
Internal invariant violations should remain 500s.

Do not log and continue.
Do not return partial success.
Do not suppress diagnostic stderr from resolver failures.

**Proof gate**

- Route tests construct real requests through `createApp(deps)` and assert status class plus structured error kind.
- Tests do not assert copied diagnostic strings as the proof.

### TypeScript Still Allows Escape Hatches

**Evidence**

- `tsconfig.json` still lacks `strict`.
- It still enables `allowJs` and `skipLibCheck`.

**Real problem**

The project reads a foreign DB, parses plugin manifests, runs processes, parses BibTeX, and exposes API payloads.
Those are exactly the boundaries where weak TypeScript settings hide defects.

**Required correction**

Enable strict TypeScript settings and remove escape hatches from owned code.
Use Zod or narrow row schemas at external boundaries.
Use total owned types after the boundary.

Do not replace `any` with `unknown as`. Do not use `Partial` for core library state.

**Proof gate**

- `just lint` runs with strict settings.
- Searches for `any`, `unknown as`, `Partial<`, `@ts-ignore`, and `@ts-expect-error` show no owned-code escape hatches except explicitly justified external type shims.

### Test Environments And Proof Boundaries Are Blurred

**Evidence**

- Vitest still uses global `jsdom`.
- Some tests are component-level and use spies or mocked callbacks.
- Server tests and resolver process tests need a Node environment, not a browser environment.

**Real problem**

The suite mixes proof-bearing route/process tests with UI rendering tests under one environment.
That makes it easy to count weak UI tests as proof of server, resolver, or DB behavior.

**Required correction**

Split Vitest configuration by owned boundary.
Server and resolver tests run in Node.
React component tests run in jsdom.
Live resolver or live Zotero checks are explicit diagnostics outside normal `just test`.

Component tests may use spies for callback wiring, but they must not be cited as proof of resolver, write, or DB behavior.

**Proof gate**

- `just test` runs local deterministic tests only.
- Resolver proof uses real fixture executable processes.
- Library proof uses fixture SQLite and `createApp(deps)`.
- Live diagnostics have separate recipes and names that do not use "smoke" as proof language.

### App-Level Ownership Is Still Too Broad

**Evidence**

- `App.tsx` still owns theme selection, localStorage persistence, column resizing, column ordering, keyboard shortcuts, command wiring, export, toast state, selection, modal orchestration, and layout class mapping.
- `LibraryTable` is extracted, but it still receives many low-level state and handler props from `App.tsx`.

**Real problem**

The earlier local CRUD theater was removed, but the top-level component still owns too many unrelated responsibilities.
This makes future behavior changes hard to prove without mounting the whole app.

**Required correction**

Extract only ownership boundaries that reduce real complexity:

- column layout state and persistence;
- theme state and token mapping;
- selection and expansion state;
- command registry and execution context;
- toast host;
- table grid state if manual table behavior remains.

Do not split components cosmetically.
Each extraction must move a real responsibility and have a proof path.

**Proof gate**

- App-level tests cover user-visible workflow only.
- Selector, command, column, and theme logic have direct tests only where those modules own nontrivial behavior.

### UI Still Contains Demo And False-Affordance Residue

**Evidence**

- The app still contains fake desktop chrome, inert menu labels, emoji item icons, placeholder "Mock PDF Viewer" text, AI Studio or Gemini residue in scaffold files, and many raw one-off Tailwind classes.

**Real problem**

These surfaces misrepresent what the app can do.
They also scatter visual decisions so repeated UI patterns cannot be changed in one place.

**Required correction**

Remove fake affordances or make them real.
Replace emoji item icons with one icon system.
Replace placeholder reader language with an honest local-Zotero handoff.
Remove scaffold metadata and dependencies that are not part of the product.
Introduce a small token or component layer only where repeated visual decisions exist.

Do not adopt a large design system merely because the report says "professional stack."
Use a mature library when the app is currently hand-owning complex behavior such as table state, command palette selection, resizable panels, forms, or accessible menus.

**Proof gate**

- Visual residue searches for AI Studio, Gemini, "Mock", and emoji item icons return no product UI hits.
- Repeated color, radius, spacing, and density decisions have a single local token or component owner.
- Browser checks confirm the main library, sidebar, inspector, command palette, and add workflow still render without overlap.

### Server State And Command Infrastructure Need A Real Ownership Decision

**Evidence**

- `useLibraryApi` hand-owns fetch, loading, error, and reload state.
- `CommandPalette` uses `cmdk` but also owns manual selected-index behavior and custom filtering.
- `appCommands.ts` is extracted, but commands are still closures assembled by `App.tsx`.

**Real problem**

This is not automatically a demand for TanStack Query or shadcn.
The real issue is that server-state invalidation and command execution have not been given explicit contracts.

**Required correction**

Choose one of two policy-aligned paths for server state:

- keep the small hook, but define exact pending, loaded, failed, and reloading states and prove add-item invalidates through `reloadLibrary`;
- adopt TanStack Query only if caching, invalidation, cancellation, and mutation semantics are now real product complexity.

Choose one command path:

- use `cmdk` selection/filtering behavior directly; or
- own a typed command registry and prove toolbar, shortcuts, and palette share it.

Do not keep two overlapping selection systems.

**Proof gate**

- Add-item success proves the library reloads and the created item is visible.
- Command tests prove commands are absent or present by owned command IDs and effects, not by copied display strings alone.

## Required Proof Matrix

| Obligation | Required proof |
| --- | --- |
| Config contract | Startup/config tests with complete config and malformed config. No runtime defaults. |
| Zotero DB contract | Doctor/preflight fixture tests plus live configured DB preflight. |
| Library mapping | Fixture SQLite through `createApp(deps)` and exact mapped payload assertions. |
| Resolver manifest | Fixture manifest tests for duplicate IDs, command shape, accepted-input contracts, and unmatched input before spawn. |
| Resolver process | Real fixture executable process tests for stdin, cwd, timeout, output limits, stderr diagnostics, and invalid BibTeX rejection. |
| Add item | Live Zotero local write plugin diagnostic: create marked item, reload, verify visibility, clean up through owned write boundary when supported. |
| Read-only GUI | UI tests that prove local-only mutation controls and commands are absent. |
| Selectors | Shared selector tests for descendants, trash, duplicates, unfiled, missing PDF, missing extraction, citekey, search, and sorting. |
| Type safety | Strict TypeScript gate with no owned-code escape hatches. |
| UI residue | Browser or component checks for the main workflows after removing fake affordances and scaffold text. |

## Correct Remediation Order

Use this order when continuing the work.

- Establish the Zotero DB doctor and preflight boundary.
- Split `queryLibrary()` into repository queries and row-to-domain mappers.
- Resolve the SQLite runtime contract.
- Tighten TypeScript and remove owned-code escape hatches.
- Split test environments and keep live diagnostics out of normal tests.
- Classify API errors without weakening hard-fail behavior.
- Reduce `App.tsx` by ownership boundary, not by cosmetic component count.
- Remove demo residue and centralize repeated UI decisions.
- Decide whether the current table, command, form, toast, and server-state complexity justifies mature libraries; adopt only where it deletes real owned behavior.

## Non-Goals

- Portability for unknown users.
- Multiple Zotero profiles or group-library support unless explicitly configured and proved.
- Silent fallback to another DB, port, resolver manifest, API endpoint, or plugin.
- Local-only Zotero metadata edits.
- Direct SQLite writes.
- JSON import replacing React state.
- Direct pasted-BibTeX import as a public route unless explicitly restored.
- Deduplication.
- Smoke-test or mock-based proof.
- Adopting a design stack as a substitute for proving behavior.
