import {readFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {readGameReleaseArtifact,readGameReleaseIndex} from '../packages/geo-core/src/game-release';
import {auditVltavaSource,diagnosticBackbone,VLTAVA_AUDIT_ENDPOINTS} from './vltava-source-audit';

it('retains alternative paths but does not mistake a dangling tributary cycle for the main reach',()=>{
 const graph=new Map([[1,[2,3]],[2,[1,4,5,6]],[3,[1,4]],[4,[2,3]],[5,[2,6]],[6,[2,5]],[7,[]]]);
 expect([...diagnosticBackbone(graph,1,4)].sort()).toEqual([1,2,3,4]);
 expect([...diagnosticBackbone(graph,1,7)]).toEqual([]);
});

it('reproduces the original ZIP spatial audit without publishing an incomplete river or losing source identities',async()=>{
 const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
 const release=await readGameReleaseArtifact(await readFile('data/releases/'+index.current.file,'utf8'),index.current);
 const bytes=new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip'));
 const audit=await auditVltavaSource(bytes,release),stored=JSON.parse(await readFile('data/source-metadata/vltava-audit.json','utf8'));
 expect(audit.source.checksum).toBe('e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d');
 expect(audit.inventory).toEqual({total:3524,waterAreas:769,streams:2755,namedStreams:0,invalidStreams:[]});
 expect(audit.connectivity.totalComponents).toBe(463);expect(audit.connectivity.riverAndTributariesComponent).toHaveLength(173);
 expect(audit.candidate.anchors.map(a=>a.globalId)).toEqual(VLTAVA_AUDIT_ENDPOINTS);
 expect(audit.candidate.records).toHaveLength(62);expect(new Set(audit.candidate.records.map(r=>r.globalId)).size).toBe(62);
 expect(audit.candidate.records).toEqual(stored.candidate.records);expect(audit.candidate.geometry).toEqual(stored.candidate.geometry);
 expect(audit.candidate.geometry).toMatchObject({type:'Polygon',parts:1,holes:10});
 // No appreciable overlap in the candidate set. Tiny floating-point area
 // residuals cannot establish correct coverage or exclude a missing arm.
 expect(Math.abs(audit.candidate.summedInputAreaM2-audit.candidate.geometry.areaM2)).toBeLessThan(0.01);
 expect(audit.allSourceWaterControl).toMatchObject({components:952,largest:{type:'Polygon',parts:1,holes:17}});
 const check=(id:string)=>audit.locationChecks.find(c=>c.id==='park:ipr-mpp-100-parky:'+id)!;
 for(const id of ['2210','2809']){expect(check(id).candidate.insideIslandHole).toBe(false);expect(check(id).allSourceWaterControl.insideIslandHole).toBe(true);}
 expect(check('2261').allSourceWaterControl.insideIslandHole).toBe(false);
 for(const id of ['2494','2003'])expect(check(id).candidate.insideIslandHole).toBe(true);
 expect(audit.publication).toMatchObject({status:'blocked',approvedVltavaObjects:0,geometryPublished:false});
 expect(audit.publication).toEqual(stored.publication);
},30000);
