import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import catalog from '../../../apps/editor/src/data/poi-catalog.json' with { type: 'json' };
import { addLibrary, agreedLibraryMapPoint, decideUnlocatedLibrary, defaultPoiConfiguration, explicitLibraryMapPoint, exportWorld, filterParkPois, defaultParkFilters, importWorld, isLibraryLocationVerified, libraryId, matchingPois, measuringPois, nearestApprovedPoi, newWorld, poiSchema, readDefaultGameArea, removeManualLibrary, resolvePois, resolveUnlocatedLibraries, unlocatedLibrarySchema, validatePoiConfiguration, verifyLibraryDecision, withPublishedLibraries, withPublishedHospitals, withPublishedZoos } from './index';
import { booleanPointInPolygon } from '@turf/turf';
import { buildGameDataRelease, createGameDataRelease, loadGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, verifyGameDataRelease } from './game-release';
import { canonicalJson } from './administrative';
import { sha256 } from './pid-snapshot';
import { releaseTestAirports, releaseTestDate, releaseTestInput } from './game-release-test-fixtures';

const published = catalog.libraries.map(value => poiSchema.parse(value));
const candidates = published.map(value => unlocatedLibrarySchema.parse(value.attributes.originalCandidate));
const input = (slug: string) => ({ name: `Synthetic library ${slug}`, address: 'Synthetic address, Praha', officialUrl: `https://www.mlp.cz/cz/pobocky/${slug}/` });
function verifiedFixture(slug: string, point: [number, number]) {
  const result = addLibrary(defaultPoiConfiguration(), point, input(slug));
  return resolvePois([], verifyLibraryDecision(result.configuration, result.poi, { status: 'approved' }, true))[0];
}

