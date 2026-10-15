import { describe, expect, it } from 'vitest';
import type { Polygon, MultiPolygon } from 'geojson';
import { addHole, distanceMeters, exportWorld, importGeoJson, importWorld, loadDraft, makeMetricCircle, newFeature, newWorld, pointInArea, saveDraft, STORAGE_KEY, validateGeometry, validateWorld } from './index';

// Syntetické testovací souřadnice, nikoli správní hranice ani reálné městské objekty.
const square: Polygon = { type: 'Polygon', coordinates: [[[14.4, 50], [14.5, 50], [14.5, 50.1], [14.4, 50.1], [14.4, 50]]] };
const hole: Polygon = { type: 'Polygon', coordinates: [[[14.42, 50.02], [14.44, 50.02], [14.44, 50.04], [14.42, 50.04], [14.42, 50.02]]] };
const multi: MultiPolygon = { type: 'MultiPolygon', coordinates: [addHole(square, hole).coordinates as Polygon['coordinates'], [[[14.6, 50], [14.7, 50], [14.7, 50.1], [14.6, 50.1], [14.6, 50]]]] };
function populatedWorld() {
  const world = newWorld();
  world.layers[0].features = [newFeature(multi, 'Testovací multipolygon')];
  const f = newFeature({ type: 'Point', coordinates: [14.43, 50.08, 230] }, 'Vlastní bod', 'Syntetická data');
  f.attributes = { nested: { key: [false, 42, 'český text'] }, _jetlag: 'běžný uživatelský atribut' };
  f.note = 'Poznámka'; world.layers[1].features = [f];
  return world;
}
describe('přenosný datový kontrakt', () => {
  it.each(['json', 'geojson'] as const)('zachová celý svět, MultiPolygon, otvor, výšku i atributy přes %s', format => {
    const world = populatedWorld();
    expect(importWorld(exportWorld(world, format))).toEqual(world);
    expect(exportWorld(world, format)).not.toContain('apikey');
  });
  it('zachovává prázdné vrstvy a parametry metrického kruhu', () => {
    const world = newWorld();
    const f = newFeature(makeMetricCircle([14.43, 50.08], 250));
    f.circle = { center: [14.43, 50.08], radiusMeters: 250 };
    world.layers[1].features.push(f);
    expect(importWorld(exportWorld(world, 'geojson'))).toEqual(world);
  });
  it('importuje pojmenovanou vrstvu se zdrojovými atributy', () => {
    const layer = importGeoJson({ type: 'FeatureCollection', features: [{ type: 'Feature', id: 'source-1', geometry: multi, properties: { name: 'Test', value: 42 } }] }, { title: 'Import', source: 'Testovací zdroj' });
    expect(layer.features[0].geometry).toEqual(multi);
    expect(layer.features[0].attributes.value).toBe(42);
    expect(layer.features[0].id).toBe('source-1');
  });
  it('sloučí více importovaných hranic do jedné herní oblasti bez ztráty atributů', () => {
    const features = multi.coordinates.map((coordinates, i) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates }, properties: { name: `Část ${i}` } }));
    const layer = importGeoJson({ type: 'FeatureCollection', features }, { title: 'Hranice', source: 'Test', kind: 'game_area' });
    expect(layer.features).toHaveLength(1);
    expect(layer.features[0].geometry).toEqual(multi);
    expect(layer.features[0].attributes.importedFeatures).toHaveLength(2);
  });
  it('odmítne neznámou verzi a duplicitní identity', () => {
    const data = JSON.parse(exportWorld(newWorld())); data.manifest.schemaVersion = 99;
    expect(() => importWorld(data)).toThrow('verze');
    const world = newWorld(); world.layers.push(world.layers[1]);
    expect(() => validateWorld(world)).toThrow('Duplicitní');
  });
});
describe('validace a skutečná geometrie', () => {
  it.each([[181, 50], [14, 91], [NaN, 50], ['14', 50], [14], [Infinity, 0]])('odmítne vadné WGS84 souřadnice %j', (...coordinates) => {
    expect(() => validateGeometry({ type: 'Point', coordinates })).toThrow();
  });
  it('odmítne neuzavřený polygon, křížení, otvor mimo a překryv částí', () => {
    expect(() => validateGeometry({ type: 'LineString', coordinates: [[14, 50], [14, 50]] })).toThrow('nulovou');
    expect(() => validateGeometry({ type: 'Polygon', coordinates: [square.coordinates[0].slice(0, -1)] })).toThrow();
    expect(() => validateGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 1], [1, 0], [0, 1], [0, 0]]] })).toThrow();
    expect(() => validateGeometry({ type: 'Polygon', coordinates: [...square.coordinates, [[14, 50], [14.1, 50], [14.1, 50.1], [14, 50.1], [14, 50]]] })).toThrow('Otvor');
    expect(() => validateGeometry({ type: 'MultiPolygon', coordinates: [square.coordinates, square.coordinates] })).toThrow();
  });
  it('odmítne nesprávné CRS i chybný objekt uprostřed importu', () => {
    expect(() => importGeoJson({ type: 'FeatureCollection', crs: { name: 'EPSG:3857' }, features: [] }, { title: 'Test', source: 'Test' })).toThrow('WGS84');
    expect(() => importGeoJson({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: square }, { type: 'Feature', geometry: { type: 'Point', coordinates: [999, 50] } }] }, { title: 'Test', source: 'Test' })).toThrow('Objekt 2');
  });
  it('nepřevezme pozdější změnu již zkontrolovaného vstupního objektu', () => {
    const raw = structuredClone(square);
    const checked = validateGeometry(raw);
    raw.coordinates[0][0][0] = 999;
    expect(() => validateGeometry(raw)).toThrow();
    expect(checked.coordinates).toEqual(square.coordinates);
    expect(Object.isFrozen(checked)).toBe(true);
  });
  it('testuje skutečný polygon a jeho otvor, ne bounding box', () => {
    expect(pointInArea([14.41, 50.01], multi)).toBe(true);
    expect(pointInArea([14.43, 50.03], multi)).toBe(false);
    expect(pointInArea([14.55, 50.05], multi)).toBe(false);
    expect(pointInArea([14.65, 50.05], multi)).toBe(true);
    expect(pointInArea([14.4, 50.05], multi)).toBe(true);
    expect(pointInArea([14.42, 50.03], multi)).toBe(true);
  });
  it('přidá otvor do správné části MultiPolygonu a odmítne vnější nebo vnořený otvor', () => {
    expect(() => addHole(hole, square)).toThrow();
    expect(() => addHole(addHole(square, hole), hole)).toThrow();
    const simpleMulti: MultiPolygon = { type: 'MultiPolygon', coordinates: [square.coordinates, multi.coordinates[1]] };
    expect(addHole(simpleMulti, hole)).toEqual(multi);
  });
  it.each([50.08, 0, -45, 75])('všechny vrcholy kruhu mají poloměr 250 m při šířce %s', lat => {
    const center = [14.43, lat];
    const circle = makeMetricCircle(center, 250);
    expect(circle.coordinates[0]).toHaveLength(129);
    for (const p of circle.coordinates[0]) expect(distanceMeters(center, p)).toBeCloseTo(250, 5);
  });
  it('měří metry po povrchu a odmítne neplatný poloměr', () => {
    expect(distanceMeters([0, 0], [1, 0])).toBeCloseTo(111195.0802, 2);
    expect(distanceMeters([14, 50], [14, 50])).toBe(0);
    for (const radius of [0, -1, NaN, Infinity, 100001]) expect(() => makeMetricCircle([14, 50], radius)).toThrow();
  });
});
describe('uložení draftu', () => {
  it('obnoví celý uložený svět a nezmění poškozený záznam', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(loadDraft(storage)).toBeNull();
    const world = populatedWorld(); saveDraft(storage, world);
    expect(loadDraft(storage)).toEqual(world);
    values.set(STORAGE_KEY, '{invalid');
    expect(() => loadDraft(storage)).toThrow();
    expect(values.get(STORAGE_KEY)).toBe('{invalid');
  });
});
