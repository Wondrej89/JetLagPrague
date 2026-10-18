import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist/site', { recursive: true, force: true });
await mkdir('dist/site', { recursive: true });
await cp('dist/game', 'dist/site', { recursive: true });
await cp('dist/editor', 'dist/site/editor', { recursive: true });
console.log('GitHub Pages připraveny: dist/site/ a dist/site/editor/.');
