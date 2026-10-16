import { copyFile, mkdir, readFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readPidCatalog } from '../packages/geo-core/src/index';
import { readPublication } from './pid-publication';

/** Copy the authoritative data branch, never download or build an upstream feed. */
export async function stagePidPublication(from: string, to: string): Promise<void> {
  const text = await readFile(join(from, 'index.json'), 'utf8'), catalog = readPidCatalog(JSON.parse(text));
  await readPublication(from);
  if (resolve(from) === resolve(to)) return;
  await mkdir(to, { recursive: true });
  for (const file of new Set([catalog.file, ...(catalog.versions ?? []).map(entry => entry.file)])) await copyFile(join(from, file), join(to, file));
  await copyFile(join(from, 'index.json'), join(to, 'index.json.tmp')); await rename(join(to, 'index.json.tmp'), join(to, 'index.json'));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const from = process.argv[process.argv.indexOf('--from') + 1];
  if (!process.argv.includes('--from') || !from) throw new Error('Použijte --from adresář publikace.');
  await stagePidPublication(resolve(from), resolve('apps/editor/public/pid'));
}
