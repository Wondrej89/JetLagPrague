import { describe, expect, test } from 'vitest';
import { booleanPointInPolygon } from '@turf/turf';
import {
  applyParkUpdate, compareParkUpdate, defaultGameStopConfiguration, withPublishedParks, sha256, createManualPark, decidePoi, defaultPoiConfiguration, distanceMeters, exportWorld,
  importParkGeoJson, importWorld, interiorReferencePoint, matchingPois, measuringPois, mergeParks, nearestApprovedPoi,
  newFeature, newWorld, poiSchema, resolvePois, saveDraft, loadDraft, validateWorld, verifyParkDataset, type AreaGeometry, type PoiSource,
} from './index';
import catalog from '../../../apps/editor/src/data/poi-catalog.json';

const airports = catalog.airports.map(p => poiSchema.parse(p));
const irregular: AreaGeometry = { type: 'Polygon', coordinates: [[[14.4, 50], [14.42, 50], [14.42, 50.004], [14.404, 50.004], [14.404, 50.02], [14.4, 50.02], [14.4, 50]]] };
const hole: AreaGeometry = { type: 'Polygon', coordinates: [[[14.4, 50], [14.44, 50], [14.44, 50.04], [14.4, 50.04], [14.4, 50]], [[14.405, 50.005], [14.405, 50.035], [14.435, 50.035], [14.435, 50.005], [14.405, 50.005]]] };
const separate: AreaGeometry = { type: 'MultiPolygon', coordinates: [irregular.coordinates, [[[14.5, 50.1], [14.52, 50.1], [14.52, 50.12], [14.5, 50.12], [14.5, 50.1]]]] };
const source: Omit<PoiSource, 'rawChecksum'> = { id: 'fixture-parks', provider: 'Syntetická testovací data', url: 'https://example.test/parks', license: { name: 'Test', url: null }, dataDate: '2026-10-16', retrievedAt: '2026-10-16T10:00:00Z', verification: 'user_supplied', note: 'Pouze test; nejde o skutečné parky Prahy.' };
function geojson(geometry: AreaGeometry = irregular, name = 'Testovací park', code = 'one') {
  return JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { stable: code, title: name, original: 'preserved' }, geometry }] });
}
async function dataset(geometry: AreaGeometry = irregular, name = 'Testovací park') { return importParkGeoJson(geojson(geometry, name), { source, idField: 'stable', nameField: 'title' }); }

describe('published approved airport category', () => {
  test('exactly three airports with approved ARP coordinates in longitude, latitude order', () => {
    expect(airports.map(p => p.id).sort()).toEqual(['LKKB', 'LKPR', 'LKTC']);
    expect(Object.fromEntries(airports.map(p => [p.id, p.point]))).toEqual({ LKPR: [14.26, 50.100833], LKKB: [14.543639, 50.121367], LKTC: [14.425556, 49.985278] });
    for (const airport of airports) { expect(airport.status).toBe('approved'); expect(airport.geometry).toEqual({ type: 'Point', coordinates: airport.point }); }
  });
  test('airport source checksum matches the published approved input', async () => {
    expect(await sha256(JSON.stringify(catalog.airportArpInput))).toBe(airports[0].source.rawChecksum);
  });
  test('Matching across west, east and south Prague uses stable airport IDs', () => {
    const same = matchingPois([14.29, 50.1], [14.3, 50.09], 'airport', airports);
    expect(same.state === 'known' && same.matches).toBe(true);
    const different = matchingPois([14.29, 50.1], [14.53, 50.12], 'airport', airports);
    expect(different.state === 'known' && different.matches).toBe(false);
    const south = nearestApprovedPoi([14.43, 49.99], 'airport', airports);
    expect(south.state === 'known' && south.poi.id).toBe('LKTC');
  });
  test('Measuring uses geographic metres and equal-distance IDs are deterministic', () => {
    const result = measuringPois([14.26, 50.100833], [14.27, 50.100833], 'airport', airports);
    expect(result.state).toBe('known');
    if (result.state === 'known') {
      expect(result.first.distanceMeters).toBe(0); expect(result.second.distanceMeters).toBeGreaterThan(700); expect(result.second.distanceMeters).toBeLessThan(720);
      expect(result.comparison).toBe('first-closer'); expect(result.second.distanceMeters).toBeCloseTo(distanceMeters([14.26, 50.100833], [14.27, 50.100833]), 6);
    }
    const tied = [ { ...airports[0], id: 'Z' }, { ...airports[0], id: 'A' } ];
    for (const order of [tied, [...tied].reverse()]) {
      const match = nearestApprovedPoi([14.4, 50.1], 'airport', order);
      expect(match.state === 'known' && match.poi.id).toBe('A'); expect(match.state === 'known' && match.tiedIds).toEqual(['A', 'Z']);
    }
    expect(measuringPois(airports[0].point, airports[0].point, 'airport', airports)).toMatchObject({ state: 'known', comparison: 'equal' });
  });
});

