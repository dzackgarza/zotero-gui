# Zotero GUI

A local web application for viewing your Zotero libraries and resolving/importing research papers directly to Zotero using custom resolver plugins.

## Prerequisites

- **Node.js**: Version 18 or higher (uses `node:sqlite`).
- **Zotero**: A local Zotero installation with a database located at `~/Zotero/zotero.sqlite`.

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

- **Database Path**: The server reads from `file:///home/dzack/Zotero/zotero.sqlite?immutable=1` by default.
- **Resolvers**: Plugins are configured in `resolver-plugins.json` and defined in the `resolver-plugins/` directory (e.g., arXiv, DOI, ISBN, and zbMATH).

## License

MIT
