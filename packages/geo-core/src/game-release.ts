import { z } from 'zod';
import { booleanPointInPolygon } from '@turf/turf';
import { canonicalJson, verifyAdministrativeSources } from './administrative';
import { validateGeometry, isArea, validateWorld, type AreaGeometry, type WorldDraft } from './index';
import { sha256, pragueDate, snapshotReference, type PidSnapshot } from './pid-snapshot';
import { buildGameStops, referenceZoneGeometry } from './game-stops';
import { defaultGameStopConfiguration } from './game-stop-configuration';
import { poiSourceSchema, resolvePois, verifyPoiSources, type Poi } from './poi';
import { transportModes, transportModeSchema, wgs84PointSchema } from './pid-model';

const id = z.string().min(1).max(500), text = z.string().max(10000), digest = z.string().regex(/^[a-f0-9]{64}$/);
const checkedArea = z.unknown().transform((value, ctx): AreaGeometry => {
  try { const result = validateGeometry(value); if (!isArea(result)) throw new Error('Očekávána polygonová geometrie.'); return result; }
  catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); return z.NEVER; }
});
const checkedPoiGeometry = z.unknown().transform((value, ctx) => {
  try { const result = validateGeometry(value); if (result.type === 'LineString') throw new Error('POI nemůže být linie.'); return result; }
  catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); return z.NEVER; }
});
export const releasePoiSchema = z.object({ id, category: z.enum(['airport', 'park', 'zoo']), name: text.trim().min(1), address: text.optional(), point: wgs84PointSchema, geometry: checkedPoiGeometry,
  sourceId: id, source: poiSourceSchema, origins: z.array(z.object({ id, sourceId: id, source: poiSourceSchema }).strict()).optional(), status: z.literal('approved'), reviewedAt: z.iso.datetime().nullable() }).strict();
const areaSchema = z.object({ id, name: text.min(1), geometry: checkedArea, source: text }).strict();
const adminSchema = z.object({ id, code: id, name: text.min(1), kind: z.enum(['municipal', 'cadastral']), geometry: checkedArea, sourceKey: id }).strict();
const stopSchema = z.object({ id, name: text.min(1), groupIds: z.array(id).min(1), point: wgs84PointSchema, modes: z.array(transportModeSchema).min(1),
  referenceModes: z.array(transportModeSchema).min(1), dominantMode: transportModeSchema, eligibility: z.enum(['allowed', 'review']), activity: z.literal('active'), service: z.enum(['day', 'night', 'both', 'unknown']) }).strict();
const pidSchema = z.object({ id, checksum: digest, serviceDate: z.iso.date(), adapterVersion: id, quality: z.enum(['verified', 'review']), stops: z.array(stopSchema).max(20000) }).strict();
const sourceSchema = z.object({ key: id, version: text, checksum: digest.nullable(), provider: text, url: z.url().nullable(), dataDate: z.string().nullable(), license: z.object({ name: text, url: z.url().nullable() }) }).strict();
export const gameReleaseDataSchema = z.object({
  gameArea: areaSchema, administrativeAreas: z.array(adminSchema).max(1000), pois: z.array(releasePoiSchema).max(10000), pidSnapshot: pidSchema,
  rulesConfig: z.object({ radiusMeters: z.number().positive().max(100000), gameAreaBoundary: z.literal('included'), allowedModes: z.array(transportModeSchema).min(1) }).strict(),
  sourceVersions: z.array(sourceSchema).max(100),
}).strict();
export type GameReleaseData = z.infer<typeof gameReleaseDataSchema>;
const checksumShape = { gameArea: digest, administrativeAreas: digest, pois: digest, pidSnapshot: digest, rulesConfig: digest, sourceVersions: digest, content: digest };
export const gameDataReleaseSchema = z.object({ format: z.literal('jetlag-prague-game-release'), schemaVersion: z.union([z.literal(1), z.literal(2)]), releaseId: z.string().regex(/^release:[a-f0-9]{64}$/),
  publishedAt: z.iso.datetime(), kind: z.enum(['approved', 'reference']), data: gameReleaseDataSchema, checksums: z.object(checksumShape).strict() }).strict();
