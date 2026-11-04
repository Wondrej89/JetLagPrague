import {z} from 'zod';
export const diplomaticOfficeTypes = ['embassy','consular_department','honorary_consulate','honorary_consulate_general','apostolic_nunciature'] as const;
export const diplomaticOfficeLabels:Record<typeof diplomaticOfficeTypes[number],string>={embassy:'Velvyslanectví',consular_department:'Konzulární oddělení',honorary_consulate:'Honorární konzulát',honorary_consulate_general:'Honorární generální konzulát',apostolic_nunciature:'Apoštolská nunciatura'};
const text=z.string().max(10000),url=z.url().refine(v=>new URL(v).protocol==='https:');
const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
export const embassyVerificationSchema=z.object({
 point,inputAddress:text.min(1),method:z.enum(['ruian_address_point','manual_review']),checkedAt:z.iso.datetime(),
 sourceUrl:url.nullable(),dataDate:z.iso.date().nullable(),rawChecksum:z.string().regex(/^[a-f0-9]{64}$/).nullable(),
 addressCode:z.string().regex(/^\d+$/).optional(),matchedAddress:text.optional(),note:text,
}).superRefine((v,c)=>{if(v.method==='ruian_address_point'&&(!v.addressCode||!v.sourceUrl||!v.rawChecksum))c.addIssue({code:'custom',message:'Adresní bod RÚIAN vyžaduje kód ADM, zdroj a kontrolní součet.'});});
export const embassyMetadataSchema=z.object({
 country:text.min(1),countryCode:z.string().regex(/^[a-z]{2}$/).nullable(),officeType:z.enum(diplomaticOfficeTypes),
 selectionRow:z.number().int().positive().optional(),sourcePage:z.number().int().positive().optional(),
 officialSourceUrl:url.nullable(),verification:embassyVerificationSchema.optional(),
});
export type EmbassyMetadata=z.infer<typeof embassyMetadataSchema>;
export type EmbassyVerification=z.infer<typeof embassyVerificationSchema>;
export function embassyId(countryCode:string,officeType:typeof diplomaticOfficeTypes[number]){return `embassy:${z.string().regex(/^[a-z]{2}$/).parse(countryCode)}:${z.enum(diplomaticOfficeTypes).parse(officeType)}`;}
export function isEmbassyLocationVerified(poi:{point:[number,number];address?:string;embassy?:EmbassyMetadata}){
 const v=poi.embassy?.verification;return !!v&&v.point[0]===poi.point[0]&&v.point[1]===poi.point[1]&&v.inputAddress.normalize('NFC').trim()===poi.address?.normalize('NFC').trim();
}
