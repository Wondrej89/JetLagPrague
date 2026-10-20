import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import catalog from '../../../apps/editor/src/data/poi-catalog.json' with { type: 'json' };
import { createManualZoo, decidePoi, defaultPoiConfiguration, matchingPois, measuringPois, nearestApprovedPoi, poiSchema, removeManualZoo, resolvePois, validatePoiConfiguration, withPublishedZoos } from './index';
import { exportWorld, importWorld, newFeature, newWorld } from './index';
import { buildGameDataRelease, createGameDataRelease, loadGameDataRelease, readGameReleaseArtifact, readGameReleaseIndex, releaseEntry, verifyGameDataRelease } from './game-release';
import { releaseTestAirports, releaseTestDate, releaseTestInput } from './game-release-test-fixtures';
import { canonicalJson } from './administrative';

const zoos = catalog.zoos.map(poi=>poiSchema.parse(poi));
const expected: [string,number,number][] = [
 ['zoo-praha',50.1171758,14.4066639],['zookoutek-prokopske-udoli',50.0415233,14.3810517],['zookoutek-mala-chuchle',50.0230156,14.3880225],['zookoutek-kamyk',50.0112667,14.4408694],['zookoutek-kunraticky-les',50.0215753,14.4733786],['zoopark-milicov',50.0280586,14.5398583],['mestska-farma-kbely',50.1333508,14.5603561],['divoka-zahrada-hostivar',50.0396019,14.5177714],['stanice-prirodovedcu-ddm',50.0752728,14.4001247],['krokodyli-zoo',50.1022558,14.4511431],
];
describe('Zoo reference points and saved decisions',()=>{
 it('ships exactly ten approved, uniquely identified locations with the exact supplied WGS84 order and addresses',()=>{
  expect(zoos).toHaveLength(10);expect(new Set(zoos.map(p=>p.id)).size).toBe(10);
  for(const [id,latitude,longitude] of expected){const poi=zoos.find(p=>p.id===id)!;expect(poi.point).toEqual([longitude,latitude]);expect(poi.geometry).toEqual({type:'Point',coordinates:[longitude,latitude]});expect(poi.category).toBe('zoo');expect(poi.status).toBe('approved');expect(poi.address?.trim()).toBeTruthy();expect(poi.source.provider).toBe('Mapy.com – ruční převzetí bodů');expect(poi.source.verification).toBe('curated');expect(poi.source.note).toContain('Nejde o oficiální dataset');}
  validatePoiConfiguration(withPublishedZoos(defaultPoiConfiguration(),zoos));
 });
 it('keeps base catalog, edits, exclusions and manual parks through updates and full world backups',()=>{
  const world=newWorld();world.layers[1].features=[newFeature({type:'Point',coordinates:[14.4,50.1]},'Vlastní data')];
  let config=withPublishedZoos(defaultPoiConfiguration(),zoos);const original=canonicalJson(zoos);
  config=decidePoi(config,zoos[0],{name:'Upravená zoo',address:'Vlastní adresa',point:[14.41,50.12],note:'Pracovní poznámka',status:'excluded'});
  config={...config,visibility:{...config.visibility,zoos:false}};
  const changedSource=zoos.map(p=>({...p,name:'Nový zdrojový název',point:[14.5,50.1] as [number,number],geometry:{type:'Point' as const,coordinates:[14.5,50.1]}}));
  config=withPublishedZoos(config,[...changedSource,{...zoos[0],id:'synthetic-new-zoo',sourceId:'synthetic-new-zoo'}]);world.poi=config;
  const loaded=importWorld(exportWorld(world,'geojson'));expect(loaded).toEqual(world);expect(canonicalJson(zoos)).toBe(original);
  const poi=resolvePois(releaseTestAirports,loaded.poi!).find(p=>p.id==='zoo-praha')!;expect(poi).toMatchObject({name:'Upravená zoo',address:'Vlastní adresa',point:[14.41,50.12],geometry:{type:'Point',coordinates:[14.41,50.12]},note:'Pracovní poznámka',status:'excluded'});expect(config.pointCatalog).toHaveLength(11);expect(config.visibility.zoos).toBe(false);expect(loaded.layers).toEqual(world.layers);
  config=decidePoi(config,poi,{status:'approved'});expect(resolvePois([],config).find(p=>p.id===poi.id)?.status).toBe('approved');
 });
 it('creates and removes only manual point POIs, validates GPS and requires a name/address before approval',()=>{
  const manual=createManualZoo([14.42,50.08]);let config=withPublishedZoos(defaultPoiConfiguration(),zoos);config={...config,manual:[manual]};validatePoiConfiguration(config);
  expect(()=>decidePoi(config,manual,{status:'approved'})).toThrow('název a adresu');expect(()=>decidePoi(config,manual,{point:[181,50]})).toThrow();
  config=decidePoi(config,manual,{name:'Ručně vytvořená zoo',address:'Praha',status:'approved'});expect(resolvePois([],config).find(p=>p.id===manual.id)?.status).toBe('approved');
  expect(()=>removeManualZoo(config,zoos[0].id)).toThrow('pouze ručně');config=removeManualZoo(config,manual.id);expect(config.manual).toHaveLength(0);expect(config.decisions).toHaveLength(0);expect(withPublishedZoos(config,zoos).pointCatalog).toHaveLength(10);
  expect(()=>poiSchema.parse({...zoos[0],geometry:{type:'Point',coordinates:[0,0]}})).toThrow('shodnou');expect(()=>poiSchema.parse({...zoos[0],geometry:{type:'Polygon',coordinates:[[[14,50],[15,50],[15,51],[14,50]]]}})).toThrow();
 });
 it('uses geographic reference distances for nearest, Matching and Measuring, ignoring excluded/review locations',()=>{
  const a=zoos.find(p=>p.id==='zoo-praha')!,b=zoos.find(p=>p.id==='krokodyli-zoo')!;
  expect(nearestApprovedPoi(a.point,'zoo',zoos)).toMatchObject({state:'known',poi:{id:a.id},distanceMeters:0});expect(matchingPois(a.point,b.point,'zoo',zoos)).toMatchObject({state:'known',matches:false});expect(matchingPois(a.point,[14.4067,50.1172],'zoo',zoos)).toMatchObject({matches:true});
  const distance=measuringPois(a.point,[b.point[0],b.point[1]+.001],'zoo',zoos);expect(distance).toMatchObject({state:'known',comparison:'first-closer'});if(distance.state==='known'){expect(distance.second.distanceMeters).toBeGreaterThan(110);expect(distance.second.distanceMeters).toBeLessThan(112);}
  const active=zoos.map(p=>p.id===a.id?{...p,status:'excluded' as const}:p);expect(nearestApprovedPoi(a.point,'zoo',active)).not.toMatchObject({poi:{id:a.id}});expect(nearestApprovedPoi(a.point,'zoo',zoos.map(p=>({...p,status:'review' as const})))).toMatchObject({state:'unknown'});
  expect(nearestApprovedPoi(a.point,'zoo',[{...a,id:'z'},{...a,id:'a'}])).toMatchObject({state:'known',poi:{id:'a'},tiedIds:['a','z']});
 });
});