export type GameDataRelease = z.infer<typeof gameDataReleaseSchema>;
export const gameReleaseEntrySchema = z.object({ releaseId: gameDataReleaseSchema.shape.releaseId, file: z.string().regex(/^release-[a-f0-9]{64}\.json$/), checksum: digest, publishedAt: z.iso.datetime(), kind: gameDataReleaseSchema.shape.kind }).strict();
export type GameReleaseEntry = z.infer<typeof gameReleaseEntrySchema>;
export const gameReleaseIndexSchema = z.object({ format: z.literal('jetlag-prague-game-catalog'), schemaVersion: z.literal(1), current: gameReleaseEntrySchema, versions: z.array(gameReleaseEntrySchema).min(1).max(2000) }).strict();
export type GameReleaseIndex = z.infer<typeof gameReleaseIndexSchema>;
const components = ['gameArea', 'administrativeAreas', 'pois', 'pidSnapshot', 'rulesConfig', 'sourceVersions'] as const;
const lexical = (a: { id: string }, b: { id: string }) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
function unique(values: string[]) { if (new Set(values).size !== values.length) throw new Error('Duplicitní ID v herním katalogu.'); }
export function containsGamePoint(point: [number, number], area: AreaGeometry): boolean { return booleanPointInPolygon(point, area); }
export function gamePublicationErrors(release: GameDataRelease, date = pragueDate()): string[] {
  const issues: string[] = [];
  if (release.kind !== 'approved') issues.push('Referenční podklady nelze publikovat jako ostrou herní verzi.');
  if (release.data.pidSnapshot.serviceDate !== date) issues.push(`PID nemá aktuální obsluhu pro ${date}; historická data nejsou ověřeným zdrojem ostré hry.`);
  if (release.data.pidSnapshot.quality !== 'verified') issues.push('Snapshot PID vyžaduje revizi.');
  if (!release.data.pidSnapshot.stops.length) issues.push('Chybějí ověřené herní zastávky uvnitř herní oblasti.');
  if (release.data.pidSnapshot.stops.some(stop => stop.eligibility !== 'allowed')) issues.push('Některé zastávky PID vyžadují revizi.');
  for (const poi of release.data.pois.filter(p => p.category === 'park')) {
    for (const origin of poi.origins ?? []) if (origin.source.id !== 'manual' && (!origin.source.license.url || /nedoložen|neznám|neověřen/i.test(origin.source.license.name))) issues.push(`Park ${poi.id}: doložte licenci sloučené části ${origin.id}.`);
    if (poi.source.id !== 'manual' && (!poi.source.license.url || /nedoložen|neznám|neověřen/i.test(poi.source.license.name))) issues.push(`Park ${poi.id}: před publikací doložte licenci zdroje.`);
  }
  return [...new Set(issues)];
}
export async function createGameDataRelease(input: GameReleaseData, options: { publishedAt: string; kind: 'approved' | 'reference'; schemaVersion?: 1 | 2 }): Promise<GameDataRelease> {
  const data = gameReleaseDataSchema.parse(input), schemaVersion = options.schemaVersion ?? 2;
  data.rulesConfig.allowedModes.sort();
  for (const stop of data.pidSnapshot.stops) { stop.groupIds.sort(); stop.modes.sort(); stop.referenceModes.sort(); }
  data.administrativeAreas.sort(lexical); data.pois.sort(lexical); data.pidSnapshot.stops.sort(lexical); data.sourceVersions.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  const hashes = Object.fromEntries(await Promise.all(components.map(async key => [key, await sha256(canonicalJson(data[key]))]))) as Omit<GameDataRelease['checksums'], 'content'>;
  const content = await sha256(canonicalJson({ schemaVersion, kind: options.kind, data }));
  const release = { format: 'jetlag-prague-game-release' as const, schemaVersion, releaseId: `release:${content}`, publishedAt: options.publishedAt, kind: options.kind, data, checksums: { ...hashes, content } };
  return verifyGameDataRelease(release);
}
export async function verifyGameDataRelease(input: unknown): Promise<GameDataRelease> {
  const release = gameDataReleaseSchema.parse(input), { data } = release;
  if (release.schemaVersion === 1 && data.pois.some(poi => poi.category === 'zoo' || poi.address !== undefined)) throw new Error('Zoo a adresy POI vyžadují herní schéma 2; historické schéma 1 zůstává beze změny.');
  for (const poi of data.pois.filter(poi => poi.category === 'zoo')) if (!poi.address?.trim() || poi.geometry.type !== 'Point' || canonicalJson(poi.point) !== canonicalJson(poi.geometry.coordinates)) throw new Error('Zoo musí mít adresu a bodovou geometrii shodnou s referenčním bodem.');
  unique(data.pois.map(p => p.id)); unique(data.administrativeAreas.map(p => p.id)); unique(data.pidSnapshot.stops.map(p => p.id)); unique(data.sourceVersions.map(p => p.key));
  unique(data.rulesConfig.allowedModes);
  for (const stop of data.pidSnapshot.stops) { unique(stop.groupIds); unique(stop.modes); unique(stop.referenceModes); }
  const airports = data.pois.filter(p => p.category === 'airport');
  const arp: Record<string, [number, number]> = { LKPR: [14.26, 50.100833], LKKB: [14.543639, 50.121367], LKTC: [14.425556, 49.985278] };
  if (airports.length !== 3 || airports.some(p => !arp[p.id] || canonicalJson(p.point) !== canonicalJson(arp[p.id]) || p.geometry.type !== 'Point' || canonicalJson(p.geometry.coordinates) !== canonicalJson(p.point))) throw new Error('Herní katalog musí zachovat tři schválené ARP letišť.');
  for (const poi of data.pois.filter(p => p.category === 'park')) if (!isArea(poi.geometry) || !booleanPointInPolygon(poi.point, poi.geometry, { ignoreBoundary: true })) throw new Error(`Park ${poi.id} nemá platný vnitřní referenční bod.`);
  const sourceKeys = new Set(data.sourceVersions.map(source => source.key));
  if (data.administrativeAreas.some(area => !sourceKeys.has(area.sourceKey))) throw new Error('Chybí verze administrativního zdroje.');
  for (const poi of data.pois) for (const source of [poi.source, ...(poi.origins ?? []).map(origin => origin.source)]) if (!sourceKeys.has(`poi:${source.id}`)) throw new Error('Chybí verze zdroje POI.');
  if (data.pidSnapshot.id !== `pid:${data.pidSnapshot.serviceDate}:${data.pidSnapshot.checksum}`) throw new Error('Nesouhlasí identita PID snapshotu.');
  for (const stop of data.pidSnapshot.stops) {
    if (!containsGamePoint(stop.point, data.gameArea.geometry)) throw new Error(`Zastávka ${stop.id} leží mimo herní oblast.`);
    if (stop.modes.some(mode => !data.rulesConfig.allowedModes.includes(mode)) || stop.referenceModes.some(mode => !stop.modes.includes(mode)) || !stop.referenceModes.includes(stop.dominantMode)) throw new Error('Zastávka neodpovídá povoleným dopravním prostředkům.');
  }
  for (const key of components) if (await sha256(canonicalJson(data[key])) !== release.checksums[key]) throw new Error(`Nesouhlasí kontrolní součet ${key}.`);
  if (await sha256(canonicalJson({ schemaVersion: release.schemaVersion, kind: release.kind, data })) !== release.checksums.content || release.releaseId !== `release:${release.checksums.content}`) throw new Error('Nesouhlasí identita nebo kontrolní součet celé publikace.');
  if (release.kind === 'approved') {
    const date = pragueDate(new Date(release.publishedAt));
    if (data.pidSnapshot.serviceDate !== date || data.pidSnapshot.quality !== 'verified' || data.pidSnapshot.stops.some(stop => stop.eligibility !== 'allowed')) throw new Error('Schválený release neobsahuje ověřenou obsluhu pro den publikace.');
  }
  return release;
}
export async function buildGameDataRelease(worldInput: WorldDraft, airports: Poi[], snapshot: PidSnapshot, publishedAt = new Date().toISOString()): Promise<GameDataRelease> {
  const world = validateWorld(worldInput); await verifyAdministrativeSources(world); await verifyPoiSources(world.poi);
  const areas = world.layers.filter(layer => layer.kind === 'game_area').flatMap(layer => layer.features);
  if (areas.length !== 1 || !isArea(areas[0].geometry)) throw new Error('Publikace vyžaduje právě jeden platný polygon herní oblasti.');
  const area = areas[0], geometry = area.geometry as AreaGeometry;
  const rules = world.gameStops ?? defaultGameStopConfiguration();
  const sources: GameReleaseData['sourceVersions'] = [];
  const administrativeAreas: GameReleaseData['administrativeAreas'] = [];
  for (const layer of world.layers.filter(layer => layer.dataset)) {
    const source = layer.dataset!; sources.push({ key: source.id, version: source.version, checksum: source.checksum, provider: source.provider, url: source.sourceUrl, dataDate: source.dataDate, license: source.license });
    for (const item of layer.features) { if (!isArea(item.geometry)) throw new Error('Administrativní hranice musí být polygonové.'); administrativeAreas.push({ id: item.id, code: String(item.attributes.code ?? item.id), name: item.name, kind: layer.kind === 'municipal' ? 'municipal' : 'cadastral', geometry: item.geometry, sourceKey: source.id }); }
  }
  const pois = resolvePois(airports, world.poi ?? { version: 1, sources: [], manual: [], decisions: [], visibility: { airports: true, parks: true, referencePoints: false } }).filter(poi => poi.status === 'approved').map(poi => releasePoiSchema.parse({ id: poi.id, category: poi.category, name: poi.name, ...(poi.category === 'zoo' ? { address: poi.address } : {}), point: poi.point, geometry: poi.geometry, sourceId: poi.sourceId, source: { ...poi.source, note: '' }, ...(Array.isArray(poi.attributes.origins) ? { origins: poi.attributes.origins.map(origin => { const value = z.object({ id, sourceId: id, source: poiSourceSchema }).parse(origin); return { ...value, source: { ...value.source, note: '' } }; }) } : {}), status: 'approved', reviewedAt: poi.reviewedAt }));
  for (const source of snapshot.sources) sources.push({ key: `pid:${source.id}`, version: source.version ?? source.sha256, checksum: source.sha256, provider: 'PID', url: source.url, dataDate: snapshot.serviceDate, license: source.license ?? { name: 'Nedoložena', url: null } });
  for (const source of world.poi?.sources ?? []) sources.push({ key: `poi:${source.source.id}`, version: source.checksum, checksum: source.source.rawChecksum, provider: source.source.provider, url: source.source.url, dataDate: source.source.dataDate, license: source.source.license });
  for (const poi of pois) for (const origin of [poi.source, ...(poi.origins ?? []).map(item => item.source)]) if (!sources.some(source => source.key === `poi:${origin.id}`)) sources.push({ key: `poi:${origin.id}`, version: origin.rawChecksum ?? 'manual', checksum: origin.rawChecksum, provider: origin.provider, url: origin.url, dataDate: origin.dataDate, license: origin.license });
  const currentPid = snapshot.serviceDate === pragueDate(new Date(publishedAt)) && snapshot.quality?.status !== 'review';
  const stops = buildGameStops(snapshot, rules, pragueDate(new Date(publishedAt))).filter(stop => (!currentPid || stop.eligibility === 'allowed') && stop.activity === 'active' && stop.point && stop.eligibility !== 'excluded' && stop.referenceModes.length && containsGamePoint(stop.point, geometry)).map(stop => ({ id: stop.id, name: stop.name, groupIds: [...stop.groupIds].sort(), point: stop.point!, modes: stop.modes, referenceModes: stop.referenceModes, dominantMode: stop.dominantMode!, eligibility: stop.eligibility as 'allowed' | 'review', activity: 'active' as const, service: stop.service }));
  const kind = currentPid && stops.length ? 'approved' : 'reference';
  return createGameDataRelease({ gameArea: { id: `game-area:${await sha256(canonicalJson(geometry))}`, name: area.name, geometry, source: area.source }, administrativeAreas, pois,
    pidSnapshot: { ...snapshotReference(snapshot), quality: snapshot.quality?.status ?? 'verified', stops }, rulesConfig: { radiusMeters: rules.radiusMeters, gameAreaBoundary: 'included', allowedModes: rules.allowedModes ?? [...transportModes] }, sourceVersions: sources }, { publishedAt, kind });
}
export async function releaseEntry(release: GameDataRelease): Promise<GameReleaseEntry> {
  return { releaseId: release.releaseId, file: `release-${release.checksums.content}.json`, checksum: await sha256(canonicalJson(release)), publishedAt: release.publishedAt, kind: release.kind };
}
export function readGameReleaseIndex(input: unknown): GameReleaseIndex {
  const index = gameReleaseIndexSchema.parse(input); unique(index.versions.map(entry => entry.releaseId));
  for (const entry of [index.current, ...index.versions]) if (entry.file !== `release-${entry.releaseId.slice(8)}.json`) throw new Error('Neplatná cesta k neměnnému hernímu release.');
  if (!index.versions.some(entry => canonicalJson(entry) === canonicalJson(index.current))) throw new Error('Aktuální publikace chybí v historii.');
  return index;
}
export async function readGameReleaseArtifact(text: string, entry: GameReleaseEntry): Promise<GameDataRelease> {
  if (await sha256(text) !== entry.checksum) throw new Error('Soubor herních podkladů je neúplný nebo poškozený.');
  const release = await verifyGameDataRelease(JSON.parse(text));
  if (release.releaseId !== entry.releaseId || release.publishedAt !== entry.publishedAt || release.kind !== entry.kind) throw new Error('Nesouhlasí metadata publikované verze.');
  return release;
}
async function limitedText(response: Response, maximum: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > maximum) throw new Error('Soubor publikace překračuje povolenou velikost.');
  const reader = response.body?.getReader(); if (!reader) throw new Error('Soubor publikace je prázdný.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > maximum) { await reader.cancel(); throw new Error('Soubor publikace překračuje povolenou velikost.'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
export async function loadGameDataRelease(base: string, fetcher: typeof fetch = fetch, pinnedId?: string): Promise<{ release: GameDataRelease; index: GameReleaseIndex }> {
  const response = await fetcher(new URL('current.json', base), { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Herní podklady zatím nejsou dostupné.');
  const index = readGameReleaseIndex(JSON.parse(await limitedText(response, 1024 * 1024)));
  const entry = pinnedId ? index.versions.find(version => version.releaseId === pinnedId) : index.current;
  if (!entry) throw new Error('Uzamčená herní verze není dostupná; nebyla nahrazena jinou.');
  const artifact = await fetcher(new URL(entry.file, base), { signal: AbortSignal.timeout(60000) }); if (!artifact.ok) throw new Error('Publikace není kompletní; chybí soubor podkladů.');
  return { release: await readGameReleaseArtifact(await limitedText(artifact, 16 * 1024 * 1024), entry), index };
}
export function compareGameReleases(before: GameDataRelease | null, after: GameDataRelease) {
  const compare = (old: { id: string }[], next: { id: string }[]) => {
    const previous = new Map(old.map(item => [item.id, item])), ids = new Set(next.map(item => item.id));
    return { added: next.filter(item => !previous.has(item.id)).length, changed: next.filter(item => previous.has(item.id) && canonicalJson(previous.get(item.id)) !== canonicalJson(item)).length, removed: old.filter(item => !ids.has(item.id)).length };
  };
  return { pois: compare(before?.data.pois ?? [], after.data.pois), pid: compare(before?.data.pidSnapshot.stops ?? [], after.data.pidSnapshot.stops), areas: compare(before?.data.administrativeAreas ?? [], after.data.administrativeAreas), gameAreaChanged: before?.checksums.gameArea !== after.checksums.gameArea, identical: before?.releaseId === after.releaseId };
}
export function releaseHidingZone(release: GameDataRelease, stopId: string) {
  if (gamePublicationErrors(release).some(message => /PID|zastáv|Referenční/.test(message))) throw new Error('Úkrytovou zónu nelze potvrdit pro historické nebo neověřené podklady.');
  const stop = release.data.pidSnapshot.stops.find(item => item.id === stopId); if (!stop) throw new Error('Herní zastávka chybí v uzamčené verzi.');
  return referenceZoneGeometry(stop.point, release.data.gameArea.geometry, release.data.rulesConfig.radiusMeters);
}
