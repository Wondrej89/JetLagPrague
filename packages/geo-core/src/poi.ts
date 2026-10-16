import { z } from 'zod';
import { booleanPointInPolygon, featureCollection, feature, union } from '@turf/turf';
import type { Point, Position } from 'geojson';
import { distanceMeters, isArea, validateGeometry, type AreaGeometry } from './index';
import { canonicalJson } from './administrative';
import { sha256 } from './pid-snapshot';

const id = z.string().min(1).max(200);
const text = z.string().max(10000);
const httpUrl = z.url().refine(url => ['http:', 'https:'].includes(new URL(url).protocol));
const pointSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export const poiStatusSchema = z.enum(['review', 'approved', 'excluded']);
export const poiSourceSchema = z.object({
  id, provider: text.min(1), url: httpUrl.nullable(),
  license: z.object({ name: text.min(1), url: httpUrl.nullable() }),
  dataDate: z.iso.date().nullable(), retrievedAt: z.iso.datetime(),
  rawChecksum: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  verification: z.enum(['provider_verified', 'user_supplied', 'curated']), note: text,
});
const geometrySchema = z.unknown().transform((value, ctx): Point | AreaGeometry => {
  try {
    const geometry = validateGeometry(value);
    if (geometry.type === 'LineString') throw new Error('POI musí být bod nebo polygon.');
    return geometry;
  } catch (error) { ctx.addIssue({ code: 'custom', message: (error as Error).message }); return z.NEVER; }
});
export const poiSchema = z.object({
  id, category: id, name: text, point: pointSchema, geometry: geometrySchema,
  sourceId: id, source: poiSourceSchema, status: poiStatusSchema,
  reviewedAt: z.iso.datetime().nullable(), note: text,
  sourceIdentity: z.object({ key: id, fingerprint: z.string(), method: z.enum(['attribute-derived', 'manual']), reviewRequired: z.boolean() }).optional(),
  attributes: z.record(z.string(), z.json()), memberIds: z.array(id).optional(),
});
export type Poi = z.infer<typeof poiSchema>;
export type PoiSource = z.infer<typeof poiSourceSchema>;
export const parkDatasetSchema = z.object({
  source: poiSourceSchema, records: z.array(poiSchema).max(10000), importRecord: z.json().optional(), checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ParkDataset = z.infer<typeof parkDatasetSchema>;
const decisionSchema = z.object({ id, name: text.optional(), point: pointSchema.optional(), status: poiStatusSchema.optional(), reviewedAt: z.iso.datetime().nullable(), note: text.optional() });
export type PoiDecision = z.infer<typeof decisionSchema>;
export const poiConfigurationSchema = z.object({
  version: z.literal(1), sources: z.array(parkDatasetSchema).max(50),
  manual: z.array(poiSchema).max(10000), decisions: z.array(decisionSchema).max(20000),
  visibility: z.object({ airports: z.boolean(), parks: z.boolean(), referencePoints: z.boolean() }),
});
export type PoiConfiguration = z.infer<typeof poiConfigurationSchema>;
export function defaultPoiConfiguration(): PoiConfiguration {
  return { version: 1, sources: [], manual: [], decisions: [], visibility: { airports: true, parks: true, referencePoints: false } };
}
function unique(ids: string[]) { if (new Set(ids).size !== ids.length) throw new Error('Duplicitní stabilní ID POI.'); }
export function validatePoiConfiguration(input: PoiConfiguration): void {
  unique(input.sources.map(s => s.source.id));
  const records = [...input.sources.flatMap(s => s.records), ...input.manual];
  unique(records.map(p => p.id)); unique(input.decisions.map(d => d.id));
  for (const dataset of input.sources) for (const record of dataset.records) {
    if (record.source.id !== dataset.source.id || record.id !== parkId(dataset.source.id, record.sourceIdentity?.key ?? record.sourceId)) throw new Error('Nesouhlasí identita zdrojového parku.');
    if (record.status !== 'review' || record.reviewedAt !== null) throw new Error('Zdrojoví kandidáti se schvalují odděleným rozhodnutím.');
  }
  for (const record of records) {
    if (record.category !== 'park' || !isArea(record.geometry)) throw new Error('Vlastní a importované POI této iterace musí být polygonové parky.');
    if (!booleanPointInPolygon(record.point, record.geometry, { ignoreBoundary: true })) throw new Error('Výchozí referenční bod parku musí být uvnitř polygonu.');
  }
}
export function parkId(namespace: string, sourceId: string): string { return `park:${encodeURIComponent(namespace)}:${encodeURIComponent(sourceId)}`; }
/** Strict interior scanline: midpoints between distinct vertex latitudes cannot
 * touch a vertex. Even/odd edge intersections handle concavity and holes. We
 * verify the result against the full geometry; all disconnected parts compete. */
export function interiorReferencePoint(input: AreaGeometry): [number, number] {
  const geometry = validateGeometry(input);
  if (!isArea(geometry)) throw new Error('Park musí mít polygonovou geometrii.');
  const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let best: { point: [number, number]; width: number } | undefined;
  for (const rings of parts) {
    const ys = [...new Set(rings.flatMap(ring => ring.map(p => p[1])))].sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      const y = (ys[i - 1] + ys[i]) / 2;
      const xs: number[] = [];
      for (const ring of rings) for (let j = 1; j < ring.length; j++) {
        const a = ring[j - 1], b = ring[j];
        if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort((a, b) => a - b);
      for (let j = 1; j < xs.length; j += 2) {
        const point: [number, number] = [(xs[j - 1] + xs[j]) / 2, y];
        const width = Math.min(xs[j] - xs[j - 1], ys[i] - ys[i - 1]);
        if ((!best || width > best.width) && booleanPointInPolygon(point, geometry, { ignoreBoundary: true })) best = { point, width };
      }
    }
  }
  if (!best) throw new Error('Vnitřní referenční bod nelze spolehlivě určit.');
  return best.point;
}
export async function importParkGeoJson(contents: string, options: {
  source: Omit<PoiSource, 'rawChecksum'>; idField: string; nameField: string;
}): Promise<ParkDataset> {
  const data = JSON.parse(contents);
  if (data?.type !== 'FeatureCollection' || data.crs || !Array.isArray(data.features) || !data.features.length || data.features.length > 10000) throw new Error('Očekávána neprázdná FeatureCollection WGS84 bez CRS, nejvýše 10 000 parků.');
  const source = poiSourceSchema.parse({ ...options.source, rawChecksum: await sha256(contents) });
  const records: Poi[] = data.features.map((f: { type?: string; id?: unknown; crs?: unknown; properties?: Record<string, unknown>; geometry?: unknown }, i: number) => {
    if (f?.type !== 'Feature' || f.crs || (f.geometry && typeof f.geometry === 'object' && 'crs' in f.geometry)) throw new Error(`Objekt ${i + 1}: očekáván GeoJSON Feature bez CRS.`);
    const attrs = z.record(z.string(), z.json()).parse(f.properties ?? {});
    const code = options.idField === '$id' ? f.id : attrs[options.idField];
    if ((typeof code !== 'string' && typeof code !== 'number') || !String(code).trim()) throw new Error(`Objekt ${i + 1}: chybí stabilní ID v poli ${options.idField}.`);
    const geometry = validateGeometry(f.geometry);
    if (!isArea(geometry)) throw new Error(`Objekt ${i + 1}: park musí být Polygon nebo MultiPolygon.`);
    const name = typeof attrs[options.nameField] === 'string' ? String(attrs[options.nameField]).trim() : '';
    return { id: parkId(source.id, String(code)), category: 'park', name, point: interiorReferencePoint(geometry), geometry,
      sourceId: String(code), source, status: 'review', reviewedAt: null, note: name ? 'Importovaný kandidát: ověřte název a vymezení parku.' : 'Chybí doložený název; nutná ruční revize.', attributes: attrs };
  });
  unique(records.map(r => r.id));
  const dataset = parkDatasetSchema.parse({ source, records, checksum: await sha256(canonicalJson({ source, records })) });
  validatePoiConfiguration({ ...defaultPoiConfiguration(), sources: [dataset] });
  return dataset;
}
export async function verifyParkDataset(input: unknown): Promise<ParkDataset> {
  const data = parkDatasetSchema.parse(input);
  validatePoiConfiguration({ ...defaultPoiConfiguration(), sources: [data] });
  if (await sha256(canonicalJson({ source: data.source, records: data.records, ...(data.importRecord === undefined ? {} : { importRecord: data.importRecord }) })) !== data.checksum) throw new Error('Kontrolní součet parkového zdroje nesouhlasí.');
  return data;
}
export async function verifyPoiSources(configuration?: PoiConfiguration): Promise<void> {
  if (configuration) for (const source of configuration.sources) await verifyParkDataset(source);
}
export function compareParkUpdate(previous: ParkDataset | undefined, next: ParkDataset) {
  const before = new Map(previous?.records.map(p => [p.id, p]) ?? []), after = new Map(next.records.map(p => [p.id, p]));
  return { added: next.records.filter(p => !before.has(p.id)).length, removed: [...before.keys()].filter(id => !after.has(id)).length,
    changed: next.records.filter(p => before.has(p.id) && canonicalJson({ name: before.get(p.id)!.name, geometry: before.get(p.id)!.geometry }) !== canonicalJson({ name: p.name, geometry: p.geometry })).length };
}
/** No user overrides or own objects are removed. Disappearing source records
 * remain as review-only historical candidates, preserving their geometry. */
export function applyParkUpdate(configuration: PoiConfiguration, next: ParkDataset): PoiConfiguration {
  const current = configuration.sources.find(s => s.source.id === next.source.id);
  const missing = current?.records.filter(p => !next.records.some(n => n.id === p.id)) ?? [];
  const existingManual = new Set(configuration.manual.map(p => p.id));
  return { ...configuration, sources: [...configuration.sources.filter(s => s.source.id !== next.source.id), next],
    manual: [...configuration.manual.filter(p => !(p.attributes.sourceMissing && next.records.some(n => n.id === p.id))), ...missing.filter(p => !existingManual.has(p.id)).map(p => ({ ...p, status: 'review' as const, attributes: { ...p.attributes, sourceMissing: true }, note: 'Objekt chybí v nové verzi zdroje; historická geometrie vyžaduje revizi.' }))] };
}
export function resolvePois(airports: Poi[], configuration: PoiConfiguration): Poi[] {
  // A previously missing source record may reappear; prefer the actual source.
  const sources = configuration.sources.flatMap(s => s.records), sourceIds = new Set(sources.map(p => p.id));
  const decisions = new Map(configuration.decisions.map(d => [d.id, d]));
  return [...airports, ...sources, ...configuration.manual.filter(p => !sourceIds.has(p.id))].map(record => {
    const decision = record.category === 'airport' ? undefined : decisions.get(record.id);
    const result = { ...record, ...decision, id: record.id };
    if (record.sourceIdentity?.reviewRequired || (record.category === 'park' && !result.name.trim()) || record.attributes.sourceMissing || (isArea(record.geometry) && !booleanPointInPolygon(result.point, record.geometry, { ignoreBoundary: true }))) {
      return { ...result, status: result.status === 'excluded' ? 'excluded' as const : 'review' as const, note: `${result.note} Referenční bod nebo dostupnost zdroje vyžaduje revizi.` };
    }
    return result;
  });
}
export function decidePoi(configuration: PoiConfiguration, poi: Poi, change: Partial<Omit<PoiDecision, 'id'>>): PoiConfiguration {
  if (poi.category !== 'park') throw new Error('Schválená letiště této lokální kategorie se automaticky nemění.');
  if (change.point) {
    pointSchema.parse(change.point);
    if (!isArea(poi.geometry) || !booleanPointInPolygon(change.point, poi.geometry, { ignoreBoundary: true })) throw new Error('Referenční bod musí ležet uvnitř parku, mimo otvory a hranici.');
  }
  const previous = configuration.decisions.find(d => d.id === poi.id);
  const decision = decisionSchema.parse({ ...previous, ...change, id: poi.id, reviewedAt: new Date().toISOString() });
  if (decision.status === 'approved') {
    if (!(decision.name ?? poi.name).trim()) throw new Error('Před schválením doplňte doložený název parku.');
    if (poi.attributes.sourceMissing) throw new Error('Objekt chybí ve zdroji; nejprve doložte aktuální vymezení.');
    if (!isArea(poi.geometry) || !booleanPointInPolygon(decision.point ?? poi.point, poi.geometry, { ignoreBoundary: true })) throw new Error('Před schválením opravte referenční bod uvnitř aktuální geometrie.');
  }
  return { ...configuration, decisions: [...configuration.decisions.filter(d => d.id !== poi.id), decision] };
}
export function createManualPark(geometry: AreaGeometry, name = ''): Poi {
  const id = `manual-park:${crypto.randomUUID()}`;
  return { id, category: 'park', name, geometry: validateGeometry(geometry) as AreaGeometry, point: interiorReferencePoint(geometry), sourceId: id,
    source: { id: 'manual', provider: 'Vlastní vymezení', url: null, license: { name: 'Vlastní data – licenci určuje autor', url: null }, dataDate: null, retrievedAt: new Date().toISOString(), rawChecksum: null, verification: 'user_supplied', note: 'Ručně nakreslený park; nejde o oficiální vrstvu IPR.' },
    status: 'review', reviewedAt: null, note: 'Ověřte název a vymezení, potom park schvalte.', attributes: {} };
}
export function mergeParks(configuration: PoiConfiguration, parks: Poi[], name: string): { configuration: PoiConfiguration; park: Poi } {
  if (parks.length < 2 || parks.some(p => p.category !== 'park' || !isArea(p.geometry))) throw new Error('Vyberte alespoň dva polygonové parky.');
  unique(parks.map(p => p.id));
  const combined = union(featureCollection(parks.map(p => feature(p.geometry as AreaGeometry))));
  if (!combined) throw new Error('Sjednocení parků nelze určit.');
  const park = { ...createManualPark(combined.geometry, name), memberIds: parks.map(p => p.id),
    note: 'Ručně sloučené vymezení; geometrie zůstává při aktualizaci zdrojů zachována. Ověřte společný název a schvalte.',
    attributes: { origins: parks.map(p => ({ id: p.id, sourceId: p.sourceId, source: p.source })) } };
  let next = { ...configuration, manual: [...configuration.manual, park] };
  for (const member of parks) next = decidePoi(next, member, { status: 'excluded', note: `Část parku sloučena do ${park.id}.` });
  return { configuration: next, park };
}
export function distanceToPoiMeters(point: Position, poi: Pick<Poi, 'point'>): number { return distanceMeters(point, poi.point); }
export const POI_DISTANCE_TOLERANCE_METERS = 0.000001;
export type NearestPoiResult = { state: 'known'; poi: Poi; distanceMeters: number; tiedIds: string[] } | { state: 'unknown'; reason: string };
/** Haversine metres, tie within 1 μm: lexicographically smallest stable ID.
 * Eligibility is independent of visibility. Invalid points never yield a guess. */
export function nearestApprovedPoi(point: Position, category: string, pois: Poi[]): NearestPoiResult {
  if (!pointSchema.safeParse(point).success) return { state: 'unknown', reason: 'Neplatná poloha; nelze určit.' };
  const candidates = pois.filter(p => p.category === category && p.status === 'approved' && pointSchema.safeParse(p.point).success)
    .map(poi => ({ poi, distanceMeters: distanceToPoiMeters(point, poi) }));
  if (!candidates.length) return { state: 'unknown', reason: 'Neexistuje schválený kandidát; nelze určit.' };
  const minimum = candidates.reduce((minimum, p) => Math.min(minimum, p.distanceMeters), Infinity);
  const ties = candidates.filter(p => p.distanceMeters - minimum <= POI_DISTANCE_TOLERANCE_METERS).sort((a, b) => a.poi.id < b.poi.id ? -1 : a.poi.id > b.poi.id ? 1 : 0);
  return { state: 'known', ...ties[0], tiedIds: ties.map(p => p.poi.id) };
}
export function matchingPois(a: Position, b: Position, category: string, pois: Poi[]) {
  const first = nearestApprovedPoi(a, category, pois), second = nearestApprovedPoi(b, category, pois);
  if (first.state === 'unknown' || second.state === 'unknown') return { state: 'unknown' as const, reason: 'Nejbližší POI nelze určit.' };
  return { state: 'known' as const, matches: first.poi.id === second.poi.id, first, second };
}
export function measuringPois(a: Position, b: Position, category: string, pois: Poi[]) {
  const first = nearestApprovedPoi(a, category, pois), second = nearestApprovedPoi(b, category, pois);
  if (first.state === 'unknown' || second.state === 'unknown') return { state: 'unknown' as const, reason: 'Vzdálenost k POI nelze určit.' };
  const deltaMeters = first.distanceMeters - second.distanceMeters;
  return { state: 'known' as const, first, second, deltaMeters, comparison: Math.abs(deltaMeters) <= POI_DISTANCE_TOLERANCE_METERS ? 'equal' as const : deltaMeters < 0 ? 'first-closer' as const : 'second-closer' as const };
}

/** Add newly published categories/records without overwriting a saved source,
 * manual geometry, visibility or any saved user decision. Source replacements
 * still require an explicit reviewed update. */
export function withPublishedParks(saved: PoiConfiguration | undefined, published: PoiConfiguration): PoiConfiguration {
  if (!saved) return published;
  const sourceIds = new Set(saved.sources.map(s => s.source.id));
  const savedRecordIds = new Set([...saved.sources.flatMap(s => s.records), ...saved.manual].map(p => p.id));
  const decisionIds = new Set(saved.decisions.map(d => d.id));
  return { ...saved, sources: [...saved.sources, ...published.sources.filter(s => !sourceIds.has(s.source.id))],
    manual: [...saved.manual, ...published.manual.filter(p => !savedRecordIds.has(p.id))],
    decisions: [...saved.decisions, ...published.decisions.filter(d => !decisionIds.has(d.id))] };
}
