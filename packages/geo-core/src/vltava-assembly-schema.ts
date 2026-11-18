// Pure persistence schema: no geometry or index imports (also used by WorldDraft).
import {z} from 'zod';
const checksum=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().min(1).max(200),note=z.string().max(10000);
const ids=z.array(id).max(10000).refine(a=>new Set(a).size===a.length,'Duplicitní GLOBALID.');
const status=z.enum(['draft','review','approved']);
const point=z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]);
export const riverSeparationSchema=z.object({
 id,name:note,reason:note,evidence:note,author:note,status,updatedAt:z.iso.datetime(),
 geometry:z.object({type:z.literal('LineString'),coordinates:z.array(point).min(2).max(1000)
  .refine(points=>points.every((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]),'Dva sousední vrcholy linie jsou totožné.')}).strict(),
}).strict().refine(line=>line.status!=='approved'||[line.name,line.reason,line.evidence,line.author].every(value=>value.trim()),'Schválení linie vyžaduje název, důvod, doklad a autora.');
export type RiverSeparation=z.infer<typeof riverSeparationSchema>;
const landReview=z.object({inputChecksum:checksum,evidence:note,reviewer:id,reviewedAt:z.iso.datetime(),areaIds:ids}).strict();
export const VLTAVA_CHECKS={river:'Vltava a Berounka jsou odlišeny od ostatních toků',coverage:'Pokrytí celé herní oblasti je ověřené',islands:'Ostrovní ramena jsou zkontrolovaná',zofin:'Vodní plocha u Žofína je zkontrolovaná',bridges:'Mosty a přemostění jsou zkontrolované',gaps:'Geometrie neobsahuje nechtěné mezery',metadata:'Zdrojová identita a metadata jsou zachované'} as const;
export const VLTAVA_SITES=['park:ipr-mpp-100-parky:2494','park:ipr-mpp-100-parky:2003','park:ipr-mpp-100-parky:2210','park:ipr-mpp-100-parky:2809','park:ipr-mpp-100-parky:2261'] as const;
export const vltavaAssemblySchema=z.object({
 format:z.literal('jetlag-prague-vltava-assembly'),schemaVersion:z.literal(1),
 source:z.object({id,rawChecksum:checksum,preparedChecksum:checksum}).strict(),
 selectedIds:ids,excludedCandidateIds:ids,status,
 excludedIds:ids.optional(),
 waterScope:z.literal('vltava-berounka').optional(),
 separations:z.array(riverSeparationSchema).max(100).optional(),
 landNames:z.record(checksum,note).optional(),
 landNotes:note.optional(),landReviewer:id.or(z.literal('')).optional(),
 landReview:landReview.nullable().optional(),
 approvalHistory:z.array(z.object({kind:z.enum(['water','separation','land']),id,author:id,at:z.iso.datetime(),checksum:checksum.optional()}).strict()).optional(),
 checks:z.object({river:z.boolean(),coverage:z.boolean(),islands:z.boolean(),zofin:z.boolean(),bridges:z.boolean(),gaps:z.boolean(),metadata:z.boolean()}).strict(),
 sites:z.array(z.object({id,status:z.enum(['pending','unresolved','verified']),note}).strict()).max(50),
 metadata:z.object({provider:note,url:note,version:note,dataDate:note,licenseName:note,licenseUrl:note,evidence:note}).strict(),
 note,reviewer:note,updatedAt:z.iso.datetime(),
 preview:z.object({geometryChecksum:checksum,selectionChecksum:checksum}).strict().nullable(),
 approval:z.object({reviewedBy:id,reviewedAt:z.iso.datetime(),geometryChecksum:checksum,selectionChecksum:checksum}).strict().nullable(),
}).strict().superRefine((d,ctx)=>{
 if(d.selectedIds.some(id=>(d.excludedIds??d.excludedCandidateIds).includes(id)||d.excludedCandidateIds.includes(id)))ctx.addIssue({code:'custom',message:'Zařazené a vyřazené ID se překrývají.'});
 if(d.separations&&new Set(d.separations.map(line=>line.id)).size!==d.separations.length)ctx.addIssue({code:'custom',message:'Duplicitní ID oddělení.'});
 if(new Set(d.sites.map(s=>s.id)).size!==d.sites.length)ctx.addIssue({code:'custom',message:'Duplicitní kontrolní místo.'});
 if(d.status!=='draft'&&(!d.preview||!d.selectedIds.length))ctx.addIssue({code:'custom',message:'Revize vyžaduje platný sjednocený náhled.'});
 if(d.status==='draft'&&d.preview||d.status!=='approved'&&d.approval)ctx.addIssue({code:'custom',message:'Rozpracovaný výběr nesmí předstírat uloženou revizi nebo schválení.'});
 if(d.approval&&d.preview&&(d.approval.geometryChecksum!==d.preview.geometryChecksum||d.approval.selectionChecksum!==d.preview.selectionChecksum))ctx.addIssue({code:'custom',message:'Schválení neodpovídá uloženému náhledu.'});
 if(d.status==='approved'&&(!d.approval||Object.values(d.checks).some(v=>!v)||VLTAVA_SITES.some(id=>d.sites.find(s=>s.id===id)?.status!=='verified')))ctx.addIssue({code:'custom',message:'Schválení vyžaduje všechny ruční kontroly včetně ostrovů.'});
});
export type VltavaAssembly=z.infer<typeof vltavaAssemblySchema>;

/** Older backups recorded only the current water approval. Keep it when
 * the draft first starts accumulating approval events. */
export function riverApprovalHistory(draft:VltavaAssembly):NonNullable<VltavaAssembly['approvalHistory']> {
 if(draft.approvalHistory)return draft.approvalHistory;
 if(!draft.approval)return [];
 return [{kind:'water',id:'river:vltava',author:draft.approval.reviewedBy,at:draft.approval.reviewedAt,checksum:draft.approval.geometryChecksum}];
}
