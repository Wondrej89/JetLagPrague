import {hangmanSchema,validateHangman} from './hangman';
import {awaitingStart} from './lobby';
import {deductionFromQuestion} from './deductions';
import {validFix} from './engine';
import { z } from 'zod';
import { effectSchema, evidenceSchema, mechanicsSchema, runtimeSchema, setupSchema } from './card-schemas';
import { deckRules } from './deck';
import { rollPassed } from './card-effects';
import type { GameEnvironment, GameState } from './types';
const id=z.string().min(1).max(300),text=z.string().max(10000),time=z.number().finite().nonnegative();
const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const fix=z.object({point,at:time,accuracy:z.number().finite().nonnegative(),speed:z.number().finite().nullable().optional()}).strict();
const stop=z.object({id,name:text,point}).strict();
const rewardPolicy=z.object({draw:z.number().int().min(1).max(20),keep:z.number().int().min(1).max(20)}).strict().refine(p=>p.keep<=p.draw,'keep musí být nejvýše draw');
const definition=z.object({id,type:z.enum(['matching','measuring','radar','thermometer','tentacles','photo']),category:id,label:text,description:text,resolver:z.enum(['poi_matching','poi_measuring','same_area','radar','thermometer','tentacles','manual','photo','unsupported']),answerMode:z.enum(['automatic','manual','photo']),rewardPolicy:rewardPolicy.nullable(),timeoutSeconds:z.number().int().positive().max(86400).nullable(),availability:z.enum(['ready','manual','missing_data','unsupported']),requirements:z.array(id).max(30),distanceMode:z.literal('geometry').optional(),spatialVersion:z.literal(2).optional(),toleranceMeters:z.number().finite().nonnegative().optional(),sourceRule:text.optional(),target:z.enum(['station','gps']),radiusMeters:z.number().positive().optional(),minMoveMeters:z.number().nonnegative().optional(),configured:z.boolean().optional(),testOnly:z.boolean().optional()}).strict();
const card=z.object({id,type:z.enum(['time_bonus','powerup','curse']),name:text,description:text,icon:text,effect:z.enum(['bonus','capacity','veto','randomize','curse','duplicate','move','discard_1_draw_2','discard_2_draw_3','draw_1_expand_1']),mechanics:mechanicsSchema.optional(),value:z.number().nonnegative().optional(),curse:z.object({durationMs:z.number().positive().optional(),condition:text,blocksQuestions:z.boolean(),manual:z.boolean()}).strict().optional()}).strict();
const rules=z.object({uxVersion:z.literal(1).optional(),hangmanVersion:z.literal(1).optional(),manualHangmanResponses:z.boolean().optional(),mapVersion:z.literal(1).optional(),moveVersion:z.literal(2).optional(),automaticDeductionMap:z.boolean().optional(),deductionConsent:z.object({hunter:z.boolean(),hider:z.boolean(),authority:z.literal('simulator')}).strict().optional(),cardVersion:z.literal(2).optional(),questionVersion:z.literal(2).optional(),size:z.enum(['small','medium','large']).optional(),id,label:text,testOnly:z.boolean(),hideMs:z.number().positive(),radiusMeters:z.number().positive(),gpsMaxAgeMs:z.number().positive(),gpsMaxAccuracyM:z.number().positive(),handLimit:z.number().int().positive().max(100),veto:z.object({enabled:z.boolean(),reward:z.boolean()}).strict(),randomize:z.object({enabled:z.boolean(),restartTimer:z.boolean()}).strict(),questions:z.array(definition).max(1000),cards:z.array(card).max(1000),deck:z.array(id).max(5000)}).strict();
const publicPoi=z.object({id,name:text,point}).strict();
const question=z.object({epochId:id.optional(),secondCapturedAt:time.optional(),phase:z.enum(['awaiting_second_measurement','awaiting_response','answered','error']).optional(),responseStartedAt:time.optional(),answerPoi:publicPoi.optional(),errorCode:z.literal('thermometer_tie').optional(),manualResolution:z.object({at:time,note:z.string().min(6).max(1000)}).strict().optional(),rewardModifierIds:z.array(id).max(100).optional(),id,definition,askedAt:time,deadline:time.nullable(),hunterFix:fix,targetPoint:point,secondFix:fix.optional(),state:z.enum(['pending','answered','vetoed','error']),answer:text.optional(),error:text.optional(),answeredAt:time.optional(),photoId:id.optional(),draftPhotoId:id.optional()}).strict();
const curse=z.object({hangman:hangmanSchema.optional(),id,cardId:id,name:text,description:text,icon:text,activatedAt:time,expiresAt:time.optional(),condition:text,blocksQuestions:z.boolean(),manual:z.boolean(),target:z.literal('hunter'),state:z.enum(['active','casting','blocking','ongoing','timed','until_round','fulfilled','ended','failed']),effects:z.array(effectSchema).max(100).optional(),evidence:z.array(evidenceSchema).max(100).optional(),casterPoint:point.optional(),setup:setupSchema.optional(),castRollStart:z.number().int().nonnegative().optional(),guesses:z.array(text).max(100).optional(),maskedWord:text.optional()}).strict();
const deduction=z.object({id,questionId:id,epochId:id,releaseId:id,geometryTarget:z.enum(['station','gps']),operation:z.enum(['include','exclude']),sourceType:z.enum(['radar','measuring','matching','thermometer']),result:text,createdAt:time,status:z.enum(['active','archived']),parameters:z.object({definitionId:id,resolver:definition.shape.resolver,category:id,hunterPoint:point,secondPoint:point.optional(),radiusMeters:z.number().positive().optional(),minMoveMeters:z.number().nonnegative().optional(),toleranceMeters:z.number().nonnegative(),distanceMode:z.literal('geometry').optional()}).strict()}).strict();
const stateSchema=z.object({lobby:z.object({choices:z.object({hunter:z.boolean().optional(),hider:z.boolean().optional()}).strict(),ready:z.object({hunter:z.boolean(),hider:z.boolean()}).strict(),startedAt:time.optional()}).strict().optional(),noticeAcknowledgements:z.object({hunter:z.array(id).max(50000).optional(),hider:z.array(id).max(50000).optional()}).strict().optional(),epochId:id.optional(),deductions:z.array(deduction).max(10000).optional(),endgame:z.boolean().optional(),version:z.union([z.literal(1),z.literal(2)]),cardState:runtimeSchema.optional(),id,releaseId:z.string().regex(/^release:[a-f0-9]{64}$/),mode:z.literal('simulation'),rules,startedAt:time,now:time,phase:z.enum(['awaiting_map_consent','awaiting_ready','hiding','needs_station','seeking','finished']),hideDeadline:time,players:z.object({hunter:z.object({id,name:text}).strict(),hider:z.object({id,name:text}).strict()}).strict(),fixes:z.object({hunter:fix.optional(),hider:fix.optional()}).strict(),walking:z.boolean(),provisionalStopId:id.nullable(),station:stop.nullable(),deadlineCandidates:z.array(stop).max(20000).nullable(),questions:z.array(question).max(10000),hand:z.array(id).max(5000),drawPile:z.array(id).max(5000),discardPile:z.array(id).max(5000),rewards:z.array(z.object({id,questionId:id,policy:rewardPolicy,state:z.enum(['pending','offered','claimed']),offer:z.array(id).max(20)}).strict()).max(10000),curses:z.array(curse).max(5000),effects:z.array(z.object({cardId:id,value:z.number().int().positive(),at:time,lifetime:z.literal('game').optional()}).strict()).max(5000),proximity:z.boolean(),seed:z.number().int().min(1).max(4294967295),rng:z.number().int().min(1).max(4294967295),sequence:z.number().int().nonnegative(),events:z.array(z.object({id,at:time,type:id,audience:z.enum(['all','hunter','hider']),text}).strict()).max(50000),processedCommands:z.array(id).max(250000)}).strict();
export function readGameState(input:unknown,env:GameEnvironment):GameState{
  if(typeof input==='string'){if(input.length>12*1024**2)throw new Error('Herní stav překračuje limit 12 MB.');input=JSON.parse(input);}
  const s=stateSchema.parse(input) as GameState;
  if(s.releaseId!==env.releaseId)throw new Error('Scénář vyžaduje přesně svou publikovanou verzi katalogu.');
  if(s.now<s.startedAt||s.hideDeadline!==s.startedAt+s.rules.hideMs)throw new Error('Nekonzistentní čas hry.');
  const unique=(values:string[])=>new Set(values).size===values.length;
  if(!unique(s.rules.cards.map(c=>c.id))||!unique(s.rules.questions.map(q=>q.id))||!unique(s.questions.map(q=>q.id))||!unique(s.events.map(e=>e.id))||!unique(s.processedCommands))throw new Error('Duplicitní herní identita.');
  const expected=[...s.rules.deck.map((id,i)=>`${id}@${i}`),...(s.cardState?.copies.map(c=>c.instanceId)??[])].sort(),actual=[...s.hand,...s.drawPile,...s.discardPile,...s.rewards.flatMap(r=>r.offer)].sort();
  if(JSON.stringify(expected)!==JSON.stringify(actual)||!unique(actual)||s.rules.deck.some(id=>!s.rules.cards.some(c=>c.id===id)))throw new Error('Poškozené rozdělení karet mezi balíčkem, rukou a odměnou.');
  validateLobby(s);
  validateCardRuntime(s,env);
  if(s.questions.filter(q=>q.state==='pending'||q.state==='error').length>1||s.rewards.filter(r=>r.state==='offered').length>1)throw new Error('Nekonzistentní rozpracovaná akce.');
  if(s.rewards.some(r=>!s.questions.some(q=>q.id===r.questionId&&JSON.stringify(q.definition.rewardPolicy)===JSON.stringify(r.policy))||r.state==='offered'&&r.offer.length!==r.policy.draw||r.state!=='offered'&&r.offer.length>0))throw new Error('Neplatná karetní odměna.');
  validateSpatialQuestions(s,env);
  validateDeductionState(s,env);
  if(s.questions.some(q=>q.askedAt>s.now||q.askedAt< s.startedAt||q.hunterFix.at>q.askedAt||q.state==='answered'&&(!q.answer||q.answeredAt===undefined)||!s.rules.questions.some(d=>d.id===q.definition.id)))throw new Error('Neplatná historie otázek.');
  if(s.station&&!env.stops.some(p=>p.id===s.station!.id&&JSON.stringify(p.point)===JSON.stringify(s.station!.point)))throw new Error('Stanoviště neodpovídá uzamčenému katalogu.');
  if(['seeking','finished'].includes(s.phase)&&!s.station)throw new Error('Chybí uzamčené stanoviště.');
  return s;
}

