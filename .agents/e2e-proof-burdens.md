# E2E Proof Burdens

This file is the review contract for the Zotero GUI Playwright suite. It is
agent-facing test doctrine for this repository, not product documentation.

## Current Failure

The current suite contains a laundering test:

- `tests/e2e/app-workflows.spec.ts` seeds
  `localStorage['zotero-gui:columns:v1']` with the old array-shaped column layout.
- The test expects `Application Render Error` and the absence of the library row.
- That assertion proves the app can crash. It does not prove a supported user story.

That test must not be preserved, renamed, or relabeled. Its intention is valid:
old persisted column layout can exist in a real browser profile after the TanStack
table migration. The implementation is invalid: a generic React render boundary is
not an acceptable product behavior or proof surface.

## Proof Rules

Every E2E test must identify the user story it proves and the owned boundary it
crosses. A line is proof-bearing only if a plausible broken implementation would
fail it.

Banned in this suite:

- expecting `Application Render Error` as a successful outcome;
- using generic no-crash, no-console-error, or visibility-only checks as the proof;
- proving helper behavior when the claim is browser/API behavior;
- asserting exact internal error text instead of owned structured route semantics;
- seeding impossible state solely to force a branch;
- using fixture API responses that cannot arise at the corresponding owned boundary;
- counting a setup or synchronization assertion as proof.

Allowed setup assertions may wait for a page, dialog, row, request, or route. They
cannot be cited as proof unless the visible state is itself the user-owned result.

## User Stories And Burdens

### Boot With Existing Browser State

User story: a returning user opens the app in the same browser profile after a
column-layout persistence migration.

Owned boundary: browser localStorage -> `readColumnLayout()` -> `useLibraryTable()`
-> rendered library table.

Proof burden:

- Seed the old array-shaped column layout that existed before the current v2 object
  schema.
- Navigate through the real Playwright page and fixture API.
- Prove the library boots and renders the canonical fixture item.
- Prove the old shape is replaced by the current persisted object shape with the
  expected column state.
- Prove the generic render boundary does not appear as the user-facing outcome.

This is a migration burden, not a fail-loud burden. The old array shape is a real
historical state produced by this app, so treating it as corrupted arbitrary input
would break a returning user.

### Boot With Corrupt Browser State

User story: a local browser profile contains malformed column-layout data that was
not produced by a supported app version.

Owned boundary: browser localStorage -> column layout persistence boundary ->
user-facing recovery or explicit storage-boundary failure.

Proof burden:

- Seed malformed JSON or a structurally impossible layout that is not the historical
  array shape.
- Prove the app does not silently fabricate a successful table state.
- Prove the user sees an explicit column-layout storage failure surface with an
  action that repairs or clears only the column-layout key.
- Prove the repair action boots the library table using the canonical default
  columns against the fixture API.

This is not permission to crash through `ErrorBoundary`. The boundary must be
owned and actionable.

### Startup Availability

User story: Zotero is unavailable at startup, then becomes available without a page
reload.

Owned boundary: browser -> `/api/startup` -> startup status -> `/api/library` ->
ready library state.

Proof burden:

- Use the fixture API to return an unavailable startup response followed by an OK
  response.
- Prove the unavailable state renders the Zotero-specific recovery view.
- Click the visible reload action.
- Prove the recovered fixture item appears.
- Prove no generic render boundary is used.

### Library Load Failure

User story: the backend route cannot load the library from Zotero.

Owned boundary: browser -> `/api/library` route failure -> library-load failure view.

Proof burden:

- Trigger the fixture route failure through the real browser request path.
- Prove the route failure is rendered by the app's library-load failure surface.
- Prove the reload action remains available.
- Do not prove this through a generic React render error.

### Collection Reconciliation After Reload

User story: a selected collection disappears after the live library is reloaded.

Owned boundary: selected collection state -> reload request -> updated collection
payload -> visible item set.

Proof burden:

- Select a real collection from the first fixture payload.
- Trigger the real sync/reload control.
- Prove the selection is reconciled to a valid view from the second payload.
- Prove items from the removed collection are not still shown.

### Add Item Through Resolver And Write Boundary

User story: a user resolves a DOI and imports it into the selected real Zotero
collection.

Owned boundary: modal input -> resolver metadata -> resolver process -> write API
payload -> success state.

Proof burden:

- Use visible resolver metadata from the fixture manifest.
- Submit a DOI through the dialog.
- Prove the fixture write boundary receives the selected real collection key.
- Prove the UI reports the successful import.
- Do not count dialog existence or option visibility alone as proof.

### Attachment Open Failure

User story: a user opens an attachment whose stored path is missing.

Owned boundary: selected item -> `/api/attachments/:id/open` route -> structured
route error -> app toast.

Proof burden:

- Select the fixture item with the missing-path attachment.
- Invoke the visible open action.
- Prove the route returns the structured error kind.
- Prove the app displays the route-owned error to the user.

### Citation Command Semantics

User story: a user copies a citation for a citable item and is blocked from citing
a standalone attachment.

Owned boundary: selected item -> command palette action -> citation formatter or
item-type rejection -> clipboard/toast result.

Proof burden:

- Select a citable fixture item and invoke the command through the command palette.
- Prove the clipboard contains a citation with fixture-owned bibliographic content.
- Select a standalone attachment and invoke the same command.
- Prove the previous clipboard value is not replaced by a fabricated attachment
  citation.
- Prove the user-facing rejection is shown.

### Toast Lifetime

User story: a second toast gets its own full display lifetime rather than inheriting
the first toast's remaining timer.

Owned boundary: two real commands -> toast scheduler -> visible toast state over
time.

Proof burden:

- Trigger two real user commands that each create a toast.
- Use deterministic Playwright time control if available; otherwise keep timing
  assertions bounded and specific.
- Prove the second toast remains visible for its own lifetime and then disappears.

## Subagent Assignment Contract

Subagents must write tests against the user stories above, not against the current
implementation's error messages. They must return:

- the user stories they covered;
- the file edits made;
- the proof-bearing assertions and what broken implementation each assertion would
  reject;
- any burden left unresolved.

Subagent output is rejected if it:

- preserves the crash-as-proof test;
- adds helper-only proof for a browser/API obligation;
- adds source-policing assertions to product tests;
- uses mock, fake, or direct component rendering as the E2E proof;
- deletes a problematic test without replacing the original proof burden.

## Reviewer Checklist

Review subagent test work by asking what the work proves about the task's
correctness, based on exact line-level evidence. Self-reports, file existence, green
test output, and broad "no render error" checks are not sufficient.

For every changed or added test, classify each assertion as one of:

- proof-bearing;
- setup or synchronization;
- policing that belongs in global QC;
- laundering;
- junk-tolerant.

Keep only tests whose proof-bearing assertions discharge the named user story.
