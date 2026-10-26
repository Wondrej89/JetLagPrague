import {sharedLocation} from './location-view';
import {awaitingStart,lobbyCommand} from './lobby';
import {publicHangman} from './hangman';
import {gameIndicators} from './indicators';
import {recordDeduction} from './deductions';
import { GEOGRAPHIC_EPSILON_METERS } from './spatial-questions';
import type { CardDefinition, Envelope, Fix, GameEnvironment, GameRules, GameState, Point, QuestionDefinition, QuestionInstance, Role, RoleView } from './types';
import { activeCurse, applyQuestionEffects, consumeRewardEffects, cardCommand, finishCardEffects, playNewPowerup, previewRewardPolicy, questionRestriction, updateCardTime } from './card-effects';
export function validFix(fix:Fix|undefined,now:number,rules:GameRules):fix is Fix {
  return !!fix&&fix.point.length===2&&fix.point.every(Number.isFinite)&&Math.abs(fix.point[0])<=180&&Math.abs(fix.point[1])<=90&&Number.isFinite(fix.at)&&fix.at<=now&&now-fix.at<=rules.gpsMaxAgeMs&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=rules.gpsMaxAccuracyM;
}
export function nextRandom(state:GameState){let x=state.rng;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x>>>0;return state.rng/4294967296;}
function shuffle(state:GameState,values:string[]){for(let i=values.length-1;i>0;i--){const j=Math.floor(nextRandom(state)*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;}
export function cardDefinition(state:Pick<GameState,'rules'|'cardState'>,instanceId:string):CardDefinition {const definitionId=state.cardState?.copies.find(c=>c.instanceId===instanceId)?.definitionId??instanceId.split('@')[0];const card=state.rules.cards.find(c=>c.id===definitionId);if(!card)throw new Error('Neznámá karta.');return card;}
export const handLimit=(state:GameState)=>state.rules.handLimit+state.effects.reduce((n,e)=>n+e.value,0);
export const pendingQuestion=(state:GameState)=>state.questions.find(q=>q.state==='pending'||q.state==='error');
function emit(s:GameState,type:string,text:string,audience:'all'|Role='all'){s.events.push({id:`${s.id}:event:${++s.sequence}`,at:s.now,type,audience,text});}
function requireValue(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
export function createGame(options:{id:string;releaseId:string;now:number;seed:number;rules:GameRules;mode?:'simulation'|'live'}):GameState {
  requireValue(options.id&&Number.isFinite(options.now)&&Number.isInteger(options.seed)&&options.seed>0&&options.seed<=4294967295,'Neplatná identita, čas nebo seed hry.');
  requireValue(options.rules.cardVersion!==2||['small','medium','large'].includes(options.rules.size??''),'Vyberte variantu Small / Medium / Large.');
  requireValue(!options.rules.automaticDeductionMap || options.mode !== 'live' && options.rules.deductionConsent?.authority === 'simulator' && options.rules.deductionConsent.hunter && options.rules.deductionConsent.hider, 'Automatická dedukce vyžaduje výslovný souhlas obou rolí; ostrá hra vyžaduje serverové ověření souhlasů.');
  requireValue(options.rules.hideMs>0&&options.rules.radiusMeters>0&&options.rules.handLimit>0,'Neplatná konfigurace hry.');
  requireValue(options.rules.questions.every(q=>!q.rewardPolicy||Number.isInteger(q.rewardPolicy.keep)&&Number.isInteger(q.rewardPolicy.draw)&&q.rewardPolicy.keep>0&&q.rewardPolicy.keep<=q.rewardPolicy.draw&&q.rewardPolicy.draw<=20),'Odměna vyžaduje celá čísla 0 < keep <= draw <= 20.');
  requireValue(options.mode!=='live'||!options.rules.testOnly,'Testovací pravidla nejsou povolená pro ostrou hru.');
  const state:GameState={epochId:`${options.id}:epoch:0`,deductions:[],endgame:false,version:options.rules.cardVersion===2?2:1,...(options.rules.cardVersion===2?{cardState:{moveHistory:[],doors:[],copies:[],rolls:[],penalties:[],move:null}}:{}),id:options.id,releaseId:options.releaseId,mode:options.mode??'simulation',rules:structuredClone(options.rules),startedAt:options.now,now:options.now,phase:'hiding',hideDeadline:options.now+options.rules.hideMs,players:{hunter:{id:'hunters',name:'Hledači'},hider:{id:'hider',name:'Schovaný'}},fixes:{},walking:false,provisionalStopId:null,station:null,deadlineCandidates:null,questions:[],hand:[],drawPile:options.rules.deck.map((id,i)=>`${id}@${i}`),discardPile:[],rewards:[],curses:[],effects:[],proximity:false,seed:options.seed>>>0||1,rng:options.seed>>>0||1,sequence:0,events:[],processedCommands:[]};
  state.drawPile.forEach(id=>cardDefinition(state,id));shuffle(state,state.drawPile);emit(state,'started','Testovací hra zahájena.');return state;
}
export function eligibleStops(state:GameState,env:GameEnvironment){
  if(!validFix(state.fixes.hider,state.now,state.rules)||!env.insideArea(state.fixes.hider.point))return [];
  return env.stops.filter(stop=>env.distance(state.fixes.hider!.point,stop.point)<=state.rules.radiusMeters+1e-6);
}
function lock(s:GameState,stop:GameEnvironment['stops'][number]){s.station=structuredClone(stop);s.provisionalStopId=stop.id;s.phase='seeking';emit(s,'station_locked',`Stanoviště uzamčeno: ${stop.name}.`,'hider');emit(s,'seek_started','Hledání začalo.');}
function reward(s:GameState,q:QuestionInstance){if(q.definition.rewardPolicy&&!s.rewards.some(r=>r.questionId===q.id)){consumeRewardEffects(s,q);s.rewards.push({id:`${q.id}:reward`,questionId:q.id,policy:structuredClone(q.definition.rewardPolicy),state:'pending',offer:[]});emit(s,'reward_granted','Karetní odměna je připravená.','hider');}}
function automaticAnswer(s:GameState,q:QuestionInstance,env:GameEnvironment){
  try{const result=env.resolve(q);if(result.state!=='known'||!result.answer){q.errorCode=result.code;throw new Error(result.reason??'Nelze určit.');}q.answer=result.answer;if(result.publicPoi)q.answerPoi=structuredClone(result.publicPoi);q.state='answered';if(q.phase)q.phase='answered';q.answeredAt=s.now;delete q.error;delete q.errorCode;emit(s,'question_resolved',`${q.definition.label}: ${result.answer}`);reward(s,q);recordDeduction(s,q);}
  catch(error){q.state='error';if(q.phase)q.phase='error';q.error=error instanceof Error?error.message:'Vyhodnocení selhalo.';emit(s,'question_error','Otázku nelze automaticky vyhodnotit.','hider');}
}
function updateTime(s:GameState,env:GameEnvironment){
  updateCardTime(s,env);
  for(const curse of s.curses)if(curse.state==='active'&&!curse.effects&&curse.expiresAt!==undefined&&s.now>=curse.expiresAt){curse.state='ended';emit(s,'curse_ended',`Prokletí skončilo: ${curse.name}.`);}
  if(s.phase==='hiding'&&s.now>=s.hideDeadline){s.deadlineCandidates=eligibleStops(s,env);const selected=s.deadlineCandidates.find(p=>p.id===s.provisionalStopId)??(s.deadlineCandidates.length===1?s.deadlineCandidates[0]:null);if(selected)lock(s,selected);else{s.phase='needs_station';emit(s,'station_required',s.deadlineCandidates.length?'Vyberte ze zastávek způsobilých při vypršení limitu.':'Ve lhůtě chyběla spolehlivá GPS nebo způsobilá zastávka. Je nutné řešení správcem; stanoviště nebylo odhadnuto.','hider');}}
  for(const q of s.questions)if(q.state==='pending'&&q.phase!=='awaiting_second_measurement'&&q.deadline!==null&&s.now>=q.deadline&&q.definition.answerMode==='automatic')automaticAnswer(s,q,env);
  if(s.phase==='seeking'&&s.station&&validFix(s.fixes.hunter,s.now,s.rules)){
    const nearby=s.walking&&env.distance(s.fixes.hunter.point,s.station.point)<=s.rules.radiusMeters+1e-6;
    if(nearby&&!s.proximity)emit(s,'proximity','Hledači jsou poblíž! Dostali se do vzdálenosti 400 metrů od tvého stanoviště.','hider');
    s.proximity=nearby;
  }
}
function ask(s:GameState,id:string,env:GameEnvironment,confirmations:string[]=[],ransomText=''){
  requireValue(s.phase==='seeking'&&s.station,'Nejprve uzamkněte stanoviště.');
  requireValue(!pendingQuestion(s),'Nejprve dokončete předchozí otázku.');
  requireValue(s.hand.length<=handLimit(s),'Nejprve dokončete karetní akci.');
  requireValue(!s.curses.some(c=>activeCurse(c)&&c.blocksQuestions),'Aktivní prokletí brání položení otázky.');
  const definition=s.rules.questions.find(q=>q.id===id);requireValue(definition,'Neznámá otázka.');
  const restriction=questionRestriction(s,definition,env,confirmations,ransomText);requireValue(!restriction,restriction);
  const available=env.availability(definition);requireValue(['ready','manual'].includes(available.state),available.reason);
  requireValue(validFix(s.fixes.hunter,s.now,s.rules),'Chybí aktuální přesná GPS hledačů.');
  const target=definition.target==='station'?s.station.point:validFix(s.fixes.hider,s.now,s.rules)?s.fixes.hider.point:null;requireValue(target,'Chybí aktuální přesná GPS schovaného.');
  if(definition.spatialVersion===2)requireValue(env.insideArea(s.fixes.hunter.point)&&env.insideArea(target),'Rozhodná poloha leží mimo herní oblast.');
  const measuring=definition.spatialVersion===2&&definition.type==='thermometer';
  const q:QuestionInstance={id:`${s.id}:question:${++s.sequence}`,epochId:s.epochId??`${s.id}:epoch:0`,definition:structuredClone(definition),askedAt:s.now,...(definition.spatialVersion===2?{phase:measuring?'awaiting_second_measurement' as const:'awaiting_response' as const,...(!measuring?{responseStartedAt:s.now}:{})}:{}),deadline:measuring||definition.timeoutSeconds===null?null:s.now+definition.timeoutSeconds*1000,hunterFix:structuredClone(s.fixes.hunter),targetPoint:[...target] as Point,state:'pending'};
  if(!measuring)applyQuestionEffects(s,q,confirmations);
  s.questions.push(q);emit(s,measuring?'measurement_started':'question_asked',measuring?`Thermometer zahájen: ${definition.label}. Čeká se na druhé měření.`:`Otázka: ${definition.label}.`);
}
export function transition(input:GameState,envelope:Envelope,env:GameEnvironment):GameState {
  requireValue(input.releaseId===env.releaseId,'Hra používá jiný uzamčený katalog.');
  if(input.processedCommands.includes(envelope.id))return input;
  requireValue(envelope.id&&Number.isFinite(envelope.at)&&envelope.at>=input.now,'Čas nesmí běžet zpět.');
  const {command:c,actor}=envelope;
  requireValue(actor!=='clock'||c.type==='tick','Časovač nesmí hrát za hráče.');
  const allowed=c.type==='tick'?actor==='clock':c.type==='location'?actor===c.role:['roll','map_consent','ready','acknowledge_notice'].includes(c.type)?actor==='hunter'||actor==='hider':['ask','second_measurement','walking','fulfill_curse','complete_curse_task','violate_curse','start_curse_visit','guess_letter','curse_roll','attempt_door','enter_space','steps_taken'].includes(c.type)?actor==='hunter':actor==='hider';
  requireValue(allowed,'Role nemá oprávnění k této akci.');
  if(input.phase==='finished'&&c.type==='tick')return input;
  const s=structuredClone(input);s.now=input.phase==='finished'?input.now:envelope.at;
  requireValue(s.phase!=='finished'||['tick','acknowledge_notice'].includes(c.type),'Kolo je ukončené.');
  // A location stamped at this instant must be available at the hide deadline.
  if(c.type==='location'){
    if(c.role==='hunter'&&s.cardState?.move?.stage==='moving'&&s.now<s.cardState.move.deadline&&c.fix){const distance=s.cardState.move.hunterPoint?env.distance(s.cardState.move.hunterPoint,c.fix.point):Infinity;if(!c.observation)requireValue(distance<=1e-6,'Move: hledači se během přesunu nesmí pohybovat.');else if(distance>Math.max(1,c.fix.accuracy))emit(s,'move_movement_observed',`Move: diagnostická GPS zaznamenala posun hledačů ${Math.round(distance)} m (přesnost ±${Math.round(c.fix.accuracy)} m). Povinnost zůstat na místě trvá.`);}
    if(c.fix){requireValue(c.fix.point.length===2&&c.fix.point.every(Number.isFinite)&&Math.abs(c.fix.point[0])<=180&&Math.abs(c.fix.point[1])<=90&&Number.isFinite(c.fix.at)&&c.fix.at<=s.now&&Number.isFinite(c.fix.accuracy)&&c.fix.accuracy>=0,'Neplatný GPS záznam.');s.fixes[c.role]=structuredClone(c.fix);const moving=s.cardState?.move;if(c.role==='hider'&&moving?.version===2&&moving.stage==='moving'&&c.fix.at<=moving.deadline)moving.lastFix=structuredClone(c.fix);}else {delete s.fixes[c.role];const moving=s.cardState?.move;if(c.role==='hider'&&moving?.version===2&&moving.stage==='moving'&&s.now<=moving.deadline)delete moving.lastFix;}
  }
  requireValue(!awaitingStart(s)||['tick','location','map_consent','ready','acknowledge_notice'].includes(c.type),'Nejprve rozhodněte na obou telefonech a potvrďte připravenost.');
  if(s.phase!=='finished')updateTime(s,env);
  if(lobbyCommand(s,c,actor)){s.processedCommands.push(envelope.id);return s;}
  if(s.cardState?.move?.stage==='moving'&&s.now<s.cardState.move.deadline)requireValue(['tick','location','complete_move'].includes(c.type),'Move: hra je pozastavena; tato akce nyní není povolená.');
  if(cardCommand(s,c,env,actor)){s.processedCommands.push(envelope.id);return s;}
  if(c.type==='declare_endgame'){requireValue(s.phase==='seeking' && c.confirmed && (!s.cardState?.move || s.cardState.move.stage==='completed'),'Potvrďte endgame až po dokončení Move.');s.endgame=true;emit(s,'endgame','Hráči ručně potvrdili zahájení endgame.');}
  else if(c.type==='select_station'){
    requireValue(s.phase==='hiding','Předběžné stanoviště lze měnit pouze během 45 minut.');requireValue(env.stops.some(p=>p.id===c.stopId),'Zastávka není v publikovaném katalogu.');s.provisionalStopId=c.stopId;emit(s,'station_selected','Předběžné stanoviště vybráno.','hider');
  }else if(c.type==='lock_station'){
    requireValue(s.phase==='hiding'||s.phase==='needs_station','Stanoviště už je uzamčené.');
    const candidates=s.phase==='needs_station'?(s.deadlineCandidates??[]):eligibleStops(s,env);
    const stop=candidates.find(p=>p.id===c.stopId);requireValue(stop,'Zastávka není způsobilá podle GPS a limitu.');lock(s,stop);
  }else if(c.type==='walking'){requireValue(c.value||!s.curses.some(c=>c.effects?.some(e=>e.state==='active'&&e.spec.kind==='travel'&&e.spec.preventBoarding)),'Aktivní prokletí zakazuje nástup do další dopravy.');s.walking=c.value;emit(s,'travel_mode',c.value?'Hledači jsou pěšky.':'Hledači jsou v dopravním prostředku.');updateTime(s,env);
  }else if(c.type==='ask')ask(s,c.questionId,env,c.confirmations,c.ransomText);
  else if(c.type==='second_measurement'){
    const q=pendingQuestion(s);requireValue(q?.definition.type==='thermometer','Nečeká otázka Thermometer.');requireValue(!q.secondFix,'Druhé měření již bylo uloženo.');requireValue(validFix(s.fixes.hunter,s.now,s.rules)&&s.fixes.hunter.at>=q.askedAt,'Chybí přesná GPS pro druhé měření po bodu A.');
    requireValue(q.definition.minMoveMeters!==undefined&&env.distance(q.hunterFix.point,s.fixes.hunter.point)+GEOGRAPHIC_EPSILON_METERS>=q.definition.minMoveMeters,'Nebyla splněna minimální vzdálenost přesunu.');
    requireValue(env.insideArea(s.fixes.hunter.point),'Druhé měření leží mimo herní oblast.');
    if(q.phase==='awaiting_second_measurement'){
      const restriction=questionRestriction(s,q.definition,env,c.confirmations,c.ransomText);requireValue(!restriction,restriction);
      q.responseStartedAt=s.now;q.deadline=s.now+(q.definition.timeoutSeconds??300)*1000;q.phase='awaiting_response';applyQuestionEffects(s,q,c.confirmations??[]);
    }
    q.secondFix=structuredClone(s.fixes.hunter);if(q.definition.spatialVersion===2)q.secondCapturedAt=s.now;q.state='pending';delete q.error;delete q.errorCode;emit(s,'second_measurement','Druhé měření bylo uloženo. Začíná reakční okno.');
  }else if(c.type==='resolve_thermometer_tie'){
    const q=pendingQuestion(s);requireValue(q?.errorCode==='thermometer_tie'&&q.secondFix&&env.resolve(q).code==='thermometer_tie','Nečeká nerozhodný Thermometer.');
    requireValue(c.confirmed&&['TEPLEJI','CHLADNĚJI'].includes(c.answer)&&c.note.trim().length>=6&&c.note.length<=1000,'Potvrďte dohodu hráčů a uveďte důvod ručního řešení.');
    q.manualResolution={at:s.now,note:c.note.trim()};q.answer=c.answer;q.state='answered';q.phase='answered';q.answeredAt=s.now;delete q.error;delete q.errorCode;
    emit(s,'thermometer_manual',`Thermometer – ruční dohoda hráčů: ${c.answer}. ${c.note.trim()}`);reward(s,q);
  }else if(c.type==='attach_photo'){
    const q=pendingQuestion(s);requireValue(q?.definition.answerMode==='photo'&&/^[a-zA-Z0-9:_-]{1,200}$/.test(c.photoId),'Není rozpracovaná fotografická otázka.');q.draftPhotoId=c.photoId;
  }else if(c.type==='answer'){
    const q=pendingQuestion(s);requireValue(q,'Není rozpracovaná otázka.');
    requireValue(q.phase!=='awaiting_second_measurement','Nejprve musí hledači dokončit druhé měření.');
    if(q.definition.answerMode==='automatic')automaticAnswer(s,q,env);
    else if(q.definition.answerMode==='photo'){requireValue(c.photoId&&/^[a-zA-Z0-9:_-]{1,200}$/.test(c.photoId),'Nejprve připojte fotografii.');q.photoId=c.photoId;q.answer='Fotografie odeslána';q.state='answered';q.answeredAt=s.now;emit(s,'photo_sent','Fotografie byla odeslána.');reward(s,q);recordDeduction(s,q);}
    else {requireValue(c.answer==='ANO'||c.answer==='NE','Zvolte ANO nebo NE podle ručního pravidla.');q.answer=c.answer;q.state='answered';q.answeredAt=s.now;emit(s,'manual_answer',`${q.definition.label}: ${c.answer}`);reward(s,q);recordDeduction(s,q);}
  }else if(c.type==='draw_reward'){
    requireValue(s.hand.length<=handLimit(s),'Nejprve zmenšete ruku.');requireValue(!s.rewards.some(r=>r.state==='offered'),'Nejprve dokončete otevřenou nabídku.');const r=s.rewards.find(r=>r.id===c.rewardId);requireValue(r?.state==='pending','Odměna již byla otevřena.');requireValue(s.drawPile.length+s.discardPile.length>=r.policy.draw,'Balíček nemá dostatek karet.');
    for(let i=0;i<r.policy.draw;i++){if(!s.drawPile.length){s.drawPile=shuffle(s,s.discardPile);s.discardPile=[];}r.offer.push(s.drawPile.shift()!);}r.state='offered';emit(s,'cards_drawn',`Vylosováno ${r.offer.length} karet; nabídka je uzamčená.`,'hider');
  }else if(c.type==='keep_reward'){
    requireValue(s.hand.length<=handLimit(s),'Nejprve zmenšete ruku.');const r=s.rewards.find(r=>r.id===c.rewardId);
    requireValue((c.cardIds===undefined)!==(c.cardId===undefined),'Použijte jeden způsob výběru karet.');
    const ids=c.cardIds??(c.cardId?[c.cardId]:[]);
    requireValue(r?.state==='offered'&&ids.length===r.policy.keep&&new Set(ids).size===ids.length&&ids.every(id=>r.offer.includes(id)),`Vyberte přesně ${r?.policy.keep??'požadovaný počet'} různých karet z nabídky.`);
    // One transaction: either the entire selection is kept or nothing changes.
    // Overflow is persisted and blocks questions until the hand is reduced.
    s.hand.push(...ids);s.discardPile.push(...r.offer.filter(id=>!ids.includes(id)));r.state='claimed';r.offer=[];emit(s,'card_kept',`Ponecháno ${ids.length} karet, ostatní odhozeny.`,'hider');
  }else if(c.type==='play_card'||c.type==='discard_card'){
    requireValue(s.hand.includes(c.cardId),'Karta není v ruce.');const card=cardDefinition(s,c.cardId);
    if(c.type==='play_card'){
      requireValue(card.mechanics?.status!=='incomplete','Work in progress – chybí úplná pravidla této karty.');
      requireValue(!s.curses.some(x=>x.state==='casting'),'Nejprve dokončete nebo zrušte rozpracované sesílání.');
      requireValue(card.effect!=='bonus','Časový bonus zůstává v ruce do konce kola.');
      if(['duplicate','move','discard_1_draw_2','discard_2_draw_3','draw_1_expand_1'].includes(card.effect))playNewPowerup(s,card,c);
      if(card.effect==='capacity')s.effects.push({cardId:c.cardId,value:card.value??0,at:s.now});
      if(card.effect==='veto'){
        requireValue(s.rules.veto.enabled,'Veto nemá povolená pravidla.');const q=pendingQuestion(s);requireValue(q,'Veto vyžaduje čekající otázku.');q.state='vetoed';delete q.error;delete q.errorCode;emit(s,'veto','Otázka byla zrušena kartou Veto.');if(s.rules.veto.reward)reward(s,q);
      }
      if(card.effect==='randomize'){
        requireValue(s.rules.randomize.enabled,'Randomize nemá povolená pravidla.');const q=pendingQuestion(s);requireValue(q,'Randomize vyžaduje čekající otázku.');
        const candidates=s.rules.questions.filter(d=>d.type===q.definition.type&&d.id!==q.definition.id&&d.answerMode==='automatic'&&d.target===q.definition.target&&env.availability(d).state==='ready'&&(!q.secondFix||d.type!=='thermometer'||env.distance(q.hunterFix.point,q.secondFix.point)+GEOGRAPHIC_EPSILON_METERS>=(d.minMoveMeters??Infinity))&&!questionRestriction(s,d,env,s.curses.flatMap(c=>(c.effects??[]).map(e=>e.id)),'kontrolní text otázky pro kontrolu dostupnosti'));requireValue(candidates.length,'Není jiná kompatibilní otázka pro Randomize.');const free=q.definition.rewardPolicy===null&&q.phase!=='awaiting_second_measurement';q.definition=structuredClone(candidates[Math.floor(nextRandom(s)*candidates.length)]);if(free)q.definition.rewardPolicy=null;for(const curse of s.curses)for(const effect of curse.effects??[])if(q.rewardModifierIds?.includes(effect.id)&&effect.spec.kind==='reward_draw'&&q.definition.rewardPolicy)q.definition.rewardPolicy.draw+=effect.spec.amount;if(s.rules.randomize.restartTimer&&q.phase!=='awaiting_second_measurement'){q.deadline=q.definition.timeoutSeconds===null?null:s.now+q.definition.timeoutSeconds*1000;if(q.phase)q.responseStartedAt=s.now;}q.state='pending';if(q.phase&&q.phase!=='awaiting_second_measurement')q.phase='awaiting_response';delete q.error;delete q.errorCode;emit(s,'randomized',`Otázka změněna: ${q.definition.label}.`);
      }
      if(card.effect==='curse'){
        requireValue(s.version===1,'Prokletí nejprve připravte a zaplaťte casting cost.');
        requireValue(card.curse,'Chybí definice prokletí.');s.curses.push({id:`${s.id}:curse:${++s.sequence}`,cardId:c.cardId,name:card.name,description:card.description,icon:card.icon,activatedAt:s.now,...(card.curse.durationMs?{expiresAt:s.now+card.curse.durationMs}:{}),condition:card.curse.condition,blocksQuestions:card.curse.blocksQuestions,manual:card.curse.manual,target:'hunter',state:'active'});emit(s,'curse_activated',`Aktivní prokletí: ${card.name}.`);
      }
      emit(s,'card_played',`Zahraná karta: ${card.name}.`,'hider');
    }else {requireValue(!s.curses.some(x=>x.state==='casting'&&x.cardId===c.cardId),'Nejprve zrušte sesílání této karty.');emit(s,'card_discarded','Karta odhozena.','hider');}
    s.hand=s.hand.filter(id=>id!==c.cardId);s.discardPile.push(c.cardId);
  }else if(c.type==='fulfill_curse'){
    const curse=s.curses.find(curse=>curse.id===c.curseId);requireValue(curse?.state==='active'&&curse.manual,'Toto prokletí nelze ručně splnit.');curse.state='fulfilled';emit(s,'curse_fulfilled',`Prokletí splněno: ${curse.name}.`);
  }else if(c.type==='finish'){requireValue(s.phase==='seeking','Nejprve zahajte hledání.');requireValue(s.hand.length<=handLimit(s),'Nejprve zmenšete ruku.');requireValue(!s.cardState?.move||s.cardState.move.stage==='completed','Nejprve dokončete přesun Move.');finishCardEffects(s);s.phase='finished';emit(s,'finished','Kolo ukončeno. Časové bonusy v ruce se započítají.');}
  s.processedCommands.push(envelope.id);return s;
}
/** This DTO boundary is the future server transport contract. Never send GameState
 * to a hunter client. The simulator's administrator owns the full local state. */
export function viewForRole(s:GameState,role:Role,env:GameEnvironment):RoleView {
  const confirmations=s.curses.flatMap(c=>(c.effects??[]).filter(e=>e.state==='active'&&(e.spec.kind==='next_question'||e.spec.kind==='travel'&&e.spec.confirmOutsideStation)).map(e=>({id:e.id,text:e.spec.kind==='next_question'?e.spec.confirmation:'Potvrzuji, že nejsem na vlakovém nádraží.'})));
  const pending=pendingQuestion(s),blocked=s.cardState?.move&&s.cardState.move.stage!=='completed'?'Probíhá přesun Move.':s.phase!=='seeking'?'Čeká se na uzamčení stanoviště.':pending?'Nejprve dokončete otázku.':s.curses.some(c=>activeCurse(c)&&c.blocksQuestions)?'Aktivní prokletí brání položení otázky.':s.hand.length>handLimit(s)?'Dokončuje se karetní akce.':!validFix(s.fixes.hunter,s.now,s.rules)?'Chybí aktuální přesná GPS hledačů.':'';
  const own=s.fixes[role],gpsIssue=!own?'GPS není dostupná.':own.accuracy>s.rules.gpsMaxAccuracyM?'GPS je nepřesná. Vyčkejte na přesnější měření.':!validFix(own,s.now,s.rules)?'GPS je zastaralá nebo má neplatný čas.':!env.insideArea(own.point)?'Poloha leží mimo herní území.':null;
  const score=scoreGame(s);const view:RoleView={hangmanVersion:s.rules.hangmanVersion,lobby:s.lobby?structuredClone(s.lobby):undefined,acknowledgedNotices:s.noticeAcknowledgements?.[role]??[],wallElapsedMs:score.baseMs,pausedMs:score.pausedMs??0,bonusMs:role==='hider'?score.bonusSeconds*1000:undefined,penaltyMs:(score.penaltySeconds??0)*1000,automaticDeductionMap:s.rules.automaticDeductionMap??false,epochId:s.epochId,endgame:s.endgame??false,deductions:s.rules.automaticDeductionMap&&role==='hunter'?structuredClone(s.deductions??[]):[],revealedStations:[...(s.cardState?.moveHistory??[]),...(s.cardState?.move?[s.cardState.move]:[])].map(m=>structuredClone(m.origin)),startedAt:s.startedAt,gameId:s.id,releaseId:s.releaseId,role,phase:s.phase,elapsedMs:score.baseMs-(score.pausedMs??0),now:s.now,hideRemainingMs:awaitingStart(s)?s.rules.hideMs:Math.max(0,s.hideDeadline-s.now),ownFix:s.fixes[role]??null,gpsIssue,canAsk:!blocked,blockingReason:blocked,questions:s.questions.map(q=>({id:q.id,epochId:q.epochId,definition:q.definition,state:q.state,phase:q.phase,responseStartedAt:q.responseStartedAt,askedAt:q.askedAt,deadline:q.deadline,secondCaptured:!!q.secondFix,manualTie:q.errorCode==='thermometer_tie',...(role==='hunter'&&q.definition.type==='thermometer'?{measurement:{first:q.hunterFix.point,...(q.secondFix?{second:q.secondFix.point}:{}),movement:q.secondFix?env.distance(q.hunterFix.point,q.secondFix.point):validFix(s.fixes.hunter,s.now,s.rules)?env.distance(q.hunterFix.point,s.fixes.hunter.point):null,remaining:validFix(s.fixes.hunter,s.now,s.rules)?Math.max(0,(q.definition.minMoveMeters??0)-env.distance(q.hunterFix.point,(q.secondFix??s.fixes.hunter).point)):null,canFinish:q.phase==='awaiting_second_measurement'&&validFix(s.fixes.hunter,s.now,s.rules)&&s.fixes.hunter.at>=q.askedAt&&env.insideArea(s.fixes.hunter.point)&&env.distance(q.hunterFix.point,s.fixes.hunter.point)+GEOGRAPHIC_EPSILON_METERS>=(q.definition.minMoveMeters??Infinity)}}:{}),...(q.state==='answered'?{answer:q.answer,photoId:q.photoId,...(q.answerPoi?{answerPoi:q.answerPoi}:{})}:{}),...(role==='hider'?{draftPhotoId:q.draftPhotoId,...(q.error?{error:q.error}:{})}:{})})),availableQuestions:s.rules.questions.map(q=>{const restriction=questionRestriction(s,q,env,confirmations.map(c=>c.id),'kontrolní text otázky pro kontrolu dostupnosti');return {...q,rewardPolicy:previewRewardPolicy(s,q),availability:restriction?'unsupported':env.availability(q).state,reason:restriction||env.availability(q).reason};}),curses:s.curses.filter(c=>role==='hider'||c.state!=='casting'&&(!c.effects||c.effects.length>0)).map(({casterPoint: _privatePoint,...c})=>{void _privatePoint;const copy=structuredClone(c);if(role==='hunter'&&copy.hangman)copy.hangman=publicHangman(copy.hangman);if(role==='hunter'&&copy.setup){const word=copy.setup.secretWord;if(word)copy.maskedWord=[...word.toLocaleUpperCase('cs')].map(l=>/\p{L}/u.test(l)&&!copy.guesses?.includes(l)?'＿':l).join(' ');delete copy.setup.secretWord;delete copy.setup.targetPoint;}return copy;}),events:s.events.filter(e=>e.audience==='all'||e.audience===role)};
  view.blockedCategories=s.curses.flatMap(c=>(c.effects??[]).filter(e=>e.state==='active'&&e.spec.kind==='block_category').map(e=>e.selectedCategory??(e.spec.kind==='block_category'&&e.spec.category!=='random'?e.spec.category:null))).filter((c):c is QuestionDefinition['type']=>c!==null);view.questionConfirmations=confirmations;view.cardVersion=s.rules.cardVersion;view.size=s.rules.size;view.rolls=s.cardState?.rolls.filter(r=>r.actor===role);view.penalties=s.cardState?.penalties;if(role==='hunter'&&s.cardState?.move){const {cardId,origin,startedAt,deadline,stage,endedAt}=s.cardState.move;view.move=structuredClone({cardId,origin,startedAt,deadline,stage,...(endedAt===undefined?{}:{endedAt})});}view.doors=s.cardState?.doors;
  if(role==='hunter')view.walking=s.walking;
  else {view.hunterLocation=sharedLocation(s.fixes.hunter,s.now,s.rules);view.drawCount=s.drawPile.length;view.discardCount=s.discardPile.length;view.move=s.cardState?.move?structuredClone(s.cardState.move):undefined;if(view.move)delete view.move.hunterPoint;view.proximityActive=s.proximity;view.finalScoreMs=s.phase==='finished'&&!scoreGame(s).penaltyUnknown?scoreGame(s).totalMs:undefined;view.station=s.station;view.provisionalStopId=s.provisionalStopId;view.stops=s.phase==='needs_station'?(s.deadlineCandidates??[]):env.stops;view.hand=s.hand.map(instanceId=>({instanceId,definition:cardDefinition(s,instanceId)}));view.handLimit=handLimit(s);view.overflow=Math.max(0,s.hand.length-handLimit(s));view.bonusSeconds=s.hand.reduce((n,id)=>{const c=cardDefinition(s,id);return n+(c.effect==='bonus'?(c.value??0):0);},0);view.rewards=s.rewards;view.rewardCards=Object.fromEntries(s.rewards.flatMap(r=>r.offer).map(id=>[id,cardDefinition(s,id)]));}
  view.indicators=gameIndicators(view);return structuredClone(view);
}

export function scoreGame(s:GameState){const bonusSeconds=s.hand.reduce((n,id)=>{const card=cardDefinition(s,id);return n+(card.effect==='bonus'?(card.value??0):0);},0),baseMs: number=awaitingStart(s)?0:s.now-s.startedAt;const moves=[...(s.cardState?.moveHistory??[]),...(s.cardState?.move?[s.cardState.move]:[])],pausedMs=moves.reduce((n,m)=>n+Math.max(0,Math.min(s.now,m.endedAt??m.deadline)-m.startedAt),0);const penalties=s.cardState?.penalties??[],penaltySeconds=penalties.reduce((n,p)=>n+(p.seconds??0),0);return {baseMs,bonusSeconds,totalMs:baseMs-pausedMs+(bonusSeconds+penaltySeconds)*1000,...(s.version===2?{pausedMs,penaltySeconds,penaltyUnknown:penalties.some(p=>p.seconds===null)}:{})};}