describe('MKP catalog and coordinate evidence', () => {
  it('archives the original selection of 45 branches without fabricated points or excluded services', async () => {
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
    const mapy = 'https://mapy.com/fnc/v1/showmap?center=14.36824000,50.02840200&marker=true&zoom=17';
    const google = 'https://www.google.com/maps?marker=true&q=50.02840200,14.36824000';
    expect(explicitLibraryMapPoint(mapy)).toEqual([14.36824,50.028402]);
    expect(agreedLibraryMapPoint([mapy,google])).toEqual([14.36824,50.028402]);
    expect(agreedLibraryMapPoint([mapy,google.replace('14.36824000','14.36825000')])).toBeNull();
    expect(agreedLibraryMapPoint([])).toBeNull();
    expect(agreedLibraryMapPoint([mapy,'https://maps.google.com/maps?ll=50.1,14.4&layer=c'])).toBeNull();
    for (const url of [mapy.replace('&marker=true',''),mapy.replace('marker=true','marker=false'),mapy+'&center=14.5,50.2',mapy+'&marker=false',google+'&q=50.1,14.5','https://www.google.com/search?q=50.08,14.42']) expect(explicitLibraryMapPoint(url)).toBeNull();
    expect(explicitLibraryMapPoint('https://mapy.com/zakladni?source=coor&id=14.42%2C50.08&x=14.5&y=50.2')).toEqual([14.42,50.08]);
    expect(explicitLibraryMapPoint('https://mapy.cz/?q=50.08%2C14.42')).toEqual([14.42,50.08]);
    expect(explicitLibraryMapPoint('geo:50.08,14.42')).toEqual([14.42,50.08]);
    expect(explicitLibraryMapPoint('https://www.google.com/maps/search/?api=1&query=50.08,14.42')).toEqual([14.42,50.08]);
    for (const url of ['https://mapy.com/?x=14.42&y=50.08&z=18','https://mapy.cz/?source=firm&id=1234&x=14.42&y=50.08','https://mapy.com/?q=Marianske+namesti+1','https://www.google.com/maps/@50.08,14.42,18z','https://example.test/?q=50.08,14.42','geo:150,14.42']) expect(explicitLibraryMapPoint(url)).toBeNull();
    expect(libraryId(input('synthetic-branch').officialUrl)).toBe('library:mkp:synthetic-branch');
    expect(libraryId('https://www.mlp.cz/cz/pobocky/detail/?id=123')).toBe('library:mkp:123');
    expect(() => libraryId('https://www.mlp.cz/cz/pobocky')).toThrow(); expect(() => libraryId('https://evil.test/cz/pobocky/test')).toThrow();
  });

  it('fills all 45 original identities with matching official target links, exact addresses and points inside Prague', async () => {
    expect(catalog.unlocatedLibraries).toEqual([]); expect(published).toHaveLength(45);
    const boundary = await readDefaultGameArea(await readFile('apps/editor/public/defaults/prague-game-area.geojson','utf8'));
    const evidenceText = await readFile('data/source-metadata/mkp-library-points.json','utf8');
    const evidence = JSON.parse(evidenceText), checksum = await sha256(evidenceText);
    for (const [index,poi] of published.entries()) {
      const original = candidates[index], proof = evidence.branches.find((row: {id:string})=>row.id===poi.id);
      expect(poi).toMatchObject({id:original.id,name:original.name,address:original.address,status:'approved',geometry:{type:'Point',coordinates:poi.point}});
      expect(poi.library).toMatchObject({selectionKey:original.selectionKey,officialUrl:proof.officialUrl,verification:{method:'official_map_link',officialAddress:original.address,detailChecksum:proof.detailChecksum}});
      expect(poi.library!.verification!.mapUrls).toHaveLength(2);
      expect(agreedLibraryMapPoint(proof.mapLinks.map((link:{url:string})=>link.url))).toEqual(poi.point);
      expect(poi.source.rawChecksum).toBe(checksum); expect(isLibraryLocationVerified(poi)).toBe(true);
      expect(booleanPointInPolygon(poi.point,boundary.geometry,{ignoreBoundary:true})).toBe(true);
    }
    expect(published[0].point).toEqual([14.36824,50.028402]);
    const alias={...published[0],id:libraryId(published[0].library!.officialUrl),library:{...published[0].library!,selectionKey:undefined}};
    expect(()=>validatePoiConfiguration({...defaultPoiConfiguration(),pointCatalog:[published[0],alias]})).toThrow('Duplicitní');
    expect(matchingPois(published[0].point,published[1].point,'library',published)).toMatchObject({state:'known',matches:false});
    expect(measuringPois(published[0].point,[14.37,50.029],'library',published)).toMatchObject({state:'known',comparison:'first-closer'});
    const broken=structuredClone(published[0]);broken.library!.verification!.mapUrls![1]=broken.library!.verification!.mapUrls![1].replace('14.36824000','14.36825000');
    expect(isLibraryLocationVerified(broken)).toBe(false);
  });
});

