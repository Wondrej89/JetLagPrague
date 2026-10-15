import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'apps/editor',
  envDir: '../..',
  base: './',
  plugins: [react()],
  resolve: { alias: { '@jetlag/geo-core': fileURLToPath(new URL('./packages/geo-core/src/index.ts', import.meta.url)) } },
  build: { outDir: '../../dist', emptyOutDir: true, rollupOptions: { output: { manualChunks: {
    react: ['react', 'react-dom'],
    map: ['leaflet', '@geoman-io/leaflet-geoman-free'],
    geo: ['@turf/turf', 'zod'],
  } } } },
});
