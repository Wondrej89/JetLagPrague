import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import catalog from '../../../apps/editor/src/data/poi-catalog.json' with { type: 'json' };
import input from '../../../data/raw/cinemas-curated.json' with { type: 'json' };
import { buildGameDataRelease, canonicalJson, createGameDataRelease, createManualCinema, decidePoi, defaultParkFilters, defaultPoiConfiguration, exportWorld, filterParkPois, importWorld, loadGameDataRelease, matchingPois, measuringPois, nearestApprovedPoi, poiSchema, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, removeManualCinema, resolvePois, sha256, validatePoiConfiguration, verifyGameDataRelease, withPublishedCinemas, withPublishedHospitals, withPublishedLibraries, withPublishedZoos } from './index';
import { releaseTestAirports, releaseTestDate, releaseTestInput } from './game-release-test-fixtures';

const cinemas=catalog.cinemas.map(poi=>poiSchema.parse(poi));
const hostivar='priemere-citenas-hostivar';

describe('Curated cinema catalog',()=>{
  it('retains all 26 supplied IDs, names, addresses and exact WGS84 points, with 25 approvals and one explicit review',async()=>{
    expect(cinemas).toHaveLength(26);expect(new Set(cinemas.map(poi=>poi.id)).size).toBe(26);
    expect(await sha256(await readFile('data/raw/cinemas-curated.json','utf8'))).toBe('812a17fbcd1a42287ae1d273eb7d5f0a10f907dcc3726458658850708af8013d');
    expect(cinemas.filter(poi=>poi.status==='approved')).toHaveLength(25);
    expect(cinemas.filter(poi=>poi.status==='review').map(poi=>poi.id)).toEqual([hostivar]);
    for(const [i,poi] of cinemas.entries()) {
      const row=input[i],point=[row.longitude,row.latitude];
      expect(poi).toMatchObject({id:row.id,name:row.name,address:row.address,sourceId:row.id,point,geometry:{type:'Point',coordinates:point},attributes:{originalId:row.id,originalName:row.name,originalAddress:row.address,originalPoint:point}});
      expect(poi.source).toMatchObject({provider:'Ruční výběr na Mapy.com',verification:'user_supplied',rawChecksum:'812a17fbcd1a42287ae1d273eb7d5f0a10f907dcc3726458658850708af8013d'});
    }
    expect(cinemas.find(poi=>poi.id===hostivar)).toMatchObject({name:'Priemere Citenas Praha Hostivař',point:[14.5172589,50.0529997],status:'review',reviewedAt:null});
    expect(cinemas.find(poi=>poi.id===hostivar)!.note).toContain('skutečný název a existenci');
    validatePoiConfiguration(withPublishedCinemas(defaultPoiConfiguration(),cinemas));
    expect(filterParkPois(cinemas,defaultParkFilters(),'list','Švehlova 1391/32').map(poi=>poi.id)).toEqual([hostivar]);
  });

  it('uses geographic distances, stable-ID Matching and deterministic ties; review and excluded cinemas cannot answer questions',()=>{
    const oko=cinemas[0],radotin=cinemas.find(poi=>poi.id==='kino-radotin')!;
    expect(nearestApprovedPoi(oko.point,'cinema',cinemas)).toMatchObject({state:'known',distanceMeters:0,poi:{id:'bio-oko'}});
    expect(matchingPois(oko.point,radotin.point,'cinema',cinemas)).toMatchObject({state:'known',matches:false});
    expect(matchingPois(oko.point,[oko.point[0],oko.point[1]+.0001],'cinema',cinemas)).toMatchObject({matches:true});
    const measured=measuringPois(oko.point,[radotin.point[0],radotin.point[1]+.001],'cinema',cinemas);
    expect(measured).toMatchObject({state:'known',comparison:'first-closer'});
    if(measured.state==='known'){expect(measured.second.distanceMeters).toBeGreaterThan(110);expect(measured.second.distanceMeters).toBeLessThan(112);}
    expect(nearestApprovedPoi(oko.point,'cinema',cinemas.map(poi=>({...poi,status:poi.id===oko.id?'excluded':poi.status})))).not.toMatchObject({poi:{id:oko.id}});
    expect(nearestApprovedPoi(cinemas.find(poi=>poi.id===hostivar)!.point,'cinema',cinemas)).not.toMatchObject({poi:{id:hostivar}});
    const noApproved=cinemas.map(poi=>({...poi,status:'review' as const}));
    expect(nearestApprovedPoi(oko.point,'cinema',noApproved)).toMatchObject({state:'unknown'});
    expect(matchingPois(oko.point,radotin.point,'cinema',noApproved)).toMatchObject({state:'unknown'});
    expect(measuringPois(oko.point,radotin.point,'cinema',noApproved)).toMatchObject({state:'unknown'});
    expect(nearestApprovedPoi(oko.point,'cinema',[{...oko,id:'z'},{...oko,id:'a'}])).toMatchObject({poi:{id:'a'},tiedIds:['a','z']});
  });

  it('preserves renamed IDs, source data, exclusions, reviews, points and visibility through updates and both backup formats',async()=>{
    const {world}=await releaseTestInput();
    const old=withPublishedLibraries(withPublishedHospitals(withPublishedZoos(world.poi!,catalog.zoos.map(poi=>poiSchema.parse(poi))),catalog.hospitals.map(poi=>poiSchema.parse(poi))),catalog.libraries.map(poi=>poiSchema.parse(poi)));
    const original=resolvePois(releaseTestAirports,old),serialized=canonicalJson(old);
    let configuration=withPublishedCinemas(old,cinemas);
    expect(canonicalJson(old)).toBe(serialized);
    configuration=decidePoi(configuration,cinemas[0],{name:'Moje přejmenované kino',address:'Moje adresa',point:[14.43,50.1],note:'Soukromá poznámka',status:'excluded'});
    configuration=decidePoi(configuration,cinemas[1],{status:'review'});
    const reviewed=cinemas.find(poi=>poi.id===hostivar)!;
    configuration=decidePoi(configuration,reviewed,{name:'Správcem potvrzený název',status:'approved'});
    configuration={...configuration,visibility:{...configuration.visibility,cinemas:false}};
    const changed=cinemas.map(poi=>({...poi,name:'Nový název zdroje',point:[14.45,50.09] as [number,number],geometry:{type:'Point' as const,coordinates:[14.45,50.09]}}));
    configuration=withPublishedCinemas(configuration,[...changed,{...cinemas[0],id:'synthetic-new-cinema',sourceId:'synthetic-new-cinema',status:'review'}]);
    expect(withPublishedCinemas(configuration,cinemas)).toBe(configuration);
    world.poi=configuration;
    for(const format of ['json','geojson'] as const){
      const loaded=importWorld(exportWorld(world,format));expect(loaded).toEqual(world);
      const resolved=resolvePois(releaseTestAirports,loaded.poi!);
      expect(resolved.filter(poi=>poi.category!=='cinema')).toEqual(original);
      expect(resolved.find(poi=>poi.id==='bio-oko')).toMatchObject({name:'Moje přejmenované kino',address:'Moje adresa',point:[14.43,50.1],geometry:{type:'Point',coordinates:[14.43,50.1]},status:'excluded',note:'Soukromá poznámka'});
      expect(resolved.find(poi=>poi.id===hostivar)).toMatchObject({name:'Správcem potvrzený název',status:'approved'});
      expect(resolved.find(poi=>poi.id===cinemas[1].id)!.status).toBe('review');
      expect(loaded.poi!.visibility.cinemas).toBe(false);expect(loaded.layers).toEqual(world.layers);expect(loaded.gameStops).toEqual(world.gameStops);
    }
  });

  it('creates a real manual point and requires a name/address for approval, validates coordinates and protects source records from deletion',()=>{
    const cinema=createManualCinema([14.42,50.08]);
    let configuration={...withPublishedCinemas(defaultPoiConfiguration(),cinemas),manual:[cinema]};validatePoiConfiguration(configuration);
    expect(()=>decidePoi(configuration,cinema,{status:'approved'})).toThrow('název a adresu');
    expect(()=>decidePoi(configuration,cinema,{name:'Vlastní kino',status:'approved'})).toThrow('název a adresu');
    expect(()=>decidePoi(configuration,cinema,{point:[14.4,91]})).toThrow();
    configuration=decidePoi(configuration,cinema,{name:'Vlastní kino',address:'Testovací adresa',status:'approved'});
    expect(resolvePois([],configuration).find(poi=>poi.id===cinema.id)).toMatchObject({status:'approved',geometry:{type:'Point',coordinates:[14.42,50.08]}});
    expect(()=>removeManualCinema(configuration,cinemas[0].id)).toThrow('pouze ručně');
    expect(()=>poiSchema.parse({...cinemas[0],geometry:{type:'Point',coordinates:[0,0]}})).toThrow('shodnou');
    expect(()=>poiSchema.parse({...cinemas[0],geometry:{type:'Polygon',coordinates:[[[14,50],[15,50],[15,51],[14,50]]]}})).toThrow();
    expect(()=>poiSchema.parse({...cinemas[0],address:undefined})).toThrow();
    configuration=removeManualCinema(configuration,cinema.id);expect(configuration.manual).toEqual([]);expect(configuration.decisions).toEqual([]);
  });
});

