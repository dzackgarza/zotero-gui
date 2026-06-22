test:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test

test-ci:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . test-ci

app-boot:
    @just -f ~/ai-review-ci/justfiles/bun.just -d . app-boot

build:
    bun run build

dev:
    bun run dev

api:
    bun run api

dev-full:
    bun run dev:full

diagnostic-live-vite-deps:
    bun run diagnostic:live-vite-deps

diagnostic-live-zotero-doctor:
    bunx tsx src/server/liveDiagnostics.ts doctor

diagnostic-live-resolvers:
    bunx tsx src/server/liveDiagnostics.ts resolvers

diagnostic-live-zotero-add-item:
    bunx tsx src/server/liveDiagnostics.ts add-item
