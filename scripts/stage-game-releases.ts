import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readGameReleaseIndex, readGameReleaseArtifact } from '../packages/geo-core/src/game-release';
/** Validation precedes all staging writes; a failed publication cannot replace the staged catalog. */
export async function stageGameReleases(from: string, to: string) {
  const index = readGameReleaseIndex(JSON.parse(await readFile(join(from, 'current.json'), 'utf8')));
  for (const entry of index.versions) await readGameReleaseArtifact(await readFile(join(from, entry.file), 'utf8'), entry);
  if (resolve(from) === resolve(to)) return;
  await rm(to, { recursive: true, force: true }); await mkdir(to, { recursive: true });
  // Copy only allowlisted artifacts, never arbitrary files from the directory.
  for (const entry of index.versions) await cp(join(from, entry.file), join(to, entry.file));
  await cp(join(from, 'current.json'), join(to, 'current.json'));
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) await stageGameReleases('data/releases', 'apps/game/public/releases');
