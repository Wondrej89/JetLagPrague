// Editor/worker only: do not export GEOS from the public geo-core barrel.
import {area,booleanPointInPolygon} from '@turf/turf';
import {parkTopology} from './park-topology';
import {canonicalJson} from './administrative';
import {sha256} from './pid-snapshot';
import {isArea,validateGeometry,type AreaGeometry} from './index';
import {checkVltavaSource,vltavaSelectionChecksum,type VltavaSource,type VltavaAssembly,type VltavaPreview} from './vltava-assembly';

export class VltavaTopologyError extends Error {
 constructor(message:string,readonly featureIds:string[]){super(message);}
}
export async function previewVltavaAssembly(source:VltavaSource,draft:VltavaAssembly):Promise<VltavaPreview>{
 checkVltavaSource(draft,source);if(!draft.selectedIds.length)throw new Error('Vyberte alespoň jeden zdrojový polygon.');
 const ids=new Set(draft.selectedIds),records=source.records.filter(r=>ids.has(r.globalId));
 for(const record of records)try{await parkTopology(record.geometry,'validate');}catch(error){throw new VltavaTopologyError(`${record.globalId}: ${(error as Error).message}`,[record.globalId]);}
 const geometry=await parkTopology({type:'GeometryCollection',geometries:records.map(r=>r.geometry)},'union');
 if(!isArea(geometry as AreaGeometry))throw new VltavaTopologyError('Sjednocení není polygonové. Zdroj se nemění.',draft.selectedIds);
 const validated=validateGeometry(geometry) as AreaGeometry;
 const coordinates=validated.type==='Polygon'?[validated.coordinates]:validated.coordinates;
 const parts:AreaGeometry[]=coordinates.map(coordinates=>({type:'Polygon',coordinates}));
 const holes:AreaGeometry[]=coordinates.flatMap(p=>p.slice(1).map(ring=>({type:'Polygon' as const,coordinates:[ring]})));
 return {geometry:validated,geometryChecksum:await sha256(canonicalJson(validated)),selectionChecksum:await vltavaSelectionChecksum(draft),valid:true,sourceCount:records.length,parts,holes,areaM2:area(validated),vertices:coordinates.flat(2).length,
  siteChecks:source.sites.map(s=>({id:s.id,insideWater:booleanPointInPolygon(s.point,validated),insideIslandHole:holes.some(h=>booleanPointInPolygon(s.point,h))}))};
}
