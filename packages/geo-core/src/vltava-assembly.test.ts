import {beforeAll,expect,it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {canonicalJson} from './administrative';
import {sha256} from './pid-snapshot';
import {exportWorld,importWorld,newWorld} from './index';
import {approveVltavaAssembly,approvedVltavaInput,changeVltavaSelection,checkVltavaSource,importVltavaAssembly,newVltavaAssembly,removedVltavaBridge,reviewVltavaAssembly,reviseVltavaAssembly,verifyVltavaSource,VLTAVA_SITES,type VltavaSource} from './vltava-assembly';
import {previewVltavaAssembly} from './vltava-topology';
import {readParkFile} from './park-import';
import {releaseTestInput,releaseTestAirports,releaseTestDate} from './game-release-test-fixtures';
import {buildGameDataRelease} from './game-release';
import {createGeoResolver} from '../../geo-resolver/src/index';
import {questionRegistry} from '../../game-core/src/registry';
let source:VltavaSource;
beforeAll(async()=>{const manifest=JSON.parse(await readFile('apps/editor/src/data/vltava-manifest.json','utf8'));source=await verifyVltavaSource(JSON.parse(await readFile('apps/editor/public/'+manifest.file,'utf8')),manifest.checksum);},30000);
it('loads all original T records, the audited 62/173 memberships, source attributes, rows and symmetric exact adjacency',()=>{
 expect(source.records).toHaveLength(2755);expect(source.records.filter(r=>r.candidate)).toHaveLength(62);expect(source.records.filter(r=>r.related)).toHaveLength(173);
 expect(new Set(source.records.map(r=>r.globalId)).size).toBe(2755);expect(new Set(source.records.map(r=>r.row)).size).toBe(2755);
 expect(source.records.every(r=>r.type==='T'&&r.attributes.GLOBALID===r.globalId&&r.attributes.TYP==='T')).toBe(true);
 expect(source.rawChecksum).toBe('e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d');expect(source.source.dataDate).toBeNull();expect(source.source.license.url).toBeNull();
});
it('deduplicates map selections, records explicit candidate exclusions, rejects unknown IDs and never mutates source polygons',()=>{
 const before=JSON.stringify(source),candidate=source.records.find(r=>r.candidate)!,initial=newVltavaAssembly(source);
 const selected=changeVltavaSelection(initial,source,[candidate.globalId,candidate.globalId]);expect(selected.selectedIds).toEqual([candidate.globalId]);
 const removed=changeVltavaSelection(selected,source,[]);expect(removed.excludedCandidateIds).toEqual([candidate.globalId]);
 expect(changeVltavaSelection(removed,source,[candidate.globalId]).excludedCandidateIds).toEqual([]);
 expect(()=>changeVltavaSelection(initial,source,['invented'])).toThrow('neznámé GLOBALID');expect(JSON.stringify(source)).toBe(before);
});
it('preserves every original transformed T vertex, hole and disconnected polygon part from the supplied Shapefile ZIP',async()=>{
 const file=await readParkFile(new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip')),'AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip');
 const original=file.features.map((f,i)=>({f,row:i+1})).filter(({f})=>f.properties.TYP==='T');
 expect(source.records.map(r=>({globalId:r.globalId,row:r.row,geometry:r.geometry,attributes:r.attributes}))).toEqual(original.map(({f,row})=>({globalId:f.properties.GLOBALID,row,geometry:f.geometry,attributes:f.properties})));
},15000);
it('rejects stale ZIP/prepared checksums, corrupt prepared data and incompatible imports without changing the original draft',async()=>{
 const draft=newVltavaAssembly(source),before=structuredClone(draft);
 for(const sourceKey of ['rawChecksum','preparedChecksum'] as const)expect(()=>importVltavaAssembly({...draft,source:{...draft.source,[sourceKey]:'f'.repeat(64)}},source)).toThrow('checksum');
 await expect(verifyVltavaSource({...source,records:[]},source.checksum)).rejects.toThrow('součet');expect(draft).toEqual(before);
});
it('reproduces the exact audited candidate union and its ten island holes without simplifying or filling water',async()=>{
 const draft=changeVltavaSelection(newVltavaAssembly(source),source,source.records.filter(r=>r.candidate).map(r=>r.globalId));
 const result=await previewVltavaAssembly(source,draft),audit=JSON.parse(await readFile('data/source-metadata/vltava-audit.json','utf8'));
 expect(result.geometryChecksum).toBe(audit.candidate.geometry.geometryChecksum);expect(result).toMatchObject({valid:true,sourceCount:62,vertices:7830});expect(result.parts).toHaveLength(1);expect(result.holes).toHaveLength(10);
 expect(result.siteChecks.find(s=>s.id===VLTAVA_SITES[2])!.insideIslandHole).toBe(false);
 expect(result.siteChecks.find(s=>s.id===VLTAVA_SITES[0])!.insideIslandHole).toBe(true);
},15000);

// Synthetic only, never published: a water polygon with an island, a joining
// segment, and a detached component exercise approval and topology boundaries.
function fixture():VltavaSource {
 const record=(globalId:string,row:number,x:number)=>({globalId,row,type:'T' as const,geometry:{type:'Polygon' as const,coordinates:[[[x,50],[x+.01,50],[x+.01,50.01],[x,50.01],[x,50]]]},attributes:{},candidate:true,related:true,neighbors:[] as string[]});
 const a=record('a',1,14),b=record('b',2,14.01),c=record('c',3,14.02),d=record('d',4,14.1);
 a.geometry.coordinates.push([[14.002,50.002],[14.002,50.004],[14.004,50.004],[14.004,50.002],[14.002,50.002]]);
 a.neighbors=['b'];b.neighbors=['a','c'];c.neighbors=['b'];
 return {format:'jetlag-prague-vltava-streams',schemaVersion:1,id:'synthetic-only',rawChecksum:'a'.repeat(64),checksum:'b'.repeat(64),source:{provider:'Synthetic test, not river data',url:'https://example.test/data',version:'synthetic',dataDate:null,retrievedAt:'2026-11-13T00:00:00Z',license:{name:'unknown',url:null},transformation:'Synthetic WGS84 fixture'},records:[a,b,c,d],sites:VLTAVA_SITES.map((id,i)=>({id,name:'Synthetic island '+i,point:[14.003,50.003],referenceRelease:'synthetic-only'}))};
}
it('detects disconnected actual union components, preserves island holes and warns on removal of a connecting source feature',async()=>{
 const data=fixture(),draft=changeVltavaSelection(newVltavaAssembly(data),data,['a','b','c','d']),result=await previewVltavaAssembly(data,draft);
 expect(result.geometry.type).toBe('MultiPolygon');expect(result.parts).toHaveLength(2);expect(result.holes).toHaveLength(1);
 expect(removedVltavaBridge(draft,data,'b')).toBe(true);expect(removedVltavaBridge(draft,data,'a')).toBe(false);
 expect((await previewVltavaAssembly(data,changeVltavaSelection(draft,data,['a','c','d']))).parts).toHaveLength(3);
});
it('requires explicit manual reviews and source evidence, rejects unresolved sites and resets approval on any selection change',async()=>{
 const data=fixture(),draft=changeVltavaSelection(newVltavaAssembly(data),data,['a','b','c']),preview=await previewVltavaAssembly(data,draft);
 let review=await reviewVltavaAssembly(draft,data,preview);
 expect(review.checks).toEqual(draft.checks);expect(review.sites.every(s=>s.status==='pending')).toBe(true);
 await expect(approveVltavaAssembly(review,data,preview)).rejects.toThrow();
 review=reviseVltavaAssembly(review,{checks:{river:true,coverage:true,islands:true,zofin:true,bridges:true,gaps:true,metadata:true},sites:review.sites.map(s=>({...s,status:'verified',note:'Detailed synthetic review. '.repeat(100)})),reviewer:'Synthetic reviewer',metadata:{...review.metadata,dataDate:'2026-11-13',licenseName:'Synthetic test',licenseUrl:'https://example.test/license',evidence:'Synthetic fixture, not real coverage'}});
 await expect(approveVltavaAssembly({...review,sites:review.sites.map((s,i)=>i===0?{...s,status:'unresolved'}:s)},data,preview)).rejects.toThrow();
 await expect(approveVltavaAssembly({...review,metadata:{...review.metadata,dataDate:''}},data,preview)).rejects.toThrow();
 const approved=await approveVltavaAssembly(review,data,preview),output=await approvedVltavaInput(approved,data,preview);
 expect(output.geometry).toEqual(preview.geometry);expect(output.properties.source.sourceFeatureIds).toEqual(['a','b','c']);expect(output.properties.coverageReview.status).toBe('verified');
 expect(output.properties.coverageReview.note.length).toBeGreaterThan(10000);
 const changed=changeVltavaSelection(approved,data,['a','b']);expect(changed.status).toBe('draft');expect(changed.approval).toBeNull();expect(Object.values(changed.checks).every(v=>!v)).toBe(true);
 await expect(approvedVltavaInput(changed,data,preview)).rejects.toThrow('není schválená');
 const tampered={...preview,geometry:data.records[0].geometry};await expect(approvedVltavaInput(approved,data,tampered)).rejects.toThrow('geometrii');
 expect(reviseVltavaAssembly(approved,{note:'Edited after approval'})).toMatchObject({status:'review',approval:null});
});
it('round-trips IDs/decisions in JSON, GeoJSON world backups and legacy drafts without duplicating source geometry',()=>{
 const draft=changeVltavaSelection(newVltavaAssembly(source),source,[source.records[0].globalId]);draft.note='Manual note';
 expect(importVltavaAssembly(JSON.parse(JSON.stringify(draft)),source)).toEqual(draft);expect(JSON.stringify(draft)).not.toContain('coordinates');
 const world={...newWorld(),vltavaAssembly:draft};for(const format of ['json','geojson'] as const)expect(importWorld(exportWorld(world,format))).toEqual(world);
 const legacy=newWorld();expect(importWorld(exportWorld(legacy))).not.toHaveProperty('vltavaAssembly');checkVltavaSource(draft,source);
});
it('never includes even a reviewed local selection in central releases or makes Measuring available',async()=>{
 const {world,snapshot}=await releaseTestInput(),before=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
 const draft=changeVltavaSelection(newVltavaAssembly(source),source,source.records.filter(r=>r.candidate).map(r=>r.globalId));world.vltavaAssembly=await reviewVltavaAssembly(draft,source,await previewVltavaAssembly(source,draft));
 const next=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
 expect(next.releaseId).toBe(before.releaseId);expect(next.data).not.toHaveProperty('vltava');
 expect(createGeoResolver(next).availability(questionRegistry().find(q=>q.id==='measuring:vltava')!).state).toBe('missing_data');
 expect(await sha256(canonicalJson(world.vltavaAssembly))).toHaveLength(64);
},15000);
