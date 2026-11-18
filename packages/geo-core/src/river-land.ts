import { booleanPointInPolygon } from '@turf/turf';
import type { AreaGeometry } from './index';
import type { Polygon, Position } from 'geojson';
import { riverApprovalHistory, type VltavaAssembly } from './vltava-assembly-schema';

export interface LandArea {
 id: string;
 geometry: Polygon;
 areaM2: number;
 separationIds: string[];
}
export interface LandStop { id:string; point:Position }
export interface LandPreview {
 inputChecksum: string;
 areas: LandArea[];
 problems: { id: string; reason: string }[];
 coverage: { checked: number; assigned: number; unresolved: string[] } | null;
}

/** A point on a shared edge or any other land boundary is unresolved. */
export function landAreaAt(areas: LandArea[], point: Position): LandArea | null {
 const touching = areas.filter(area => booleanPointInPolygon(point, area.geometry));
 return touching.length === 1 && booleanPointInPolygon(point, touching[0].geometry, {ignoreBoundary:true}) ? touching[0] : null;
}

export function riverLandCoverage(boundary:AreaGeometry,water:AreaGeometry,areas:LandArea[],stops:LandStop[]|null):LandPreview['coverage'] {
 if(!stops)return null;
 const onLand=stops.filter(stop=>booleanPointInPolygon(stop.point,boundary)&&!booleanPointInPolygon(stop.point,water,{ignoreBoundary:true}));
 const unresolved=onLand.filter(stop=>!landAreaAt(areas,stop.point)).map(stop=>stop.id);
 return {checked:onLand.length,assigned:onLand.length-unresolved.length,unresolved};
}

export function approveLandArea(draft:VltavaAssembly,preview:LandPreview,id:string,reviewer:string,evidence:string):VltavaAssembly {
 if(!reviewer.trim()||!evidence.trim()||!preview.areas.some(area=>area.id===id)||preview.problems.length||
    preview.coverage?.unresolved.length)throw new Error('Schválení vyžaduje platná oddělení, vyřešení nejednoznačných stanovišť, správce a doklad revize pevniny.');
 const reviewedAt=new Date().toISOString();
 const previous=draft.landReview?.inputChecksum===preview.inputChecksum?draft.landReview.areaIds:[];
 return {...draft,updatedAt:reviewedAt,
  landReview:{inputChecksum:preview.inputChecksum,areaIds:[...new Set([...previous,id])],reviewer:reviewer.trim(),evidence,reviewedAt},
  approvalHistory:[...riverApprovalHistory(draft),{kind:'land',id,author:reviewer.trim(),at:reviewedAt,checksum:preview.inputChecksum}]};
}
