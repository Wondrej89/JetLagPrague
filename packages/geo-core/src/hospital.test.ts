import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import catalog from '../../../apps/editor/src/data/poi-catalog.json' with { type: 'json' };
import { createManualHospital, decidePoi, defaultPoiConfiguration, exportWorld, importWorld, matchingPois, measuringPois, nearestApprovedPoi, newFeature, newWorld, poiSchema, removeManualHospital, resolvePois, validatePoiConfiguration, withPublishedHospitals, withPublishedZoos } from './index';
import { buildGameDataRelease, createGameDataRelease, loadGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, verifyGameDataRelease } from './game-release';
import { releaseTestAirports, releaseTestDate, releaseTestInput } from './game-release-test-fixtures';
import { canonicalJson } from './administrative';

const hospitals = catalog.hospitals.map(poi => poiSchema.parse(poi));
const expected: [string, number, number][] = [
  ['hospital-bulovka',50.1155525,14.4643531], ['hospital-na-frantisku',50.0927786,14.4214061],
  ['hospital-uvn',50.0898339,14.3625906], ['hospital-motol',50.0740153,14.3409883],
  ['hospital-homolka',50.0754794,14.3541617], ['hospital-vinohrady',50.0757197,14.4754242],
  ['hospital-thomayer',50.0300714,14.4563864], ['hospital-vfn',50.0734300,14.4209875],
  ['hospital-sv-alzbety',50.0692439,14.4203839], ['hospital-boromejky',50.0870408,14.3962378],
];

