import {feature, featureCollection, intersect, union} from '@turf/turf';
import type {AreaGeometry, GameDataRelease} from '../../../geo-core/src/index';
import {classifyArea, distanceMeters, makeMetricCircle} from '../../../geo-core/src/index';
import type {Deduction, Point, TargetPolicy} from '../../../game-core/src/index';
import {areaSegments,featureIndex,project,SpatialIndex,unproject,type Bounds} from './spatial-index';

export const DEDUCTION_CELL_METERS=64;
export const DEDUCTION_MARGIN_METERS=2;
export interface DeductionGeometry {
 guides:{include:import('geojson').FeatureCollection;exclude:import('geojson').FeatureCollection};
 possible:AreaGeometry|null; excluded:AreaGeometry|null; neutral:AreaGeometry|null;
 lines:{type:'FeatureCollection';features:import('geojson').Feature<import('geojson').LineString>[]};
 cellMeters:number; marginMeters:number; metricErrorMeters:number; limited:boolean; evaluatedCells:number; deductionIds:string[]; target:TargetPolicy;
}
type Predicate = {value(p:Point):number; lipschitz:number;errorMeters?:number};
function transformArea(area:AreaGeometry,convert:(p:Point)=>Point):AreaGeometry {
 const ring=(r:number[][])=>r.map(p=>convert(p as Point));
 return area.type==='Polygon'?{type:'Polygon',coordinates:area.coordinates.map(ring)}:{type:'MultiPolygon',coordinates:area.coordinates.map(poly=>poly.map(ring))};
}
function rectangle(b:Bounds):AreaGeometry {return {type:'Polygon',coordinates:[[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]],[b[0],b[1]]]]};}
/** Projected clipping only affects a derived display. Original release geometry is
 * never simplified or mutated. A 2 m neutral allowance covers display projection
 * chords; answers always use the full geographic source. */

