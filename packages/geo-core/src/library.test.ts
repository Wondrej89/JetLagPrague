import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import catalog from '../../../apps/editor/src/data/poi-catalog.json' with { type: 'json' };
import { addLibrary, decideUnlocatedLibrary, defaultPoiConfiguration, explicitLibraryMapPoint, exportWorld, filterParkPois, defaultParkFilters, importWorld, isLibraryLocationVerified, libraryId, matchingPois, measuringPois, nearestApprovedPoi, newWorld, poiSchema, removeManualLibrary, resolvePois, resolveUnlocatedLibraries, unlocatedLibrarySchema, validatePoiConfiguration, verifyLibraryDecision, withPublishedLibraries, withPublishedHospitals, withPublishedZoos } from './index';
import { buildGameDataRelease, createGameDataRelease, loadGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, verifyGameDataRelease } from './game-release';
import { canonicalJson } from './administrative';
import { sha256 } from './pid-snapshot';
import { releaseTestAirports, releaseTestDate, releaseTestInput } from './game-release-test-fixtures';

const candidates = catalog.unlocatedLibraries.map(value => unlocatedLibrarySchema.parse(value));
const input = (slug: string) => ({ name: `Synthetic library ${slug}`, address: 'Synthetic address, Praha', officialUrl: `https://www.mlp.cz/cz/pobocky/${slug}/` });
function verifiedFixture(slug: string, point: [number, number]) {
  const result = addLibrary(defaultPoiConfiguration(), point, input(slug));
  return resolvePois([], verifyLibraryDecision(result.configuration, result.poi, { status: 'approved' }, true))[0];
}

describe('MKP catalog and coordinate evidence', () => {
  it('retains the exact selection of 45 branches without fabricated GPS, official IDs or excluded services', async () => {
    expect(candidates).toHaveLength(45); expect(new Set(candidates.map(row => row.id)).size).toBe(45);
    expect(new Set(candidates.map(row => row.selectionKey)).size).toBe(45);
    expect(candidates.map(row => row.name)).toEqual(['Barrandov','Bohnice','Brusnice – vzácné tisky','Břevnov','Cibulka','Černý Most','Dědina','Dejvice','Dittrichova','Dům čtení (Ruská)','Hloubětín','Hostivař','Hradčany','Chodov','Jezerka','Kobylisy','Korunní','Krč','Ládví','Letná','Lužiny','Malešice','Novodvorská','Opatov','Ostrčilovo náměstí','Ostrovského','Pankrác','Petřiny','Prosek','Rajská zahrada','Sedmička','Skalka','Smíchov','Spořilov','Stodůlky','Školská','Ústřední knihovna','Velká Chuchle','Velký mlýn','Vikova','Vozovna','Vysočany','Zahradní Město','Záhřebská','Žižkov']);
    const table = candidates.map(row => [row.name, row.address]), hash = await sha256(JSON.stringify(table));
    for (const row of candidates) {
      expect(row).toMatchObject({ point: null, geometry: null, officialUrl: null, status: 'review', reviewedAt: null });
      expect(row.source).toMatchObject({ provider: 'Městská knihovna v Praze', verification: 'user_supplied', rawChecksum: hash });
      expect(row.id).toMatch(/^library-pending:mkp-selection:/); expect(row.source.note).toContain('403');
    }
    expect(table.some(([name]) => /bibliobus|kiosek|Modřany|DOK16|Oddělení pro děti|Kreativní centrUM/i.test(name))).toBe(false);
    const config = withPublishedLibraries(defaultPoiConfiguration(), [], candidates); validatePoiConfiguration(config);
    expect(resolvePois([], config)).toEqual([]); expect(resolveUnlocatedLibraries(config)).toHaveLength(45);
    expect(nearestApprovedPoi([14.4,50.1], 'library', resolvePois([], config))).toMatchObject({ state: 'unknown' });
    expect(() => decideUnlocatedLibrary(config, candidates[0], { status: 'approved' })).toThrow('bez doloženého bodu');
  });

  it('extracts explicit markers in WGS84 order and rejects map centers, place IDs and approximate address searches', () => {
    expect(explicitLibraryMapPoint('https://mapy.com/zakladni?source=coor&id=14.42%2C50.08&x=14.5&y=50.2')).toEqual([14.42,50.08]);
    expect(explicitLibraryMapPoint('https://mapy.cz/?q=50.08%2C14.42')).toEqual([14.42,50.08]);
    expect(explicitLibraryMapPoint('geo:50.08,14.42')).toEqual([14.42,50.08]);
    expect(explicitLibraryMapPoint('https://www.google.com/maps/search/?api=1&query=50.08,14.42')).toEqual([14.42,50.08]);
    for (const url of ['https://mapy.com/?x=14.42&y=50.08&z=18','https://mapy.cz/?source=firm&id=1234&x=14.42&y=50.08','https://mapy.com/?q=Marianske+namesti+1','https://www.google.com/maps/@50.08,14.42,18z','https://example.test/?q=50.08,14.42','geo:150,14.42']) expect(explicitLibraryMapPoint(url)).toBeNull();
    expect(libraryId(input('synthetic-branch').officialUrl)).toBe('library:mkp:synthetic-branch');
    expect(libraryId('https://www.mlp.cz/cz/pobocky/detail/?id=123')).toBe('library:mkp:123');
    expect(() => libraryId('https://www.mlp.cz/cz/pobocky')).toThrow(); expect(() => libraryId('https://evil.test/cz/pobocky/test')).toThrow();
  });
});

