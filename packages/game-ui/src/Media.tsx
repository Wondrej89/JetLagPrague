import { useEffect, useState } from 'react';
import type { PhotoRepository } from './Phone';
export function Media({id,kind,photos}:{id:string;kind:'photo'|'video';photos:PhotoRepository}) {
 const [url,setUrl]=useState('');
 useEffect(()=>{let cancelled=false,local='';void photos.get(id).then(blob=>{if(blob&&!cancelled){local=URL.createObjectURL(blob);setUrl(local);}}).catch(()=>{});return()=>{cancelled=true;if(local)URL.revokeObjectURL(local);};},[id,photos]);
 return url?kind==='photo'?<img className="question-photo" src={url} alt="Fotografie k úkolu prokletí"/>:<video className="question-photo" src={url} controls preload="metadata" aria-label="Video k úkolu prokletí"/>:<p>Médium v místním úložišti není dostupné.</p>;
}
