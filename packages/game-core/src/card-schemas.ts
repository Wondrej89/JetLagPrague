import { z } from 'zod';
const id=z.string().min(1).max(300), text=z.string().max(10000), time=z.number().finite().nonnegative();
const type=z.enum(['time_bonus','powerup','curse']), category=z.enum(['matching','measuring','radar','thermometer','tentacles','photo']);
const point=z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]);
export const requirementSchema=z.discriminatedUnion('kind',[
 z.object({id,kind:z.literal('discard'),count:z.number().int().min(1).max(100),cardType:type.optional()}).strict(),
 z.object({id,kind:z.literal('discard_hand')}).strict(),
 ...(['photo','video','physical','outdoors','off_transit','special'] as const).map(kind=>z.object({id,kind:z.literal(kind),text}).strict()),
 z.object({id,kind:z.literal('roll'),count:z.union([z.literal(1),z.literal(2)]),condition:z.enum(['any','even','five_or_six']),noEffectWhen:z.enum(['any','even','five_or_six']).optional()}).strict(),
 z.object({id,kind:z.literal('geography'),subject:z.enum(['hider','hunter']),reference:z.enum(['named_water','caster']),minMeters:z.number().nonnegative().optional(),maxMeters:z.number().nonnegative().optional(),text}).strict(),
]);
export const effectSpecSchema=z.discriminatedUnion('kind',[
 z.object({kind:z.literal('free_question'),questions:z.number().int().positive(),text}).strict(),
 ...(['door_gate','step_budget'] as const).map(kind=>z.object({kind:z.literal(kind),durationMs:z.number().positive(),...(kind==='door_gate'?{retryMs:z.number().positive()}:{}),text}).strict()),
 z.object({kind:z.literal('task'),text,proof:z.enum(['confirmation','photo','video']),blocksQuestions:z.boolean(),minMedia:z.number().int().min(1).max(10).optional(),approvalByHider:z.boolean().optional(),minimumDurationSeconds:z.number().nonnegative().optional(),rollCondition:z.enum(['any','even','five_or_six']).optional(),waitMs:z.number().nonnegative().optional()}).strict(),
 z.object({kind:z.literal('round_obligation'),text,penaltySeconds:z.number().nonnegative().nullable(),endsWithTask:z.boolean().optional()}).strict(),
 z.object({kind:z.literal('timer'),text,durationMs:z.number().positive(),blocksQuestions:z.boolean()}).strict(),
 z.object({kind:z.literal('reward_draw'),amount:z.number().int().min(1).max(10),questions:z.number().int().min(1).max(100),text}).strict(),
 z.object({kind:z.literal('block_questions'),questionIds:z.array(id).max(100),text}).strict(),
 z.object({kind:z.literal('block_category'),category:z.union([category,z.literal('random')]),text,rerollAfterQuestion:z.boolean().optional()}).strict(),
 z.object({kind:z.literal('travel'),noTransit:z.boolean(),confirmOutsideStation:z.boolean(),text,endsWithTask:z.boolean().optional(),preventBoarding:z.boolean().optional()}).strict(),
 z.object({kind:z.literal('next_question'),confirmation:text,minDistanceFromCaster:z.number().nonnegative().optional(),minWords:z.number().int().min(1).optional(),text}).strict(),
]);
export const setupSchema=z.object({animalCategory:text.optional(),targetPoint:point.optional(),rockCount:z.number().int().positive().max(1000).optional(),durationSeconds:z.number().nonnegative().max(86400).optional(),nextStopId:id.optional(),questionIds:z.array(id).max(3).optional(),country:text.optional(),secretWord:z.string().min(1).max(100).optional()}).strict();
export const mechanicsSchema=z.object({status:z.enum(['ready','incomplete','test_fixture']),source:text,fullTextEn:text.nullable(),fullTextCs:text.nullable(),missing:z.array(text).max(100),castingCost:z.array(requirementSchema).max(100).nullable(),effects:z.array(effectSpecSchema).max(100),move:z.object({durationMs:z.number().positive()}).strict().optional()}).strict();
export const effectSchema=z.object({id,spec:effectSpecSchema,state:z.enum(['waiting_task','active','awaiting_review','fulfilled','ended','failed']),expiresAt:time.optional(),remainingQuestions:z.number().int().nonnegative().max(100).optional(),selectedCategory:category.optional(),startedAt:time.optional(),submittedAt:time.optional(),remainingSteps:z.number().int().min(0).max(6).optional()}).strict();
export const evidenceSchema=z.object({id,kind:z.enum(['photo','video']),by:z.enum(['hider','hunter']),at:time,verification:z.literal('player_supplied')}).strict();
const moveSchema=z.object({version:z.literal(2).optional(),epochId:id.optional(),lastFix:z.object({point,at:time,accuracy:z.number().finite().nonnegative(),speed:z.number().finite().nullable().optional()}).strict().optional(),selectionFix:z.object({point,at:time,accuracy:z.number().finite().nonnegative(),speed:z.number().finite().nullable().optional()}).strict().optional(),selectedAt:time.optional(),selectedStopId:id.optional(),lockedAt:time.optional(),completionFix:z.object({point,at:time,accuracy:z.number().finite().nonnegative(),speed:z.number().finite().nullable().optional()}).strict().optional(),hunterPoint:point.optional(),cardId:id,origin:z.object({id,name:text,point}).strict(),startedAt:time,deadline:time,stage:z.enum(['moving','needs_destination','completed']),endedAt:time.optional(),destinationId:id.optional(),candidates:z.array(z.object({id,name:text,point}).strict()).max(20000).optional()}).strict();
export const runtimeSchema=z.object({
 moveHistory:z.array(moveSchema).max(5000),
 doors:z.array(z.object({curseId:id,spaceId:id,rollId:id,passed:z.boolean(),retryAt:time,at:time}).strict()).max(10000),
 copies:z.array(z.object({instanceId:id,definitionId:id,sourceInstanceId:id,createdBy:id}).strict()).max(5000),
 rolls:z.array(z.object({id,at:time,actor:z.enum(['hider','hunter']),source:z.enum(['seeded_simulation','manual']),kind:z.enum(['dice','category']),values:z.array(z.number().int().min(1).max(6)).max(2),condition:z.enum(['any','even','five_or_six']),passed:z.boolean(),category:category.optional(),usedBy:id.optional()}).strict()).max(10000),
 penalties:z.array(z.object({curseId:id,effectId:id.optional(),seconds:z.number().nonnegative().nullable(),at:time,verification:z.literal('player_confirmed')}).strict()).max(5000),
 move:moveSchema.nullable(),
}).strict();
