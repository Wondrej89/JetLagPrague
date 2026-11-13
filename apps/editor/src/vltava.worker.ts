import {verifyVltavaSource,type VltavaAssembly,type VltavaSource} from '../../../packages/geo-core/src/vltava-assembly';
import {previewVltavaAssembly,VltavaTopologyError} from '../../../packages/geo-core/src/vltava-topology';
let source:VltavaSource|null=null;
self.onmessage=async(event:MessageEvent<{id:number;action:'load'|'preview';url?:string;checksum?:string;draft?:VltavaAssembly}>)=>{
 const {id,action}=event.data;
 try {
  if(action==='load'){
   const response=await fetch(event.data.url!,{signal:AbortSignal.timeout(20000),cache:'no-cache'});
   if(!response.ok)throw new Error(`Vodní toky nelze načíst (HTTP ${response.status}).`);
   source=await verifyVltavaSource(await response.json(),event.data.checksum!);self.postMessage({id,value:source});
  }else{
   if(!source||!event.data.draft)throw new Error('Zdrojové polygony nejsou načtené.');
   self.postMessage({id,value:await previewVltavaAssembly(source,event.data.draft)});
  }
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Zpracování Vltavy selhalo.',featureIds:error instanceof VltavaTopologyError?error.featureIds:[]});}
};
