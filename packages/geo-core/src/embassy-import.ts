import {z} from 'zod';
import {parse} from 'csv-parse/browser/esm/sync';
import {booleanPointInPolygon} from '@turf/turf';
import {embassyVerificationSchema} from './embassy-model';
import {decidePoi,locateEmbassy,resolvePois,resolveUnlocatedEmbassies,type PoiConfiguration} from './poi';
import type {AreaGeometry} from './index';

const rowSchema=z.object({id:z.string().min(1),address:z.string().trim().min(1),longitude:z.coerce.number().finite().min(-180).max(180),latitude:z.coerce.number().finite().min(-90).max(90),sourceUrl:z.url().refine(v=>new URL(v).protocol==='https:'),checkedAt:z.iso.datetime(),note:z.string().min(1)}).strict();
export type EmbassyGpsRow=z.infer<typeof rowSchema>;
/** Explicitly reviewed, address-specific points only. A full import is atomic;
 * unrelated data, original rows, IDs and previous decisions stay untouched. */
export function importEmbassyGps(configuration:PoiConfiguration,text:string,format:'json'|'csv',prague:AreaGeometry,confirmed:boolean):{configuration:PoiConfiguration;count:number}{
 if(!confirmed)throw new Error('Potvrďte kontrolu bodů vůči uvedeným adresám.');
 const raw=format==='json'?JSON.parse(text):parse(text,{columns:true,bom:true,skip_empty_lines:true,trim:true});
 const rows=z.array(rowSchema).min(1).max(1000).parse(raw);
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicitní ID v importu GPS.');
 let next=configuration;
 for(const row of rows){
  const point:[number,number]=[row.longitude,row.latitude];
  if(!booleanPointInPolygon(point,prague))throw new Error(`${row.id}: bod leží mimo administrativní území Prahy.`);
  const pending=resolveUnlocatedEmbassies(next).find(p=>p.id===row.id),existing=resolvePois([],next).find(p=>p.id===row.id&&p.category==='embassy');
  const target=pending??existing;
  if(!target)throw new Error(`${row.id}: neznámé ID ambasády.`);
  if(row.address.normalize('NFC')!==target.address?.normalize('NFC').trim())throw new Error(`${row.id}: adresa nesouhlasí s aktuálním záznamem; opravte nebo prověřte ji před importem.`);
  const verification=embassyVerificationSchema.parse({point,inputAddress:target.address,method:'manual_review',checkedAt:row.checkedAt,sourceUrl:row.sourceUrl,dataDate:null,rawChecksum:null,note:row.note});
  if(pending)next=locateEmbassy(next,pending,point,verification);
  const poi=resolvePois([],next).find(p=>p.id===row.id)!;
  // Importing a corrected point must never reverse an exclusion or approve a
  // review automatically. The editor has a separate explicit approval action.
  next=decidePoi(next,poi,{point,embassyVerification:verification});
 }
 return {configuration:next,count:rows.length};
}
