import { canonicalJson } from './administrative';
import { decidePoi, libraryId, poiSchema, unlocatedLibrarySchema, type Poi, type PoiConfiguration, type PoiDecision, type UnlocatedLibrary } from './poi';

export function resolveUnlocatedLibraries(configuration: PoiConfiguration): UnlocatedLibrary[] {
  const located = new Set([...(configuration.pointCatalog ?? []), ...configuration.manual].filter(poi => poi.category === 'library').map(poi => poi.library?.selectionKey).filter(Boolean));
  const decisions = new Map(configuration.decisions.map(decision => [decision.id, decision]));
  return (configuration.unlocatedLibraries ?? []).filter(row => !located.has(row.selectionKey)).map(row => {
    const decision = decisions.get(row.id);
    return { ...row, name: decision?.name ?? row.name, address: decision?.address ?? row.address, note: decision?.note ?? row.note, reviewedAt: decision?.reviewedAt ?? row.reviewedAt, status: decision?.status === 'excluded' ? 'excluded' : decision?.status === 'review' ? 'review' : row.status };
  });
}
export function decideUnlocatedLibrary(configuration: PoiConfiguration, row: UnlocatedLibrary, change: Pick<PoiDecision, 'name' | 'address' | 'note' | 'status'>): PoiConfiguration {
  if (change.status === 'approved') throw new Error('Knihovnu bez doloženého bodu nelze schválit. Nejdříve doplňte skutečnou polohu a oficiální detail.');
  const previous = configuration.decisions.find(decision => decision.id === row.id);
  unlocatedLibrarySchema.parse({ ...row, ...change, status: change.status ?? row.status });
  return { ...configuration, decisions: [...configuration.decisions.filter(decision => decision.id !== row.id), { ...previous, ...change, id: row.id, reviewedAt: new Date().toISOString() }] };
}
export interface NewLibrary { name: string; address: string; officialUrl: string; note?: string }
export function createManualLibrary(point: [number, number], input: NewLibrary, candidate?: UnlocatedLibrary): Poi {
  const id = libraryId(input.officialUrl), at = new Date().toISOString();
  return poiSchema.parse({ id, category: 'library', name: input.name.trim(), address: input.address.trim(), point, geometry: { type: 'Point', coordinates: point }, sourceId: id,
    library: { officialUrl: input.officialUrl, ...(candidate ? { selectionKey: candidate.selectionKey } : {}) },
    source: candidate?.source ?? { id: 'manual-library', provider: 'Městská knihovna v Praze – ruční doplnění správce', url: 'https://www.mlp.cz/cz/pobocky', license: { name: 'Licence podkladů není doložena', url: null }, dataDate: null, retrievedAt: at, rawChecksum: null, verification: 'user_supplied', note: 'Bod ručně vložený správcem; před schválením je nutná kontrola přesné polohy pobočky.' },
    status: candidate?.status === 'excluded' ? 'excluded' : 'review', reviewedAt: null, note: input.note ?? '',
    attributes: candidate ? { originalCandidate: candidate } : {},
  });
}
export function addLibrary(configuration: PoiConfiguration, point: [number, number], input: NewLibrary, candidate?: UnlocatedLibrary): { configuration: PoiConfiguration; poi: Poi } {
  const poi = createManualLibrary(point, input, candidate);
  const known = [...(configuration.pointCatalog ?? []), ...configuration.manual];
  if (known.some(row => row.id === poi.id)) throw new Error(`Pobočka ${poi.id} již existuje. Vyberte ji v seznamu a případně vraťte do hry; duplicitní objekt nebyl vytvořen.`);
  if (candidate && known.some(row => row.library?.selectionKey === candidate.selectionKey)) throw new Error('Tato pobočka už má bod. Vyberte existující knihovnu.');
  return { configuration: { ...configuration, manual: [...configuration.manual, poi] }, poi };
}
export function verifyLibraryDecision(configuration: PoiConfiguration, poi: Poi, change: Partial<Omit<PoiDecision, 'id'>>, confirmLocation: boolean): PoiConfiguration {
  if (poi.category !== 'library' || !poi.library) throw new Error('Očekávána knihovna.');
  const point = change.point ?? poi.point;
  const changed = canonicalJson(point) !== canonicalJson(poi.point);
  return decidePoi(configuration, poi, { ...change, ...(confirmLocation ? { libraryVerification: { point, method: 'manual_review', checkedAt: new Date().toISOString(), url: poi.library.officialUrl } } : changed ? { libraryVerification: null } : {}) });
}
export function removeManualLibrary(configuration: PoiConfiguration, id: string): PoiConfiguration {
  if (!configuration.manual.some(poi => poi.id === id && poi.category === 'library' && !poi.library?.selectionKey)) throw new Error('Odstranit lze pouze vlastní knihovnu. Pobočku výchozího výběru vyřaďte ze hry.');
  return { ...configuration, manual: configuration.manual.filter(poi => poi.id !== id), decisions: configuration.decisions.filter(decision => decision.id !== id) };
}
/** An explicit target/marker is evidence; x/y, @lat,lon and viewport centers are
 * not. The caller must additionally establish that the URL came from the branch. */
export function explicitLibraryMapPoint(input: string): [number, number] | null {
  try {
    const url = new URL(input);
    let pair: string | null = null, order: 'lat-lon' | 'lon-lat' = 'lat-lon';
    if (url.protocol === 'geo:') pair = url.pathname.split(';')[0];
    else if (['mapy.cz', 'www.mapy.cz', 'mapy.com', 'www.mapy.com'].includes(url.hostname)) {
      if (url.searchParams.get('source') === 'coor') { pair = url.searchParams.get('id'); order = 'lon-lat'; }
      else pair = url.searchParams.get('q');
    } else if (['maps.google.com', 'www.google.com', 'google.com'].includes(url.hostname)) pair = url.searchParams.get('query') ?? url.searchParams.get('q');
    if (!pair || !/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(pair)) return null;
    const numbers = pair.split(',').map(Number), point: [number, number] = order === 'lon-lat' ? [numbers[0], numbers[1]] : [numbers[1], numbers[0]];
    if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return null;
    return point;
  } catch { return null; }
}
