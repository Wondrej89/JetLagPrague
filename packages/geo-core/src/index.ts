import { z } from 'zod';
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js';
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js';
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js';
import { booleanPointInPolygon, booleanValid, circle, distance, feature, area, polygon } from '@turf/turf';
import type { Point, LineString, Polygon, MultiPolygon, Position } from 'geojson';
import { poiConfigurationSchema, validatePoiConfiguration } from './poi';
import { gameStopConfigurationSchema, validateGameStopConfiguration } from './game-stop-configuration';

export type Geometry = Point | LineString | Polygon | MultiPolygon;
export type AreaGeometry = Polygon | MultiPolygon;
export const SCHEMA_VERSION = 2;

const text = z.string().max(10000);
const webUrl = z.url().refine(value => ['https:', 'http:'].includes(new URL(value).protocol), 'Zdroj a licence musí být HTTP nebo HTTPS odkazy.');
const id = z.string().min(1).max(200);
const position = z.array(z.number().finite()).min(2).max(3).refine(p => Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90, 'Souřadnice musí být WGS84 [délka −180…180, šířka −90…90].');
const ring = z.array(position).min(4).refine(r => JSON.stringify(r[0]) === JSON.stringify(r.at(-1)), 'Prstenec polygonu musí být uzavřený.');
const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), coordinates: position }),
  z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2) }),
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1)).min(1) }),
]);
const validatedGeometries = new WeakSet<object>();
function freezeCoordinates(value: unknown): void {
  if (!Array.isArray(value)) return;
  for (const child of value) freezeCoordinates(child);
  Object.freeze(value);
}

function topologyError(geometry: Geometry): string | null {
  if (geometry.type === 'LineString' && geometry.coordinates.some((p, i, points) => i > 0 && p[0] === points[i - 1][0] && p[1] === points[i - 1][1])) return 'Linie obsahuje úsek s nulovou délkou. Odstraňte opakovaný vrchol.';
  if (geometry.type === 'Point' || geometry.type === 'LineString') return booleanValid(feature(geometry)) ? null : 'Geometrie není platná.';
  // OGC validity distinguishes isolated point contacts from crossings and shared
  // edges. Turf.kinks reports intersections without this polygon topology context.
  const operation = new IsValidOp(new GeoJSONReader(new GeometryFactory()).read(geometry));
  const error = operation.getValidationError();
  if (error) {
    const prefix = [2, 3].includes(error.getErrorType()) ? 'Otvor polygonu není platný' : 'Neplatná topologie polygonu';
    const coordinate = error.getCoordinate();
    return `${prefix}: ${error.getMessage()}${coordinate ? ` [${coordinate.x}, ${coordinate.y}]` : ''}.`;
  }
  const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (parts.some(rings => area(polygon([rings[0]])) <= 0)) return 'Polygon má nulovou plochu.';
  return null;
}

