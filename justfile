# ai-review-ci contract variables consumed by doctor and workflow installers.
ai_review_ci_schema_version := "1"
ai_review_ci_profile := "bun-playwright"
ai_review_ci_ref := "main"
ai_review_ci_release_channel := "main"
ai_review_ci_workflow_template_version := "1"
ai_review_ci_local_delegation := "global-justfile"
ai_review_ci_default_branch := "main"

# Run commit-tier Bun QC through the central implementation.
test-commit:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-commit

# Run the full Bun test suite before pushing.
test-push:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-push

# Run CI acceptance QC through the central implementation.
test-ci:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-ci

app-boot:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . app-boot

build:
    bun run build

dev:
    bun run dev:full

api:
    bun run api

diagnostic-live-vite-deps:
    bun run diagnostic:live-vite-deps

diagnostic-live-zotero-doctor:
    bunx tsx src/server/liveDiagnostics.ts doctor

diagnostic-live-resolvers:
    bunx tsx src/server/liveDiagnostics.ts resolvers

diagnostic-live-zotero-add-item:
    bunx tsx src/server/liveDiagnostics.ts add-item