describe('Library decisions and stable identities', () => {
  it('keeps candidate edits and exclusions; locating a branch archives its source and reuses its selection without a duplicate', () => {
    let config = withPublishedLibraries(defaultPoiConfiguration(), [], candidates);
    config = decideUnlocatedLibrary(config, candidates[0], { name: 'Ruční název', address: 'Vlastní adresa', note: 'Soukromá poznámka', status: 'excluded' });
    const row = resolveUnlocatedLibraries(config)[0]; expect(row.status).toBe('excluded');
    const result = addLibrary(config, [14.42,50.08], { ...input('synthetic-candidate'), name: row.name, address: row.address, note: row.note }, row);
    config = result.configuration; expect(resolveUnlocatedLibraries(config)).toHaveLength(44); expect(result.poi.attributes.originalCandidate).toEqual(row);
    expect(result.poi).toMatchObject({ status: 'excluded', name: row.name, address: row.address, note: row.note, library: { selectionKey: row.selectionKey } });
    expect(() => addLibrary(config, [14.43,50.09], input('synthetic-candidate'))).toThrow('již existuje');
    expect(() => addLibrary(config, [14.43,50.09], input('synthetic-other-id'), row)).toThrow('už má bod');
    expect(() => removeManualLibrary(config, result.poi.id)).toThrow('pouze vlastní');
    config = verifyLibraryDecision(config, result.poi, { status: 'approved' }, true);
    expect(resolvePois([], config)[0]).toMatchObject({ status: 'approved' });
    const world = newWorld(); world.poi = config;
    for (const format of ['json','geojson'] as const) expect(importWorld(exportWorld(world, format))).toEqual(world);
  });

  it('invalidates verification on point movement and preserves explicit manual review through reload, catalog updates and exclusion', () => {
    const result = addLibrary(withPublishedLibraries(defaultPoiConfiguration(), [], candidates), [14.42,50.08], input('synthetic-move'));
    expect(() => verifyLibraryDecision(result.configuration, result.poi, { status: 'approved' }, false)).toThrow('ověřte');
    let config = verifyLibraryDecision(result.configuration, result.poi, { status: 'approved' }, true);
    let poi = resolvePois([], config)[0]; expect(isLibraryLocationVerified(poi)).toBe(true);
    config = verifyLibraryDecision(config, poi, { point: [14.43,50.09] }, false); poi = resolvePois([], config)[0];
    expect(poi.status).toBe('review'); expect(isLibraryLocationVerified(poi)).toBe(false);
    config = verifyLibraryDecision(config, poi, { status: 'approved', name: 'Moje knihovna', address: 'Upravená adresa' }, true);
    config = { ...config, visibility: { ...config.visibility, libraries: false } };
    config = withPublishedLibraries(config, [verifiedFixture('synthetic-move', [14.4,50.1])], candidates);
    const world = newWorld(); world.poi = config;
    const loaded = importWorld(exportWorld(world, 'geojson')); poi = resolvePois([], loaded.poi!)[0];
    expect(poi).toMatchObject({ name: 'Moje knihovna', point: [14.43,50.09], geometry: { type: 'Point', coordinates: [14.43,50.09] }, status: 'approved' });
    expect(isLibraryLocationVerified(poi)).toBe(true); expect(loaded.poi!.visibility.libraries).toBe(false);
    config = verifyLibraryDecision(config, poi, { status: 'excluded' }, false);
    expect(nearestApprovedPoi(poi.point, 'library', resolvePois([], config))).toMatchObject({ state: 'unknown' });
    config = verifyLibraryDecision(config, resolvePois([], config)[0], { status: 'approved' }, false);
    expect(resolvePois([], config)[0].status).toBe('approved'); config = removeManualLibrary(config, poi.id); expect(config.manual).toEqual([]);
  });

  it('carries decisions on unlocated candidates into newly verified source records without overriding later edits', () => {
    let config = withPublishedLibraries(defaultPoiConfiguration(), [], candidates);
    config = decideUnlocatedLibrary(config, candidates[0], { name: 'Moje pojmenování', status: 'excluded', note: 'Zachovat vyloučení' });
    const source = { ...verifiedFixture('synthetic-new-source',[14.42,50.08]), library: { ...verifiedFixture('synthetic-new-source',[14.42,50.08]).library!, selectionKey: candidates[0].selectionKey } };
    config = withPublishedLibraries(config, [source], candidates);
    expect(resolvePois([], config)[0]).toMatchObject({ name: 'Moje pojmenování', status: 'excluded', note: 'Zachovat vyloučení' });
    expect(resolvePois([], config)[0].address).toBe(source.address);
    expect(resolveUnlocatedLibraries(config)).toHaveLength(44);
    config = verifyLibraryDecision(config, resolvePois([], config)[0], { status: 'approved' }, false);
    config = withPublishedLibraries(config, [{ ...source, name: 'Nový název zdroje' }], candidates);
    expect(resolvePois([], config)[0]).toMatchObject({ name: 'Moje pojmenování', status: 'approved' });
    const local = addLibrary(withPublishedLibraries(defaultPoiConfiguration(), [], candidates),[14.4,50.1],input('synthetic-local-alias'),candidates[0]);
    const merged = withPublishedLibraries(local.configuration,[source],candidates);
    expect(resolvePois([], merged)).toHaveLength(1); expect(resolvePois([], merged)[0].id).toBe(local.poi.id);
    const excluded = decideUnlocatedLibrary(withPublishedLibraries(defaultPoiConfiguration(), [], candidates),candidates[0],{status:'excluded'});
    const inherited = resolvePois([],withPublishedLibraries(excluded,[source],candidates))[0];
    expect(inherited).toMatchObject({name:source.name,address:source.address,status:'excluded'});expect(isLibraryLocationVerified(inherited)).toBe(true);
  });

  it('uses geographic distances, address search and deterministic ties, independently of opening hours', () => {
    const a = verifiedFixture('synthetic-a',[14.42,50.08]), b = verifiedFixture('synthetic-b',[14.50,50.12]), pois = [a,b];
    expect(matchingPois(a.point,b.point,'library',pois)).toMatchObject({ state: 'known', matches: false });
    expect(matchingPois(a.point,[14.42001,50.08001],'library',pois)).toMatchObject({ matches: true });
    const result = measuringPois(a.point,[b.point[0],b.point[1]+.001],'library',pois); expect(result).toMatchObject({ state: 'known', comparison: 'first-closer' });
    if (result.state === 'known') { expect(result.second.distanceMeters).toBeGreaterThan(110); expect(result.second.distanceMeters).toBeLessThan(112); }
    expect(nearestApprovedPoi(a.point,'library',[{...a,id:'z'},{...a,id:'a'}])).toMatchObject({ poi: { id: 'a' }, tiedIds: ['a','z'] });
    expect(matchingPois(a.point,b.point,'library',pois.map(poi=>({...poi,status:'review' as const})))).toMatchObject({ state:'unknown' });
    expect(filterParkPois(pois,defaultParkFilters(),'list','Synthetic address')).toHaveLength(2);
  });
});

