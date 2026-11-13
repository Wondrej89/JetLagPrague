import initGeos from 'geos-wasm';
import {area,booleanPointInPolygon} from '@turf/turf';
import {readParkFile} from '../packages/geo-core/src/park-import';
import {parkTopology,PARK_TOPOLOGY_ENGINE} from '../packages/geo-core/src/park-topology';
import {canonicalJson} from '../packages/geo-core/src/administrative';
import {sha256} from '../packages/geo-core/src/pid-snapshot';
import type {AreaGeometry,GameDataRelease} from '../packages/geo-core/src/index';

/** Source features identified by spatial review at the southern/northern Prague
 * river exits. These are diagnostic anchors, not an approved river selection. */
export const VLTAVA_AUDIT_ENDPOINTS=['{F2D6E82B-C5AB-4E9C-8A3A-ADF9E10010CB}','{99537C4D-12D7-4AFA-8BBC-7D6DBC269ECF}'] as const;
type Point=[number,number];type Bounds=[number,number,number,number];
const polygons=(g:AreaGeometry)=>g.type==='Polygon'?[g.coordinates]:g.coordinates;
const bounds=(g:AreaGeometry)=>polygons(g).flat(2).reduce<Bounds>((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
const boundsDistance=(a:Bounds,b:Bounds)=>Math.hypot(Math.max(a[0]-b[2],b[0]-a[2],0),Math.max(a[1]-b[3],b[1]-a[3],0));
function isWaterArea(g:unknown):g is AreaGeometry{return !!g&&typeof g==='object'&&'type' in g&&(g.type==='Polygon'||g.type==='MultiPolygon');}

/** Vertices on a simple endpoint-to-endpoint path, via block-cut decomposition.
 * Only a diagnostic candidate generator: a source feature can have multiple
 * separate contacts with its neighbour, so a simple feature graph can omit a
 * real island arm. Never publish this set without independent coverage review. */
export function diagnosticBackbone(graph:Map<number,number[]>,start:number,end:number):Set<number>{
 const seen=new Map<number,number>(),low=new Map<number,number>(),stack:[number,number][]=[],blocks:Set<number>[]=[];let clock=0;
 const visit=(v:number,parent?:number)=>{seen.set(v,++clock);low.set(v,clock);for(const w of graph.get(v)??[]){if(w===parent)continue;if(!seen.has(w)){stack.push([v,w]);visit(w,v);low.set(v,Math.min(low.get(v)!,low.get(w)!));if(low.get(w)!>=seen.get(v)!){const block=new Set<number>();while(stack.length){const edge=stack.pop()!;edge.forEach(p=>block.add(p));if(edge[0]===v&&edge[1]===w)break;}blocks.push(block);}}else if(seen.get(w)!<seen.get(v)!){stack.push([v,w]);low.set(v,Math.min(low.get(v)!,seen.get(w)!));}}};
 visit(start);if(!seen.has(end))return new Set();if(start===end)return new Set([start]);
 const membership=new Map<number,number[]>();blocks.forEach((block,i)=>block.forEach(v=>membership.set(v,[...(membership.get(v)??[]),i])));
 const tree=new Map<string,string[]>();for(const [v,ids]of membership)if(ids.length>1)for(const i of ids){const a='a:'+v,b='b:'+i;tree.set(a,[...(tree.get(a)??[]),b]);tree.set(b,[...(tree.get(b)??[]),a]);}
 const node=(v:number)=>membership.get(v)!.length>1?'a:'+v:'b:'+membership.get(v)![0],first=node(start),last=node(end),queue=[first],parent=new Map<string,string|null>([[first,null]]);
 for(let i=0;i<queue.length;i++)for(const next of tree.get(queue[i])??[])if(!parent.has(next)){parent.set(next,queue[i]);queue.push(next);}
 const result=new Set<number>();for(let current:string|null=last;current!==null;current=parent.get(current)??null){const [kind,id]=current.split(':');if(kind==='a')result.add(Number(id));else blocks[Number(id)].forEach(v=>result.add(v));}return result;
}

export async function auditVltavaSource(bytes:Uint8Array,release:GameDataRelease){
 const file=await readParkFile(bytes,'AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip'),g=await initGeos(),reader=g.GEOSGeoJSONReader_create(),number=g.Module._malloc(8),handles:number[]=[];
 try{
  const read=(geometry:AreaGeometry)=>{const text=JSON.stringify(geometry),size=new TextEncoder().encode(text).length+1,p=g.Module._malloc(size);try{g.Module.stringToUTF8(text,p,size);const handle=g.GEOSGeoJSONReader_readGeometry(reader,p);if(!handle)throw new Error('GEOS nemůže načíst zdrojový polygon.');handles.push(handle);return handle;}finally{g.Module._free(p);}};
  const streams=file.originalFeatures.flatMap((f,i)=>f.properties.TYP==='T'&&isWaterArea(f.geometry)?[{row:i+1,id:String(f.properties.GLOBALID),name:String(f.properties.NAZEV??''),geometry:f.geometry,handle:read(f.geometry),bounds:bounds(f.geometry)}]:[]);
  const invalid=streams.filter(s=>g.GEOSisValid(s.handle)!==1).map(s=>s.id);if(invalid.length)throw new Error('Neplatné zdrojové T: '+invalid.join(', '));
  const nodes=new Map(streams.map(s=>[s.row,s])),adjacency=new Map(streams.map(s=>[s.row,[] as number[]]));
  for(let i=0;i<streams.length;i++)for(let j=i+1;j<streams.length;j++){const a=streams[i],b=streams[j];if(boundsDistance(a.bounds,b.bounds)>1e-6)continue;if(g.GEOSDistance(a.handle,b.handle,number)!==1)throw new Error('GEOS nevrátil vzdálenost.');if(g.Module.getValue(number,'double')<=1e-6){adjacency.get(a.row)!.push(b.row);adjacency.get(b.row)!.push(a.row);}}
  const components:number[][]=[],visited=new Set<number>();for(const s of streams){if(visited.has(s.row))continue;const queue=[s.row];visited.add(s.row);for(let i=0;i<queue.length;i++)for(const row of adjacency.get(queue[i])!)if(!visited.has(row)){visited.add(row);queue.push(row);}components.push(queue);}
  const anchors=VLTAVA_AUDIT_ENDPOINTS.map(id=>streams.find(s=>s.id===id));if(anchors.some(s=>!s))throw new Error('Zdrojové kotvy auditu chybí; nová verze vyžaduje novou prostorovou revizi.');
  const component=components.find(c=>c.includes(anchors[0]!.row))!;if(!component.includes(anchors[1]!.row))throw new Error('Vstupní a výstupní kotva nejsou propojené.');
  const candidateRows=diagnosticBackbone(adjacency,anchors[0]!.row,anchors[1]!.row),candidateFeatures=file.features.filter((_,i)=>candidateRows.has(i+1));
  const union=await parkTopology({type:'GeometryCollection',geometries:candidateFeatures.map(f=>f.geometry!)},'union');if(!isWaterArea(union))throw new Error('Sjednocení kandidátů není polygonové.');
  const allAreas=file.features.map(f=>f.geometry);if(!allAreas.every(isWaterArea))throw new Error('Původní dataset obsahuje nepolygonové geometrie.');
  // Deliberately overinclusive negative control. It includes Berounka and other
  // streams/ponds and is NEVER offered as a Vltava geometry or a game release.
  const control=await parkTopology({type:'GeometryCollection',geometries:allAreas},'union');if(!isWaterArea(control))throw new Error('Kontrolní sjednocení není polygonové.');
  const controlParts=polygons(control),largest=controlParts.map(coordinates=>({type:'Polygon' as const,coordinates})).sort((a,b)=>area(b)-area(a))[0];
  const summarize=async(geometry:AreaGeometry)=>({type:geometry.type,parts:polygons(geometry).length,holes:polygons(geometry).reduce((n,p)=>n+p.length-1,0),areaM2:area(geometry),vertices:polygons(geometry).flat(2).length,geometryChecksum:await sha256(canonicalJson(geometry))});
  const locationChecks=['park:ipr-mpp-100-parky:2210','park:ipr-mpp-100-parky:2261','park:ipr-mpp-100-parky:2494','park:ipr-mpp-100-parky:2003','park:ipr-mpp-100-parky:2809'].map(id=>{
   const park=release.data.pois.find(p=>p.id===id);if(!park)throw new Error('Chybí publikovaný orientační bod: '+id);
   const check=(geometry:AreaGeometry)=>{const insideWater=booleanPointInPolygon(park.point,geometry),insideOuterRing=polygons(geometry).some(coordinates=>booleanPointInPolygon(park.point,{type:'Polygon',coordinates:[coordinates[0]]}));return {insideWater,insideOuterRing,insideIslandHole:insideOuterRing&&!insideWater};};
   return {id:park.id,name:park.name,point:park.point as Point,referenceRelease:release.releaseId,candidate:check(union),allSourceWaterControl:check(largest)};
  });
  const sourceRecord=(row:number)=>{const s=nodes.get(row)!;return {row,globalId:s.id,name:s.name};};
  return {format:'jetlag-prague-vltava-source-audit',schemaVersion:1,source:{file:'data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip',checksum:file.originalChecksum,crs:file.originalCrs,encoding:file.encoding,transformation:file.transformation,fields:file.fields,metadataSynchronizedAt:'2026-10-05',dataDate:null,license:'Konkrétní licence není v dodaném ZIPu doložena.'},
   inventory:{total:file.features.length,waterAreas:file.features.filter(f=>f.properties.TYP==='P').length,streams:streams.length,namedStreams:streams.filter(s=>s.name.trim()).length,invalidStreams:invalid},
   sourceAdjacency:Object.fromEntries(streams.map(s=>[s.id,adjacency.get(s.row)!.map(row=>nodes.get(row)!.id).sort()])),
   connectivity:{engine:PARK_TOPOLOGY_ENGINE,space:'original EPSG:5514 metres',adjacencyToleranceMeters:1e-6,totalComponents:components.length,riverAndTributariesComponent:component.map(sourceRecord).sort((a,b)=>a.row-b.row)},
   candidate:{status:'diagnostic_only_not_approved',method:'Block-cut endpoint path; spatially reviewed source anchors. Feature-graph pruning alone does not preserve all island arms.',anchors:anchors.map(s=>sourceRecord(s!.row)),records:[...candidateRows].sort((a,b)=>a-b).map(sourceRecord),geometry:await summarize(union),summedInputAreaM2:candidateFeatures.reduce((sum,f)=>sum+area(f.geometry!),0)},
   allSourceWaterControl:{input:'All 3,524 source P/T polygons, including other rivers and ponds; not a river selection.',components:controlParts.length,largest:await summarize(largest)},locationChecks,
   publication:{status:'blocked',approvedVltavaObjects:0,geometryPublished:false,reasons:['Neexistuje atribut příslušnosti anonymních T k Vltavě; propojená komponenta zahrnuje i jiné toky.','Pouhý výběr topologické páteře vynechává skutečná ostrovní ramena.','Ani kontrolní sjednocení všech vodních polygonů neuzavírá ostrovní otvor u publikovaného bodu Žofína. Je nutná autoritativní kontrola břehů a vody pod přemostěními.','Úplnost koryta pro geografické Measuring není ověřená; žádné doplnění bufferem, obálkou nebo rastrem se neprovádí.']}};
 }finally{for(const handle of handles)g.GEOSGeom_destroy(handle);g.Module._free(number);g.GEOSGeoJSONReader_destroy(reader);}
}