it('publishes only approved cinemas in schema 5 with addresses and supports geographic calculations on public records',async()=>{
  const {world,snapshot}=await releaseTestInput();
  world.poi=withPublishedLibraries(withPublishedHospitals(withPublishedZoos(world.poi!,catalog.zoos.map(poi=>poiSchema.parse(poi))),catalog.hospitals.map(poi=>poiSchema.parse(poi))),catalog.libraries.map(poi=>poiSchema.parse(poi)));
  const before=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
  world.poi=withPublishedCinemas(world.poi!,cinemas);
  world.poi=decidePoi(world.poi,cinemas[0],{name:'Upravené Oko',address:'Upravená adresa',point:[14.43,50.1],note:'PRIVATE CINEMA NOTE'});
  world.poi=decidePoi(world.poi,cinemas[1],{status:'excluded'});
  const built=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
  const release=await createGameDataRelease(built.data,{publishedAt:releaseTestDate,kind:built.kind,schemaVersion:5});
  expect(release.schemaVersion).toBe(5);expect(release.data.pois.filter(poi=>poi.category==='cinema')).toHaveLength(24);
  expect(release.data.pois.filter(poi=>poi.category!=='cinema')).toEqual(before.data.pois);
  expect(release.data.pois.find(poi=>poi.id==='bio-oko')).toMatchObject({name:'Upravené Oko',address:'Upravená adresa',point:[14.43,50.1],geometry:{type:'Point',coordinates:[14.43,50.1]}});
  expect(release.data.pois.some(poi=>poi.id===hostivar)).toBe(false);expect(canonicalJson(release)).not.toContain('PRIVATE CINEMA NOTE');
  for(const key of ['gameArea','administrativeAreas','pidSnapshot','rulesConfig'] as const) expect(release.checksums[key]).toBe(before.checksums[key]);
  for(const schemaVersion of [1,2,3,4] as const) await expect(createGameDataRelease(release.data,{publishedAt:releaseTestDate,kind:'reference',schemaVersion})).rejects.toThrow('schéma 5');
  const entry=await releaseEntry(release),index={format:'jetlag-prague-game-catalog',schemaVersion:1,current:entry,versions:[entry]};
  const fetcher=(async(input:RequestInfo|URL)=>String(input).endsWith('current.json')?Response.json(index):new Response(canonicalJson(release))) as typeof fetch;
  const loaded=(await loadGameDataRelease('https://example.test/releases/',fetcher)).release;
  expect(nearestApprovedPoi([14.43,50.1],'cinema',loaded.data.pois)).toMatchObject({state:'known',distanceMeters:0,poi:{id:'bio-oko'}});
  const corrupt=structuredClone(release);corrupt.data.pois.find(poi=>poi.category==='cinema')!.name='Tampered';await expect(verifyGameDataRelease(corrupt)).rejects.toThrow('kontrolní součet');
  const broken=structuredClone(release);broken.data.pois.find(poi=>poi.category==='cinema')!.geometry={type:'Point',coordinates:[0,0]};await expect(verifyGameDataRelease(broken)).rejects.toThrow('Kino');
});