function prepareAdministrative(release:GameDataRelease,category:string){
 const areas=release.data.administrativeAreas.filter(a=>a.kind===category);
 const layer={id:category,title:category,kind:category==='municipal'?'municipal' as const:'cadastral' as const,color:'#666666',visible:false,source:release.releaseId,features:areas.map(a=>({id:a.id,name:a.name,geometry:a.geometry,attributes:{code:a.code},note:'',source:a.sourceKey,importedAt:release.publishedAt,status:'draft' as const}))};
 const candidates=layer.features.map(feature=>{const points=(feature.geometry.type==='Polygon'?feature.geometry.coordinates:feature.geometry.coordinates.flat()).flat() as Point[];return {feature,bounds:points.reduce<Bounds>((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity])};});
 const boundary=new SpatialIndex(areas.flatMap(a=>areaSegments(a.geometry).map(e=>({...e,id:a.id+':'+e.id}))));
 return {layer,candidates,boundary};
}
export class DeductionComputer {
 private administrative=new Map<string,ReturnType<typeof prepareAdministrative>>();
 private predicates=new Map<string,Predicate>();
 private indexes=new Map<string,ReturnType<typeof featureIndex>>();
 private cache=new Map<string,DeductionGeometry>();
 private area:AreaGeometry;
 private bounds:Bounds;
 constructor(readonly release:GameDataRelease){
  const raw=release.data.gameArea.geometry,points=(raw.type==='Polygon'?raw.coordinates:raw.coordinates.flat()).flat() as Point[];
  if(points.some(p=>p[0]<13||p[0]>16||p[1]<49||p[1]>51))throw new Error('Dedukční projekce je ověřena pouze pro Prahu a okolí (13–16° E, 49–51° N).');
  this.area=transformArea(raw,project);
  const vertices=(this.area.type==='Polygon'?this.area.coordinates:this.area.coordinates.flat()).flat() as Point[];
  this.bounds=vertices.reduce<Bounds>((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);
 }
 private predicate(d:Deduction):Predicate {
  const p=d.parameters,sign=d.operation==='include'?1:-1;
  if(p.resolver==='radar'){if(!p.radiusMeters||p.radiusMeters<=0||!Number.isFinite(p.radiusMeters))throw new Error('Chybí platný poloměr Radaru.');return {value:point=>sign*(p.radiusMeters!-distanceMeters(p.hunterPoint,point)),lipschitz:1};}
  if(p.resolver==='thermometer'){
   if(!p.secondPoint||distanceMeters(p.hunterPoint,p.secondPoint)<1e-6)throw new Error('Chybí uložené měření B.');
   return {value:point=>sign*(distanceMeters(p.hunterPoint,point)-distanceMeters(p.secondPoint!,point)),lipschitz:2};
  }
  if(p.resolver==='same_area'){
   let model=this.administrative.get(p.category);if(!model){model=prepareAdministrative(this.release,p.category);this.administrative.set(p.category,model);}
   const {layer,candidates,boundary}=model,hunter=classifyArea(p.hunterPoint,layer);if(!['inside','boundary'].includes(hunter.status))throw new Error('Administrativní příslušnost hledačů nelze určit.');
   const chosenId=hunter.matches[0].id;
   return {value:point=>{const classification=classifyArea(point,{...layer,features:candidates.filter(({bounds:b})=>point[0]>=b[0]&&point[0]<=b[2]&&point[1]>=b[1]&&point[1]<=b[3]).map(v=>v.feature)});if(!['inside','boundary'].includes(classification.status))return 0;return sign*(classification.matches[0].id===chosenId?1:-1)*boundary.nearest(point)!.distance;},lipschitz:1,errorMeters:2*boundary.errorMeters};
  }
  const key=`${p.category}:${p.distanceMode??'category'}`;
  if(!this.indexes.has(key))this.indexes.set(key,featureIndex(this.release.data.pois.filter(poi=>poi.category===p.category&&poi.status==='approved'),p.distanceMode??'category',p.category));
  const index=this.indexes.get(key)!,nearest=index.nearest(p.hunterPoint);
  if(!nearest)throw new Error('Chybí schválená publikovaná geometrie kategorie.');
  if(p.resolver==='poi_measuring')return {value:point=>sign*(nearest.distance-index.nearest(point)!.distance),lipschitz:1,errorMeters:2*index.errorMeters};
  if(p.resolver==='poi_matching'){
   const selected=featureIndex([nearest.item],p.distanceMode??'category',p.category);
   return {value:point=>{const other=index.nearest(point,nearest.id);return other?sign*(other.distance-selected.nearest(point)!.distance):sign*1e12;},lipschitz:2,errorMeters:4*index.errorMeters};
  }
  throw new Error('Tato otázka nemá korektní prostorovou interpretaci.');
 }
 compute(deductions:Deduction[],target:TargetPolicy,cellMeters=DEDUCTION_CELL_METERS):DeductionGeometry {
  const active=deductions.filter(d=>d.status==='active'&&d.geometryTarget===target);
  if(active.some(d=>d.releaseId!==this.release.releaseId)||new Set(active.map(d=>d.epochId)).size>1)throw new Error('Nelze míchat katalogy, etapy ani rozhodné cíle.');
  if(!Number.isFinite(cellMeters)||cellMeters<16||cellMeters>512)throw new Error('Neplatná přesnost dedukčního výpočtu.');
  if(target==='gps'&&active.length>1)throw new Error('GPS z různých otázek nelze automaticky spojovat v jednu polohu.');
  const key=JSON.stringify([this.release.releaseId,active,target,cellMeters]);const cached=this.cache.get(key);if(cached)return cached;
  const unique=new Map(active.map(d=>[JSON.stringify([d.operation,d.parameters,d.geometryTarget]),d]));
  const predicates=[...unique].map(([key,d])=>{let value=this.predicates.get(key);if(!value){value=this.predicate(d);this.predicates.set(key,value);if(this.predicates.size>128)this.predicates.delete(this.predicates.keys().next().value!);}return {predicate:value,tolerance:d.parameters.toleranceMeters};});
  const cells:{possible:AreaGeometry[];excluded:AreaGeometry[];neutral:AreaGeometry[]}={possible:[],excluded:[],neutral:[]};
  let evaluatedCells=0,evaluations=0,limited=false;
  const visit=(b:Bounds)=>{
   evaluatedCells++;if(evaluations+predicates.length>300000){limited=true;cells.neutral.push(rectangle(b));return;}evaluations+=predicates.length;
   const center:Point=[(b[0]+b[2])/2,(b[1]+b[3])/2],point=unproject(center);
   // Within the validated UTM domain, 1% exceeds the projection scale error.
   // A Lipschitz bound certifies ALL points of a cell, not just its centre.
   const radius=Math.hypot(b[2]-b[0],b[3]-b[1])/2*1.01+DEDUCTION_MARGIN_METERS;
   const values=predicates.map(({predicate,tolerance})=>({value:predicate.value(point),bound:predicate.lipschitz*radius+(predicate.errorMeters??0)+tolerance}));
   if(values.some(v=>v.value < -v.bound)){cells.excluded.push(rectangle(b));return;}
   if(values.length && values.every(v=>v.value > v.bound)){cells.possible.push(rectangle(b));return;}
   if(!values.length||b[2]-b[0]<=cellMeters||evaluatedCells>45000){if(evaluatedCells>45000)limited=true;cells.neutral.push(rectangle(b));return;}
   const x=center[0],y=center[1];visit([b[0],b[1],x,y]);visit([x,b[1],b[2],y]);visit([b[0],y,x,b[3]]);visit([x,y,b[2],b[3]]);
  };
  // Aligned cells make robust union cheap and give a declared maximum leaf size.
  const x=Math.floor(this.bounds[0]/cellMeters)*cellMeters,y=Math.floor(this.bounds[1]/cellMeters)*cellMeters;
  let width=cellMeters;while(width<Math.max(this.bounds[2]-x,this.bounds[3]-y))width*=2;
  visit([x,y,x+width,y+width]);
  const clip=(items:AreaGeometry[]):AreaGeometry|null=>{
   if(!items.length)return null;
   const combined=items.length===1?feature(items[0]):union(featureCollection(items.map(g=>feature(g))));
   if(!combined)return null;const clipped=intersect(featureCollection([combined,feature(this.area)]));
   return clipped?transformArea(clipped.geometry,unproject):null;
  };
  const lines:DeductionGeometry['lines']={type:'FeatureCollection',features:[]};
  for(const d of active)if(d.sourceType==='thermometer'&&d.parameters.secondPoint){
   const a=project(d.parameters.hunterPoint),b=project(d.parameters.secondPoint),mid:Point=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   const length=Math.hypot(b[0]-a[0],b[1]-a[1]),n:Point=[(b[0]-a[0])/length,(b[1]-a[1])/length],t:Point=[-n[1],n[0]];
   const roots:Point[]=[];
   // Root of the real geodesic equality along metric cross-sections, not a
   // latitude-degree radius or a guessed bisector through today's GPS.
   for(let i=-32;i<=32;i++){
    const base:Point=[mid[0]+t[0]*i*2000,mid[1]+t[1]*i*2000];let low=-64000,high=64000;
    for(let j=0;j<32;j++){const m=(low+high)/2,point=unproject([base[0]+n[0]*m,base[1]+n[1]*m]);const delta=distanceMeters(d.parameters.hunterPoint,point)-distanceMeters(d.parameters.secondPoint,point);if(delta>0)high=m;else low=m;}
    roots.push(unproject([base[0]+n[0]*(low+high)/2,base[1]+n[1]*(low+high)/2]));
   }
   lines.features.push({type:'Feature',properties:{kind:'measurement',questionId:d.questionId},geometry:{type:'LineString',coordinates:[d.parameters.hunterPoint,d.parameters.secondPoint]}});
   // The equality guide is illustrative; the certified areas above decide colour.
   lines.features.push({type:'Feature',properties:{kind:'bisector',questionId:d.questionId},geometry:{type:'LineString',coordinates:roots}});
  }
  const guides:DeductionGeometry['guides']={include:{type:'FeatureCollection',features:[]},exclude:{type:'FeatureCollection',features:[]}};
  for(const d of active){
   if(d.parameters.resolver==='radar'&&d.parameters.radiusMeters!<=100000)guides[d.operation].features.push(feature(makeMetricCircle(d.parameters.hunterPoint,d.parameters.radiusMeters!),{kind:'radar',questionId:d.questionId}));
   if(d.parameters.resolver==='same_area'){
    const units=this.release.data.administrativeAreas.filter(a=>a.kind===d.parameters.category);
    const layer={id:'admin',title:'admin',kind:d.parameters.category==='municipal'?'municipal' as const:'cadastral' as const,color:'#666666',visible:false,source:this.release.releaseId,features:units.map(a=>({id:a.id,name:a.name,geometry:a.geometry,attributes:{code:a.code},note:'',source:a.sourceKey,importedAt:this.release.publishedAt,status:'draft' as const}))};
    const classified=classifyArea(d.parameters.hunterPoint,layer),unit=units.find(a=>a.id===classified.matches[0]?.id);if(unit)guides[d.operation].features.push(feature(unit.geometry,{kind:'administrative',questionId:d.questionId}));
   }
  }
  const result:DeductionGeometry={guides,possible:clip(cells.possible),excluded:clip(cells.excluded),neutral:clip(cells.neutral),lines,cellMeters,marginMeters:DEDUCTION_MARGIN_METERS,metricErrorMeters:Math.max(0,...predicates.map(p=>p.predicate.errorMeters??0)),limited,evaluatedCells,deductionIds:active.map(d=>d.id),target};
  this.cache.set(key,result);if(this.cache.size>12)this.cache.delete(this.cache.keys().next().value!);return result;
 }
}
