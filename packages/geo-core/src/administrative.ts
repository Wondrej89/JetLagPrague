import { booleanPointInPolygon } from '@turf/turf';
import type { Position } from 'geojson';
import { distanceMeters, isArea, newWorld, sourceDatasetSchema, validateGeometry, validateWorld, type GeoFeature, type GeoLayer, type SourceDataset, type WorldDraft } from './index';

export interface AdminSnapshot {
  format: 'jetlag-praha-administrative';
  schemaVersion: 1;
  dataset: SourceDataset;
  features: GeoFeature[];
}
export function isManagedLayer(layer: GeoLayer): boolean { return !!layer.dataset; }

// Kanonizace objektů, nikoli souřadnic: nepřepočítává, nezaokrouhluje a nezjednodušuje hranice.
export function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) return `[${input.map(canonicalJson).join(',')}]`;
  if (input && typeof input === 'object') return `{${Object.entries(input).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  return JSON.stringify(input);
}
function content(f: GeoFeature) { return { id: f.id, name: f.name, geometry: f.geometry, attributes: f.attributes }; }
export async function administrativeChecksum(features: GeoFeature[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson([...features].sort((a, b) => a.id.localeCompare(b.id)).map(content)));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
export function snapshotLayer(snapshot: AdminSnapshot): GeoLayer {
  const dataset = sourceDatasetSchema.parse(snapshot.dataset);
  if (snapshot.format !== 'jetlag-praha-administrative' || snapshot.schemaVersion !== 1) throw new Error('Nepodporovaný formát administrativních dat.');
  const layer: GeoLayer = {
    id: dataset.id, title: dataset.id === 'praha-municipal' ? 'Městské části Prahy' : 'Katastrální území Prahy',
    kind: dataset.id === 'praha-municipal' ? 'municipal' : 'cadastral',
    color: dataset.id === 'praha-municipal' ? '#7057a3' : '#287b9a',
    visible: false, source: dataset.provider, dataset, features: snapshot.features,
  };
  const world = newWorld(); world.layers.push(layer);
  return validateWorld(world).layers.at(-1)!;
}
export async function readAdministrativeSnapshot(input: unknown): Promise<GeoLayer> {
  let data: AdminSnapshot;
  try { data = (typeof input === 'string' ? JSON.parse(input) : input) as AdminSnapshot; }
  catch { throw new Error('Soubor administrativních dat není platný JSON.'); }
  if (!data || typeof data !== 'object') throw new Error('Očekáván balíček administrativních dat.');
  const layer = snapshotLayer(data);
  if (await administrativeChecksum(layer.features) !== layer.dataset!.checksum) throw new Error('Kontrolní součet administrativních dat nesouhlasí. Soubor je poškozený nebo byl změněný.');
  return layer;
}
export async function verifyAdministrativeSources(world: WorldDraft): Promise<void> {
  for (const layer of world.layers) if (layer.dataset && await administrativeChecksum(layer.features) !== layer.dataset.checksum) throw new Error(`Kontrolní součet vrstvy „${layer.title}“ nesouhlasí. Zdrojová data nebyla použita.`);
}

export interface SourceDiff { added: string[]; changed: string[]; removed: string[]; unchanged: string[] }
export function compareAdministrativeLayers(previous: GeoLayer | undefined, next: GeoLayer): SourceDiff {
  if (!next.dataset || (previous && previous.dataset?.id !== next.dataset.id)) throw new Error('Porovnávat lze pouze verze stejného administrativního zdroje.');
  const old = new Map(previous?.features.map(f => [f.id, f]) ?? []);
  const diff: SourceDiff = { added: [], changed: [], removed: [], unchanged: [] };
  for (const f of next.features) {
    const before = old.get(f.id);
    if (!before) diff.added.push(f.id);
    else if (canonicalJson(content(before)) === canonicalJson(content(f))) diff.unchanged.push(f.id);
    else diff.changed.push(f.id);
    old.delete(f.id);
  }
  diff.removed = [...old.keys()];
  return diff;
}
export function applyAdministrativeUpdate(world: WorldDraft, next: GeoLayer): WorldDraft {
  if (!next.dataset) throw new Error('Aktualizace nemá evidovaný zdroj.');
  const existing = world.layers.find(l => l.id === next.id);
  if (existing && existing.dataset?.id !== next.dataset.id) throw new Error('ID zdrojové vrstvy koliduje s vlastní vrstvou. Vlastní data nebyla změněna.');
  const replacement = existing ? { ...next, visible: existing.visible, color: existing.color, title: existing.title } : next;
  return validateWorld({ ...world, layers: existing ? world.layers.map(l => l.id === next.id ? replacement : l) : [...world.layers, replacement] });
}

export interface AreaMatch { id: string; name: string; code: string }
export interface AreaResult {
  status: 'inside' | 'outside' | 'boundary' | 'ambiguous' | 'unknown';
  matches: AreaMatch[];
  reason?: string;
}
export function classifyArea(point: Position, layer: GeoLayer | undefined): AreaResult {
  try { distanceMeters(point, point); }
  catch { return { status: 'unknown', matches: [], reason: 'Neplatné WGS84 souřadnice.' }; }
  if (!layer?.features.length) return { status: 'unknown', matches: [], reason: 'Chybí polygonová data.' };
  const matches: AreaMatch[] = [];
  let onBoundary = false;
  for (const f of layer.features) {
    if (!isArea(f.geometry)) return { status: 'unknown', matches: [], reason: 'Vrstva obsahuje nepolygonovou geometrii.' };
    // Vrstva je validovaná při načtení. Drag bodu znovu neprovádí drahou topologickou validaci.
    if (booleanPointInPolygon(point, f.geometry)) {
      if (!booleanPointInPolygon(point, f.geometry, { ignoreBoundary: true })) onBoundary = true;
      matches.push({ id: f.id, name: f.name, code: typeof f.attributes.code === 'string' ? f.attributes.code : f.id });
    }
  }
  matches.sort((a, b) => a.code.localeCompare(b.code));
  if (matches.length > 1) return { status: 'ambiguous', matches, reason: onBoundary ? 'Bod leží na společné hranici více území; nelze jednoznačně přiřadit.' : 'Datové polygony se v tomto místě překrývají; nelze jednoznačně přiřadit.' };
  return { status: matches.length ? onBoundary ? 'boundary' : 'inside' : 'outside', matches };
}
export function inspectPosition(point: Position, world: WorldDraft) {
  return {
    gameArea: classifyArea(point, world.layers.find(l => l.kind === 'game_area')),
    municipal: classifyArea(point, world.layers.find(l => l.dataset?.id === 'praha-municipal')),
    cadastral: classifyArea(point, world.layers.find(l => l.dataset?.id === 'praha-cadastral')),
  };
}

// Offline příprava z oficiálního GeoJSON po ověřené transformaci do WGS84.
export async function createAdministrativeSnapshot(input: unknown, metadata: Omit<SourceDataset, 'checksum' | 'featureCount'>, fields: { code: string; name: string }): Promise<AdminSnapshot> {
  const raw = input as { type?: string; crs?: unknown; features?: { geometry: unknown; properties: Record<string, unknown> }[] };
  if (raw?.type !== 'FeatureCollection' || !Array.isArray(raw.features) || raw.crs) throw new Error('Vstup musí být FeatureCollection ve WGS84 / RFC 7946 bez deklarace jiného CRS.');
  const features = raw.features.map((f, i) => {
    const code = f.properties?.[fields.code]; const name = f.properties?.[fields.name];
    if (!['string', 'number'].includes(typeof code) || !code || typeof name !== 'string' || !name.trim()) throw new Error(`Objekt ${i + 1} nemá oficiální kód nebo název.`);
    const geometry = validateGeometry(f.geometry);
    if (!isArea(geometry)) throw new Error('Administrativní hranice musí být Polygon nebo MultiPolygon.');
    return { id: `${metadata.id}:${code}`, name, note: '', source: metadata.provider, importedAt: metadata.retrievedAt, status: 'draft' as const, geometry, attributes: { code: String(code), original: JSON.parse(JSON.stringify(f.properties)) } };
  });
  const snapshot: AdminSnapshot = { format: 'jetlag-praha-administrative', schemaVersion: 1, dataset: { ...metadata, featureCount: features.length, checksum: await administrativeChecksum(features) }, features };
  snapshotLayer(snapshot);
  return snapshot;
}