describe('Library decisions and stable identities', () => {
  it('keeps candidate edits and exclusions; locating a branch archives its source and reuses its selection without a duplicate', () => {
    let config = withPublishedLibraries(defaultPoiConfiguration(), [], candidates);
    config = decideUnlocatedLibrary(config, candidates[0], { name: 'Ruční název', address: 'Vlastní adresa', note: 'Soukromá poznámka', status: 'excluded' });
    const row = resolveUnlocatedLibraries(config)[0]; expect(row.status).toBe('excluded');
    const result = addLibrary(config, [14.42,50.08], { ...input('synthetic-candidate'), name: row.name, address: row.address, note: row.note }, row);
    config = result.configuration; expect(resolveUnlocatedLibraries(config)).toHaveLength(44); expect(result.poi.attributes.originalCandidate).toEqual(row);
    expect(result.poi.id).toBe(row.id); validatePoiConfiguration(config);
    expect(result.poi).toMatchObject({ status: 'excluded', name: row.name, address: row.address, note: row.note, library: { selectionKey: row.selectionKey } });
    expect(() => addLibrary(config, [14.43,50.09], input('synthetic-candidate'))).toThrow('již existuje');
    expect(() => addLibrary(config, [14.43,50.09], input('synthetic-other-id'), row)).toThrow('už má bod');
    expect(() => removeManualLibrary(config, result.poi.id)).toThrow('pouze vlastní');
    config = verifyLibraryDecision(config, result.poi, { status: 'approved' }, true);
    expect(resolvePois([], config)[0]).toMatchObject({ status: 'approved' });
    const world = newWorld(); world.poi = config;
    for (const format of ['json','geojson'] as const) expect(importWorld(exportWorld(world, format))).toEqual(world);
  });

  it('upgrades old unlocated drafts using the same IDs before saving, preserving decisions, custom data and legacy aliases', () => {
    let old = withPublishedLibraries(defaultPoiConfiguration(),[],candidates);
    old = decideUnlocatedLibrary(old,candidates[0],{name:'Moje knihovna',address:'Moje adresa',status:'excluded',note:'Zachovat'});
    old = decideUnlocatedLibrary(old,candidates[1],{status:'review'});
    const manual = addLibrary(old,[14.4,50.1],input('synthetic-own')); old = manual.configuration;
    const migrated=withPublishedLibraries(old,published);
    validatePoiConfiguration(migrated); expect(migrated.unlocatedLibraries).toEqual([]);
    expect(migrated.manual).toEqual(old.manual); expect(migrated.visibility).toEqual(old.visibility);
    expect(resolvePois([],migrated).find(poi=>poi.id===candidates[0].id)).toMatchObject({name:'Moje knihovna',address:'Moje adresa',note:'Zachovat',status:'excluded',point:published[0].point});
    expect(resolvePois([],migrated).find(poi=>poi.id===candidates[1].id)!.status).toBe('review');
    expect(resolvePois([],migrated).filter(poi=>poi.category==='library'&&poi.status==='approved')).toHaveLength(43);
    expect(withPublishedLibraries(migrated,published,candidates)).toEqual(migrated);
    const world=newWorld();world.poi=migrated;
    for(const format of ['json','geojson'] as const) expect(importWorld(exportWorld(world,format))).toEqual(world);
    const alias={...published[0],id:libraryId(published[0].library!.officialUrl)};
    const legacy=withPublishedLibraries(defaultPoiConfiguration(),[alias]);
    const updated=withPublishedLibraries(legacy,published,candidates);
    expect(resolvePois([],updated).filter(poi=>poi.library?.selectionKey===candidates[0].selectionKey)).toHaveLength(1);
    expect(resolvePois([],updated)[0].id).toBe(alias.id);validatePoiConfiguration(updated);
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

it('adds all 45 verified default points to an immutable schema 4 release without changing any prior data', { timeout: 15000 }, async () => {
  const history=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
  const old=history.versions.find(entry=>entry.releaseId==='release:2a63e4db546a77e616eb0a46d5fb0a15a5defd6f6f28a80e51c185280fe553c5')!;
  const added=history.versions.find(entry=>entry.releaseId==='release:1df560d4f22e6e38ec4df73df52bd34d58b831988ef73f0812753750ae7cff39')!;
  const previous=await readGameReleaseArtifact(await readFile(`data/releases/${old.file}`,'utf8'),old);
  const release=await readGameReleaseArtifact(await readFile(`data/releases/${added.file}`,'utf8'),added);
  expect(release.schemaVersion).toBe(4);expect(release.data.pois.filter(poi=>poi.category==='library')).toHaveLength(45);
  expect(release.data.pois.filter(poi=>poi.category!=='library')).toEqual(previous.data.pois);
  for(const key of ['gameArea','administrativeAreas','pidSnapshot','rulesConfig'] as const) {
    expect(release.data[key]).toEqual(previous.data[key]);expect(release.checksums[key]).toBe(previous.checksums[key]);
  }
  expect(release.data.sourceVersions.filter(source=>!source.key.startsWith('poi:mkp-official-branch-points-'))).toEqual(previous.data.sourceVersions);
  for(const library of release.data.pois.filter(poi=>poi.category==='library')) {
    expect(isLibraryLocationVerified(library)).toBe(true);expect(library.id).toMatch(/^library-pending:mkp-selection:/);
    expect(library.library!.verification!.mapUrls).toHaveLength(2);expect(library).not.toHaveProperty('attributes');
  }
});
