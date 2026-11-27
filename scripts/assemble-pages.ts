import { cp, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export async function assemblePages(dist = 'dist') {
  const site = join(dist, 'site');
  await rm(site, { recursive: true, force: true });
  await mkdir(site, { recursive: true });
  await cp(join(dist, 'game'), site, { recursive: true });
  await cp(join(dist, 'editor'), join(site, 'editor'), { recursive: true });
  await cp(join(dist, 'simulator'), join(site, 'simulator'), { recursive: true });
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  await assemblePages();
  console.log('GitHub Pages připraveny: veřejná hra, editor a samostatný prohlížečový simulátor.');
}
