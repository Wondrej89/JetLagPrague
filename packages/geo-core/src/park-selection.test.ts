import { expect, test } from 'vitest';
import { applyParkUpdate, createManualPark, decideParkHierarchies, decidePoi, defaultGameStopConfiguration, defaultParkFilters, defaultPoiConfiguration, exportWorld, filterParkPois, importParkGeoJson, importWorld, newFeature, newWorld, parkHierarchy, resolvePois, undoParkBulk, type Poi } from './index';

const polygon = { type: 'Polygon' as const, coordinates: [[[14.4, 50], [14.42, 50], [14.42, 50.02], [14.4, 50.02], [14.4, 50]]] };
function park(hierarchy: unknown, name = 'Testovací park'): Poi { const poi = createManualPark(polygon, name); return { ...poi, attributes: { HIERARCHIE: hierarchy as number } }; }
function configuration(parks: Poi[]) { return { ...defaultPoiConfiguration(), manual: parks }; }
test.each([[1, 1], ['1', 1], [' 2 ', 2], [3, 3], ['4', 4], [null, 'unknown'], ['', 'unknown'], [undefined, 'unknown'], [true, 'unknown'], [0, 'unknown'], [5, 'unknown'], ['místní', 'unknown']])('hierarchy %j resolves to %j', (value, expected) => {
  expect(parkHierarchy(park(value))).toBe(expected);
});
test('conflicting or missing merged source hierarchies remain unknown', () => {
  const poi = park(1); poi.importAudit = { sourceRows: [1, 2], sourceNames: ['A', 'B'], repairedRows: [], merged: true, sourceRecords: [{ row: 1, attributes: { HIERARCHIE: 1 } }, { row: 2, attributes: { HIERARCHIE: '1' } }] };
  expect(parkHierarchy(poi)).toBe(1);
  poi.importAudit.sourceRecords[1].attributes.HIERARCHIE = 2; expect(parkHierarchy(poi)).toBe('unknown');
});
test('working hierarchy/status/search and full approved map preview are independent of game eligibility', async () => {
  const parks = [park(1, 'Metropolitní'), park('2', 'Čtvrťový'), park(null, 'Bez hierarchie')];
  let config = configuration(parks);
  config = decidePoi(config, parks[0], { status: 'excluded' }); config = decidePoi(config, parks[1], { status: 'approved' });
  const pois = resolvePois([], config), filters = defaultParkFilters();
  expect(filterParkPois(pois, filters, 'list').map(p => p.id)).toEqual([parks[0].id]);
  expect(filterParkPois(pois, { ...filters, hierarchies: [1, 2] }, 'map')).toHaveLength(2);
  expect(filterParkPois(pois, { ...filters, showOutside: true }, 'list')).toHaveLength(3);
  expect(filterParkPois(pois, { ...filters, showOutside: true, status: 'approved' }, 'list')).toMatchObject([{ id: parks[1].id }]);
  expect(filterParkPois(pois, { ...filters, hierarchies: [] }, 'list')).toEqual([]);
  expect(filterParkPois(pois, { ...filters, approvedOnlyMap: true, status: 'excluded' }, 'map', 'neodpovídající hledání')).toMatchObject([{ id: parks[1].id }]);
  expect(config.decisions.map(p => p.status)).toEqual(['excluded', 'approved']);
});
test('bulk decisions apply precisely to selected hierarchies and preserve manual overrides; undo keeps later edits and world data', async () => {
  const parks = [park(1, 'A'), park(2, 'B'), park(3, 'C'), park(null, 'D')];
  let config = configuration(parks);
  config = decidePoi(config, parks[0], { name: 'Ruční název', point: [14.401, 50.001], note: 'Moje poznámka' });
  config = decidePoi(config, parks[2], { status: 'approved' });
  const before = config, bulk = await decideParkHierarchies(config, [1, 2], 'approved');
  expect(bulk).toMatchObject({ matched: 2, changed: 2, skipped: [] });
  expect(bulk.configuration.manual).toBe(before.manual); expect(bulk.configuration.sources).toBe(before.sources);
  expect(resolvePois([], bulk.configuration).map(p => p.status)).toEqual(['approved', 'approved', 'approved', 'review']);
  expect(resolvePois([], bulk.configuration)[0]).toMatchObject({ name: 'Ruční název', point: [14.401, 50.001], note: 'Moje poznámka' });
  const later = decidePoi(bulk.configuration, parks[1], { status: 'excluded' });
  const undone = undoParkBulk(later, bulk.undo);
  expect(undone).toMatchObject({ restored: 1, preserved: 1 });
  expect(undone.configuration.decisions.find(p => p.id === parks[0].id)).toEqual(before.decisions.find(p => p.id === parks[0].id));
  expect(resolvePois([], undone.configuration).map(p => p.status)).toEqual(['review', 'excluded', 'approved', 'review']);
  const excluded = await decideParkHierarchies(before, [1, 2], 'excluded');
  expect(excluded.configuration.decisions.filter(p => p.status === 'excluded')).toHaveLength(2);
  expect(resolvePois([], undoParkBulk(excluded.configuration, excluded.undo).configuration)).toEqual(resolvePois([], before));
  const world = newWorld(); world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50] }, 'Moje data')]; world.gameStops = defaultGameStopConfiguration();
  const updated = { ...world, poi: { ...bulk.configuration, parkFilters: { ...defaultParkFilters(), approvedOnlyMap: true } } };
  const roundtrip = importWorld(exportWorld(updated, 'geojson'));
  expect(roundtrip.layers).toEqual(world.layers); expect(roundtrip.gameStops).toEqual(world.gameStops); expect(roundtrip.poi).toEqual(updated.poi);
});
test('unsafe candidates are skipped with diagnostics, valid candidates still succeed in one configuration', async () => {
  const good = park(1), unnamed = park(1, ''), invalidPoint = { ...park(1), point: [14.8, 50.3] as [number, number] };
  const crossed = { ...park(1), geometry: { type: 'Polygon' as const, coordinates: [[[14.4, 50], [14.42, 50.02], [14.42, 50], [14.4, 50.02], [14.4, 50]]] } };
  const historical = { ...park(1), attributes: { HIERARCHIE: 1, sourceMissing: true } };
  const result = await decideParkHierarchies(configuration([good, unnamed, invalidPoint, crossed, historical]), [1], 'approved');
  expect(result).toMatchObject({ matched: 5, changed: 1 }); expect(result.skipped).toHaveLength(4);
  expect(result.skipped.every(p => p.id && p.reason)).toBe(true); expect(result.configuration.decisions).toMatchObject([{ id: good.id, status: 'approved' }]);
});
test('reimport keeps individual and bulk decisions, newly added hierarchy-1 parks require another explicit approval', async () => {
  const source = { id: 'test-parks', provider: 'Fixture', url: null, license: { name: 'Test', url: null }, dataDate: null, retrievedAt: '2026-10-18T08:00:00Z', verification: 'user_supplied' as const, note: 'Test' };
  const importData = (ids: number[]) => importParkGeoJson(JSON.stringify({ type: 'FeatureCollection', features: ids.map(id => ({ type: 'Feature', properties: { ID: id, NAZEV: `Park ${id}`, HIERARCHIE: 1 }, geometry: polygon })) }), { source, idField: 'ID', nameField: 'NAZEV' });
  const first = await importData([1, 2]);
  const bulk = await decideParkHierarchies(applyParkUpdate(defaultPoiConfiguration(), first), [1], 'approved');
  const excluded = decidePoi(bulk.configuration, first.records[1], { status: 'excluded' });
  const next = applyParkUpdate(excluded, await importData([1, 2, 3]));
  expect(next.decisions).toEqual(excluded.decisions); expect(resolvePois([], next).map(p => p.status)).toEqual(['approved', 'excluded', 'review']);
});
