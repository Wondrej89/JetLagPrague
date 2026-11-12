import type {Point} from '../../game-core/src/types';
import {sameStreetName} from '../../game-core/src/matching';

export const MAPY_REVERSE_GEOCODING_ENDPOINT='https://api.mapy.com/v1/rgeocode';
export type StreetResolution={state:'known';name:string}|{state:'unknown';reason:string};
/** A future trusted multiplayer server can supply a line-data implementation
 * through this contract. Neither the reducer nor a hunter phone makes HTTP calls. */
export interface StreetNameProvider {source?:'mapy-reverse-geocoding'|'street-lines';note?:string;resolve(point:Point,signal?:AbortSignal):Promise<StreetResolution>}
const unknown=(reason:string):StreetResolution=>({state:'unknown',reason});
/** Verified against mapycom/developer docs/rest-api/reverse-geocoding.md,
 * c322fefbab6f18073f3bb80b2b965b632a1d2c03. Only explicit regional.street
 * entities qualify, including typed parent entities. Never parse an address. */
export function mapyStreetResult(input:unknown):StreetResolution {
 if(!input||typeof input!=='object'||!('items' in input)||!Array.isArray(input.items))return unknown('Mapy.com vrátily nerozpoznanou odpověď; název ulice nelze určit.');
 const names:string[]=[];
 const inspect=(item:unknown)=>{if(!item||typeof item!=='object')return;const value=item as Record<string,unknown>;if(value.type==='regional.street'&&typeof value.name==='string'&&value.name.trim()&&value.name.length<=300&&!/[\p{Cc}]/u.test(value.name))names.push(value.name.normalize('NFC').trim());};
 for(const item of input.items){inspect(item);if(item&&typeof item==='object'&&'regionalStructure' in item&&Array.isArray(item.regionalStructure))item.regionalStructure.forEach(inspect);}
 if(!names.length)return unknown('Mapy.com neposkytly jednoznačně pojmenovanou ulici. Určete ji ručně.');
 if(names.some(name=>!sameStreetName(name,names[0])))return unknown('Mapy.com navrhly různé ulice; výsledek je nejednoznačný. Určete ulici ručně.');
 return {state:'known',name:names.sort()[0]};
}
export function createMapyStreetProvider(apiKey?:string,fetcher:typeof fetch=fetch,timeoutMs=10000):StreetNameProvider {
 let blockedUntil=0;
 return {source:'mapy-reverse-geocoding',note:'Navržená ulice podle Mapy.com; geometricky nejbližší ulici ručně ověřte.',async resolve(point,signal){
  if(!apiKey?.trim())return unknown('Chybí klientský klíč Mapy.com pro reverse geocoding. Ulici lze určit ručně.');
  if(Date.now()<blockedUntil)return unknown('Mapy.com: limit API (HTTP 429); vyčkejte podle Retry-After nebo určete ulici ručně.');
  if(point.length!==2||!point.every(Number.isFinite)||Math.abs(point[0])>180||Math.abs(point[1])>90)return unknown('Neplatná GPS pro určení ulice.');
  const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)controller.abort();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const url=new URL(MAPY_REVERSE_GEOCODING_ENDPOINT);url.search=new URLSearchParams({apikey:apiKey,lon:String(point[0]),lat:String(point[1]),lang:'cs'}).toString();
   const request=(async()=>{const response=await fetcher(url,{signal:controller.signal,credentials:'omit'});if(response.status===429){const retry=response.headers.get('Retry-After'),seconds=retry&&/^\d+$/.test(retry)?Number(retry):null;blockedUntil=seconds!==null?Date.now()+seconds*1000:Math.max(Date.now()+30000,Date.parse(retry??'')||0);}if(!response.ok)return unknown(response.status===429?'Mapy.com: vyčerpán limit API (HTTP 429). Vyčkejte a opakujte přípravu nebo určete ulici ručně.':`Mapy.com: reverse geocoding není dostupný (HTTP ${response.status}). Ulici určete ručně.`);return mapyStreetResult(await response.json());})();
   return await Promise.race([request,new Promise<StreetResolution>(resolve=>{timer=setTimeout(()=>{controller.abort();resolve(unknown('Zjištění ulice překročilo časový limit. Opakujte přípravu nebo určete ulici ručně.'));},timeoutMs);})]);
  }catch{return unknown('Zjištění ulice na Mapy.com selhalo. Opakujte přípravu nebo určete ulici ručně.');}
  finally{if(timer)clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }};
}
