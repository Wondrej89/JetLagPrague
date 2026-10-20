/** One addition to immutable history. Subsequent administrator decisions use
 * the existing authenticated editor → Worker → GitHub publishing workflow. */
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalJson, createGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, releasePoiSchema, poiSchema } from '../packages/geo-core/src/index';

const directory = 'data/releases';
const index = readGameReleaseIndex(JSON.parse(await readFile(`${directory}/current.json`, 'utf8')));
const previous = await readGameReleaseArtifact(await readFile(`${directory}/${index.current.file}`, 'utf8'), index.current);
if (previous.data.pois.some(poi => poi.category === 'cinema')) throw new Error('Katalog již kina obsahuje. Další rozhodnutí publikujte z editoru.');
const catalog = JSON.parse(await readFile('apps/editor/src/data/poi-catalog.json', 'utf8'));
const cinemas = (catalog.cinemas as unknown[]).map(value => poiSchema.parse(value));
if (cinemas.length !== 26 || cinemas.some(poi => poi.category !== 'cinema') || cinemas.filter(poi => poi.status === 'approved').length !== 25 || cinemas.find(poi => poi.id === 'priemere-citenas-hostivar')?.status !== 'review') throw new Error('Požadováno 26 výchozích kin, z toho 25 schválených a Hostivař k revizi.');
const data = structuredClone(previous.data);
for (const cinema of cinemas.filter(poi => poi.status === 'approved')) {
  data.pois.push(releasePoiSchema.parse({ id: cinema.id, category: cinema.category, name: cinema.name, address: cinema.address, point: cinema.point, geometry: cinema.geometry, sourceId: cinema.sourceId, source: { ...cinema.source, note: '' }, status: 'approved', reviewedAt: cinema.reviewedAt }));
  if (!data.sourceVersions.some(source => source.key === `poi:${cinema.source.id}`)) data.sourceVersions.push({ key: `poi:${cinema.source.id}`, version: cinema.source.rawChecksum!, checksum: cinema.source.rawChecksum, provider: cinema.source.provider, url: cinema.source.url, dataDate: cinema.source.dataDate, license: cinema.source.license });
}
// Preserve all existing components and actual PID service date. No re-dating,
// bootstrap/reset, mutation of earlier artifacts or editor drafts.
const release = await createGameDataRelease(data, { publishedAt: new Date().toISOString(), kind: previous.kind });
const entry = await releaseEntry(release);
await writeFile(`${directory}/${entry.file}`, canonicalJson(release), { flag: 'wx' });
await writeFile(`${directory}/current.json`, `${JSON.stringify({ ...index, current: entry, versions: [...index.versions, entry] }, null, 2)}\n`);
console.log(JSON.stringify({ release: release.releaseId, schemaVersion: release.schemaVersion, cinemas: 25, unchangedPidChecksum: data.pidSnapshot.checksum }));
