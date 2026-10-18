import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'apps/editor',
  envDir: '../..',
  base: './',
  // Worker-only dependencies must be ready before the first file selection;
  // a late optimizer reload would otherwise discard an open import dialog.
  optimizeDeps: { include: ['@zip.js/zip.js', 'shpjs', 'proj4', 'geos-wasm'] },
  plugins: [react(), { name: 'editor-dev-release-catalog', configureServer(server) {
    server.middlewares.use('/releases', async (request, response, next) => {
      const file = request.url?.split('?')[0].slice(1);
      if (!file || !/^(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(file)) return next();
      try { const text = await readFile(new URL(`./data/releases/${file}`, import.meta.url)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Cache-Control', 'no-store'); response.end(text); }
      catch { response.statusCode = 404; response.end('Publikace není dostupná.'); }
    });
  } }],
  resolve: { alias: { '@jetlag/geo-core': fileURLToPath(new URL('./packages/geo-core/src/index.ts', import.meta.url)) } },
  build: { outDir: '../../dist/editor', emptyOutDir: true, rollupOptions: { output: { manualChunks: {
    react: ['react', 'react-dom'],
    map: ['leaflet', '@geoman-io/leaflet-geoman-free'],
    geo: ['@turf/turf', 'zod'],
  } } } },
});
