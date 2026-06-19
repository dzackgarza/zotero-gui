test *args:
    npm run test -- {{args}}

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