it('publishes only verified approved library points in schema 4; all prior categories and PID remain unchanged', async () => {
  const { world, snapshot } = await releaseTestInput();
  world.poi = withPublishedHospitals(withPublishedZoos(world.poi!,catalog.zoos.map(row=>poiSchema.parse(row))),catalog.hospitals.map(row=>poiSchema.parse(row)));
  const before = await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
  world.poi = withPublishedLibraries(world.poi!,[verifiedFixture('synthetic-published',[14.42,50.08]),{...verifiedFixture('synthetic-excluded',[14.43,50.09]),status:'excluded' as const}],candidates);
  const added = addLibrary(world.poi,[14.44,50.1],input('synthetic-unverified')); world.poi = added.configuration;
  const release = await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
  expect(release.schemaVersion).toBe(4); expect(release.data.pois.filter(poi=>poi.category==='library')).toHaveLength(1);
  expect(release.data.pois.filter(poi=>poi.category!=='library')).toEqual(before.data.pois);
  expect(release.data.pois.find(poi=>poi.category==='library')).toMatchObject({ address:'Synthetic address, Praha',library:{officialUrl:input('synthetic-published').officialUrl,verification:{point:[14.42,50.08],method:'manual_review'}} });
  for(const key of ['gameArea','administrativeAreas','pidSnapshot','rulesConfig'] as const) expect(release.checksums[key]).toBe(before.checksums[key]);
  for(const schemaVersion of [1,2,3] as const) await expect(createGameDataRelease(release.data,{publishedAt:releaseTestDate,kind:'reference',schemaVersion})).rejects.toThrow('schéma 4');
  const entry=await releaseEntry(release),index={format:'jetlag-prague-game-catalog',schemaVersion:1,current:entry,versions:[entry]};
  const fetcher=(async(input:RequestInfo|URL)=>String(input).endsWith('current.json')?Response.json(index):new Response(canonicalJson(release))) as typeof fetch;
  const loaded=(await loadGameDataRelease('https://example.test/releases/',fetcher)).release;
  expect(nearestApprovedPoi([14.42,50.08],'library',loaded.data.pois)).toMatchObject({state:'known',distanceMeters:0});
  const broken=structuredClone(release);broken.data.pois.find(poi=>poi.category==='library')!.library!.verification!.point=[0,0];await expect(verifyGameDataRelease(broken)).rejects.toThrow('Knihovna');
});

// This fixture audit parses and validates all geometries in four large immutable
// files. Its I/O and CPU budget is intentionally separate from the small POI test.
it('verifies the unchanged artifacts and checksums of all historical schema 1–3 publications', { timeout: 15000 }, async () => {
  const history=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
  const schemas=new Set<number>();
  for(const prior of history.versions) { const release=await readGameReleaseArtifact(await readFile(`data/releases/${prior.file}`,'utf8'),prior);schemas.add(release.schemaVersion); }
  expect([...schemas]).toEqual(expect.arrayContaining([1,2,3]));
});
