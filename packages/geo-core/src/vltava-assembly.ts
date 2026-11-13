import {z} from 'zod';
import {canonicalJson} from './administrative';
import {sha256} from './pid-snapshot';
import {readVltavaWaterAreaInput} from './vltava';
import {isArea,validateGeometry,type AreaGeometry} from './index';

import {vltavaAssemblySchema,type VltavaAssembly} from './vltava-assembly-schema';
export {vltavaAssemblySchema,VLTAVA_CHECKS,VLTAVA_SITES,type VltavaAssembly} from './vltava-assembly-schema';
const checksum=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(200);
export interface VltavaSourceRecord {globalId:string;row:number;type:'T';geometry:AreaGeometry;attributes:Record<string,unknown>;candidate:boolean;related:boolean;neighbors:string[]}
export interface VltavaSource {
 format:'jetlag-prague-vltava-streams';schemaVersion:1;id:string;rawChecksum:string;checksum:string;
 source:{provider:string;url:string;version:string;dataDate:string|null;retrievedAt:string;license:{name:string;url:string|null};transformation:string};
 records:VltavaSourceRecord[];sites:{id:string;name:string;point:[number,number];referenceRelease:string}[];
}
export interface VltavaPreview {
 geometry:AreaGeometry;geometryChecksum:string;selectionChecksum:string;valid:true;sourceCount:number;
 parts:AreaGeometry[];holes:AreaGeometry[];areaM2:number;vertices:number;
 siteChecks:{id:string;insideWater:boolean;insideIslandHole:boolean}[];
}
export function newVltavaAssembly(source:VltavaSource):VltavaAssembly {
 return {format:'jetlag-prague-vltava-assembly',schemaVersion:1,source:{id:source.id,rawChecksum:source.rawChecksum,preparedChecksum:source.checksum},selectedIds:[],excludedCandidateIds:[],status:'draft',checks:{river:false,coverage:false,islands:false,zofin:false,bridges:false,gaps:false,metadata:false},sites:source.sites.map(s=>({id:s.id,status:'pending',note:''})),metadata:{provider:source.source.provider,url:source.source.url,version:source.source.version,dataDate:source.source.dataDate??'',licenseName:source.source.license.url?source.source.license.name:'',licenseUrl:source.source.license.url??'',evidence:''},note:'',reviewer:'',updatedAt:new Date().toISOString(),preview:null,approval:null};
}
export function checkVltavaSource(draft:VltavaAssembly,source:VltavaSource):void {
 if(draft.source.id!==source.id||draft.source.rawChecksum!==source.rawChecksum||draft.source.preparedChecksum!==source.checksum)throw new Error('Zdrojový checksum výběru neodpovídá načtenému datasetu. Výběr nebyl použit ani přepsán; obnovte odpovídající verzi zdroje nebo založte nový výběr.');
 const records=new Map(source.records.map(r=>[r.globalId,r]));
 if(draft.selectedIds.some(id=>!records.has(id))||draft.excludedCandidateIds.some(id=>!records.get(id)?.candidate))throw new Error('Výběr obsahuje neznámé GLOBALID nebo nesprávně vyřazené kandidáty.');
 if(draft.sites.length!==source.sites.length||draft.sites.some(s=>!source.sites.some(p=>p.id===s.id)))throw new Error('Kontrolní místa neodpovídají zdrojové verzi.');
}
export async function verifyVltavaSource(input:unknown,expectedChecksum:string):Promise<VltavaSource> {
 if(!input||typeof input!=='object')throw new Error('Chybí dataset vodních toků.');
 const source=input as VltavaSource,{checksum:declared,...body}=source;
 if(source.format!=='jetlag-prague-vltava-streams'||source.schemaVersion!==1||!Array.isArray(source.records)||declared!==expectedChecksum||await sha256(canonicalJson(body))!==declared)throw new Error('Nesouhlasí kontrolní součet zdrojových polygonů.');
 checksum.parse(source.rawChecksum);id.parse(source.id);
 const all=new Set(source.records.map(r=>r.globalId));if(all.size!==source.records.length)throw new Error('Duplicitní zdrojové GLOBALID.');
 for(const record of source.records){
  id.parse(record.globalId);if(record.type!=='T'||!Number.isInteger(record.row)||record.row<1||!isArea(validateGeometry(record.geometry)))throw new Error('Neplatný zdrojový vodní polygon.');
  if(record.neighbors.some(n=>!all.has(n)||n===record.globalId))throw new Error('Neplatná návaznost zdrojových polygonů.');
 }
 const map=new Map(source.records.map(r=>[r.globalId,r]));
 if(source.records.some(r=>r.neighbors.some(n=>!map.get(n)!.neighbors.includes(r.globalId))))throw new Error('Nesouměrná návaznost polygonů.');
 return source;
}
export function changeVltavaSelection(draft:VltavaAssembly,source:VltavaSource,selection:string[]):VltavaAssembly {
 checkVltavaSource(draft,source);
 const selectedIds=[...new Set(selection)].sort(),candidates=new Set(source.records.filter(r=>r.candidate).map(r=>r.globalId));
 const excludedCandidateIds=[...new Set([...draft.excludedCandidateIds,...draft.selectedIds.filter(id=>!selectedIds.includes(id)&&candidates.has(id))])].filter(id=>!selectedIds.includes(id)).sort();
 const next={...draft,selectedIds,excludedCandidateIds,status:'draft' as const,checks:newVltavaAssembly(source).checks,sites:draft.sites.map(s=>({...s,status:'pending' as const})),preview:null,approval:null,updatedAt:new Date().toISOString()};
 checkVltavaSource(next,source);return next;
}
export function reviseVltavaAssembly(draft:VltavaAssembly,change:Partial<Pick<VltavaAssembly,'checks'|'sites'|'note'|'reviewer'|'metadata'>>):VltavaAssembly {
 return {...draft,...change,status:draft.status==='approved'?'review':draft.status,approval:null,updatedAt:new Date().toISOString()};
}
export function vltavaSelectionChecksum(draft:VltavaAssembly):Promise<string>{return sha256(canonicalJson({source:draft.source,ids:[...draft.selectedIds].sort()}));}
export function vltavaComponents(source:VltavaSource,selection:string[]):string[][] {
 const remaining=new Set(selection),records=new Map(source.records.map(r=>[r.globalId,r])),parts:string[][]=[];
 for(const id of selection){if(!remaining.delete(id))continue;const part=[id];for(let i=0;i<part.length;i++)for(const next of records.get(part[i])?.neighbors??[])if(remaining.delete(next))part.push(next);parts.push(part);}return parts;
}
export function removedVltavaBridge(draft:VltavaAssembly,source:VltavaSource,id:string):boolean {
 return draft.selectedIds.includes(id)&&vltavaComponents(source,draft.selectedIds.filter(v=>v!==id)).length>vltavaComponents(source,draft.selectedIds).length;
}
export async function reviewVltavaAssembly(draft:VltavaAssembly,source:VltavaSource,preview:VltavaPreview):Promise<VltavaAssembly>{
 checkVltavaSource(draft,source);if(!preview.valid||!draft.selectedIds.length||await vltavaSelectionChecksum(draft)!==preview.selectionChecksum)throw new Error('Náhled již neodpovídá výběru. Znovu sestavte geometrii.');
 return vltavaAssemblySchema.parse({...draft,status:'review',preview:{geometryChecksum:preview.geometryChecksum,selectionChecksum:preview.selectionChecksum},approval:null,updatedAt:new Date().toISOString()});
}
export async function approvedVltavaInput(draft:VltavaAssembly,source:VltavaSource,preview:VltavaPreview){
 checkVltavaSource(draft,source);
 if(draft.status!=='approved'||!draft.approval||!draft.preview||!Object.values(draft.checks).every(Boolean)||draft.sites.some(s=>s.status!=='verified'))throw new Error('Vltava není schválená: dokončete kontrolní seznam a všechna kontrolní místa.');
 const selected=await vltavaSelectionChecksum(draft),geometry=await sha256(canonicalJson(preview.geometry));
 if(selected!==preview.selectionChecksum||selected!==draft.approval.selectionChecksum||selected!==draft.preview.selectionChecksum||geometry!==draft.approval.geometryChecksum||geometry!==draft.preview.geometryChecksum)throw new Error('Schválení neodpovídá aktuální zdrojové geometrii. Zopakujte náhled a revizi.');
 if(!draft.metadata.evidence.trim())throw new Error('Doplňte doklad o zdroji, licenci a datu dat.');
 const m=draft.metadata;
 return readVltavaWaterAreaInput({type:'Feature',id:'river:vltava:prague',geometry:preview.geometry,properties:{name:'Vltava',kind:'river_water_area',source:{provider:m.provider,url:m.url,version:m.version,dataDate:m.dataDate,retrievedAt:source.source.retrievedAt,license:{name:m.licenseName,url:m.licenseUrl},rawChecksum:source.rawChecksum,sourceFeatureIds:[...draft.selectedIds].sort()},coverageReview:{status:'verified',fullPragueReach:true,islandHoles:'included',bridgePassages:'continuous',reviewedBy:draft.approval.reviewedBy,reviewedAt:draft.approval.reviewedAt,note:[draft.note,m.evidence,...draft.sites.map(s=>`${s.id}: ${s.status}; ${s.note}`)].join('\n')}}});
}
export async function approveVltavaAssembly(draft:VltavaAssembly,source:VltavaSource,preview:VltavaPreview):Promise<VltavaAssembly>{
 if(draft.status!=='review'||!draft.reviewer.trim())throw new Error('Nejprve předejte platný náhled k revizi a vyplňte jméno správce.');
 const next=vltavaAssemblySchema.parse({...draft,status:'approved',approval:{reviewedBy:draft.reviewer.trim(),reviewedAt:new Date().toISOString(),geometryChecksum:preview.geometryChecksum,selectionChecksum:preview.selectionChecksum},updatedAt:new Date().toISOString()});
 await approvedVltavaInput(next,source,preview);return next;
}
export function importVltavaAssembly(input:unknown,source:VltavaSource):VltavaAssembly {
 const draft=vltavaAssemblySchema.parse(input);checkVltavaSource(draft,source);return draft;
}