function validateCardRuntime(s:GameState,env:GameEnvironment){
 if(s.version===1){if(s.cardState||s.rules.cardVersion||s.rules.size)throw new Error('Historická pravidla nelze tiše migrovat.');return;}
 const r=s.cardState;if(!r||s.rules.cardVersion!==2||!s.rules.size)throw new Error('Chybí verzovaný karetní stav nebo varianta.');
 const base=deckRules(s.rules.size);
 if(!s.rules.id.startsWith(base.id)||JSON.stringify(s.rules.deck)!==JSON.stringify(base.deck)||s.rules.cards.length!==base.cards.length||base.cards.some(c=>{const actual=s.rules.cards.find(x=>x.id===c.id);return !actual||actual.type!==c.type||actual.effect!==c.effect||actual.value!==c.value;}))throw new Error('Karetní katalog nebo varianta neodpovídá přesnému balíčku.');
 const physical=new Set(s.rules.deck.map((id,i)=>`${id}@${i}`)),copies=new Set<string>();
 for(const copy of r.copies){const known=new Set([...physical,...copies]);if(known.has(copy.instanceId)||!s.rules.cards.some(c=>c.id===copy.definitionId)||!known.has(copy.createdBy)||!copy.createdBy.startsWith('duplicate@')||!known.has(copy.sourceInstanceId)||!copy.sourceInstanceId.startsWith(copy.definitionId+'@')||!copy.instanceId.startsWith(copy.definitionId+'@copy-'))throw new Error('Neplatný audit Duplicate.');copies.add(copy.instanceId);}
 const knownCards=new Set([...physical,...copies]);
 const unique=(ids:string[])=>new Set(ids).size===ids.length;
 if(!unique(r.rolls.map(x=>x.id))||!unique(s.curses.map(x=>x.id))||s.curses.filter(c=>c.state==='casting').length>1)throw new Error('Duplicitní hod nebo sesílání.');
 for(const roll of r.rolls){if(roll.at>s.now||roll.at<s.startedAt||roll.kind==='dice'&&(roll.values.length<1||roll.passed!==rollPassed(roll.values,roll.condition))||roll.kind==='category'&&(!roll.category||roll.values.length)||roll.usedBy&&!s.curses.some(c=>c.id===roll.usedBy))throw new Error('Neplatný audit náhodného mechanismu.');}
 for(const c of s.curses){validateHangman(s,c);if(s.rules.hangmanVersion===1&&c.cardId.startsWith('curse-hidden-hangman@')&&c.state!=='casting'&&c.effects?.length&&!c.hangman)throw new Error('Chybí stav Hangmana.');if(!knownCards.has(c.cardId)||!s.rules.cards.some(d=>d.id===c.cardId.split('@')[0]&&d.effect==='curse')||!c.effects||!c.evidence||c.state==='active'||c.state==='casting'&&(!s.hand.includes(c.cardId)||c.effects.length)||!unique(c.effects.map(e=>e.id)))throw new Error('Neplatný životní cyklus prokletí.');
  for(const e of c.effects){if(e.spec.kind==='reward_draw'&&(e.remainingQuestions===undefined||e.remainingQuestions>e.spec.questions)||['timer','door_gate','step_budget'].includes(e.spec.kind)&&e.expiresAt===undefined||e.spec.kind==='block_category'&&e.spec.category==='random'&&!e.spec.rerollAfterQuestion&&!e.selectedCategory||e.spec.kind==='block_questions'&&e.spec.questionIds.some(id=>!s.rules.questions.some(q=>q.id===id)))throw new Error('Neplatné parametry účinku.');}
 }
 if(r.penalties.some(p=>p.at>s.now||!s.curses.some(c=>c.id===p.curseId&&c.effects?.some(e=>e.state==='failed'&&e.spec.kind==='round_obligation'&&e.spec.penaltySeconds===p.seconds))))throw new Error('Neplatná penalizace.');
 for(const move of [...r.moveHistory,...(r.move?[r.move]:[])])if(!knownCards.has(move.cardId)||!move.cardId.startsWith('move@')||move.deadline<=move.startedAt||move.startedAt>s.now||move.endedAt!==undefined&&(move.endedAt>move.deadline||move.endedAt<move.startedAt)||!env.stops.some(p=>p.id===move.origin.id&&JSON.stringify(p.point)===JSON.stringify(move.origin.point)))throw new Error('Neplatný proces Move.');
 if(r.moveHistory.some(m=>m.stage!=='completed'))throw new Error('Nedokončený přesun v historii.');
}

