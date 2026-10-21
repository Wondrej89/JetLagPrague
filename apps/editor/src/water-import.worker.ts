import '../../../packages/geo-core/src/index';
import { importWaterZip } from '../../../packages/geo-core/src/water-import';
self.onmessage=async(event:MessageEvent<{bytes:ArrayBuffer;filename:string}>)=>{
  try { self.postMessage({value:await importWaterZip(new Uint8Array(event.data.bytes),event.data.filename)}); }
  catch(error){self.postMessage({error:error instanceof Error?error.message:'Import vodních ploch selhal.'});}
};
