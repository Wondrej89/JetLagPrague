import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {checkVltavaSource,newVltavaAssembly,type VltavaAssembly,type VltavaSource,type VltavaPreview} from '../../../packages/geo-core/src/vltava-assembly';
import type {AreaGeometry} from '@jetlag/geo-core';
import type {LandInputs} from '../../../packages/geo-core/src/river-land-topology';
import {riverLandCoverage,type LandPreview} from '../../../packages/geo-core/src/river-land';
import manifest from './data/vltava-manifest.json';

export type VltavaMode='candidates'|'related'|'all'|'selected'|'result'|'land';
export function useVltava(draft:VltavaAssembly|undefined,onChange:(draft:VltavaAssembly)=>void,boundary:AreaGeometry|null,stops:LandInputs['stops']){
 const [enabled,setEnabled]=useState(false),[source,setSource]=useState<VltavaSource|null>(null),[mode,setMode]=useState<VltavaMode>('candidates');
 const [opacity,setOpacity]=useState(.3),[selectedId,setSelectedId]=useState<string|null>(null),[neighbors,setNeighbors]=useState(false),[showSites,setShowSites]=useState(true);
 const [previewState,setPreview]=useState<{key:string;value:VltavaPreview}|null>(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[problems,setProblems]=useState<string[]>([]),[reload,setReload]=useState(0);
 const [landState,setLandState]=useState<{key:string;stopKey:string;value:LandPreview}|null>(null);
 const [areaId,setAreaId]=useState<string|null>(null),[lineId,setLineId]=useState<string|null>(null),[editingLine,setEditingLine]=useState<string|null>(null);
 const [highlight,setHighlight]=useState<string[]>([]);
 useEffect(()=>{if(highlight.length){const timer=setTimeout(()=>setHighlight([]),3000);return ()=>clearTimeout(timer);}},[highlight]);
 const recovered=useRef('');
 const worker=useRef<Worker|null>(null),requests=useRef(new Map<number,{resolve(value:unknown):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}>()),sequence=useRef(0);
 const key=(value:VltavaAssembly|undefined)=>JSON.stringify([value?.source,value?.selectedIds]);
 const currentKey=key(draft),preview=previewState?.key===currentKey?previewState.value:null;
 const landInputs=useMemo(()=>JSON.stringify([boundary,draft?.separations]),[boundary,draft?.separations]);
 const landKey=currentKey+landInputs;
 const latest=useRef({draft,onChange,landKey});latest.current={draft,onChange,landKey};
 const stopKey=useMemo(()=>JSON.stringify(stops),[stops]);
 const land=useMemo(()=>{
  if(!landState||landState.key!==landKey||!boundary||!preview)return null;
  if(landState.stopKey===stopKey)return landState.value;
  const coverage=riverLandCoverage(boundary,preview.geometry,landState.value.areas,stops);
  return {...landState.value,coverage};
 },[landState,landKey,boundary,preview,stopKey,stops]);
 useEffect(()=>{
  if(busy)return;
  if(mode==='land'&&!land)setMode(preview?'result':'selected');
  if(mode==='result'&&!preview)setMode('selected');
 },[mode,land,preview,busy]);
 const request=useCallback(<T,>(message:object):Promise<T>=>new Promise((resolve,reject)=>{
  if(!worker.current){reject(new Error('Worker není dostupný. Znovu načtěte zdroj.'));return;}
  const id=++sequence.current,timer=setTimeout(()=>{requests.current.delete(id);reject(new Error('Zpracování překročilo časový limit. Zrušte výpočet a zkuste menší výběr.'));},60000);
  requests.current.set(id,{resolve:value=>resolve(value as T),reject,timer});worker.current.postMessage({...message,id});
 }),[]);
 useEffect(()=>{
  if(!enabled)return;
  recovered.current='';
  let active=true;setSource(null);setPreview(null);setLandState(null);setEditingLine(null);setBusy('Načítám a ověřuji 2 755 původních toků…');setError('');
  const instance=new Worker(new URL('./vltava.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
  const pending=requests.current;
  const rejectAll=(error:Error)=>{for(const r of pending.values()){clearTimeout(r.timer);r.reject(error);}pending.clear();};
  instance.onmessage=event=>{const r=pending.get(event.data.id);if(!r)return;clearTimeout(r.timer);pending.delete(event.data.id);if(event.data.error)r.reject(Object.assign(new Error(event.data.error),{featureIds:event.data.featureIds}));else r.resolve(event.data.value);};
  instance.onerror=()=>{const error=new Error('GIS worker selhal. Výběr je zachovaný; znovu načtěte zdroj.');rejectAll(error);if(active){setError(error.message);setBusy('');}instance.terminate();if(worker.current===instance)worker.current=null;};
  void request<VltavaSource>({action:'load',url:new URL(import.meta.env.BASE_URL+manifest.file,location.href).href,checksum:manifest.checksum}).then(value=>{
   if(!active)return;if(value.rawChecksum!==manifest.rawChecksum||value.records.length!==manifest.records)throw new Error('Zdroj neodpovídá manifestu aplikace.');
   setSource(value);
   if(!latest.current.draft)latest.current.onChange(newVltavaAssembly(value));
  }).catch(error=>{if(active)setError(error.message);}).finally(()=>{if(active)setBusy('');});
  return ()=>{active=false;instance.terminate();if(worker.current===instance)worker.current=null;rejectAll(new Error('Zpracování zrušeno; uložený výběr zůstává zachovaný.'));};
 },[enabled,reload,request]);
 let compatibilityError='';try{if(draft&&source)checkVltavaSource(draft,source);}catch(error){compatibilityError=(error as Error).message;}
 const compute=useCallback(async(value:VltavaAssembly)=>{
  setBusy('Sjednocuji původní polygony a kontroluji topologii…');setError('');setProblems([]);
  try{
   const result=await request<VltavaPreview>({action:'preview',draft:value});
   if(key(latest.current.draft)!==key(value))throw new Error('Výběr se během výpočtu změnil. Novější změny zůstaly zachované; vytvořte nový náhled.');
   setPreview({key:key(value),value:result});return result;
  }catch(error){setError((error as Error).message);setProblems((error as Error&{featureIds?:string[]}).featureIds??[]);return null;}
  finally{setBusy('');}
 },[request]);
 const computeLand=async(value:VltavaAssembly)=>{
  if(!boundary){setError('Nejprve nastavte polygon herní oblasti.');return;}
  const water=preview??await compute(value);
  if(!water)return;
  const separations=value.separations;
  const sameInputs=()=>latest.current.landKey===landKey;
  if(!sameInputs()){setError('Vstupy se změnily. Zopakujte výpočet pevniny.');return;}
  setBusy('Rozděluji pevninu a kontroluji stanoviště…');setError('');
  try{
   const result=await request<LandPreview>({action:'land',land:{boundary,water:water.geometry,stops,separations:separations??[]} satisfies LandInputs});
   if(!sameInputs())throw new Error('Vstupy se změnily. Zopakujte výpočet pevniny.');
   setLandState({key:landKey,stopKey,value:result});
   setMode('land');
  }catch(error){setError((error as Error).message);}
  finally{setBusy('');}
 };
 useEffect(()=>{
  if(!enabled||!source||!draft?.preview||compatibilityError||busy||preview||recovered.current===currentKey)return;
  recovered.current=currentKey;void compute(draft);
 },[enabled,source,draft,compatibilityError,busy,preview,currentKey,compute]);
 const focus=source?.records.find(r=>r.globalId===selectedId)??null;
 const neighborIds=neighbors&&focus?focus.neighbors.filter(id=>!draft?.selectedIds.includes(id)):[];
 return {enabled,setEnabled,source,boundary,land,computeLand,areaId,setAreaId,lineId,setLineId,editingLine,setEditingLine,highlight,setHighlight,mode,setMode,opacity,setOpacity,selectedId,setSelectedId,neighbors,setNeighbors,showSites,setShowSites,preview,busy,error:error||compatibilityError,compatibilityError,notice,setNotice,problems,focus,neighborIds,compute,reload:()=>{recovered.current='';setReload(n=>n+1);},setError};
}
export type VltavaController=ReturnType<typeof useVltava>;
