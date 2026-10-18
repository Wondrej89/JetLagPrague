import { readFile } from 'node:fs/promises';
import { readGameReleaseIndex, readGameReleaseArtifact } from '../packages/geo-core/src/game-release';
const index = readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json', 'utf8')));
for (const entry of index.versions) await readGameReleaseArtifact(await readFile(`data/releases/${entry.file}`, 'utf8'), entry);
console.log(`Ověřeno ${index.versions.length} neměnných herních verzí; aktuální ${index.current.releaseId}.`);
