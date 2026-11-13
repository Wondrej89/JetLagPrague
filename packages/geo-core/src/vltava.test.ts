import {expect,it} from 'vitest';
import {readFile,readdir} from 'node:fs/promises';
import {unzipSync} from 'fflate';
import {sha256} from './pid-snapshot';
import {readVltavaWaterAreaInput} from './vltava';

/** Synthetic topology fixture only. Never written to a catalog or publication;
 * these coordinates do not describe the Vltava. */
function input(){return {type:'Feature',id:'river:vltava:prague',geometry:{type:'MultiPolygon',coordinates:[
 [[[14.40,50.05],[14.44,50.05],[14.44,50.09],[14.40,50.09],[14.40,50.05]],[[14.41,50.06],[14.41,50.07],[14.42,50.07],[14.42,50.06],[14.41,50.06]]],
 [[[14.45,50.10],[14.46,50.10],[14.46,50.11],[14.45,50.11],[14.45,50.10]]]
 ]},properties:{name:'Vltava',kind:'river_water_area',source:{provider:'Syntetický test kontraktu – nejde o Vltavu',url:'https://example.test/source',version:'synthetic-v1',dataDate:'2026-11-13',retrievedAt:'2026-11-13T08:00:00.000Z',license:{name:'Pouze testovací fixture',url:'https://example.test/license'},rawChecksum:'a'.repeat(64),sourceFeatureIds:['synthetic-1','synthetic-2']},coverageReview:{status:'pending',fullPragueReach:false,islandHoles:'unverified',bridgePassages:'unverified',reviewedBy:null,reviewedAt:null,note:'Syntetická geometrie pro kontrolu formátu. Neověřuje průběh skutečné řeky.'}}};}

it('defines a separate water-area input and preserves every vertex, island hole and MultiPolygon component',()=>{
 const data=input(),before=JSON.stringify(data),parsed=readVltavaWaterAreaInput(data);expect(parsed.geometry).toEqual(data.geometry);expect(parsed.properties.coverageReview.status).toBe('pending');expect(parsed.properties.source.sourceFeatureIds).toEqual(['synthetic-1','synthetic-2']);expect(JSON.stringify(data)).toBe(before);
});
it.each([
 {type:'Point',coordinates:[14.4,50.08]},
 {type:'LineString',coordinates:[[14.4,50.08],[14.5,50.09]]},
 {type:'Polygon',coordinates:[[[14.4,50],[14.5,50.1],[14.5,50],[14.4,50.1],[14.4,50]]]},
 {type:'Polygon',coordinates:[[[-740000,-1040000],[-739000,-1040000],[-739000,-1039000],[-740000,-1040000]]]},
])('rejects point/shoreline-only, invalid topology and untransformed projected coordinates',geometry=>{
 expect(()=>readVltavaWaterAreaInput({...input(),geometry})).toThrow();
});
it('requires stable river identity, source date/version, license, checksum and original source IDs',()=>{
 const data=input();expect(()=>readVltavaWaterAreaInput({...data,id:'pond'})).toThrow();
 for(const source of [{...data.properties.source,rawChecksum:'unknown'},{...data.properties.source,sourceFeatureIds:[]},{...data.properties.source,sourceFeatureIds:['same','same']},{...data.properties.source,dataDate:null},{...data.properties.source,license:{name:'neznámá',url:null}}])expect(()=>readVltavaWaterAreaInput({...data,properties:{...data.properties,source}})).toThrow();
});
it('does not equate parsing a valid polygon with a verified complete river',()=>{
 const data=input();expect(()=>readVltavaWaterAreaInput({...data,properties:{...data.properties,coverageReview:{...data.properties.coverageReview,status:'verified'}}})).toThrow('Ověření vyžaduje');
 const reviewed={...data.properties.coverageReview,status:'verified',fullPragueReach:true,islandHoles:'included',bridgePassages:'continuous',reviewedBy:'Syntetický test',reviewedAt:'2026-11-13T08:00:00.000Z'};
 expect(readVltavaWaterAreaInput({...data,properties:{...data.properties,coverageReview:reviewed}}).properties.coverageReview.status).toBe('verified');
 // This checks only the declared review record. No real coverage, publication,
 // automatic answer or geographic deduction is claimed by this fixture.
});
it('audits all immutable published versions: none supplies a river/shore/landmass dataset',async()=>{
 const files=(await readdir('data/releases')).filter(f=>f.startsWith('release-')&&f.endsWith('.json'));expect(files.length).toBeGreaterThan(0);
 for(const file of files){const release=JSON.parse(await readFile('data/releases/'+file,'utf8'));if(release.schemaVersion>7)continue;expect(Object.keys(release.data).sort()).toEqual(['administrativeAreas','gameArea','pidSnapshot','pois','rulesConfig','sourceVersions']);expect(release.data.pois.filter((p:{category:string})=>['vltava','landmass','shore'].includes(p.category))).toEqual([]);}
});
it('audits the supplied original ZIP: all 2,755 stream polygons are unnamed and have no river identity field',async()=>{
 const raw=new Uint8Array(await readFile('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip'));expect(await sha256(raw)).toBe('e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d');
 const zip=unzipSync(raw),key=Object.keys(zip).find(n=>n.endsWith('.dbf'))!,dbf=zip[key],view=new DataView(dbf.buffer,dbf.byteOffset,dbf.byteLength),decoder=new TextDecoder('utf-8');
 const fields:{name:string;width:number}[]=[];for(let offset=32;offset<view.getUint16(8,true)-1;offset+=32){const bytes=dbf.subarray(offset,offset+11),end=bytes.indexOf(0);fields.push({name:decoder.decode(end<0?bytes:bytes.subarray(0,end)),width:dbf[offset+16]});}
 expect(fields.map(f=>f.name)).toEqual(['NAZEV','PRISTUPNOS','TYP','KOUPANI','KOUP_OBL','GLOBALID','SHAPE_LEN']);
 const rows:Record<string,string>[]=[];for(let i=0;i<view.getUint32(4,true);i++){let offset=view.getUint16(8,true)+i*view.getUint16(10,true);if(dbf[offset++]===42)continue;const row:Record<string,string>={};for(const field of fields){row[field.name]=decoder.decode(dbf.subarray(offset,offset+field.width)).trim();offset+=field.width;}rows.push(row);}
 expect(rows).toHaveLength(3524);const streams=rows.filter(r=>r.TYP==='T');expect(streams).toHaveLength(2755);expect(streams.every(r=>!r.NAZEV)).toBe(true);expect(rows.filter(r=>/vltav/i.test(r.NAZEV))).toEqual([]);
});