export function validateGeometry(input: unknown): Geometry {
  // Pouze námi validované a zmrazené výstupy lze bezpečně použít opakovaně.
  // Vstupní objekty volajícího se necachují: mohl by je později změnit.
  if (input && typeof input === 'object' && validatedGeometries.has(input)) return input as Geometry;
  const parsed = geometrySchema.safeParse(input);
  if (!parsed.success) throw new Error(`Neplatná geometrie: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const result = parsed.data as Geometry;
  const error = topologyError(result);
  if (error) throw new Error(error);
  freezeCoordinates(result.coordinates);
  Object.freeze(result);
  validatedGeometries.add(result);
  return result;
}
const checkedGeometrySchema = z.unknown().transform((input, context) => {
  try { return validateGeometry(input); }
  catch (error) { context.addIssue({ code: 'custom', message: error instanceof Error ? error.message : 'Neplatná geometrie.' }); return z.NEVER; }
});

const geoFeatureSchema = z.object({
  id, name: text, note: text, source: text, importedAt: z.iso.datetime(), status: z.literal('draft'),
  geometry: checkedGeometrySchema,
  attributes: z.record(z.string(), z.json()),
  circle: z.object({ center: position, radiusMeters: z.number().positive().max(100000) }).optional(),
});
export const sourceDatasetSchema = z.object({
  id: z.enum(['praha-municipal', 'praha-cadastral']),
  provider: text.min(1), sourceUrl: webUrl,
  license: z.object({ name: text.min(1), url: webUrl.nullable() }),
  dataDate: z.iso.date().nullable(),
  retrievedAt: z.iso.datetime(), version: id,
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  codeField: text.min(1), featureCount: z.number().int().positive(),
  processing: text,
  provenance: z.object({
    status: z.enum(['user_supplied', 'provider_verified']),
    upstreamUrl: webUrl.optional(),
    rawFile: text.min(1), rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
    note: text,
  }).optional(),
});
export type SourceDataset = z.infer<typeof sourceDatasetSchema>;
const geoLayerSchema = z.object({
  id, title: text.min(1), kind: z.enum(['game_area', 'custom', 'municipal', 'cadastral', 'transit', 'poi']),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/), visible: z.boolean(), source: text,
  features: z.array(geoFeatureSchema).max(10000),
  dataset: sourceDatasetSchema.optional(),
});
const worldSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION), id, title: text.min(1), updatedAt: z.iso.datetime(),
  layers: z.array(geoLayerSchema).min(1).max(200),
  gameStops: gameStopConfigurationSchema.optional(),
  poi: poiConfigurationSchema.optional(),
  gameAreaInitialization: z.object({ version: z.literal(1), state: z.enum(['initialized', 'intentionally-empty', 'legacy-empty']) }).optional(),
});
export type GeoFeature = z.infer<typeof geoFeatureSchema>;
export type GeoLayer = z.infer<typeof geoLayerSchema>;
export type WorldDraft = z.infer<typeof worldSchema>;

export function newLayer(title = 'Nová vrstva', kind: GeoLayer['kind'] = 'custom'): GeoLayer {
  return { id: crypto.randomUUID(), title, kind, color: kind === 'game_area' ? '#d47e26' : '#267a72', visible: true, source: 'Vlastní úpravy', features: [] };
}
export function newWorld(): WorldDraft {
  return { schemaVersion: SCHEMA_VERSION, id: crypto.randomUUID(), title: 'Praha · nový svět', updatedAt: new Date().toISOString(), layers: [newLayer('Herní oblast', 'game_area'), newLayer('Vlastní objekty')] };
}
export function newFeature(geometry: Geometry, name = 'Nový objekt', source = 'Vlastní kresba'): GeoFeature {
  return { id: crypto.randomUUID(), name, note: '', source, importedAt: new Date().toISOString(), status: 'draft', geometry: validateGeometry(geometry), attributes: {} };
}
export function validateWorld(input: unknown): WorldDraft {
  // Verze 1 neměla metadata spravovaných zdrojů; geometrie i identifikátory zůstávají beze změny.
  const candidate = input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 1 ? { ...input, schemaVersion: SCHEMA_VERSION } : input;
  const parsed = worldSchema.safeParse(candidate);
  if (!parsed.success) throw new Error(`Neplatný datový balíček: ${parsed.error.issues.slice(0, 6).map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const world = parsed.data;
  if (world.gameStops) validateGameStopConfiguration(world.gameStops);
  if (world.poi) validatePoiConfiguration(world.poi);
  if (world.layers.filter(l => l.kind === 'game_area').length !== 1) throw new Error('Svět musí mít právě jednu vrstvu Herní oblast.');
  const ids = new Set<string>();
  for (const layer of world.layers) {
    if (ids.has(layer.id)) throw new Error('Duplicitní ID vrstvy.');
    ids.add(layer.id);
    if (layer.dataset) {
      const kind = layer.dataset.id === 'praha-municipal' ? 'municipal' : 'cadastral';
      if (layer.kind !== kind || layer.id !== layer.dataset.id) throw new Error('Identita spravované administrativní vrstvy neodpovídá jejímu typu.');
      if (layer.features.length !== layer.dataset.featureCount || (kind === 'municipal' && layer.features.length !== 57)) throw new Error('Administrativní vrstva nemá deklarovaný počet území (městských částí musí být 57).');
    }
    if (layer.kind === 'game_area' && (layer.features.length > 1 || layer.features.some(f => !isArea(f.geometry)))) throw new Error('Herní oblast musí být jeden Polygon nebo MultiPolygon.');
    const featureIds = new Set<string>();
    for (const f of layer.features) {
      if (featureIds.has(f.id)) throw new Error('Duplicitní ID objektu ve vrstvě.');
      featureIds.add(f.id);
      if (layer.dataset && (!isArea(f.geometry) || !f.name || typeof f.attributes.code !== 'string' || !f.attributes.code || f.id !== `${layer.id}:${f.attributes.code}`)) throw new Error('Administrativní objekt musí mít polygonovou geometrii, název a stabilní oficiální kód.');
      validateGeometry(f.geometry);
      if (f.circle) {
        const expected = makeMetricCircle(f.circle.center, f.circle.radiusMeters);
        if (JSON.stringify(expected) !== JSON.stringify(f.geometry)) throw new Error('Geometrie kruhu neodpovídá jeho středu a metrickému poloměru.');
      }
    }
  }
  return world;
}
export function isArea(geometry: Geometry): geometry is AreaGeometry {
  return geometry.type === 'Polygon' || geometry.type === 'MultiPolygon';
}
export function distanceMeters(a: Position, b: Position): number {
  position.parse(a); position.parse(b);
  return distance(a, b, { units: 'meters' });
}
export function makeMetricCircle(center: Position, radiusMeters: number): Polygon {
  position.parse(center);
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > 100000) throw new Error('Poloměr musí být větší než 0 a nejvýše 100 000 metrů.');
  return circle(center, radiusMeters, { steps: 128, units: 'meters' }).geometry;
}
// Hranice vnějšího prstence i otvoru jsou součástí plochy; vnitřek otvoru není.
export function pointInArea(point: Position, geometry: AreaGeometry): boolean {
  position.parse(point); validateGeometry(geometry);
  return booleanPointInPolygon(point, geometry);
}
export function addHole(geometry: AreaGeometry, hole: Polygon): AreaGeometry {
  const result = structuredClone(geometry);
  const parts = result.type === 'Polygon' ? [result.coordinates] : result.coordinates;
  const part = parts.find(r => hole.coordinates[0].slice(0, -1).every(p => booleanPointInPolygon(p, polygon(r), { ignoreBoundary: true })));
  if (!part) throw new Error('Celý otvor musí být uvnitř jedné části vybraného polygonu.');
  part.push(hole.coordinates[0]);
  return validateGeometry(result) as AreaGeometry;
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Očekáván JSON objekt.');
  return input as Record<string, unknown>;
}
function parseInput(input: unknown): Record<string, unknown> {
  try { return object(typeof input === 'string' ? JSON.parse(input) : input); }
  catch { throw new Error('Soubor není platný JSON objekt.'); }
}
export function importGeoJson(input: unknown, options: { title: string; source: string; kind?: GeoLayer['kind'] }): GeoLayer {
  const data = parseInput(input);
  if (data.crs) throw new Error('Starší GeoJSON s uvedeným CRS není podporován. Nejprve převeďte data do WGS84 / RFC 7946.');
  const entries = data.type === 'FeatureCollection' ? data.features : data.type === 'Feature' ? [data] : [{ type: 'Feature', geometry: data, properties: {} }];
  if (!Array.isArray(entries) || entries.length > 10000) throw new Error('Očekáván seznam nejvýše 10 000 objektů GeoJSON.');
  const layer = newLayer(options.title, options.kind);
  layer.source = options.source;
  layer.features = entries.map((item, index) => {
    try {
      const raw = object(item);
      if (raw.type !== 'Feature') throw new Error('Očekáván GeoJSON Feature.');
      if (raw.crs || object(raw.geometry).crs) throw new Error('CRS musí být WGS84 bez starší deklarace CRS.');
      const attrs = z.record(z.string(), z.json()).parse(raw.properties ?? {});
      const f = newFeature(validateGeometry(raw.geometry), typeof attrs.name === 'string' ? attrs.name : `Objekt ${index + 1}`, options.source);
      f.attributes = attrs;
      if (typeof raw.id === 'string' || typeof raw.id === 'number') f.id = String(raw.id);
      return f;
    } catch (error) { throw new Error(`Objekt ${index + 1}: ${(error as Error).message}`); }
  });
  if (layer.kind === 'game_area' && layer.features.length > 1) {
    const parts = layer.features.flatMap(f => {
      if (!isArea(f.geometry)) throw new Error('Herní oblast smí obsahovat pouze polygony.');
      return f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    });
    // Zachovat atributy všech původních objektů při sloučení hranice.
    const merged = newFeature({ type: 'MultiPolygon', coordinates: parts }, options.title, options.source);
    merged.attributes = { importedFeatures: JSON.parse(JSON.stringify(layer.features)) };
    layer.features = [merged];
  }
  const world = newWorld();
  world.layers = layer.kind === 'game_area' ? [layer] : [world.layers[0], layer];
  validateWorld(world);
  return layer;
}

export function exportWorld(input: WorldDraft, format: 'json' | 'geojson' = 'json'): string {
  const world = validateWorld(input);
  const manifest = { format: 'jetlag-praha-world', schemaVersion: SCHEMA_VERSION, builtAt: new Date().toISOString(), status: 'draft', coordinateSystem: 'WGS84 / RFC 7946', distanceUnit: 'metres', sources: world.layers.map(l => ({ layerId: l.id, description: l.source, dataset: l.dataset })) };
  if (format === 'json') return JSON.stringify({ manifest, world }, null, 2);
  const layers = world.layers.map(l => ({ ...l, features: undefined }));
  return JSON.stringify({ type: 'FeatureCollection', manifest, world: { ...world, layers: undefined }, layers,
    features: world.layers.flatMap(l => l.features.map(f => ({ type: 'Feature', id: f.id, geometry: f.geometry, properties: { ...f.attributes, name: f.name, note: f.note, source: f.source, _jetlag: { ...f, geometry: undefined, layerId: l.id } } }))),
  }, null, 2);
}
export function importWorld(input: unknown): WorldDraft {
  const data = parseInput(input);
  const manifest = object(data.manifest);
  if (manifest.format !== 'jetlag-praha-world' || ![1, SCHEMA_VERSION].includes(manifest.schemaVersion as number)) throw new Error('Nepodporovaný formát nebo verze schématu datového balíčku.');
  if (data.type !== 'FeatureCollection') return validateWorld(data.world);
  const layers = z.array(geoLayerSchema.omit({ features: true })).parse(data.layers).map(l => ({ ...l, features: [] as GeoFeature[] }));
  if (!Array.isArray(data.features)) throw new Error('Balíček nemá seznam objektů.');
  for (const item of data.features) {
    const raw = object(item);
    const meta = object(object(raw.properties)._jetlag);
    const layer = layers.find(l => l.id === meta.layerId);
    if (!layer) throw new Error('Objekt odkazuje na neznámou vrstvu.');
    layer.features.push(geoFeatureSchema.parse({ ...meta, geometry: raw.geometry }));
  }
  return validateWorld({ ...object(data.world), layers });
}

export interface DraftStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export const STORAGE_KEY = 'jetlag-praha:world:v1';
export function saveDraft(storage: DraftStorage, world: WorldDraft): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(validateWorld(world)));
}
export function loadDraft(storage: DraftStorage): WorldDraft | null {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? null : validateWorld(JSON.parse(raw));
}

export * from './administrative';
export * from './pid-snapshot';
export * from './game-stops';
export * from './pid-adapter';
export * from './territory';
export * from './default-game-area';
export * from './pid-gtfs';
export * from './pid-catalog';
export * from './pid-shared';
export * from './hide-selection';

export * from './poi';

export * from './park-selection';

export * from './game-release';
