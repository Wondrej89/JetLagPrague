import { booleanPointInPolygon, pointToPolygonDistance } from '@turf/turf';
import { expect, it } from 'vitest';
import type { Polygon, Position } from 'geojson';
import { landAreaAt, approveLandArea } from './river-land';
import { previewRiverLand, type LandInputs } from './river-land-topology';
import type { RiverSeparation, VltavaAssembly } from './vltava-assembly-schema';

const polygon=(coordinates:Position[]):Polygon=>({type:'Polygon',coordinates:[coordinates]});
const boundary=polygon([[14,50],[14.1,50],[14.1,50.1],[14,50.1],[14,50]]);
// Water surrounds the island on three sides. The gap at the top models
// unmapped water underneath a bridge or building linking it to the mainland.
const water=polygon([[14.02,50.09],[14.02,50.02],[14.08,50.02],[14.08,50.09],[14.06,50.09],
 [14.06,50.04],[14.04,50.04],[14.04,50.09],[14.02,50.09]]);
const separation=(geometry:RiverSeparation['geometry']['coordinates'],id='bridge'):RiverSeparation=>({
 id,geometry:{type:'LineString',coordinates:geometry},
 name:'Přemostění',reason:'Chybějící rameno',evidence:'Testovací podklad',author:'Správce',
 status:'approved',updatedAt:'2026-11-18T12:00:00Z',
});
const island:[number,number]=[14.05,50.06], bank:[number,number]=[14.01,50.05];
const stops=[{id:'island',point:island},{id:'bank',point:bank},{id:'water',point:[14.03,50.06]}];
const inputs:LandInputs={boundary,water,separations:[],stops};

it.each([
 ['most',[[14.03,50.07],[14.07,50.07]]],
 ['budova',[[14.03,50.07],[14.048,50.075],[14.07,50.072]]],
] as const)('oddělí ostrov u překážky (%s) bez doplnění vody',async(_name,coordinates)=>{
 const line=separation(coordinates.map(([x,y])=>[x,y]));
 const before=await previewRiverLand(inputs),after=await previewRiverLand({...inputs,separations:[line]});
 expect(before.areas).toHaveLength(1);
 expect(after.areas).toHaveLength(2);
 expect(landAreaAt(after.areas,island)?.id).not.toBe(landAreaAt(after.areas,bank)?.id);
 expect(after.areas.every(area=>area.separationIds.includes(line.id))).toBe(true);
 expect(after.coverage).toEqual({checked:2,assigned:2,unresolved:[]});
 expect(after.problems).toEqual([]);
 expect((await previewRiverLand({...inputs,separations:[{...line,status:'review'}]})).areas).toEqual(before.areas);
 const onCut=line.geometry.coordinates[0].map((value,i)=>(value+line.geometry.coordinates[1][i])/2);
 const overLand=onCut[0]<14.04?line.geometry.coordinates[1]:onCut;
 expect(booleanPointInPolygon(overLand,water)).toBe(false);
 expect(pointToPolygonDistance(overLand,water)).toBeGreaterThan(0);
});
it('odmítne neúplné, neúčinné a samoprotínající se linie',async()=>{
 const before=await previewRiverLand(inputs);
 const invalid=[
  separation([[14.03,50.07],[14.05,50.07]],'dangling'),
  separation([[14.025,50.07],[14.03,50.08]],'water-only'),
  separation([[14.025,50.07],[14.07,50.082],[14.07,50.07],[14.025,50.082]],'self-crossing'),
 ];
 const result=await previewRiverLand({...inputs,separations:invalid});
 expect(result.problems.map(problem=>problem.id).sort()).toEqual(invalid.map(line=>line.id).sort());
 expect(result.areas).toEqual(before.areas);
});
it('nepřiřadí hraniční stanoviště a naváže názvy i schválení na konkrétní výpočet',async()=>{
 const line=separation([[14.03,50.07],[14.07,50.07]]);
 const result=await previewRiverLand({...inputs,separations:[line]});
 const onEdge=[14.05,50.07];
 expect(landAreaAt(result.areas,onEdge)).toBeNull();
 const ambiguous=await previewRiverLand({...inputs,separations:[line],stops:[...stops,{id:'cut',point:onEdge}]});
 expect(ambiguous.coverage?.unresolved).toEqual(['cut']);
 const id=landAreaAt(result.areas,island)!.id;
 const draft={landNames:{[id]:'Ostrov'}} as VltavaAssembly;
 expect(()=>approveLandArea(draft,ambiguous,id,'Správce','Ověřená hranice')).toThrow();
 const approved=approveLandArea(draft,result,id,'Správce','Ověřená hranice');
 expect(approved.landReview?.areaIds).toEqual([id]);
 expect(approved.approvalHistory).toHaveLength(1);
 const withoutStops=await previewRiverLand({...inputs,separations:[line],stops:null});
 expect(approveLandArea(draft,withoutStops,id,'Správce','Místní kontrola hranice').landReview?.areaIds).toEqual([id]);
 const legacyApproval={reviewedBy:'Původní správce',reviewedAt:'2026-11-13T12:00:00Z',
  geometryChecksum:'a'.repeat(64),selectionChecksum:'b'.repeat(64)};
 const withLegacy=approveLandArea({...draft,approval:legacyApproval},result,id,'Správce','Místní kontrola hranice');
 expect(withLegacy.approvalHistory?.map(event=>event.id)).toEqual(['river:vltava',id]);
 const reloaded=await previewRiverLand(JSON.parse(JSON.stringify({...inputs,separations:[line]})));
 expect(reloaded.inputChecksum).toBe(result.inputChecksum);
 expect(approved.landNames?.[landAreaAt(reloaded.areas,island)!.id]).toBe('Ostrov');
 expect(ambiguous.inputChecksum).toBe(result.inputChecksum);
});
it('společně zpracuje dvě oddělení tam, kde má ostrov dva chybějící průchody',async()=>{
 const channel:Polygon={type:'Polygon',coordinates:[
  [[14.03,50.02],[14.07,50.02],[14.07,50.045],[14.03,50.045],[14.03,50.02]],
 ]};
 const other=polygon([[14.03,50.055],[14.07,50.055],[14.07,50.08],[14.03,50.08],[14.03,50.055]]);
 const rivers={type:'MultiPolygon' as const,coordinates:[channel.coordinates,other.coordinates]};
 const cuts=[
  separation([[14.035,50.04],[14.035,50.06]],'left'),
  separation([[14.065,50.04],[14.065,50.06]],'right'),
 ];
 const result=await previewRiverLand({...inputs,water:rivers,separations:cuts});
 expect(result.areas).toHaveLength(2);
 expect(result.areas.every(area=>area.separationIds.length===2)).toBe(true);
 expect(result.problems).toEqual([]);
});
