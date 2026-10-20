/** One explicit addition to the immutable publication history. Normal builds never
 * regenerate this release; subsequent zoo decisions go through the editor/API. */
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import { createGameDataRelease, readGameReleaseIndex, readGameReleaseArtifact, releaseEntry, releasePoiSchema } from '../packages/geo-core/src/game-release';
import { poiSchema } from '../packages/geo-core/src/poi';
const directory = 'data/releases';
const index = readGameReleaseIndex(JSON.parse(await readFile(`${directory}/current.json`, 'utf8')));
const previous = await readGameReleaseArtifact(await readFile(`${directory}/${index.current.file}`, 'utf8'), index.current);
if (previous.data.pois.some(poi => poi.category === 'zoo')) throw new Error('Katalog již zoo obsahuje. Další změny publikujte z editoru; ruční rozhodnutí se nenahrazují výchozími.');
const catalog = JSON.parse(await readFile('apps/editor/src/data/poi-catalog.json', 'utf8'));
const zoos = (catalog.zoos as unknown[]).map(value => poiSchema.parse(value));
if (zoos.length !== 10 || zoos.some(poi => poi.category !== 'zoo' || poi.status !== 'approved')) throw new Error('Požadován výchozí schválený výběr deseti zoo.');
const data = structuredClone(previous.data);
for (const zoo of zoos) {
  data.pois.push(releasePoiSchema.parse({ id: zoo.id, category: zoo.category, name: zoo.name, address: zoo.address, point: zoo.point, geometry: zoo.geometry, sourceId: zoo.sourceId, source: { ...zoo.source, note: '' }, status: zoo.status, reviewedAt: zoo.reviewedAt }));
  if (!data.sourceVersions.some(source => source.key === `poi:${zoo.source.id}`)) data.sourceVersions.push({ key: `poi:${zoo.source.id}`, version: zoo.source.rawChecksum!, checksum: zoo.source.rawChecksum, provider: zoo.source.provider, url: zoo.source.url, dataDate: zoo.source.dataDate, license: zoo.source.license });
}
// Preserve the current approved/reference status and every existing data component.
// An expired approved PID cannot be silently re-dated: release validation rejects it.
const release = await createGameDataRelease(data, { publishedAt: new Date().toISOString(), kind: previous.kind });
const entry = await releaseEntry(release);
await writeFile(`${directory}/${entry.file}`, canonicalJson(release), { flag: 'wx' });
await writeFile(`${directory}/current.json`, `${JSON.stringify({ ...index, current: entry, versions: [...index.versions, entry] }, null, 2)}\n`);
console.log(JSON.stringify({ release: release.releaseId, schemaVersion: release.schemaVersion, zoos: zoos.length, unchangedPidChecksum: data.pidSnapshot.checksum }));
