import {z} from 'zod';
import {isArea,validateGeometry,type AreaGeometry} from './index';
import {riverSeparationSchema} from './vltava-assembly-schema';

export const RIVER_ID = 'river:vltava-berounka:prague';
export const LAND_MISSING_DATA_REASON = 'Publikovaný release neobsahuje ověřené pevninské oblasti a ostrovy včetně schválených oddělení.';

export const VLTAVA_MISSING_DATA_REASON = 'Publikovaný release neobsahuje ověřenou vodní plochu Vltavy a Berounky (Polygon/MultiPolygon) s doloženou licencí a datem zdroje.';

const url=z.url().refine(value=>['https:','http:'].includes(new URL(value).protocol),'Zdroj a licence musí být HTTP(S) odkazy.');
const text=z.string().trim().min(1).max(2000);
const area=z.unknown().transform((input,ctx):AreaGeometry=>{
 try {const geometry=validateGeometry(input);if(!isArea(geometry))throw new Error('Vltava vyžaduje vodní plochu Polygon/MultiPolygon; bod ani samotná linie ji nenahrazují.');return geometry;}
 catch(error){ctx.addIssue({code:'custom',message:(error as Error).message});return z.NEVER;}
});

function riverFeatureSchema<const Id extends string, const Name extends string>(id:Id, name:Name) {
 return z.object({
  type:z.literal('Feature'),id:z.literal(id),geometry:area,
  properties:z.object({
   name:z.literal(name),kind:z.literal('river_water_area'),
   source:z.object({provider:text,url,version:text,dataDate:z.iso.date(),retrievedAt:z.iso.datetime(),
    license:z.object({name:text,url}).strict(),rawChecksum:z.string().regex(/^[a-f0-9]{64}$/),sourceFeatureIds:z.array(text).min(1).max(10000).refine(ids=>new Set(ids).size===ids.length,'Zdrojová ID nesmějí být duplicitní.')}).strict(),
   coverageReview:z.object({status:z.enum(['pending','verified']),fullPragueReach:z.boolean(),islandHoles:z.enum(['unverified','included']),
    bridgePassages:z.enum(['unverified','continuous']),reviewedBy:text.nullable(),reviewedAt:z.iso.datetime().nullable(),note:z.string().trim().min(1).max(100000)}).strict()
  }).strict()
 }).strict().superRefine((input,ctx)=>{
  const review=input.properties.coverageReview;
  if(review.status==='verified'&&(!review.fullPragueReach||review.islandHoles!=='included'||review.bridgePassages!=='continuous'||!review.reviewedBy||!review.reviewedAt))ctx.addIssue({code:'custom',path:['properties','coverageReview'],message:'Ověření vyžaduje celý pražský úsek, otvory ostrovů, souvislou vodu pod mosty a autora i datum kontroly.'});
 });
}
export const vltavaWaterAreaInputSchema = riverFeatureSchema('river:vltava:prague', 'Vltava');
export type VltavaWaterAreaInput = z.infer<typeof vltavaWaterAreaInputSchema>;
export function readVltavaWaterAreaInput(input:unknown):VltavaWaterAreaInput {return vltavaWaterAreaInputSchema.parse(input);}

export const riverInputSchema = riverFeatureSchema(RIVER_ID, 'Vltava a Berounka');
export type RiverInput = z.infer<typeof riverInputSchema>;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
export const riverMetadataReviewSchema = z.object({
 reviewedBy: text, reviewedAt: z.iso.datetime(),
 licenseEvidence: url, dataDateEvidence: url,
}).strict();

export function riverSourceProblems(source: RiverInput['properties']['source']): string[] {
 const issues: string[] = [];
 const licenseHost = new URL(source.license.url).hostname.toLowerCase();
 if (/^cc$|nedoložen|neznám|neověřen/i.test(source.license.name) || /(^|\.)cc\.com$/.test(licenseHost)) {
  issues.push(`Licence „${source.license.name}“ (${source.license.url}) není doložená.`);
 }
 if (source.dataDate > source.retrievedAt.slice(0,10)) {
  issues.push(`Datum zdroje ${source.dataDate} je pozdější než převzetí dat ${source.retrievedAt.slice(0,10)}.`);
 }
 return issues;
}

export const riverLayerSchema = z.object({
 feature: riverInputSchema,
 geometryChecksum: checksum,
 metadataReview: riverMetadataReviewSchema,
}).strict().superRefine(({feature},ctx)=>{
 for (const message of riverSourceProblems(feature.properties.source)) ctx.addIssue({code:'custom',message});
 if (feature.properties.coverageReview.status !== 'verified') ctx.addIssue({code:'custom',message:'Vodní plocha vyžaduje schválenou kontrolu pokrytí.'});
});

export const landLayerSchema = z.object({
 riverChecksum: checksum,
 riverGeometryChecksum: checksum.optional(),
 gameAreaChecksum: checksum,
 areas: z.array(z.object({
  id: checksum, name: text, kind: z.enum(['main','island']), geometry: area,
 }).strict()).min(1).max(1000),
 separations: z.array(riverSeparationSchema.refine(line=>line.status==='approved','Oddělení musí být schválené.')).max(100),
}).strict();

export const riverPublicationLayersSchema = z.object({
 river: riverLayerSchema,
 land: landLayerSchema.optional(),
}).strict();
export type RiverPublicationLayers = z.infer<typeof riverPublicationLayersSchema>;