/** Optional fields keep historical exports readable; v2 spatial questions have
 * explicit, checked phases and an immutable second fix / response timestamp. */
function validateSpatialQuestions(s:GameState,env:GameEnvironment){
 for(const q of s.questions){
  if(q.definition.spatialVersion!==2)continue;
  const thermo=q.definition.type==='thermometer';
  if(!validFix(q.hunterFix,q.askedAt,s.rules)||!env.insideArea(q.hunterFix.point)||!env.insideArea(q.targetPoint))throw new Error('Neplatný počáteční GPS snapshot.');
  if(!q.phase||q.state==='answered'&&q.phase!=='answered'||q.state==='error'&&q.phase!=='error'||q.state==='pending'&&!['awaiting_second_measurement','awaiting_response'].includes(q.phase))throw new Error('Nekonzistentní fáze otázky.');
  if(q.phase==='awaiting_second_measurement'&&(!thermo||q.secondFix||q.secondCapturedAt!==undefined||q.deadline!==null||q.responseStartedAt!==undefined||q.rewardModifierIds!==undefined))throw new Error('Neplatné rozpracované měření.');
  if(q.responseStartedAt!==undefined&&(q.responseStartedAt<q.askedAt||q.responseStartedAt>s.now||q.deadline!==q.responseStartedAt+(q.definition.timeoutSeconds??300)*1000))throw new Error('Neplatný začátek reakčního okna.');
  if(q.state!=='vetoed'&&q.phase!=='awaiting_second_measurement'&&(q.responseStartedAt===undefined||thermo&&!q.secondFix))throw new Error('Chybí snapshot druhého měření nebo začátek odpovědi.');
  if(q.secondCapturedAt!==undefined&&(!thermo||!q.secondFix||q.responseStartedAt===undefined||q.secondCapturedAt<q.askedAt||q.secondCapturedAt>q.responseStartedAt))throw new Error('Neplatný čas zachycení bodu B.');
  if(q.secondFix&&(q.secondFix.at>q.responseStartedAt!||q.secondFix.at<q.askedAt||!validFix(q.secondFix,q.secondCapturedAt??q.responseStartedAt!,s.rules)||env.distance(q.hunterFix.point,q.secondFix.point)+0.000001<(q.definition.minMoveMeters??Infinity)||!env.insideArea(q.secondFix.point)))throw new Error('Neplatný druhý GPS snapshot.');
  if(q.errorCode&&(q.state!=='error'||!thermo||env.resolve(q).code!=='thermometer_tie'))throw new Error('Neplatný nerozhodný výsledek.');
  if(q.manualResolution&&(!thermo||q.state!=='answered'||q.manualResolution.at!==q.answeredAt||env.resolve(q).code!=='thermometer_tie'||!['TEPLEJI','CHLADNĚJI'].includes(q.answer??'')))throw new Error('Neplatné ruční řešení Thermometer.');
  if(q.state==='answered'&&!q.manualResolution){const expected=env.resolve(q);if(expected.state!=='known'||expected.answer!==q.answer||JSON.stringify(expected.publicPoi)!==JSON.stringify(q.answerPoi))throw new Error('Odpověď neodpovídá uloženým snapshotům.');}
  if(q.answerPoi){const expected=env.resolve(q);if(q.state!=='answered'||q.definition.type!=='tentacles'||expected.state!=='known'||expected.answer!==q.answer||JSON.stringify(expected.publicPoi)!==JSON.stringify(q.answerPoi))throw new Error('Veřejný POI neodpovídá výsledku resolveru.');}
 }
}

