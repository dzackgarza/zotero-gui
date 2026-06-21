test *args:
    npm run test -- {{args}}

# Regression guard: the suite must pass even when the caller's environment
# exports NODE_ENV=production (which otherwise loads react-dom's production
# test-utils build and breaks React.act). See testing-library/react#1392.
test-prod-env:
    NODE_ENV=production npm run test

# Offline gate run by the global pre-push hook. Excludes the live Zotero /
# resolver diagnostics, which require the local Zotero DB, write plugin, and
# network and are run on demand via the diagnostic-live-* recipes.
test-ci: lint test test-prod-env build

lint:
    npm run lint

build:
    npm run build

dev:
    npm run dev

api:
    npm run api

dev-full:
    npm run dev:full

diagnostic-live-vite-deps:
    npm run diagnostic:live-vite-deps

diagnostic-live-zotero-doctor:
    npx tsx src/server/liveDiagnostics.ts doctor

diagnostic-live-resolvers:
    npx tsx src/server/liveDiagnostics.ts resolvers

diagnostic-live-zotero-add-item:
    npx tsx src/server/liveDiagnostics.ts add-item
