import {loadGameDataRelease} from '../../../packages/geo-core/src/game-release';

// Only public, checksum-verified release files. Never send cookies, identifiers,
// locations or imported scenario contents to the publication server.
export function releaseBase(pageUrl:string,development:boolean){return new URL(development?'./releases/':'../releases/',pageUrl);}
export function publicReleaseFetch(base:URL,fetcher:typeof fetch=fetch):typeof fetch{
 return async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input));
  const file=url.href.slice(base.href.length);
  if(!url.href.startsWith(base.href)||! /^(?:current\.json|release-[a-f0-9]{64}\.json)$/.test(file)||(init?.method??(input instanceof Request?input.method:'GET'))!=='GET')throw new Error('Simulátor smí pouze číst veřejné publikované katalogy.');
  return fetcher(url,{method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:init?.cache,signal:init?.signal});
 };
}
export function loadPublicRelease(pinnedId?:string){const base=releaseBase(document.baseURI,import.meta.env.DEV);return loadGameDataRelease(base.href,publicReleaseFetch(base),pinnedId);}