function stable(value:unknown):string {return JSON.stringify(value,(_,v)=>v && typeof v==='object' && !Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
function validateDeductionState(s:GameState,env:GameEnvironment){
 if(s.rules.automaticDeductionMap && (!s.rules.deductionConsent?.hunter || !s.rules.deductionConsent.hider || s.rules.deductionConsent.authority!=='simulator')) throw new Error('Chybí výslovný souhlas obou rolí s dedukční mapou.');
 const moves=[...(s.cardState?.moveHistory??[]),...(s.cardState?.move?[s.cardState.move]:[])];
 const epochs=new Set([`${s.id}:epoch:0`,...moves.flatMap(m=>m.epochId?[m.epochId]:[])]);
 if(moves.at(-1)?.epochId && s.epochId!==moves.at(-1)!.epochId)throw new Error('Aktuální etapa neodpovídá poslednímu Move.');
 if(s.epochId && !epochs.has(s.epochId))throw new Error('Neplatná dedukční etapa.');
 for(const q of s.questions){
  if(q.epochId && !epochs.has(q.epochId))throw new Error('Otázka odkazuje na neexistující dedukční etapu.');
  if(s.rules.mapVersion===1 && q.state==='answered' && q.definition.answerMode==='automatic' && !q.manualResolution){const expected=env.resolve(q);if(expected.state!=='known'||expected.answer!==q.answer)throw new Error('Geografická odpověď neodpovídá neměnným snapshotům.');}
 }
 const expected=s.rules.automaticDeductionMap?s.questions.flatMap(q=>{const d=deductionFromQuestion(s,q);return d?[{...d,status:d.epochId===s.epochId?'active':'archived'}]:[];}):[];
 if(stable(expected)!==stable(s.deductions??[]))throw new Error('Dedukce neodpovídají historii otázek a aktuální etapě.');
 for(const m of moves)if(m.version===2){
  if(s.rules.moveVersion!==2 || !m.epochId || !epochs.has(m.epochId) || m.deadline-m.startedAt!==20*60000 || m.endedAt!==undefined && (m.endedAt!==m.deadline || m.endedAt>s.now))throw new Error('Neplatný čas nebo etapa úplného Move.');
  if(m.lastFix && (m.lastFix.at>m.deadline || m.lastFix.at>s.now))throw new Error('Move používá GPS z doby po rozhodném okamžiku.');
  if(m.selectedStopId){const stop=env.stops.find(p=>p.id===m.selectedStopId);if(!stop||stop.id===m.origin.id||m.selectedAt===undefined||m.selectedAt<m.startedAt||m.selectedAt>s.now||m.selectedAt>=m.deadline||!validFix(m.selectionFix,m.selectedAt,s.rules)||env.distance(m.selectionFix.point,stop.point)>s.rules.radiusMeters+1e-6)throw new Error('Neplatný audit výběru cíle Move.');}
  if(m.stage!=='moving'){const expected=validFix(m.lastFix,m.deadline,s.rules)&&env.insideArea(m.lastFix.point)?env.stops.filter(stop=>stop.id!==m.origin.id&&env.distance(m.lastFix!.point,stop.point)<=s.rules.radiusMeters+1e-6):[];if(stable(m.candidates??[])!==stable(expected))throw new Error('Nesouhlasí způsobilé cíle v okamžiku limitu Move.');if(m.stage==='completed'&&!expected.some(stop=>stop.id===m.destinationId))throw new Error('Nové stanoviště nebylo způsobilé v okamžiku limitu Move.');}
  if(m.stage==='completed'){const destination=env.stops.find(p=>p.id===m.destinationId);if(m.lockedAt===undefined||m.lockedAt<m.deadline||m.lockedAt>s.now||!validFix(m.completionFix,m.lockedAt,s.rules)||!env.insideArea(m.completionFix.point)||!destination||env.distance(m.completionFix.point,destination.point)>s.rules.radiusMeters+1e-6)throw new Error('Chybí platná GPS a čas uzamčení nového stanoviště Move.');}
  if(m.stage==='completed' && (!m.destinationId || m.destinationId===m.origin.id || m.endedAt===undefined))throw new Error('Move nemá platné nové stanoviště.');
 }
}

function validateLobby(s:GameState){
 const l=s.lobby;if(!l){if(awaitingStart(s)||s.rules.uxVersion)throw new Error('Chybí úvodní stav partie.');return;}
 if(s.rules.uxVersion!==1)throw new Error('Neplatná verze herního startu.');
 const both=l.choices.hunter!==undefined&&l.choices.hider!==undefined,ready=l.ready.hunter&&l.ready.hider;
 if(s.phase==='awaiting_map_consent'&&(both||l.ready.hunter||l.ready.hider)||s.phase==='awaiting_ready'&&(!both||ready)||!awaitingStart(s)&&(!both||!ready||l.startedAt!==s.startedAt)||awaitingStart(s)&&l.startedAt!==undefined)throw new Error('Nekonzistentní souhlas nebo připravenost.');
 if(both&&(s.rules.automaticDeductionMap!==(l.choices.hunter&&l.choices.hider)||s.rules.deductionConsent?.hunter!==l.choices.hunter||s.rules.deductionConsent?.hider!==l.choices.hider))throw new Error('Nastavení mapy neodpovídá rozhodnutí rolí.');
 if(awaitingStart(s)&&(s.station||s.provisionalStopId||s.questions.length||s.hand.length||s.rewards.length||s.curses.length||s.deductions?.length||s.cardState?.move||s.cardState?.moveHistory.length))throw new Error('Před startem existují rozehrané akce.');
 for(const role of ['hunter','hider'] as const)for(const id of s.noticeAcknowledgements?.[role]??[])if(!s.events.some(e=>e.id===id&&(e.audience==='all'||e.audience===role)))throw new Error('Neplatné potvrzení upozornění.');
}