it('publishes only approved zoo in the current schema; public geographic functions consume the DTO directly',async()=>{
 const {world,snapshot}=await releaseTestInput();world.poi=withPublishedZoos(world.poi!,zoos);world.poi=decidePoi(world.poi,zoos[0],{status:'excluded'});world.poi=decidePoi(world.poi,zoos[1],{status:'review'});world.poi=decidePoi(world.poi,zoos[2],{address:'Upravená adresa',point:[14.39,50.02],note:'PRIVATE ZOO NOTE'});
 const release=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);expect(release.schemaVersion).toBe(4);expect(release.data.pois.filter(p=>p.category==='zoo')).toHaveLength(8);expect(release.data.pois.find(p=>p.id===zoos[2].id)).toMatchObject({address:'Upravená adresa',point:[14.39,50.02],geometry:{type:'Point',coordinates:[14.39,50.02]}});expect(canonicalJson(release)).not.toContain('PRIVATE ZOO NOTE');expect(release.data.pois.filter(p=>p.category==='airport')).toHaveLength(3);expect(release.data.pois.filter(p=>p.category==='park')).toHaveLength(1);
 const entry=await releaseEntry(release),index={format:'jetlag-prague-game-catalog',schemaVersion:1,current:entry,versions:[entry]};
 const fetcher=(async(input:RequestInfo|URL)=>String(input).endsWith('current.json')?Response.json(index):new Response(canonicalJson(release))) as typeof fetch;
 const loaded=(await loadGameDataRelease('https://example.test/releases/',fetcher)).release;expect(nearestApprovedPoi([14.39,50.02],'zoo',loaded.data.pois)).toMatchObject({state:'known',poi:{id:zoos[2].id},distanceMeters:0});
 await expect(createGameDataRelease(release.data,{publishedAt:releaseTestDate,kind:'reference',schemaVersion:1})).rejects.toThrow('schéma 2');const broken=structuredClone(release);broken.data.pois.find(p=>p.category==='zoo')!.geometry={type:'Point',coordinates:[0,0]};await expect(verifyGameDataRelease(broken)).rejects.toThrow('Zoo');
});

it('retains existing immutable schema 1 publications, all 117 live parks and the PID snapshot unchanged',async()=>{
 const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));const added=index.versions.find(entry=>entry.releaseId==='release:3b0174b470beb21667464ae5434c30ebd48c199e4aeeb67ffd8055e65fc3af17')!;const current=await readGameReleaseArtifact(await readFile(`data/releases/${added.file}`,'utf8'),added);
 const oldEntry=index.versions.find(entry=>entry.releaseId==='release:ec2c0804b7609826ba0be9d42799718f03dcd6136a6ebdb2e6a82341e64ecf76')!;const old=await readGameReleaseArtifact(await readFile(`data/releases/${oldEntry.file}`,'utf8'),oldEntry);
 expect(old.schemaVersion).toBe(1);expect(current.schemaVersion).toBe(2);expect(current.data.pois.filter(p=>p.category!=='zoo')).toEqual(old.data.pois);expect(current.data.pois.filter(p=>p.category==='zoo')).toHaveLength(10);
 for(const key of ['pidSnapshot','gameArea','administrativeAreas','rulesConfig'] as const){expect(current.data[key]).toEqual(old.data[key]);expect(current.checksums[key]).toBe(old.checksums[key]);}
});
