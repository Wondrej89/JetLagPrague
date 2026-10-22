import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: 'apps/game', envDir: '../..', base: './', plugins: [react(), { name: 'game-without-editor', generateBundle() { for (const id of this.getModuleIds()) if (/apps\/(?:editor|simulator)\/|node_modules\/(?:@geoman-io|geos-wasm|shpjs|proj4|@zip\.js)\//.test(id)) this.error(`Veřejná hra importuje knihovnu editoru: ${id}`); } }],
  resolve: { alias: { '@jetlag/geo-core': fileURLToPath(new URL('./packages/geo-core/src/index.ts', import.meta.url)) } },
  build: { outDir: '../../dist/game', emptyOutDir: true, manifest: true },
});
