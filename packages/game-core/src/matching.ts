import {z} from 'zod';
import {validFix} from './engine';
import type {GameEnvironment,GameState,Point,QuestionDefinition,QuestionInstance,Role} from './types';

const time=z.number().finite().nonnegative(),name=z.string().trim().min(1).max(300).refine(s=>!/[\p{Cc}]/u.test(s));
export const matchingReferenceSchema=z.object({source:z.enum(['pid','mapy-reverse-geocoding','street-lines','manual']),id:z.string().min(1).max(300).optional(),name,capturedAt:time,letters:z.number().int().nonnegative().optional(),manuallyCorrected:z.boolean().optional(),note:z.string().max(1000).optional()}).strict();
const correction=z.object({role:z.enum(['hunter','hider']),previousName:name.optional(),name,at:time}).strict();
export const matchingReferencesSchema=z.object({releaseId:z.string().min(1),measurementAt:time,hunter:matchingReferenceSchema,hider:matchingReferenceSchema,corrections:z.array(correction).max(100),verifiedAt:time.optional()}).strict();
const point=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const fix=z.object({point,at:time,accuracy:z.number().finite().nonnegative(),speed:z.number().finite().nullable().optional()}).strict();
export const matchingPreparationSchema=z.object({id:z.string().min(1),definitionId:z.string().min(1),releaseId:z.string().min(1),capturedAt:time,hunterFix:fix,targetPoint:point,targetFix:fix.optional(),references:z.object({hunter:matchingReferenceSchema.optional(),hider:matchingReferenceSchema.optional()}).strict(),issues:z.object({hunter:z.string().max(1000).optional(),hider:z.string().max(1000).optional()}).strict(),corrections:z.array(correction).max(100)}).strict();
export type MatchingReference=z.infer<typeof matchingReferenceSchema>;
export type MatchingReferences=z.infer<typeof matchingReferencesSchema>;
export type MatchingPreparation=z.infer<typeof matchingPreparationSchema>;
export interface MatchingReferencesView {hunter?:MatchingReference;hider?:MatchingReference;releaseId:string;measurementAt:number;corrections:z.infer<typeof correction>[];suggestedAnswer?:'ANO'|'NE';verifiedAt?:number}
export interface MatchingPreparationView extends MatchingReferencesView {id:string;definitionId:string;ready:boolean;loading:boolean;issue?:string}
const check=(value:unknown,message:string)=>{if(!value)throw new Error(message);};
const samePoint=(a:Point,b:Point)=>a[0]===b[0]&&a[1]===b[1];
/** Unicode letters after NFC; spaces, punctuation and digits do not count. Ch
 * counts as two letters, just as every other pair of Unicode letters. */
export const matchingNameLength=(value:string)=>(value.normalize('NFC').match(/\p{L}/gu)??[]).length;
export const sameStreetName=(a:string,b:string)=>a.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('cs')===b.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('cs');
export function matchingPreparationCurrent(s:GameState,p:MatchingPreparation){
 const d=s.rules.questions.find(d=>d.id===p.definitionId),target=d?.target==='gps'?s.fixes.hider?.point:s.station?.point;
 return !!d&&p.releaseId===s.releaseId&&validFix(s.fixes.hunter,s.now,s.rules)&&samePoint(p.hunterFix.point,s.fixes.hunter.point)&&!!target&&samePoint(p.targetPoint,target)&&(d.target!=='gps'||validFix(s.fixes.hider,s.now,s.rules));
}
export function beginMatchingPreparation(s:GameState,d:QuestionDefinition,env:GameEnvironment,retry=false){
 check(d.referenceVersion===1&&d.type==='matching','Tato otázka nemá přípravu referenčních názvů.');
 check(validFix(s.fixes.hunter,s.now,s.rules),'Chybí aktuální přesná GPS hledačů.');
 check(d.target!=='gps'||validFix(s.fixes.hider,s.now,s.rules),'Chybí aktuální přesná GPS schovaného.');
 if(!retry&&s.matchingPreparation?.definitionId===d.id&&matchingPreparationCurrent(s,s.matchingPreparation))return;
 const target=d.target==='gps'?s.fixes.hider!.point:s.station!.point;
 const p:MatchingPreparation={id:`${s.id}:matching:${++s.sequence}`,definitionId:d.id,releaseId:s.releaseId,capturedAt:s.now,hunterFix:structuredClone(s.fixes.hunter!),targetPoint:[...target],...(d.target==='gps'?{targetFix:structuredClone(s.fixes.hider!)}:{}),references:{},issues:{},corrections:[]};
 if(d.category==='stop_name')for(const role of ['hunter','hider'] as const){const stop=env.nearestStop?.(role==='hunter'?p.hunterFix.point:p.targetPoint);check(stop,'Publikace neobsahuje způsobilé aktivní PID zastávky s referenčním bodem.');p.references[role]={source:'pid',id:stop!.id,name:stop!.name,capturedAt:s.now,letters:matchingNameLength(stop!.name)};}
 s.matchingPreparation=p;
}
/** Trusted async host/server completion, deliberately NOT a player command.
 * A late response from an abandoned preparation cannot replace newer data. */
