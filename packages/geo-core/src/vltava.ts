import {z} from 'zod';
import {isArea,validateGeometry,type AreaGeometry} from './index';

export const VLTAVA_MISSING_DATA_REASON='Publikovaný release neobsahuje ověřený polygon vodní plochy Vltavy včetně ostrovů a celého pražského úseku. Zdrojový GIS vyžaduje ověření výběru toků, ostrovních ramen a vody pod mosty; poté lze publikovat samostatný GeoJSON Polygon/MultiPolygon s doloženým zdrojem a licencí.';

const url=z.url().refine(value=>['https:','http:'].includes(new URL(value).protocol),'Zdroj a licence musí být HTTP(S) odkazy.');
const text=z.string().trim().min(1).max(2000);
const area=z.unknown().transform((input,ctx):AreaGeometry=>{
 try {const geometry=validateGeometry(input);if(!isArea(geometry))throw new Error('Vltava vyžaduje vodní plochu Polygon/MultiPolygon; bod ani samotná linie ji nenahrazují.');return geometry;}
 catch(error){ctx.addIssue({code:'custom',message:(error as Error).message});return z.NEVER;}
});

/** Input contract ONLY. Parsing checks WGS84 and polygon topology, not whether
 * the shape really is the complete river. It neither publishes a release nor
 * enables a question. No fabricated geometry or POI/reference-point fallback.
 * A future publication step must verify provenance and real coverage first. */
export const vltavaWaterAreaInputSchema=z.object({
 type:z.literal('Feature'),id:z.literal('river:vltava:prague'),geometry:area,
 properties:z.object({
  name:z.literal('Vltava'),kind:z.literal('river_water_area'),
  source:z.object({provider:text,url,version:text,dataDate:z.iso.date(),retrievedAt:z.iso.datetime(),
   license:z.object({name:text,url}).strict(),rawChecksum:z.string().regex(/^[a-f0-9]{64}$/),sourceFeatureIds:z.array(text).min(1).max(10000).refine(ids=>new Set(ids).size===ids.length,'Zdrojová ID nesmějí být duplicitní.')}).strict(),
  coverageReview:z.object({status:z.enum(['pending','verified']),fullPragueReach:z.boolean(),islandHoles:z.enum(['unverified','included']),
   bridgePassages:z.enum(['unverified','continuous']),reviewedBy:text.nullable(),reviewedAt:z.iso.datetime().nullable(),note:z.string().trim().min(1).max(100000)}).strict()
 }).strict()
}).strict().superRefine((input,ctx)=>{
 const review=input.properties.coverageReview;
 if(review.status==='verified'&&(!review.fullPragueReach||review.islandHoles!=='included'||review.bridgePassages!=='continuous'||!review.reviewedBy||!review.reviewedAt))ctx.addIssue({code:'custom',path:['properties','coverageReview'],message:'Ověření vyžaduje celý pražský úsek, otvory ostrovů, souvislou vodu pod mosty a autora i datum kontroly.'});
});
export type VltavaWaterAreaInput=z.infer<typeof vltavaWaterAreaInputSchema>;
/** Contract for the future, published-data-backed adapter. No implementation
 * exists while the river data is absent; callers must report missing_data. */
export interface VltavaDistanceResolver {
 readonly source:VltavaWaterAreaInput['properties']['source'];
 distanceToVltava(point:[number,number]):number;
}
export function readVltavaWaterAreaInput(input:unknown):VltavaWaterAreaInput {return vltavaWaterAreaInputSchema.parse(input);}
