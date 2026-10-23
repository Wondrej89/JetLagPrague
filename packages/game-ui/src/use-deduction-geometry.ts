import {useEffect,useState} from 'react';
import type {GameDataRelease} from '../../geo-core/src/index';
import type {Deduction,TargetPolicy} from '../../game-core/src/index';
import type {DeductionGeometry} from '../../geo-resolver/src/deduction/geometry';

class GeometryService {
 references=0;
 private failReady:(error:Error)=>void=()=>{};
 dispose(){const error=new Error('Výpočet byl zrušen při zavření mapy.');this.failReady(error);this.worker.terminate();for(const p of this.pending.values())p.reject(error);this.pending.clear();this.results.clear();}
 private worker=new Worker(new URL('./deduction.worker.ts',import.meta.url),{type:'module'});
 private pending=new Map<number,{resolve(value:DeductionGeometry):void;reject(error:Error):void}>();
 private serial=0;
 private results=new Map<string,Promise<DeductionGeometry>>();
 private ready:Promise<void>;
 constructor(release:GameDataRelease){
  this.ready=new Promise((resolve,reject)=>{this.failReady=reject;
   this.worker.onmessage=event=>{const data=event.data;if(data.id===0){if(data.error)reject(new Error(data.error));else resolve();return;}const callback=this.pending.get(data.id);if(callback){this.pending.delete(data.id);if(data.error)callback.reject(new Error(data.error));else callback.resolve(data.result);}};
   this.worker.onerror=()=>{const error=new Error('Prostorový worker selhal. Dedukční mapa se nevydává za prázdný výsledek.');reject(error);for(const callback of this.pending.values())callback.reject(error);this.pending.clear();};
   this.worker.postMessage({id:0,release});
  });
 }
 compute(deductions:Deduction[],target:TargetPolicy){
  const key=JSON.stringify([deductions,target]);let request=this.results.get(key);
  if(!request){request=this.ready.then(()=>new Promise<DeductionGeometry>((resolve,reject)=>{const id=++this.serial;this.pending.set(id,{resolve,reject});this.worker.postMessage({id,deductions,target});}));this.results.set(key,request);if(this.results.size>12)this.results.delete(this.results.keys().next().value!);}
  return request;
 }
}
// One worker/index/cache for all maps of the same public release, not per phone.
const services=new WeakMap<GameDataRelease,GeometryService>();
export function useDeductionGeometry(release:GameDataRelease|undefined,deductions:Deduction[],target:TargetPolicy,individualIds:string[],gpsQuestionId?:string):{loading:boolean;combined?:DeductionGeometry;individual?:DeductionGeometry[];error?:string}{
 const requested=deductions.some(d=>d.status==='active'&&d.geometryTarget===target)||individualIds.length>0;
 useEffect(()=>{if(!release||!requested)return;let service=services.get(release);if(!service){service=new GeometryService(release);services.set(release,service);}service.references++;return()=>{if(--service.references===0){service.dispose();services.delete(release);}};},[release,requested]);
 const key=JSON.stringify([release?.releaseId,deductions,target,individualIds,gpsQuestionId]);
 const [state,setState]=useState<{key:string;combined?:DeductionGeometry;individual?:DeductionGeometry[];error?:string}>({key:''});
 useEffect(()=>{
  if(!release)return;let cancelled=false;
  const [,source,target,ids,gpsQuestionId]=JSON.parse(key) as [string,Deduction[],TargetPolicy,string[],string|undefined];
  const candidates=source.filter(d=>d.status==='active'&&d.geometryTarget===target);
  const active=target==='gps'?(gpsQuestionId&&candidates.some(d=>d.questionId===gpsQuestionId)?candidates.filter(d=>d.questionId===gpsQuestionId):candidates.slice(-1)):candidates;
  if(!active.length&&!ids.length){setState({key});return;}
  let service=services.get(release);if(!service){service=new GeometryService(release);services.set(release,service);}
  const individual=source.filter(d=>ids.includes(d.id));
  void Promise.all([active.length?service.compute(active,target):Promise.resolve(undefined),Promise.all(individual.map(d=>service!.compute([{...d,status:'active'}],d.geometryTarget)))]).then(([combined,individual])=>{if(!cancelled)setState({key,combined,individual});}).catch(error=>{if(!cancelled)setState({key,error:error.message});});
  return()=>{cancelled=true;};
 },[release,key]);
 return state.key===key?{...state,loading:false}:{loading:!!release&&requested};
}
