import proj4 from 'proj4';
import {booleanPointInPolygon, pointToLineDistance} from '@turf/turf';
import type {AreaGeometry} from '../../../geo-core/src/index';
import {distanceMeters} from '../../../geo-core/src/index';
import type {Point} from '../../../game-core/src/index';

export const UTM = '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs';
export const project = (p:Point):Point => proj4('EPSG:4326', UTM, p) as Point;
export const unproject = (p:Point):Point => proj4(UTM, 'EPSG:4326', p) as Point;
export type Bounds = [number,number,number,number];
export interface Indexed<T> {id:string; bounds:Bounds; item:T; errorMeters?:number; distance(p:Point):number}
interface Node<T> {bounds:Bounds; children?:Node<T>[]; items?:Indexed<T>[]}
export function boundsOf(points:Point[]):Bounds {return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];}
function merged(items:{bounds:Bounds}[]):Bounds {return items.reduce<Bounds>((a,{bounds:b})=>[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])],[Infinity,Infinity,-Infinity,-Infinity]);}
/** A balanced bounding-volume tree. Bounds only prune searches; never replace a
 * polygon or decide containment. Conservative allowance covers projection scale
 * and the curvature of Prague's geodesic segments. */
export class SpatialIndex<T> {
 readonly errorMeters:number;
 private root:Node<T>;
 constructor(items:Indexed<T>[]){
  this.errorMeters=items.reduce((max,item)=>Math.max(max,item.errorMeters??0),0);
  const build=(items:Indexed<T>[]):Node<T>=>{const bounds=merged(items);if(items.length<=8)return {bounds,items};const axis=bounds[2]-bounds[0]>bounds[3]-bounds[1]?0:1;items.sort((a,b)=>a.bounds[axis]+a.bounds[axis+2]-b.bounds[axis]-b.bounds[axis+2]||a.id.localeCompare(b.id));const half=Math.floor(items.length/2);return {bounds,children:[build(items.slice(0,half)),build(items.slice(half))]};};
  this.root=build([...items]);
 }
 nearest(point:Point,skipId?:string):{id:string;item:T;distance:number}|null {
  const p=project(point);let best:{id:string;item:T;distance:number}|null=null;
  const lower=(b:Bounds)=>Math.max(0,Math.hypot(Math.max(b[0]-p[0],0,p[0]-b[2]),Math.max(b[1]-p[1],0,p[1]-b[3]))*.98-Math.max(100,this.errorMeters*1.02));
  const visit=(node:Node<T>)=>{if(best && lower(node.bounds)>best.distance+1e-6)return;
   if(node.items)for(const entry of node.items){if(entry.id===skipId||best&&lower(entry.bounds)>best.distance+1e-6)continue;const distance=entry.distance(point);if(!Number.isFinite(distance))throw new Error('Nelze spolehlivě určit vzdálenost geometrie.');if(!best||distance<best.distance-1e-6||Math.abs(distance-best.distance)<=1e-6&&entry.id<best.id)best={id:entry.id,item:entry.item,distance};}
   else for(const child of [...node.children!].sort((a,b)=>lower(a.bounds)-lower(b.bounds)))visit(child);
  };visit(this.root);return best;
 }
}
export function areaSegments(area:AreaGeometry):Indexed<null>[] {
 const polygons=area.type==='Polygon'?[area.coordinates]:area.coordinates;
 return polygons.flatMap((rings,pi)=>rings.flatMap((ring,ri)=>ring.slice(1).map((b,i)=>{const a=ring[i] as Point;if([a,b].some(p=>p[0]<13||p[0]>16||p[1]<49||p[1]>51))throw new Error('Hranice leží mimo ověřený rozsah pražské projekce.');const length=distanceMeters(a,b as Point);if(length>50000)throw new Error('Prostorový index vyžaduje segmenty kratší než 50 km; geometrii nelze bezpečně aproximovat.');return {id:`${pi}:${ri}:${i}`,item:null,errorMeters:length**2/6371008.8,bounds:boundsOf([project(a),project(b as Point)]),distance:(p:Point)=>pointToLineDistance(p,{type:'LineString',coordinates:[a,b]},{units:'meters',method:'geodesic'})};})));
}
export function prepareArea(area:AreaGeometry) {
 const edges=new SpatialIndex(areaSegments(area));
 return {errorMeters:edges.errorMeters,distance:(p:Point)=>booleanPointInPolygon(p,area)?0:edges.nearest(p)!.distance,
  signedDistance:(p:Point)=>(booleanPointInPolygon(p,area)?1:-1)*edges.nearest(p)!.distance};
}
export interface MetricFeature {id:string; point:Point; geometry:{type:'Point';coordinates:number[]}|AreaGeometry}
export function featureIndex(features:MetricFeature[],mode:'category'|'geometry',category:string) {
 return new SpatialIndex(features.map(item=>{
  const polygon=item.geometry.type!=='Point' && (mode==='geometry'||category==='waterbody');
  const measured=polygon?prepareArea(item.geometry as AreaGeometry):null;
  const points=polygon?(item.geometry.type==='Polygon'?item.geometry.coordinates:item.geometry.type==='MultiPolygon'?item.geometry.coordinates.flat():[]).flat() as Point[]:[item.point];
  // Use a reduction: large source geometries exceed JS's argument spread limit.
  if(points.some(p=>p[0]<13||p[0]>16||p[1]<49||p[1]>51))throw new Error('POI leží mimo ověřený rozsah pražské projekce.');
  const bounds=points.reduce<Bounds>((b,p)=>{const x=project(p);return [Math.min(b[0],x[0]),Math.min(b[1],x[1]),Math.max(b[2],x[0]),Math.max(b[3],x[1])];},[Infinity,Infinity,-Infinity,-Infinity]);
  return {id:item.id,item,bounds,errorMeters:measured?.errorMeters??0,distance:(p:Point)=>measured?measured.distance(p):distanceMeters(p,item.point)};
 }));
}
