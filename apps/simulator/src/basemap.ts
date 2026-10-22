import type {StaticBasemap} from '../../../packages/game-ui/src/MapSurface';

// A fixed public Prague atlas, independent of all scenario/player state. Loading
// viewport-dependent tiles would disclose simulated positions through tile IDs.
export const ATLAS_ZOOM=13;
export const ATLAS_BOUNDS:[[number,number],[number,number]]=[[49.94,14.22],[50.19,14.72]];
export function atlasTiles(){
 const tile=(lat:number,lng:number)=>({x:Math.floor((lng+180)/360*2**ATLAS_ZOOM),y:Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**ATLAS_ZOOM)});
 const sw=tile(...ATLAS_BOUNDS[0]),ne=tile(...ATLAS_BOUNDS[1]),ids:string[]=[];
 for(let y=ne.y;y<=sw.y;y++)for(let x=sw.x;x<=ne.x;x++)ids.push(`${ATLAS_ZOOM}/${x}/${y}`);
 return ids;
}
let cached:Promise<{basemap:StaticBasemap;missing:number}>|undefined;
export function loadBasemap(apiKey:string){
 // One ephemeral atlas shared by all three maps, not persisted/redistributed.
 return cached??= (async()=>{
  const pending=atlasTiles(),tiles=new Map<string,string>();let missing=0;
  await Promise.all(Array.from({length:6},async()=>{
   while(pending.length){const id=pending.shift()!;try{
    const response=await fetch(`https://api.mapy.com/v1/maptiles/basic/256/${id}?apikey=${encodeURIComponent(apiKey.trim())}`,{method:'GET',credentials:'omit',redirect:'error',referrerPolicy:'origin',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('Dlaždice není dostupná.');const blob=await response.blob();
    if(!blob.type.startsWith('image/'))throw new Error('Neplatná mapová dlaždice.');tiles.set(id,URL.createObjectURL(blob));
   }catch{missing++;}}
  }));
  return {basemap:{zoom:ATLAS_ZOOM,bounds:ATLAS_BOUNDS,tiles},missing};
 })();
}
