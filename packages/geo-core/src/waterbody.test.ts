import {beforeAll,describe,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import proj4 from 'proj4';
import {area} from '@turf/turf';
import {applyWaterUpdate,buildGameDataRelease,canonicalJson,classifyWaterbody,createGameDataRelease,decidePoi,defaultPoiConfiguration,distanceToPoiMeters,exportWorld,filterWaterbodies,importWorld,interiorReferencePoint,matchingPois,measuringPois,nearestApprovedPoi,poiSchema,readGameReleaseArtifact,readGameReleaseIndex,resolvePois,sha256,splitWaterbody,validatePoiConfiguration,verifyPoiSources,waterbodyId,waterNameKey,WATER_RULES,withPublishedWaterbodies,type AreaGeometry,type ParkDataset,type Poi} from './index';
import {importWaterZip} from './water-import';
import {mergeWaterbodies} from './water-topology';
import {releaseTestAirports,releaseTestDate,releaseTestInput} from './game-release-test-fixtures';
let dataset:ParkDataset;
beforeAll(async()=>{dataset=JSON.parse(await readFile('apps/editor/src/data/waterbody-catalog.json','utf8'));});
const box:AreaGeometry={type:'Polygon',coordinates:[[[14.4,50],[14.42,50],[14.42,50.02],[14.4,50.02],[14.4,50]],[[14.407,50.007],[14.407,50.013],[14.413,50.013],[14.413,50.007],[14.407,50.007]]]};
function synthetic(index:number,geometry:AreaGeometry=box):Poi{
 const globalId=`{00000000-0000-0000-0000-${String(index).padStart(12,'0')}}`;
 return poiSchema.parse({...dataset.records[0],id:waterbodyId(globalId),sourceId:globalId,name:`Testovací nádrž ${index}`,geometry,point:interiorReferencePoint(geometry),waterbody:{globalIds:[globalId]},status:'approved',attributes:{original:{GLOBALID:globalId,TYP:'P',NAZEV:`Testovací nádrž ${index}`}}});
}
async function source(records:Poi[]):Promise<ParkDataset>{const value={source:dataset.source,records};return {...value,checksum:await sha256(canonicalJson(value))};}

describe('Water classification and complete original dataset',()=>{
 it('keeps all five natural bathing sites, never treats a swimming-place keyword or RN/PN/VN as a pool',()=>{
  for(const name of WATER_RULES.allow)expect(classifyWaterbody(name).status).toBe('approved');
  for(const name of ['RN Kotářka','PN Lochkov','VN Džbán','Tůň Na Vyhlídce'])expect(classifyWaterbody(name).status).toBe('approved');
  expect(classifyWaterbody('Koupaliště Březiněves').status).toBe('review');expect(classifyWaterbody('Koupaliště').status).toBe('review');
  expect(classifyWaterbody('Bazén sportovního areálu').status).toBe('excluded');expect(classifyWaterbody('RN PSN').status).toBe('review');
  expect(classifyWaterbody('Rybník').status).toBe('review');expect(classifyWaterbody('Stejné jméno',2).status).toBe('review');
 });
 it('applies all 19 exact exclusions and the 20 review polygons, preserving unmodified names, GLOBALIDs and every WGS84 geometry',async()=>{
  expect(dataset.records).toHaveLength(763);expect(WATER_RULES.excluded).toHaveLength(19);
  const counts=Object.fromEntries(['approved','review','excluded'].map(status=>[status,dataset.records.filter(p=>p.status===status).length]));expect(counts).toEqual({approved:307,review:384,excluded:72});
  expect(new Set(dataset.records.map(p=>p.id)).size).toBe(763);
  let excluded=0,review=0;
  for(const name of WATER_RULES.excluded){const rows=dataset.records.filter(p=>waterNameKey(p.name)===waterNameKey(name));expect(rows.length,name).toBeGreaterThan(0);expect(rows.every(p=>p.status==='excluded')).toBe(true);excluded+=rows.length;}
  for(const name of Object.keys(WATER_RULES.review)){const rows=dataset.records.filter(p=>waterNameKey(p.name)===waterNameKey(name));expect(rows.length,name).toBeGreaterThan(0);expect(rows.every(p=>p.status==='review')).toBe(true);review+=rows.length;}
  expect(excluded).toBe(72);expect(review).toBe(20);
  for(const name of WATER_RULES.allow)expect(dataset.records.find(p=>p.name===name)!.status).toBe('approved');
  for(const poi of dataset.records){
   const original=poi.attributes.original as {GLOBALID:string;NAZEV:string;TYP:string};
   expect(poi.name).toBe(original.NAZEV);expect(original.TYP).toBe('P');expect(poi.sourceId).toBe(original.GLOBALID);expect(poi.waterbody!.globalIds).toEqual([original.GLOBALID]);
   expect(await sha256(canonicalJson(poi.geometry))).toBe(poi.attributes.originalGeometryChecksum);
  }
  await verifyPoiSources(withPublishedWaterbodies(defaultPoiConfiguration(),dataset));
 });
 it('imports all real SHP rows with CRS5514 conversion, excludes only unnamed P/streams, and repeats with identical identities and geometry',{timeout:30000},async()=>{
  const bytes=new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip'));
  expect(await sha256(bytes)).toBe('e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d');
  const imported=await importWaterZip(bytes,'AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip');
  expect(imported.records.map(p=>[p.id,p.name,p.geometry,p.status])).toEqual(dataset.records.map(p=>[p.id,p.name,p.geometry,p.status]));
  const record=imported.importRecord as unknown as {total:number;waterPolygons:number;ignoredUnnamed:number;ignoredStreams:number;repairs:unknown[];info:{prj:string};originalFeatures:{geometry:AreaGeometry}[]};
  expect(record).toMatchObject({total:3524,waterPolygons:769,ignoredUnnamed:6,ignoredStreams:2755,repairs:[]});
  const original=record.originalFeatures[0].geometry;const first=original.type==='Polygon'?original.coordinates[0][0]:original.coordinates[0][0][0];
  const transformed=proj4(record.info.prj,'EPSG:4326',first);
  const actual=imported.records[0].geometry as AreaGeometry;expect(actual.type==='Polygon'?actual.coordinates[0][0]:actual.coordinates[0][0][0]).toEqual(transformed);
  expect(imported.records.some(p=>p.category==='vltava'||p.id==='river-vltava')).toBe(false);
 });
});

describe('Water polygon geography and review decisions',()=>{
 it('measures real metres to irregular polygons, holes, boundaries and separate MultiPolygon parts',()=>{
  const p=synthetic(1);
  expect(distanceToPoiMeters([14.405,50.005],p)).toBe(0);expect(distanceToPoiMeters([14.4,50.005],p)).toBe(0);
  expect(distanceToPoiMeters([14.399,50.005],p)).toBeGreaterThan(70);expect(distanceToPoiMeters([14.399,50.005],p)).toBeLessThan(73);
  expect(distanceToPoiMeters([14.41,50.01],p)).toBeGreaterThan(210);expect(distanceToPoiMeters([14.41,50.01],p)).toBeLessThan(220);
  const irregular=synthetic(3,{type:'Polygon',coordinates:[[[14.4,50],[14.42,50],[14.42,50.005],[14.405,50.005],[14.405,50.02],[14.4,50.02],[14.4,50]]]});
  // In the concavity: inside the bounding box but outside the actual water.
  expect(distanceToPoiMeters([14.415,50.015],irregular)).toBeGreaterThan(700);expect(distanceToPoiMeters([14.415,50.015],irregular)).toBeLessThan(725);
  expect(distanceToPoiMeters([14.402,50.015],irregular)).toBe(0);
  const multiple:AreaGeometry={type:'MultiPolygon',coordinates:[box.coordinates,[[[14.45,50],[14.46,50],[14.46,50.01],[14.45,50.01],[14.45,50]]]]};
  expect(distanceToPoiMeters([14.455,50.005],synthetic(1,multiple))).toBe(0);
 });
 it('uses only approved polygons for nearest/Matching/Measuring, independently of point distance and display filters',()=>{
  const a=synthetic(1),b=synthetic(2,{type:'Polygon',coordinates:[[[14.45,50],[14.46,50],[14.46,50.01],[14.45,50.01],[14.45,50]]]});
  expect(nearestApprovedPoi([14.405,50.005],'waterbody',[a,b])).toMatchObject({state:'known',distanceMeters:0,poi:{id:a.id}});
  expect(matchingPois([14.405,50.005],[14.455,50.005],'waterbody',[a,b])).toMatchObject({state:'known',matches:false});
  expect(measuringPois([14.405,50.005],[14.449,50.005],'waterbody',[a,b])).toMatchObject({state:'known',comparison:'first-closer'});
  for(const status of ['review','excluded'] as const)expect(nearestApprovedPoi(a.point,'waterbody',[{...a,status}])).toMatchObject({state:'unknown'});
  expect(nearestApprovedPoi(a.point,'waterbody',[{...a,geometry:undefined}])).toMatchObject({state:'unknown'});
  expect(nearestApprovedPoi(a.point,'waterbody',[{...a,id:'z'},{...a,id:'a'}])).toMatchObject({tiedIds:['a','z'],poi:{id:'a'}});
  expect(filterWaterbodies([a,{...b,status:'excluded'}],'excluded')).toHaveLength(1);expect(filterWaterbodies([a,b],'all',a.sourceId)).toEqual([a]);
 });
 it('preserves exclusions, source names/geometries and other world data across update, restoration and both backup formats',async()=>{
  const a=synthetic(1),b=synthetic(2),old=await source([a,b]),{world}=await releaseTestInput();
  const original=structuredClone(world);let c=withPublishedWaterbodies(world.poi!,old);
  c=decidePoi(c,a,{status:'excluded',name:'Moje pojmenování',note:'Zachovat'});c=decidePoi(c,b,{status:'approved'});
  c={...c,waterStatusFilter:'excluded',visibility:{...c.visibility,waterbodies:false}};
  const changed=synthetic(2,{type:'Polygon',coordinates:[[[14.5,50],[14.51,50],[14.51,50.01],[14.5,50.01],[14.5,50]]]});
  c=applyWaterUpdate(c,await source([a,changed]));world.poi=c;
  expect(resolvePois([],c).find(p=>p.id===a.id)).toMatchObject({status:'excluded',name:'Moje pojmenování',geometry:a.geometry});
  expect(resolvePois([],c).find(p=>p.id===b.id)!.status).toBe('review');
  expect(c.waterSources![0].records[0]).toEqual(a);expect(c.manual).toEqual(original.poi!.manual);expect(world.layers).toEqual(original.layers);expect(world.gameStops).toEqual(original.gameStops);
  for(const format of ['json','geojson'] as const)expect(importWorld(exportWorld(world,format))).toEqual(world);
  const restored=decidePoi(c,resolvePois([],c).find(p=>p.id===a.id)!,{status:'approved'});expect(resolvePois([],restored).find(p=>p.id===a.id)!.status).toBe('approved');
 });
 it('explicitly unions and splits source parts without losing islands, GLOBALIDs, geometries or later decisions',async()=>{
  const a=synthetic(1),b=synthetic(2,{type:'Polygon',coordinates:[[[14.45,50],[14.46,50],[14.46,50.01],[14.45,50.01],[14.45,50]]]});
  let c=withPublishedWaterbodies(defaultPoiConfiguration(),await source([a,b]));const before=structuredClone(c);
  const merged=await mergeWaterbodies(c,[a,b],'Spojené vodní plochy');c=merged.configuration;
  expect(merged.poi.geometry.type).toBe('MultiPolygon');expect(area(merged.poi.geometry)).toBeCloseTo(area(a.geometry)+area(b.geometry),3);expect(merged.poi.waterbody!.globalIds).toHaveLength(2);
  expect(merged.poi.status).toBe('review');expect(resolvePois([],c).filter(p=>p.status==='approved')).toHaveLength(0);validatePoiConfiguration(c);
  const split=splitWaterbody(c,merged.poi);expect(split).toEqual(before);
  c=decidePoi(c,a,{status:'review',note:'Pozdější individuální revize'});const after=splitWaterbody(c,merged.poi);expect(after.decisions.find(d=>d.id===a.id)).toMatchObject({status:'review',note:'Pozdější individuální revize'});
 });
});

it('publishes only approved polygon DTOs in schema 6, preserves other POIs/PID and rejects older schema labels',async()=>{
 const {world,snapshot}=await releaseTestInput(),a=synthetic(1),b={...synthetic(2),status:'excluded' as const};
 const before=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);world.poi=withPublishedWaterbodies(world.poi!,await source([a,b]));
 const release=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);expect(release.schemaVersion).toBe(6);expect(release.data.pois.filter(p=>p.category==='waterbody')).toHaveLength(1);
 expect(release.data.pois.filter(p=>p.category!=='waterbody')).toEqual(before.data.pois);expect(release.data.pidSnapshot).toEqual(before.data.pidSnapshot);
 expect(release.data.pois.find(p=>p.id===a.id)).toMatchObject({waterbody:{globalIds:[a.sourceId]},geometry:a.geometry});
 for(const schemaVersion of [1,2,3,4,5] as const)await expect(createGameDataRelease(release.data,{kind:'reference',publishedAt:releaseTestDate,schemaVersion})).rejects.toThrow('schéma 6');
});

it('checks all immutable published versions including the added approved waters without modifying earlier data',{timeout:30000},async()=>{
 const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
 const prior=index.versions.find(e=>e.releaseId==='release:1f5e3316c584ad01849e246761882b66e02504382bc12b6b18b504b019f988cd')!;
 const old=await readGameReleaseArtifact(await readFile('data/releases/'+prior.file,'utf8'),prior);
 const newest=await readGameReleaseArtifact(await readFile('data/releases/'+index.current.file,'utf8'),index.current);
 expect(newest.schemaVersion).toBe(6);expect(newest.data.pois.filter(p=>p.category==='waterbody')).toHaveLength(307);
 expect(newest.data.pois.filter(p=>p.category!=='waterbody')).toEqual(old.data.pois);
 for(const key of ['gameArea','administrativeAreas','pidSnapshot','rulesConfig'] as const)expect(newest.checksums[key]).toBe(old.checksums[key]);
 expect(newest.data.pois.map(p=>p.category)).not.toContain('vltava');
});
