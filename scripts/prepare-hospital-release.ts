/** One explicit addition to the immutable publication history. Normal builds never
 * regenerate this release; subsequent hospital decisions go through the editor/API. */
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import { createGameDataRelease, readGameReleaseIndex, readGameReleaseArtifact, releaseEntry, releasePoiSchema } from '../packages/geo-core/src/game-release';
import { poiSchema } from '../packages/geo-core/src/poi';
const directory = 'data/releases';
const index = readGameReleaseIndex(JSON.parse(await readFile(`${directory}/current.json`, 'utf8')));
const previous = await readGameReleaseArtifact(await readFile(`${directory}/${index.current.file}`, 'utf8'), index.current);
if (previous.data.pois.some(poi => poi.category === 'hospital')) throw new Error('Katalog již nemocnice obsahuje. Další změny publikujte z editoru; ruční rozhodnutí se nenahrazují výchozími.');
const catalog = JSON.parse(await readFile('apps/editor/src/data/poi-catalog.json', 'utf8'));
const hospitals = (catalog.hospitals as unknown[]).map(value => poiSchema.parse(value));
if (hospitals.length !== 10 || hospitals.some(poi => poi.category !== 'hospital' || poi.status !== 'approved')) throw new Error('Požadován výchozí schválený výběr deseti nemocnic.');
const data = structuredClone(previous.data);
for (const hospital of hospitals) {
  data.pois.push(releasePoiSchema.parse({ id: hospital.id, category: hospital.category, name: hospital.name, address: hospital.address, point: hospital.point, geometry: hospital.geometry, sourceId: hospital.sourceId, source: { ...hospital.source, note: '' }, status: hospital.status, reviewedAt: hospital.reviewedAt }));
  if (!data.sourceVersions.some(source => source.key === `poi:${hospital.source.id}`)) data.sourceVersions.push({ key: `poi:${hospital.source.id}`, version: hospital.source.rawChecksum!, checksum: hospital.source.rawChecksum, provider: hospital.source.provider, url: hospital.source.url, dataDate: hospital.source.dataDate, license: hospital.source.license });
}
// Preserve the current approved/reference status and every existing data component.
// An expired approved PID cannot be silently re-dated: release validation rejects it.
const release = await createGameDataRelease(data, { publishedAt: new Date().toISOString(), kind: previous.kind });
const entry = await releaseEntry(release);
await writeFile(`${directory}/${entry.file}`, canonicalJson(release), { flag: 'wx' });
await writeFile(`${directory}/current.json`, `${JSON.stringify({ ...index, current: entry, versions: [...index.versions, entry] }, null, 2)}\n`);
console.log(JSON.stringify({ release: release.releaseId, schemaVersion: release.schemaVersion, hospitals: hospitals.length, unchangedPidChecksum: data.pidSnapshot.checksum }));