describe('Hospital catalog and saved decisions', () => {
  it('ships exactly ten approved unique hospitals using the supplied GPS order without inventing the missing address', () => {
    expect(hospitals).toHaveLength(10); expect(new Set(hospitals.map(poi => poi.id)).size).toBe(10);
    for (const [id, lat, lon] of expected) {
      const poi = hospitals.find(poi => poi.id === id)!;
      expect(poi).toMatchObject({ category: 'hospital', status: 'approved', point: [lon, lat], geometry: { type: 'Point', coordinates: [lon, lat] } });
      expect(poi.source).toMatchObject({ provider: 'Ruční výběr na Mapy.com', verification: 'curated', dataDate: null });
      expect(poi.source.note).toContain('Nejde o úplný registr'); expect(poi.source.rawChecksum).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(hospitals.find(poi => poi.id === 'hospital-sv-alzbety')!.address).toBe('');
    validatePoiConfiguration(withPublishedHospitals(defaultPoiConfiguration(), hospitals));
    expect(resolvePois([], withPublishedHospitals(defaultPoiConfiguration(), hospitals)).every(poi => poi.status === 'approved')).toBe(true);
  });

  it('preserves all edits, statuses, visibility, other POIs and custom layers through catalog updates and both backup formats', () => {
    const world = newWorld(); world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50.1] }, 'Vlastní objekt')];
    let config = withPublishedHospitals(withPublishedZoos(defaultPoiConfiguration(), catalog.zoos.map(poi => poiSchema.parse(poi))), hospitals);
    const before = canonicalJson(config), zoo = resolvePois([], config).filter(poi => poi.category === 'zoo');
    config = decidePoi(config, hospitals[0], { name: 'Moje nemocnice', address: 'Vlastní adresa', note: 'Soukromá poznámka', point: [14.465, 50.116], status: 'excluded' });
    config = decidePoi(config, hospitals[1], { status: 'review' });
    config = { ...config, visibility: { ...config.visibility, hospitals: false } };
    const updated = hospitals.map(poi => ({ ...poi, name: 'Nový zdrojový název' }));
    config = withPublishedHospitals(config, [...updated, { ...hospitals[0], id: 'hospital-new-fixture', sourceId: 'hospital-new-fixture' }]);
    world.poi = config;
    for (const format of ['json', 'geojson'] as const) {
      const loaded = importWorld(exportWorld(world, format)); expect(loaded).toEqual(world);
      const resolved = resolvePois(releaseTestAirports, loaded.poi!);
      expect(resolved.find(poi => poi.id === hospitals[0].id)).toMatchObject({ name: 'Moje nemocnice', address: 'Vlastní adresa', note: 'Soukromá poznámka', status: 'excluded', point: [14.465, 50.116], geometry: { type: 'Point', coordinates: [14.465, 50.116] } });
      expect(resolved.find(poi => poi.id === hospitals[1].id)?.status).toBe('review');
      expect(resolved.filter(poi => poi.category === 'zoo')).toEqual(zoo);
      expect(loaded.poi!.visibility.hospitals).toBe(false); expect(loaded.layers).toEqual(world.layers);
    }
    expect(JSON.parse(before).pointCatalog.filter((poi: { category: string }) => poi.category === 'hospital')).toEqual(hospitals);
    expect(withPublishedHospitals(config, hospitals)).toBe(config);
    expect(config.pointCatalog).toHaveLength(21);
  });

  it('creates and removes manual points, allows approval without an address and rejects invalid GPS or inconsistent geometry', () => {
    const manual = createManualHospital([14.42, 50.08]);
    let config = withPublishedHospitals(defaultPoiConfiguration(), hospitals); config = { ...config, manual: [manual] };
    validatePoiConfiguration(config); expect(() => decidePoi(config, manual, { status: 'approved' })).toThrow('název');
    expect(() => decidePoi(config, manual, { point: [181, 50] })).toThrow();
    config = decidePoi(config, manual, { name: 'Ručně přidaná nemocnice', status: 'approved' });
    expect(resolvePois([], config).find(poi => poi.id === manual.id)).toMatchObject({ status: 'approved', address: '' });
    const noAddress = poiSchema.parse({ ...hospitals[8], address: undefined });
    validatePoiConfiguration({ ...config, manual: [manual, { ...noAddress, id: 'no-address-fixture' }] });
    expect(() => decidePoi(config, noAddress, { status: 'approved' })).not.toThrow();
    expect(() => removeManualHospital(config, hospitals[0].id)).toThrow('pouze ručně');
    config = removeManualHospital(config, manual.id); expect(config.manual).toEqual([]); expect(config.decisions).toEqual([]); expect(config.pointCatalog).toHaveLength(10);
    expect(() => poiSchema.parse({ ...hospitals[0], geometry: { type: 'Point', coordinates: [0, 0] } })).toThrow('shodnou');
    expect(() => poiSchema.parse({ ...hospitals[0], geometry: { type: 'Polygon', coordinates: [[[14,50],[15,50],[15,51],[14,50]]] } })).toThrow();
  });

  it('uses geographical reference distances and stable ties for Matching and Measuring, ignoring excluded and review hospitals', () => {
    const a = hospitals[0], b = hospitals[3];
    expect(nearestApprovedPoi(a.point, 'hospital', hospitals)).toMatchObject({ state: 'known', poi: { id: a.id }, distanceMeters: 0 });
    expect(matchingPois(a.point, b.point, 'hospital', hospitals)).toMatchObject({ state: 'known', matches: false });
    expect(matchingPois(a.point, [a.point[0], a.point[1] + .0001], 'hospital', hospitals)).toMatchObject({ matches: true });
    const result = measuringPois(a.point, [b.point[0], b.point[1] + .001], 'hospital', hospitals);
    expect(result).toMatchObject({ state: 'known', comparison: 'first-closer' });
    if (result.state === 'known') { expect(result.second.distanceMeters).toBeGreaterThan(110); expect(result.second.distanceMeters).toBeLessThan(112); }
    expect(nearestApprovedPoi(a.point, 'hospital', hospitals.map(poi => poi.id === a.id ? { ...poi, status: 'excluded' as const } : poi))).not.toMatchObject({ poi: { id: a.id } });
    expect(nearestApprovedPoi(a.point, 'hospital', hospitals.map(poi => ({ ...poi, status: 'review' as const })))).toMatchObject({ state: 'unknown' });
    expect(matchingPois(a.point, b.point, 'hospital', [])).toMatchObject({ state: 'unknown' });
    expect(measuringPois(a.point, b.point, 'hospital', [])).toMatchObject({ state: 'unknown' });
    expect(nearestApprovedPoi(a.point, 'hospital', [{ ...a, id: 'z' }, { ...a, id: 'a' }])).toMatchObject({ poi: { id: 'a' }, tiedIds: ['a', 'z'] });
  });
});

