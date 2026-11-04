import {describe,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import input from '../../../data/raw/embassies-selection.json' with {type:'json'};
import catalog from '../../../apps/editor/src/data/embassy-catalog.json' with {type:'json'};
import {buildGameDataRelease,canonicalJson,createGameDataRelease,createManualEmbassy,decidePoi,decideUnlocatedEmbassy,defaultPoiConfiguration,embassyId,exportWorld,importEmbassyGps,importWorld,isEmbassyLocationVerified,locateEmbassy,matchingPois,measuringPois,nearestApprovedPoi,readDefaultGameArea,removeManualEmbassy,resolvePois,resolveUnlocatedEmbassies,sha256,unlocatedEmbassySchema,validatePoiConfiguration,verifyGameDataRelease,withPublishedEmbassies,type EmbassyVerification} from './index';
import {questionRegistry} from '../../game-core/src/registry';
import {createGeoResolver} from '../../geo-resolver/src/index';
import {releaseTestInput,releaseTestAirports,releaseTestDate} from './game-release-test-fixtures';

const rows=catalog.unlocated.map(r=>unlocatedEmbassySchema.parse(r));
const configuration=()=>withPublishedEmbassies(defaultPoiConfiguration(),[],rows);
// Synthetic test points, explicitly not geocoded embassy locations.
const point:[number,number]=[14.41,50.09],other:[number,number]=[14.44,50.08];
function verification(address:string,p=point):EmbassyVerification{return {point:p,inputAddress:address,method:'manual_review',checkedAt:releaseTestDate,sourceUrl:'https://example.org/synthetic-test-only',dataDate:null,rawChecksum:null,note:'SYNTHETIC TEST FIXTURE – not an actual embassy location'};}
function placed(){return locateEmbassy(configuration(),rows[0],point,verification(rows[0].address));}

describe('Diplomatic selection and address-specific POI approval',()=>{
 it('preserves exactly 60 original rows, country/type identities, addresses, document pages and original XLSX checksum without invented points',async()=>{
  expect(await sha256(new Uint8Array(await readFile('data/raw/prazska_diplomaticka_zastoupeni_pracovni.xlsx')))).toBe(input.sourceChecksum);
  expect(rows).toHaveLength(60);expect(new Set(rows.map(r=>r.id)).size).toBe(60);
  rows.forEach((r,i)=>{const original=input.records[i];expect(r).toMatchObject({id:embassyId(original.countryCode,original.officeType as typeof r.embassy.officeType),name:original.name,address:original.address,sourceId:original.id,point:null,geometry:null,status:'review',embassy:{country:original.country,sourcePage:original.sourcePage,selectionRow:original.sourceRow},attributes:{original}});});
  expect(rows.filter(r=>r.embassy.countryCode==='ru').map(r=>r.id)).toHaveLength(2);
  expect(rows.find(r=>r.embassy.countryCode==='pl'&&r.embassy.officeType==='consular_department')?.address).toContain('13–15');
  expect(resolvePois([],configuration())).toEqual([]);validatePoiConfiguration(configuration());
  expect(nearestApprovedPoi(point,'embassy',resolvePois([],configuration()))).toMatchObject({state:'unknown'});
 });
 it('requires explicit address-matching verification, keeps GeoJSON order, and invalidates approval after a move or address change',()=>{
  expect(()=>decideUnlocatedEmbassy(configuration(),rows[0],{status:'approved'})).toThrow('Nejprve');
  expect(()=>locateEmbassy(configuration(),rows[0],point,verification('Other address'))).toThrow('Potvrďte');
  let c=placed(),poi=resolvePois([],c)[0];expect(poi).toMatchObject({id:rows[0].id,point,geometry:{type:'Point',coordinates:point},status:'review'});
  c=decidePoi(c,poi,{status:'approved'});poi=resolvePois([],c)[0];expect(poi.status).toBe('approved');expect(isEmbassyLocationVerified(poi)).toBe(true);
  const moved=decidePoi(c,poi,{point:other});expect(resolvePois([],moved)[0].status).toBe('review');expect(()=>decidePoi(moved,resolvePois([],moved)[0],{status:'approved'})).toThrow('ověřte');
  expect(resolvePois([],decidePoi(c,poi,{address:'Nová adresa'}))[0].status).toBe('review');
  expect(resolvePois([],decidePoi(c,poi,{name:'Oprava názvu',note:'Poznámka'}))[0].status).toBe('approved');
 });
 it('uses geographic metres, stable office IDs and deterministic ties; excluded/review offices are ignored',()=>{
  let c=placed();c=locateEmbassy(c,rows[1],other,verification(rows[1].address,other));
  for(const p of resolvePois([],c))c=decidePoi(c,p,{status:'approved'});
  const pois=resolvePois([],c);expect(matchingPois(point,other,'embassy',pois)).toMatchObject({state:'known',matches:false});
  expect(matchingPois(point,[point[0]+.0001,point[1]],'embassy',pois)).toMatchObject({matches:true});
  const result=measuringPois(point,[other[0],other[1]+.001],'embassy',pois);expect(result).toMatchObject({state:'known',comparison:'first-closer'});
  if(result.state==='known'){expect(result.second.distanceMeters).toBeGreaterThan(110);expect(result.second.distanceMeters).toBeLessThan(112);}
  const excluded=decidePoi(c,pois[0],{status:'excluded'});expect(nearestApprovedPoi(point,'embassy',resolvePois([],excluded))).toMatchObject({poi:{id:rows[1].id}});
  expect(nearestApprovedPoi(point,'embassy',[{...pois[0],id:'z'},{...pois[0],id:'a'}])).toMatchObject({poi:{id:'a'},tiedIds:['a','z']});
 });
 it('preserves original rows, manual points, exclusions and unrelated data through bundle updates and both backup formats',async()=>{
  const {world}=await releaseTestInput(),before=structuredClone(world);
  let c=withPublishedEmbassies(world.poi!,[],rows);c=decideUnlocatedEmbassy(c,rows[1],{name:'Můj název',status:'excluded',note:'Moje poznámka'});
  c=locateEmbassy(c,rows[0],point,verification(rows[0].address));c=decidePoi(c,resolvePois([],c).find(p=>p.id===rows[0].id)!,{status:'approved'});
  c={...c,visibility:{...c.visibility,embassies:false}};world.poi=withPublishedEmbassies(c,[],rows.map(r=>({...r,name:'Nový zdrojový název'})));
  for(const format of ['json','geojson'] as const){const restored=await importWorld(exportWorld(world,format));expect(restored.poi).toEqual(world.poi);expect(restored.layers).toEqual(before.layers);expect(restored.gameStops).toEqual(before.gameStops);}
  expect(resolveUnlocatedEmbassies(world.poi).find(r=>r.id===rows[1].id)).toMatchObject({name:'Můj název',status:'excluded',note:'Moje poznámka'});
  expect(resolveUnlocatedEmbassies(world.poi).some(r=>r.id===rows[0].id)).toBe(false);expect(resolvePois([],world.poi).find(p=>p.id===rows[0].id)).toMatchObject({point,status:'approved'});
  expect(()=>removeManualEmbassy(world.poi!,rows[0].id)).toThrow('pouze');
  const manual=createManualEmbassy(point,{name:'Test',address:'Test',country:'Test',officeType:'embassy'});world.poi.manual.push(manual);expect(removeManualEmbassy(world.poi,manual.id).manual.some(p=>p.id===manual.id)).toBe(false);
 });
 it('imports reviewed JSON/CSV atomically by existing ID and exact address, rejects unknown/duplicate IDs and points outside Prague, and preserves exclusion',async()=>{
  const prague=await readDefaultGameArea(JSON.parse(await readFile('apps/editor/public/defaults/prague-game-area.geojson','utf8')));
  const row={id:rows[0].id,address:rows[0].address,longitude:point[0],latitude:point[1],sourceUrl:'https://example.org/synthetic',checkedAt:releaseTestDate,note:'Synthetic fixture'};
  let c=decideUnlocatedEmbassy(configuration(),rows[0],{status:'excluded'});const before=canonicalJson(c);
  for(const bad of [{...row,id:'unknown'},{...row,address:'other'},{...row,longitude:0},{...row,latitude:200}])expect(()=>importEmbassyGps(c,JSON.stringify([row,bad]),'json',prague.geometry,true)).toThrow();
  expect(canonicalJson(c)).toBe(before);expect(()=>importEmbassyGps(c,JSON.stringify([row,row]),'json',prague.geometry,true)).toThrow('Duplicitní');expect(()=>importEmbassyGps(c,JSON.stringify([row]),'json',prague.geometry,false)).toThrow('Potvrďte');
  c=importEmbassyGps(c,JSON.stringify([row]),'json',prague.geometry,true).configuration;expect(resolvePois([],c)[0]).toMatchObject({point,status:'excluded'});
  const csv=Object.keys(row).join(',')+'\n'+Object.values(row).map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',');
  const imported=importEmbassyGps(configuration(),csv,'csv',prague.geometry,true);expect(imported.count).toBe(1);expect(resolvePois([],imported.configuration)[0]).toMatchObject({point,status:'review'});
 });
 it('publishes approved offices with schema 7 and source metadata, serves Matching/Measuring, and rejects older schemas for embassy data',async()=>{
  const {world,snapshot}=await releaseTestInput();world.poi=withPublishedEmbassies(world.poi!,[],rows);world.poi=locateEmbassy(world.poi,rows[0],point,verification(rows[0].address));world.poi=decidePoi(world.poi,resolvePois([],world.poi).find(p=>p.id===rows[0].id)!,{status:'approved'});
  const release=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);expect(release.schemaVersion).toBe(7);expect(release.data.pois.filter(p=>p.category==='embassy')).toHaveLength(1);expect(await verifyGameDataRelease(release)).toEqual(release);
  const resolver=createGeoResolver(release),definitions=questionRegistry().filter(q=>q.category==='embassy');expect(definitions.map(q=>q.id)).toEqual(['matching:embassy','measuring:embassy']);for(const d of definitions)expect(resolver.availability(d)).toMatchObject({state:'ready'});
  for(const schemaVersion of [1,2,3,4,5,6] as const)await expect(createGameDataRelease(release.data,{publishedAt:releaseTestDate,kind:'reference',schemaVersion})).rejects.toThrow('schéma 7');
  // All immutable artifacts are verified by the shared historical-release
  // audit in library.test.ts, with a separate budget for full Prague geometry.
  // Keep this small category test inside the default unit-test timeout.
 });
});