it('adds 25 approved cinemas to immutable history and preserves all five previous categories, Prague, PID and source versions', {timeout:15000},async()=>{
  const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
  const old=index.versions.find(entry=>entry.releaseId==='release:1df560d4f22e6e38ec4df73df52bd34d58b831988ef73f0812753750ae7cff39')!;
  const added=index.versions.find(entry=>entry.releaseId==='release:1f5e3316c584ad01849e246761882b66e02504382bc12b6b18b504b019f988cd')!;
  const previous=await readGameReleaseArtifact(await readFile(`data/releases/${old.file}`,'utf8'),old);
  const release=await readGameReleaseArtifact(await readFile(`data/releases/${added.file}`,'utf8'),added);
  expect(previous.schemaVersion).toBe(4);expect(release.schemaVersion).toBe(5);
  expect(release.data.pois.filter(poi=>poi.category==='cinema')).toHaveLength(25);
  expect(release.data.pois.filter(poi=>poi.category!=='cinema')).toEqual(previous.data.pois);
  expect(release.data.pois.some(poi=>poi.id===hostivar)).toBe(false);
  for(const row of input.filter(row=>row.id!==hostivar)) expect(release.data.pois.find(poi=>poi.id===row.id)).toMatchObject({name:row.name,address:row.address,point:[row.longitude,row.latitude]});
  for(const key of ['gameArea','administrativeAreas','pidSnapshot','rulesConfig'] as const){expect(release.data[key]).toEqual(previous.data[key]);expect(release.checksums[key]).toBe(previous.checksums[key]);}
  expect(release.data.sourceVersions.filter(source=>!source.key.startsWith('poi:cinemas-curated-'))).toEqual(previous.data.sourceVersions);
});