describe('park source and decision separation', () => {
  test.each([irregular, hole, separate])('reference point is strictly inside concave, holed or disconnected geometry %#', geometry => {
    const point = interiorReferencePoint(geometry);
    expect(booleanPointInPolygon(point, geometry, { ignoreBoundary: true })).toBe(true);
  });
  test('excluded and unapproved parks cannot enter questions, missing category returns unknown', async () => {
    const data = await dataset(); let config = applyParkUpdate(defaultPoiConfiguration(), data);
    const park = data.records[0]; expect(park.status).toBe('review');
    expect(nearestApprovedPoi(park.point, 'park', resolvePois(airports, config)).state).toBe('unknown');
    config = decidePoi(config, park, { status: 'approved' });
    expect(nearestApprovedPoi(park.point, 'park', resolvePois(airports, config)).state).toBe('known');
    config = decidePoi(config, park, { status: 'excluded' });
    expect(matchingPois(park.point, park.point, 'park', resolvePois(airports, config)).state).toBe('unknown');
    expect(measuringPois(park.point, park.point, 'museum', airports).state).toBe('unknown');
    expect(nearestApprovedPoi([NaN, 50], 'airport', airports).state).toBe('unknown');
  });
  test('source update preserves approval, exclusion, renamed park and manual point across serialization and reload', async () => {
    const data = await dataset(); const park = data.records[0];
    let config = applyParkUpdate(defaultPoiConfiguration(), data);
    config = decidePoi(config, park, { status: 'approved', name: 'Ruční název', point: [14.401, 50.01], note: 'Moje rozhodnutí' });
    const refreshed = await dataset(irregular, 'Změněný zdrojový název');
    config = applyParkUpdate(config, refreshed);
    expect(config.sources[0].records[0].name).toBe('Změněný zdrojový název');
    expect(resolvePois([], config)[0]).toMatchObject({ name: 'Ruční název', point: [14.401, 50.01], status: 'approved', note: 'Moje rozhodnutí' });
    const world = { ...newWorld(), poi: config };
    const memory = new Map<string, string>(), storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    saveDraft(storage, world); expect(loadDraft(storage)?.poi).toEqual(config);
    config = decidePoi(config, park, { status: 'excluded' });
    expect(resolvePois([], applyParkUpdate(config, data))[0].status).toBe('excluded');
  });
  test('changed geometry retains manual coordinates but requires review if point is outside', async () => {
    const data = await dataset(); const park = data.records[0];
    const config = decidePoi(applyParkUpdate(defaultPoiConfiguration(), data), park, { status: 'approved', point: [14.401, 50.01] });
    const moved = await dataset({ type: 'Polygon', coordinates: separate.coordinates.slice(1)[0] });
    const result = resolvePois([], applyParkUpdate(config, moved))[0];
    expect(result.point).toEqual([14.401, 50.01]); expect(result.status).toBe('review');
    expect(() => decidePoi(config, result, { status: 'approved' })).toThrow(/referenční bod/);
    expect(() => decidePoi(config, park, { point: [14.41, 50.01] })).toThrow(/uvnitř/);
  });
  test('missing objects remain historical and can reappear without duplicate IDs or lost decisions', async () => {
    const data = await dataset(); const park = data.records[0];
    let config = decidePoi(applyParkUpdate(defaultPoiConfiguration(), data), park, { status: 'approved' });
    const other = await importParkGeoJson(geojson(irregular, 'Jiný park', 'two'), { source, idField: 'stable', nameField: 'title' });
    expect(compareParkUpdate(data, other)).toMatchObject({ added: 1, removed: 1 });
    config = applyParkUpdate(config, other);
    expect(resolvePois([], config).find(p => p.id === park.id)?.status).toBe('review');
    expect(config.decisions[0].status).toBe('approved');
    config = applyParkUpdate(config, data);
    expect(() => validateWorld({ ...newWorld(), poi: config })).not.toThrow();
    expect(resolvePois([], config).find(p => p.id === park.id)?.status).toBe('approved');
  });
  test('real union merges parts, preserves holes and original source metadata and excludes originals', () => {
    const first = createManualPark(hole, 'První část'), second = createManualPark({ type: 'Polygon', coordinates: separate.coordinates[1] }, 'Druhá část');
    const result = mergeParks({ ...defaultPoiConfiguration(), manual: [first, second] }, [first, second], 'Jeden park');
    expect(result.park.geometry.type).toBe('MultiPolygon'); expect(result.park.memberIds).toEqual([first.id, second.id]);
    expect(booleanPointInPolygon([14.42, 50.02], result.park.geometry as AreaGeometry)).toBe(false);
    expect(booleanPointInPolygon(result.park.point, result.park.geometry as AreaGeometry, { ignoreBoundary: true })).toBe(true);
    expect(resolvePois([], result.configuration).filter(p => p.status === 'excluded')).toHaveLength(2);
    expect(result.park.attributes.origins).toHaveLength(2);
  });
  test('unnamed parks need review; bad IDs, duplicate IDs, wrong CRS, nonpolygon and altered checksum are rejected atomically', async () => {
    const unnamed = await dataset(irregular, '');
    expect(unnamed.records[0]).toMatchObject({ name: '', status: 'review' });
    expect(() => decidePoi(defaultPoiConfiguration(), unnamed.records[0], { status: 'approved' })).toThrow(/název/);
    await expect(importParkGeoJson(geojson(), { source, idField: 'missing', nameField: 'title' })).rejects.toThrow(/stabilní ID/);
    const input = JSON.parse(geojson()); input.features.push(input.features[0]);
    await expect(importParkGeoJson(JSON.stringify(input), { source, idField: 'stable', nameField: 'title' })).rejects.toThrow(/Duplicitní/);
    input.features.pop(); input.crs = { name: 'EPSG:5514' };
    await expect(importParkGeoJson(JSON.stringify(input), { source, idField: 'stable', nameField: 'title' })).rejects.toThrow(/WGS84/);
    delete input.crs; input.features[0].geometry = { type: 'Point', coordinates: [14.4, 50] };
    await expect(importParkGeoJson(JSON.stringify(input), { source, idField: 'stable', nameField: 'title' })).rejects.toThrow(/Polygon/);
    const data = await dataset(); expect(await verifyParkDataset(data)).toEqual(data);
    data.records[0].name = 'Poškozený zdroj'; await expect(verifyParkDataset(data)).rejects.toThrow(/součet/);
  });
  test('JSON and GeoJSON roundtrip preserve existing world, PID configuration, user objects and POI decisions', async () => {
    const world = newWorld(); world.gameStops = { ...defaultGameStopConfiguration(), radiusMeters: 450 }; world.layers[0].features = [newFeature(hole, 'Moje hranice')]; world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50] }, 'Vlastní objekt')];
    const data = await dataset(separate); const park = data.records[0];
    world.poi = decidePoi(applyParkUpdate(defaultPoiConfiguration(), data), park, { status: 'approved' });
    world.poi.visibility.parks = false;
    for (const format of ['json', 'geojson'] as const) expect(importWorld(exportWorld(world, format))).toEqual(world);
    const legacy = newWorld(); expect(importWorld(exportWorld(legacy)).poi).toBeUndefined();
  });
});

test('newly published parks are added without replacing saved source or user decisions', async () => {
  const data = await dataset(); const park = data.records[0];
  const published = decidePoi(applyParkUpdate(defaultPoiConfiguration(), data), park, { status: 'approved' });
  const saved = decidePoi(applyParkUpdate(defaultPoiConfiguration(), data), park, { status: 'excluded', point: [14.401, 50.01] });
  saved.visibility.parks = false;
  const combined = withPublishedParks(saved, published);
  expect(resolvePois([], combined)[0]).toMatchObject({ status: 'excluded', point: [14.401, 50.01] });
  expect(combined.sources).toEqual(saved.sources); expect(combined.visibility.parks).toBe(false);
  expect(resolvePois([], withPublishedParks(defaultPoiConfiguration(), published))[0].status).toBe('approved');
});
