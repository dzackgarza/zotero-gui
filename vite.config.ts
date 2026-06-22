import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {CONFIG_PATH, loadAppConfig} from './src/server/config.js';

function configPathForViteMode(mode: string): string {
  if (mode === 'e2e') {
    return path.resolve(__dirname, 'zotero-gui.e2e.config.json');
  }
  return CONFIG_PATH;
}

export default defineConfig(({mode}) => {
  const apiPort = loadAppConfig(configPathForViteMode(mode)).server.port;
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      proxy: {
        '/api': `http://127.0.0.1:${apiPort}`,
      },
    },
  };
});
