# Zotero GUI

A local web application for viewing your Zotero libraries and resolving/importing research papers directly to Zotero using custom resolver plugins.

## Prerequisites

- **Node.js**: Exactly `25.8.2`; the server uses `node:sqlite`.
- **Bun**: Used for dependency installation and local quality gates.
- **Zotero**: A local Zotero installation with the `zotero-local-write-api` plugin installed and reachable at the configured write endpoint.

## Installation

Install the dependencies:

```bash
bun install
```

## Usage

Start both the API backend and Vite frontend concurrently:

```bash
just dev-full
```

Open your browser and navigate to `http://localhost:3000` to interact with the GUI.

To run the components separately:

- API server: `just api` (starts on port 3001)
- Frontend: `just dev` (starts on port 3000)

After dependency changes, restart the frontend with `just dev` and hard-reload the browser tab.
The frontend recipe runs Vite with forced dependency optimization so stale `/node_modules/.vite/deps/` URLs are regenerated instead of reusing an outdated optimizer cache.
Use `just diagnostic-live-vite-deps` against the running frontend to verify that the current server is serving every optimized dependency recorded by Vite.

## Configuration

- `zotero-gui.config.json` is required at startup and must contain the server port, immutable Zotero DB URI, Zotero storage directory, resolver manifest path, resolver execution limits, and Zotero write endpoint.
- Resolver plugins are configured in `resolver-plugins.json` and defined in the `resolver-plugins/` directory.

## License

MIT