it('publishes only approved hospitals in the current schema, preserves optional addresses and loads geographic public DTOs', async () => {
  const { world, snapshot } = await releaseTestInput();
  world.poi = withPublishedZoos(world.poi!, catalog.zoos.map(poi => poiSchema.parse(poi)));
  const before = await buildGameDataRelease(world, releaseTestAirports, snapshot, releaseTestDate);
  world.poi = withPublishedHospitals(world.poi!, hospitals);
  world.poi = decidePoi(world.poi, hospitals[0], { status: 'excluded' }); world.poi = decidePoi(world.poi, hospitals[1], { status: 'review' });
  world.poi = decidePoi(world.poi, hospitals[3], { name: 'Upravený Motol', address: 'Upravená adresa', point: [14.341, 50.074], note: 'PRIVATE HOSPITAL NOTE' });
  const release = await buildGameDataRelease(world, releaseTestAirports, snapshot, releaseTestDate);
  expect(release.schemaVersion).toBe(4); expect(release.data.pois.filter(poi => poi.category === 'hospital')).toHaveLength(8);
  expect(release.data.pois.find(poi => poi.id === 'hospital-motol')).toMatchObject({ name: 'Upravený Motol', address: 'Upravená adresa', point: [14.341,50.074], geometry: { type: 'Point', coordinates: [14.341,50.074] } });
  expect(release.data.pois.find(poi => poi.id === 'hospital-sv-alzbety')!.address).toBe('');
  expect(canonicalJson(release)).not.toContain('PRIVATE HOSPITAL NOTE');
  expect(release.data.pois.filter(poi => poi.category !== 'hospital')).toEqual(before.data.pois);
  for (const key of ['gameArea', 'administrativeAreas', 'pidSnapshot', 'rulesConfig'] as const) expect(release.checksums[key]).toBe(before.checksums[key]);
  const entry = await releaseEntry(release), index = { format: 'jetlag-prague-game-catalog', schemaVersion: 1, current: entry, versions: [entry] };
  const fetcher = (async (input: RequestInfo | URL) => String(input).endsWith('current.json') ? Response.json(index) : new Response(canonicalJson(release))) as typeof fetch;
  const loaded = (await loadGameDataRelease('https://example.test/releases/', fetcher)).release;
  expect(nearestApprovedPoi([14.341,50.074], 'hospital', loaded.data.pois)).toMatchObject({ state: 'known', poi: { id: 'hospital-motol' }, distanceMeters: 0 });
  for (const schemaVersion of [1,2] as const) await expect(createGameDataRelease(release.data, { publishedAt: releaseTestDate, kind: 'reference', schemaVersion })).rejects.toThrow('schéma 3');
  const broken = structuredClone(release); broken.data.pois.find(poi => poi.category === 'hospital')!.geometry = { type: 'Point', coordinates: [0,0] };
  await expect(verifyGameDataRelease(broken)).rejects.toThrow('Nemocnice');
  const corrupt = structuredClone(release); corrupt.data.pois.find(poi => poi.category === 'hospital')!.address = 'Tampered';
  await expect(verifyGameDataRelease(corrupt)).rejects.toThrow('kontrolní součet');
});

it('adds hospitals to immutable history without changing older artifacts, zoo, 117 parks, airports, Prague or PID', async () => {
  const index = readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json', 'utf8')));
  const previousEntry = index.versions.find(entry => entry.releaseId === 'release:3b0174b470beb21667464ae5434c30ebd48c199e4aeeb67ffd8055e65fc3af17')!;
  const entry = index.versions.find(entry => entry.releaseId === 'release:2a63e4db546a77e616eb0a46d5fb0a15a5defd6f6f28a80e51c185280fe553c5')!;
  const previous = await readGameReleaseArtifact(await readFile(`data/releases/${previousEntry.file}`, 'utf8'), previousEntry);
  const release = await readGameReleaseArtifact(await readFile(`data/releases/${entry.file}`, 'utf8'), entry);
  expect(previous.schemaVersion).toBe(2); expect(release.schemaVersion).toBe(3);
  expect(release.data.pois.filter(poi => poi.category === 'hospital')).toHaveLength(10);
  expect(release.data.pois.filter(poi => poi.category !== 'hospital')).toEqual(previous.data.pois);
  expect(release.data.pois.filter(poi => poi.category === 'park')).toHaveLength(117);
  for (const key of ['gameArea', 'administrativeAreas', 'pidSnapshot', 'rulesConfig'] as const) {
    expect(release.data[key]).toEqual(previous.data[key]); expect(release.checksums[key]).toBe(previous.checksums[key]);
  }
});
