import {readGameState,type GameState,type GameEnvironment} from '../../../packages/game-core/src/index';
import type {PhotoRepository} from '../../../packages/game-ui/src/Phone';
const DB='jetlag-praha:simulator:v1';
async function database(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{request.result.createObjectStore('games');request.result.createObjectStore('photos');};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function read(store:string,key:string){const db=await database();try{return await new Promise<unknown>((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=tx.objectStore(store).get(key);r.onsuccess=()=>resolve(r.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function write(store:string,key:string,value:unknown){const db=await database();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}}
export interface SavedSimulation {version:1;state:GameState;paused:boolean;speed:number;scenario:string}
interface ArchiveEntry {id:string; savedAt:number; simulation:SavedSimulation}
export interface SimulationArchive {id:string; savedAt:number; releaseId:string}
const archiveKey=(id:string)=>`archive:${id}`;
let writes:Promise<void>=Promise.resolve();
export async function readSimulation(){return await read('games','current') as SavedSimulation|undefined;}
export async function readArchivedSimulation(id:string){
 const entry=await read('games',archiveKey(id)) as ArchiveEntry|undefined;
 if(!entry)throw new Error('Uložená simulace už není k dispozici.');
 return entry.simulation;
}
export async function listSimulationArchives():Promise<SimulationArchive[]>{
 const db=await database();
 try{
  const range=IDBKeyRange.bound('archive:','archive;');
  const entries=await new Promise<ArchiveEntry[]>((resolve,reject)=>{
   const request=db.transaction('games','readonly').objectStore('games').getAll(range);
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
  });
  return entries.flatMap(({id,savedAt,simulation})=>simulation?.state?.releaseId
   ?[{id,savedAt,releaseId:simulation.state.releaseId}]:[]).sort((a,b)=>b.savedAt-a.savedAt);
 }finally{db.close();}
}
interface SaveOptions {
 expectedState?:Pick<GameState,'id'|'releaseId'>;
 previous?:SavedSimulation;
 archive?:boolean;
 restoreId?:string;
}
async function writeCurrent(value:SavedSimulation,options?:SaveOptions){
 const db=await database();
 try{
  await new Promise<void>((resolve,reject)=>{
   const tx=db.transaction('games','readwrite'),store=tx.objectStore('games');
   tx.oncomplete=()=>resolve();
   tx.onerror=()=>reject(tx.error);
   tx.onabort=()=>reject(tx.error??new Error('Uložení simulace bylo přerušeno.'));
   const abort=(message:string)=>{reject(new Error(message));tx.abort();};
   const current=store.get('current');
   current.onsuccess=()=>{
    const stored=current.result as SavedSimulation|undefined;
    const expected=options?.expectedState??options?.previous?.state??(!options?value.state:undefined);
    if(stored&&expected&&(stored.state?.id!==expected.id||stored.state?.releaseId!==expected.releaseId)){
     abort('Aktivní simulace se změnila v jiné kartě. Obnovte stránku.');return;
    }
    const commit=()=>{
     const previous=options?.previous??stored;
     if(options?.archive&&previous){
      const id=crypto.randomUUID();
      store.add({id,savedAt:Date.now(),simulation:previous} satisfies ArchiveEntry,archiveKey(id));
     }
     store.put(value,'current');
    };
    if(options?.restoreId){
     const key=archiveKey(options.restoreId),entry=store.get(key);
     entry.onsuccess=()=>{
      if(!entry.result){abort('Uložená simulace již byla otevřena v jiné kartě.');return;}
      store.delete(key);
      commit();
     };
    }else commit();
   };
  });
 }finally{db.close();}
}
export function saveSimulation(value:SavedSimulation,options?:SaveOptions){
 writes=writes.catch(()=>{}).then(()=>writeCurrent(value,options));
 return writes;
}
export function validateSimulation(input:unknown,env:GameEnvironment):SavedSimulation{const raw=input as Partial<SavedSimulation>;if(!raw||raw.version!==1||typeof raw.paused!=='boolean'||![1,10,60].includes(raw.speed??0))throw new Error('Neplatný scénář simulace.');return {version:1,state:readGameState(raw.state,env),paused:raw.paused,speed:raw.speed!,scenario:typeof raw.scenario==='string'?raw.scenario:'blank'};}
export const photos:PhotoRepository={
 async putVideo(file){if(!['video/mp4','video/webm'].includes(file.type)||file.size>20*1024**2)throw new Error('Použijte MP4 nebo WebM do 20 MB.');const header=new Uint8Array(await file.slice(0,12).arrayBuffer());if(file.type==='video/mp4'?String.fromCharCode(...header.slice(4,8))!=='ftyp':!(header[0]===0x1a&&header[1]===0x45&&header[2]===0xdf&&header[3]===0xa3))throw new Error('Soubor nemá platnou hlavičku MP4/WebM.');const id=`video:${crypto.randomUUID()}`;await write('photos',id,new Blob([file],{type:file.type}));return id;},
 async put(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024**2)throw new Error('Použijte JPEG, PNG nebo WebP do 10 MB.');
  const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>40000000)throw new Error('Fotografie má příliš velké rozlišení.');const scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Fotografii nelze převést.')),'image/jpeg',.9));const id=`photo:${crypto.randomUUID()}`;await write('photos',id,blob);return id;}finally{bitmap.close();}
 },async get(id){const value=await read('photos',id);return value instanceof Blob?value:null;}
};
function mediaIds(saved:SavedSimulation){return [...new Set([...saved.state.questions.flatMap(q=>[q.photoId,q.draftPhotoId].filter((id):id is string=>!!id)),...saved.state.curses.flatMap(c=>(c.evidence??[]).map(m=>m.id))])];}
export async function exportScenario(saved:SavedSimulation){await writes;const ids=mediaIds(saved),media:Record<string,string>={};for(const id of ids){const blob=await photos.get(id);if(blob)media[id]=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});}return JSON.stringify({format:'jetlag-private-simulation',...saved,photos:media},null,2);}
export async function importScenario(text:string,env:GameEnvironment){if(text.length>40*1024**2)throw new Error('Scénář přesahuje 40 MB.');const raw=JSON.parse(text);if(raw.format!=='jetlag-private-simulation')throw new Error('Toto není soukromý scénář simulace.');const saved=validateSimulation(raw,env),ids=new Set(mediaIds(saved));
 const decoded:{id:string;blob:Blob}[]=[];for(const [id,value]of Object.entries(raw.photos??{})){if(!ids.has(id)||typeof value!=='string'||!/^data:(image\/jpeg|video\/mp4|video\/webm);base64,[A-Za-z0-9+/=]+$/.test(value))throw new Error('Neplatná příloha fotografie.');const bytes=Uint8Array.from(atob(value.split(',')[1]),c=>c.charCodeAt(0));const type=value.slice(5,value.indexOf(';'));if(bytes.length>(type==='image/jpeg'?10:20)*1024**2||type==='image/jpeg'&&(bytes[0]!==255||bytes[1]!==216)||type==='video/webm'&&!(bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3)||type==='video/mp4'&&String.fromCharCode(...bytes.slice(4,8))!=='ftyp')throw new Error('Neplatné médium.');decoded.push({id,blob:new Blob([bytes],{type})});}
 // Full state and attachments are validated before any current-game replacement.
 for(const item of decoded)await write('photos',item.id,item.blob);return saved;
}
