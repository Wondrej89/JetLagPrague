import { area } from '@turf/turf';
import type { Geometry, Polygon, Position } from 'geojson';
import type { AreaGeometry } from './index';
import { canonicalJson } from './administrative';
import { sha256 } from './pid-snapshot';
import { withGeos } from './park-topology';
import { riverLandCoverage, type LandArea, type LandPreview, type LandStop } from './river-land';
import type { RiverSeparation } from './vltava-assembly-schema';

export interface LandInputs {
 boundary: AreaGeometry;
 water: AreaGeometry;
 separations: RiverSeparation[];
 stops: LandStop[] | null;
}

export async function previewRiverLand({boundary,water,separations,stops}:LandInputs):Promise<LandPreview> {
 const ordered=[...separations].sort((a,b)=>a.id.localeCompare(b.id));
 const topology=await withGeos((g,{read,own,release,write,allocate})=>{
  const territory=read(boundary),river=read(water);
  if(g.GEOSisValid(territory)!==1||g.GEOSisValid(river)!==1)throw new Error('Hranice hry nebo vodní plocha je topologicky neplatná.');
  const land=own(g.GEOSDifference(territory,river));
  if(g.GEOSisEmpty(land)===1||g.GEOSisValid(land)!==1)throw new Error('Herní oblast nemá platnou pevninskou část.');
  const edge=own(g.GEOSBoundary(land));
  const boundaryLinework=write(edge);
  const problems:LandPreview['problems']=[];
  const active=ordered.filter(line=>{
   if(line.status!=='approved')return false;
   const start=line.geometry.coordinates[0],end=line.geometry.coordinates.at(-1)!;
   const inside=(coordinates:Position)=>g.GEOSContains(land,read({type:'Point',coordinates}))===1;
   if(g.GEOSisSimple(read(line.geometry))!==1||inside(start)||inside(end)||
      (start[0]===end[0]&&start[1]===end[1])){
    problems.push({id:line.id,reason:'Linie musí být jednoduchá, otevřená a mít oba konce na břehu, ve vodě nebo mimo herní oblast.'});
    return false;
   }
   return true;
  });
  const polygonize=(lines:RiverSeparation[])=>{
   const linework:Geometry={type:'GeometryCollection',geometries:[boundaryLinework,...lines.map(line=>line.geometry)]};
   const input=read(linework);
   const noded=own(g.GEOSUnaryUnion(input));
   release(input);
   const collection=own(g.GEOSPolygonize_full(noded,0,0,0));
   release(noded);
   const faces:{polygon:number; interior:number}[]=[];
   for(let i=0;i<g.GEOSGetNumGeometries(collection);i++){
    const polygon=g.GEOSGetGeometryN(collection,i);
    const interior=own(g.GEOSPointOnSurface(polygon));
    if(g.GEOSContains(land,interior)===1)faces.push({polygon,interior});
    else release(interior);
   }
   return {faces,dispose:()=>{
    for(const face of faces)release(face.interior);
    release(collection);
   }};
  };
  let partition=polygonize(active);
  const byFace=new Map<number,string[]>();
  // A line contributes only if removing it merges faces. Repeat after dropping
  // ineffective cuts so they cannot change the coordinates or IDs of faces.
  while(active.length){
   const ineffective=new Set<string>();
   byFace.clear();
   for(const line of active){
    const without=polygonize(active.filter(other=>other.id!==line.id));
    try{
     if(without.faces.length>=partition.faces.length){ineffective.add(line.id);continue;}
     for(const parent of without.faces){
      const children=partition.faces.filter(face=>g.GEOSContains(parent.polygon,face.interior)===1);
      if(children.length<2)continue;
      for(const face of children){
       const ids=byFace.get(face.polygon)??[];
       ids.push(line.id);
       byFace.set(face.polygon,ids);
      }
     }
    }finally{without.dispose();}
   }
   if(!ineffective.size)break;
   for(const id of ineffective)problems.push({id,reason:'Linie souš nerozdělila. Upravte průběh a zkontrolujte napojení na oba břehy.'});
   for(let i=active.length-1;i>=0;i--)if(ineffective.has(active[i].id))active.splice(i,1);
   partition.dispose();
   partition=polygonize(active);
   byFace.clear();
  }
  const {faces}=partition;
  const areaPointer=allocate(8);
  const planarArea=(geometry:number)=>{
   if(g.GEOSArea(geometry,areaPointer)!==1)throw new Error('GEOS nemůže spočítat plochu.');
   return g.Module.HEAPF64[areaPointer/8];
  };
  const expected=planarArea(land);
  const actual=faces.reduce((sum,face)=>sum+planarArea(face.polygon),0);
  if(!faces.length||Math.abs(expected-actual)>Math.max(expected*1e-9,1e-13))throw new Error('Rozdělení nepokrývá celou pevninu.');
  return {problems,faces:faces.map(({polygon})=>{
   // Clone borrowed members before normalization.
   const normalized=own(g.GEOSGeom_clone(polygon));
   if(g.GEOSisValid(normalized)!==1||g.GEOSNormalize(normalized)!==0)throw new Error('Neplatná pevninská oblast.');
   const geometry=write(normalized);
   if(geometry.type!=='Polygon')throw new Error('Výsledek polygonizace není polygon.');
   return {geometry:geometry as Polygon,separationIds:byFace.get(polygon)??[]};
  })};
 });
 const areas:LandArea[]=await Promise.all(topology.faces.map(async face=>({...face,id:await sha256(canonicalJson(face.geometry)),areaM2:area(face.geometry)})));
 areas.sort((a,b)=>a.id.localeCompare(b.id));
 const coverage=riverLandCoverage(boundary,water,areas,stops);
 const inputChecksum=await sha256(canonicalJson({boundary,water,separations:ordered}));
 return {areas,problems:topology.problems,coverage,inputChecksum};
}
