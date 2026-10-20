/** One addition of the newly verified default libraries. Later administrator
 * decisions continue through the existing authenticated publishing workflow. */
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalJson, createGameDataRelease, isLibraryLocationVerified, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, releasePoiSchema, poiSchema } from '../packages/geo-core/src/index';

const directory = 'data/releases';
const index = readGameReleaseIndex(JSON.parse(await readFile(`${directory}/current.json`, 'utf8')));
const previous = await readGameReleaseArtifact(await readFile(`${directory}/${index.current.file}`, 'utf8'), index.current);
if (previous.data.pois.some(poi => poi.category === 'library')) throw new Error('Katalog již knihovny obsahuje. Další rozhodnutí publikujte z editoru.');
const catalog = JSON.parse(await readFile('apps/editor/src/data/poi-catalog.json', 'utf8'));
const libraries = (catalog.libraries as unknown[]).map(value => poiSchema.parse(value)).filter(poi => poi.status === 'approved' && isLibraryLocationVerified(poi));
if (libraries.length !== 45 || libraries.some(poi => poi.category !== 'library')) throw new Error('Požadováno 45 doložených výchozích knihoven.');
const data = structuredClone(previous.data);
for (const library of libraries) {
  data.pois.push(releasePoiSchema.parse({ id: library.id, category: library.category, name: library.name, address: library.address, point: library.point, geometry: library.geometry, library: library.library, sourceId: library.sourceId, source: { ...library.source, note: '' }, status: 'approved', reviewedAt: library.reviewedAt }));
  if (!data.sourceVersions.some(source => source.key === `poi:${library.source.id}`)) data.sourceVersions.push({ key: `poi:${library.source.id}`, version: library.source.rawChecksum!, checksum: library.source.rawChecksum, provider: library.source.provider, url: library.source.url, dataDate: library.source.dataDate, license: library.source.license });
}
// Never bootstrap/reset parks, PID, game area, administrative layers or history.
const release = await createGameDataRelease(data, { publishedAt: new Date().toISOString(), kind: previous.kind });
const entry = await releaseEntry(release);
await writeFile(`${directory}/${entry.file}`, canonicalJson(release), { flag: 'wx' });
await writeFile(`${directory}/current.json`, `${JSON.stringify({ ...index, current: entry, versions: [...index.versions, entry] }, null, 2)}\n`);
console.log(JSON.stringify({ release: release.releaseId, libraries: libraries.length, unchangedPidChecksum: data.pidSnapshot.checksum }));