export function completeMatchingReference(input:GameState,preparationId:string,role:Role,result:{reference:MatchingReference}|{issue:string}):GameState {
 const p=input.matchingPreparation;
 if(!p||p.id!==preparationId||p.references[role]||p.issues[role]||input.phase!=='seeking'||input.rules.questions.find(d=>d.id===p.definitionId)?.category!=='street')return input;
 const s=structuredClone(input),next=s.matchingPreparation!;
 if('reference' in result){const ref=matchingReferenceSchema.parse(result.reference);check((ref.source==='mapy-reverse-geocoding'||ref.source==='street-lines')&&ref.capturedAt===p.capturedAt&&!ref.manuallyCorrected,'Neplatný výsledek poskytovatele ulic.');next.references[role]=ref;}
 else next.issues[role]=result.issue.slice(0,1000);
 return s;
}
export function correctMatchingReference(s:GameState,actor:Role,input:{name:string;preparationId?:string;questionId?:string}){
 check(!!input.preparationId!==!!input.questionId,'Zvolte právě jednu přípravu nebo otázku.');
 const value=name.parse(input.name.normalize('NFC'));
 if(input.preparationId){const p=s.matchingPreparation;check(p?.id===input.preparationId&&s.rules.questions.find(d=>d.id===p.definitionId)?.category==='street','Příprava ulice již není aktuální.');
  check(p!.corrections.length<100,'Byl dosažen limit ručních oprav.');const previous=p!.references[actor];check(previous||p!.issues[actor],'Nejprve vyčkejte na zjištění názvu.');p!.references[actor]={source:previous?.source??'manual',name:value,capturedAt:p!.capturedAt,manuallyCorrected:true,note:'Název ručně určil hráč; nejde o automaticky ověřenou nejbližší ulici.'};delete p!.issues[actor];p!.corrections.push({role:actor,previousName:previous?.name,name:value,at:s.now});
 }else {const q=s.questions.find(q=>q.id===input.questionId);check(actor==='hider'&&q?.definition.category==='street'&&q.definition.referenceVersion===1&&q.state==='pending'&&q.matchingReferences,'Opravit lze pouze vlastní ulici čekající otázky.');
  const refs=q!.matchingReferences!,previous=refs.hider;check(refs.corrections.length<100,'Byl dosažen limit ručních oprav.');refs.hider={...previous,name:value,manuallyCorrected:true,note:'Ručně opravil schovaný.'};refs.corrections.push({role:'hider',previousName:previous.name,name:value,at:s.now});delete refs.verifiedAt;
  s.events.push({id:`${s.id}:event:${++s.sequence}`,at:s.now,type:'matching_correction',audience:'hider',text:`Ruční oprava ulice: ${previous.name} → ${value}.`});
 }
}
export function captureMatchingReferences(s:GameState,d:QuestionDefinition,preparationId?:string):MatchingReferences {
 const p=s.matchingPreparation;
 check(p&&p.id===preparationId&&p.definitionId===d.id&&matchingPreparationCurrent(s,p),'Referenční údaje nejsou aktuální. Obnovte přípravu otázky.');
 check(p!.references.hunter&&p!.references.hider,'Nejprve dokončete zjištění nebo ruční určení obou názvů.');
 return {releaseId:s.releaseId,measurementAt:s.now,hunter:structuredClone(p!.references.hunter!),hider:structuredClone(p!.references.hider!),corrections:structuredClone(p!.corrections)};
}
export function matchingReferencesView(refs:MatchingReferences,role:Role,category:string):MatchingReferencesView {
 return {releaseId:refs.releaseId,measurementAt:refs.measurementAt,hunter:structuredClone(refs.hunter),...(role==='hider'?{hider:structuredClone(refs.hider),suggestedAnswer:category==='stop_name'?(matchingNameLength(refs.hunter.name)===matchingNameLength(refs.hider.name)?'ANO':'NE'):(sameStreetName(refs.hunter.name,refs.hider.name)?'ANO':'NE'),verifiedAt:refs.verifiedAt}:{}),corrections:structuredClone(refs.corrections.filter(c=>role==='hider'||c.role==='hunter'))};
}
export function matchingPreparationView(s:GameState,role:Role):MatchingPreparationView|undefined {
 const p=s.matchingPreparation;if(!p)return;
 return {id:p.id,definitionId:p.definitionId,releaseId:p.releaseId,measurementAt:p.capturedAt,ready:!!p.references.hunter&&!!p.references.hider&&matchingPreparationCurrent(s,p),loading:!p.references.hunter&&!p.issues.hunter||!p.references.hider&&!p.issues.hider,hunter:p.references.hunter?structuredClone(p.references.hunter):undefined,...(role==='hider'?{hider:p.references.hider?structuredClone(p.references.hider):undefined}:{}),issue:p.issues[role]??(!matchingPreparationCurrent(s,p)?'GPS se změnila nebo není platná; obnovte přípravu.':undefined),corrections:structuredClone(p.corrections.filter(c=>role==='hider'||c.role==='hunter'))};
}
export function validateMatchingState(s:GameState,env:GameEnvironment){
 const validRefs=(refs:MatchingReferences,q:QuestionInstance)=>{
  check(refs.releaseId===s.releaseId&&refs.measurementAt===q.askedAt&&refs.hunter.capturedAt>=s.startedAt&&refs.hider.capturedAt>=s.startedAt&&refs.hunter.capturedAt<=q.askedAt&&refs.hider.capturedAt<=q.askedAt,'Neplatný zdroj nebo čas referenčních názvů.');
  check(validFix(q.hunterFix,q.askedAt,s.rules),'Neplatný GPS snapshot Matching.');
  if(q.definition.category==='street'){check(refs.hunter.source!=='pid'&&refs.hider.source!=='pid','Ulice nemůže používat PID název.');check(q.definition.target==='gps'&&q.targetFix&&validFix(q.targetFix,q.askedAt,s.rules)&&samePoint(q.targetFix.point,q.targetPoint),'Ulice vyžaduje skutečný GPS snapshot schovaného.');}
  else {check(q.definition.target==='station'&&!q.targetFix,'Název zastávky vyžaduje uzamčené stanoviště.');for(const role of ['hunter','hider'] as const){const ref=refs[role],stop=env.nearestStop?.(role==='hunter'?q.hunterFix.point:q.targetPoint);check(stop&&ref.source==='pid'&&ref.id===stop.id&&ref.name===stop.name&&ref.letters===matchingNameLength(ref.name),'Referenční zastávka neodpovídá publikaci.');}}
  check(refs.corrections.every(c=>c.at>=s.startedAt&&c.at<=s.now)&&(!refs.verifiedAt||refs.verifiedAt===q.answeredAt),'Neplatný audit ručního ověření.');
  if(q.definition.category==='street'&&q.state==='answered')check(refs.verifiedAt===q.answeredAt,'Chybí ruční ověření ulic.');
 };
 for(const q of s.questions)if(q.definition.referenceVersion===1){check(q.matchingReferences,'Chybí referenční názvy otázky.');validRefs(q.matchingReferences!,q);}
 const p=s.matchingPreparation;if(p){const d=s.rules.questions.find(d=>d.id===p.definitionId);check(d?.referenceVersion===1&&p.releaseId===s.releaseId&&p.capturedAt>=s.startedAt&&p.capturedAt<=s.now&&validFix(p.hunterFix,p.capturedAt,s.rules),'Neplatná příprava Matching.');
  if(d?.category==='street')check(p.targetFix&&validFix(p.targetFix,p.capturedAt,s.rules)&&samePoint(p.targetPoint,p.targetFix.point),'Chybí skutečný GPS snapshot při přípravě ulice.');
  for(const role of ['hunter','hider'] as const){const ref=p.references[role];if(ref)check(!p.issues[role]&&ref.capturedAt===p.capturedAt,'Nekonzistentní výsledek přípravy.');if(d?.category==='stop_name'){const stop=env.nearestStop?.(role==='hunter'?p.hunterFix.point:p.targetPoint);check(ref&&stop&&ref.source==='pid'&&ref.id===stop.id&&ref.name===stop.name&&ref.letters===matchingNameLength(stop.name),'Neplatná publikovaná zastávka v přípravě.');}else if(ref)check(ref.source!=='pid','Ulice nemůže používat PID název.');}
 }
}
