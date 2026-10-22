import { cp, mkdir, rm } from 'node:fs/promises';
await rm('dist/site', { recursive: true, force: true });
await mkdir('dist/site', { recursive: true });
await cp('dist/game', 'dist/site', { recursive: true });
await cp('dist/editor', 'dist/site/editor', { recursive: true });
await cp('dist/simulator', 'dist/site/simulator', { recursive: true });
console.log('GitHub Pages připraveny: veřejná hra, editor a samostatný prohlížečový simulátor.');
