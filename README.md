# Zotero GUI

A local web application for viewing your Zotero libraries and resolving/importing research papers directly to Zotero using custom resolver plugins.

## Prerequisites

- **Node.js**: Exactly `25.8.2`; the server uses `node:sqlite`.
- **Zotero**: A local Zotero installation with the `zotero-local-write-api` plugin installed and reachable at the configured write endpoint.

## Installation

Install the dependencies:

```bash
npm install
```

## Usage

Start both the API backend and Vite frontend concurrently:

```bash
npm run dev:full
```

Open your browser and navigate to `http://localhost:3000` to interact with the GUI.

To run the components separately:

- API server: `npm run api` (starts on port 3001)
- Frontend: `npm run dev` (starts on port 3000)

## Configuration

- `zotero-gui.config.json` is required at startup and must contain the server port, immutable Zotero DB URI, resolver manifest path, resolver execution limits, and Zotero write endpoint.
- Resolver plugins are configured in `resolver-plugins.json` and defined in the `resolver-plugins/` directory.

## License

MIT
