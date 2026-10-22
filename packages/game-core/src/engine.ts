import type { CardDefinition, Envelope, Fix, GameEnvironment, GameRules, GameState, Point, QuestionInstance, Role, RoleView } from './types';
export function validFix(fix:Fix|undefined,now:number,rules:GameRules):fix is Fix {
  return !!fix&&fix.point.length===2&&fix.point.every(Number.isFinite)&&Math.abs(fix.point[0])<=180&&Math.abs(fix.point[1])<=90&&Number.isFinite(fix.at)&&fix.at<=now&&now-fix.at<=rules.gpsMaxAgeMs&&Number.isFinite(fix.accuracy)&&fix.accuracy>=0&&fix.accuracy<=rules.gpsMaxAccuracyM;
}
function random(state:GameState){let x=state.rng;x^=x<<13;x^=x>>>17;x^=x<<5;state.rng=x>>>0;return state.rng/4294967296;}
function shuffle(state:GameState,values:string[]){for(let i=values.length-1;i>0;i--){const j=Math.floor(random(state)*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;}
export function cardDefinition(state:Pick<GameState,'rules'>,instanceId:string):CardDefinition {const card=state.rules.cards.find(c=>c.id===instanceId.split('@')[0]);if(!card)throw new Error('Neznámá karta.');return card;}
export const handLimit=(state:GameState)=>state.rules.handLimit+state.effects.reduce((n,e)=>n+e.value,0);
export const pendingQuestion=(state:GameState)=>state.questions.find(q=>q.state==='pending'||q.state==='error');
function emit(s:GameState,type:string,text:string,audience:'all'|Role='all'){s.events.push({id:`${s.id}:event:${++s.sequence}`,at:s.now,type,audience,text});}
function requireValue(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
export function createGame(options:{id:string;releaseId:string;now:number;seed:number;rules:GameRules;mode?:'simulation'|'live'}):GameState {
  requireValue(options.id&&Number.isFinite(options.now)&&Number.isInteger(options.seed)&&options.seed>0&&options.seed<=4294967295,'Neplatná identita, čas nebo seed hry.');
  requireValue(options.rules.hideMs>0&&options.rules.radiusMeters>0&&options.rules.handLimit>0,'Neplatná konfigurace hry.');
  requireValue(options.rules.questions.every(q=>!q.rewardPolicy||q.rewardPolicy.keep===1&&q.rewardPolicy.draw>=1),'MVP podporuje odměny s ponecháním jedné karty.');
  requireValue(options.mode!=='live'||!options.rules.testOnly,'Testovací pravidla nejsou povolená pro ostrou hru.');
  const state:GameState={version:1,id:options.id,releaseId:options.releaseId,mode:options.mode??'simulation',rules:structuredClone(options.rules),startedAt:options.now,now:options.now,phase:'hiding',hideDeadline:options.now+options.rules.hideMs,players:{hunter:{id:'hunters',name:'Hledači'},hider:{id:'hider',name:'Schovaný'}},fixes:{},walking:false,provisionalStopId:null,station:null,deadlineCandidates:null,questions:[],hand:[],drawPile:options.rules.deck.map((id,i)=>`${id}@${i}`),discardPile:[],rewards:[],curses:[],effects:[],proximity:false,seed:options.seed>>>0||1,rng:options.seed>>>0||1,sequence:0,events:[],processedCommands:[]};
  state.drawPile.forEach(id=>cardDefinition(state,id));shuffle(state,state.drawPile);emit(state,'started','Testovací hra zahájena.');return state;
}
export function eligibleStops(state:GameState,env:GameEnvironment){
  if(!validFix(state.fixes.hider,state.now,state.rules)||!env.insideArea(state.fixes.hider.point))return [];
  return env.stops.filter(stop=>env.distance(state.fixes.hider!.point,stop.point)<=state.rules.radiusMeters+1e-6);
}
function lock(s:GameState,stop:GameEnvironment['stops'][number]){s.station=structuredClone(stop);s.provisionalStopId=stop.id;s.phase='seeking';emit(s,'station_locked',`Stanoviště uzamčeno: ${stop.name}.`,'hider');emit(s,'seek_started','Hledání začalo.');}
function reward(s:GameState,q:QuestionInstance){if(q.definition.rewardPolicy&&!s.rewards.some(r=>r.questionId===q.id)){s.rewards.push({id:`${q.id}:reward`,questionId:q.id,policy:structuredClone(q.definition.rewardPolicy),state:'pending',offer:[]});emit(s,'reward_granted','Karetní odměna je připravená.','hider');}}
function automaticAnswer(s:GameState,q:QuestionInstance,env:GameEnvironment){
  try{const result=env.resolve(q);if(result.state!=='known'||!result.answer)throw new Error(result.reason??'Nelze určit.');q.answer=result.answer;q.state='answered';q.answeredAt=s.now;delete q.error;emit(s,'question_resolved',`${q.definition.label}: ${result.answer}`);reward(s,q);}
  catch(error){q.state='error';q.error=error instanceof Error?error.message:'Vyhodnocení selhalo.';emit(s,'question_error','Otázku nelze automaticky vyhodnotit.','hider');}
}
function updateTime(s:GameState,env:GameEnvironment){
  for(const curse of s.curses)if(curse.state==='active'&&curse.expiresAt!==undefined&&s.now>=curse.expiresAt){curse.state='ended';emit(s,'curse_ended',`Prokletí skončilo: ${curse.name}.`);}
  if(s.phase==='hiding'&&s.now>=s.hideDeadline){s.deadlineCandidates=eligibleStops(s,env);const selected=s.deadlineCandidates.find(p=>p.id===s.provisionalStopId)??(s.deadlineCandidates.length===1?s.deadlineCandidates[0]:null);if(selected)lock(s,selected);else{s.phase='needs_station';emit(s,'station_required',s.deadlineCandidates.length?'Vyberte ze zastávek způsobilých při vypršení limitu.':'Ve lhůtě chyběla spolehlivá GPS nebo způsobilá zastávka. Je nutné řešení správcem; stanoviště nebylo odhadnuto.','hider');}}
  for(const q of s.questions)if(q.state==='pending'&&q.deadline!==null&&s.now>=q.deadline&&q.definition.answerMode==='automatic')automaticAnswer(s,q,env);
  if(s.phase==='seeking'&&s.station&&validFix(s.fixes.hunter,s.now,s.rules)){
    const nearby=s.walking&&env.distance(s.fixes.hunter.point,s.station.point)<=s.rules.radiusMeters+1e-6;
    if(nearby&&!s.proximity)emit(s,'proximity','Hledači jsou poblíž! Dostali se do vzdálenosti 400 metrů od tvého stanoviště.','hider');
    s.proximity=nearby;
  }
}
function ask(s:GameState,id:string,env:GameEnvironment){
  requireValue(s.phase==='seeking'&&s.station,'Nejprve uzamkněte stanoviště.');
  requireValue(!pendingQuestion(s),'Nejprve dokončete předchozí otázku.');
  requireValue(s.hand.length<=handLimit(s),'Nejprve dokončete karetní akci.');
  requireValue(!s.curses.some(c=>c.state==='active'&&c.blocksQuestions),'Aktivní prokletí brání položení otázky.');
  const definition=s.rules.questions.find(q=>q.id===id);requireValue(definition,'Neznámá otázka.');
  const available=env.availability(definition);requireValue(['ready','manual'].includes(available.state),available.reason);
  requireValue(validFix(s.fixes.hunter,s.now,s.rules),'Chybí aktuální přesná GPS hledačů.');
  const target=definition.target==='station'?s.station.point:validFix(s.fixes.hider,s.now,s.rules)?s.fixes.hider.point:null;requireValue(target,'Chybí aktuální přesná GPS schovaného.');
  const q:QuestionInstance={id:`${s.id}:question:${++s.sequence}`,definition:structuredClone(definition),askedAt:s.now,deadline:definition.timeoutSeconds===null?null:s.now+definition.timeoutSeconds*1000,hunterFix:structuredClone(s.fixes.hunter),targetPoint:[...target] as Point,state:'pending'};
  s.questions.push(q);emit(s,'question_asked',`Otázka: ${definition.label}.`);
}
export function transition(input:GameState,envelope:Envelope,env:GameEnvironment):GameState {
  requireValue(input.releaseId===env.releaseId,'Hra používá jiný uzamčený katalog.');
  if(input.processedCommands.includes(envelope.id))return input;
  requireValue(envelope.id&&Number.isFinite(envelope.at)&&envelope.at>=input.now,'Čas nesmí běžet zpět.');
  const {command:c,actor}=envelope;
  requireValue(actor!=='clock'||c.type==='tick','Časovač nesmí hrát za hráče.');
  const allowed=c.type==='tick'?actor==='clock':c.type==='location'?actor===c.role:['ask','second_measurement','walking','fulfill_curse'].includes(c.type)?actor==='hunter':actor==='hider';
  requireValue(allowed,'Role nemá oprávnění k této akci.');
  if(input.phase==='finished'&&c.type==='tick')return input;
  const s=structuredClone(input);s.now=envelope.at;
  requireValue(s.phase!=='finished'||c.type==='tick','Kolo je ukončené.');
  // A location stamped at this instant must be available at the hide deadline.
  if(c.type==='location'){
    if(c.fix){requireValue(c.fix.point.length===2&&c.fix.point.every(Number.isFinite)&&Math.abs(c.fix.point[0])<=180&&Math.abs(c.fix.point[1])<=90&&Number.isFinite(c.fix.at)&&c.fix.at<=s.now&&Number.isFinite(c.fix.accuracy)&&c.fix.accuracy>=0,'Neplatný GPS záznam.');s.fixes[c.role]=structuredClone(c.fix);}else delete s.fixes[c.role];
  }
  updateTime(s,env);
  if(c.type==='select_station'){
    requireValue(s.phase==='hiding','Předběžné stanoviště lze měnit pouze během 45 minut.');requireValue(env.stops.some(p=>p.id===c.stopId),'Zastávka není v publikovaném katalogu.');s.provisionalStopId=c.stopId;emit(s,'station_selected','Předběžné stanoviště vybráno.','hider');
  }else if(c.type==='lock_station'){
    requireValue(s.phase==='hiding'||s.phase==='needs_station','Stanoviště už je uzamčené.');
    const candidates=s.phase==='needs_station'?(s.deadlineCandidates??[]):eligibleStops(s,env);
    const stop=candidates.find(p=>p.id===c.stopId);requireValue(stop,'Zastávka není způsobilá podle GPS a limitu.');lock(s,stop);
  }else if(c.type==='walking'){s.walking=c.value;emit(s,'travel_mode',c.value?'Hledači jsou pěšky.':'Hledači jsou v dopravním prostředku.');updateTime(s,env);
  }else if(c.type==='ask')ask(s,c.questionId,env);
  else if(c.type==='second_measurement'){
    const q=pendingQuestion(s);requireValue(q?.definition.type==='thermometer','Nečeká otázka Thermometer.');requireValue(!q.secondFix,'Druhé měření již bylo uloženo.');requireValue(validFix(s.fixes.hunter,s.now,s.rules),'Chybí přesná GPS pro druhé měření.');requireValue(q.definition.minMoveMeters!==undefined&&env.distance(q.hunterFix.point,s.fixes.hunter.point)>=q.definition.minMoveMeters,'Nebyla splněna minimální vzdálenost přesunu.');q.secondFix=structuredClone(s.fixes.hunter);q.state='pending';delete q.error;emit(s,'second_measurement','Druhé měření bylo uloženo.');
  }else if(c.type==='attach_photo'){
    const q=pendingQuestion(s);requireValue(q?.definition.answerMode==='photo'&&/^[a-zA-Z0-9:_-]{1,200}$/.test(c.photoId),'Není rozpracovaná fotografická otázka.');q.draftPhotoId=c.photoId;
  }else if(c.type==='answer'){
    const q=pendingQuestion(s);requireValue(q,'Není rozpracovaná otázka.');
    if(q.definition.answerMode==='automatic')automaticAnswer(s,q,env);
    else if(q.definition.answerMode==='photo'){requireValue(c.photoId&&/^[a-zA-Z0-9:_-]{1,200}$/.test(c.photoId),'Nejprve připojte fotografii.');q.photoId=c.photoId;q.answer='Fotografie odeslána';q.state='answered';q.answeredAt=s.now;emit(s,'photo_sent','Fotografie byla odeslána.');reward(s,q);}
    else {requireValue(c.answer==='ANO'||c.answer==='NE','Zvolte ANO nebo NE podle ručního pravidla.');q.answer=c.answer;q.state='answered';q.answeredAt=s.now;emit(s,'manual_answer',`${q.definition.label}: ${c.answer}`);reward(s,q);}
  }else if(c.type==='draw_reward'){
    requireValue(s.hand.length<=handLimit(s),'Nejprve zmenšete ruku.');requireValue(!s.rewards.some(r=>r.state==='offered'),'Nejprve dokončete otevřenou nabídku.');const r=s.rewards.find(r=>r.id===c.rewardId);requireValue(r?.state==='pending','Odměna již byla otevřena.');requireValue(s.drawPile.length+s.discardPile.length>=r.policy.draw,'Balíček nemá dostatek karet.');
    for(let i=0;i<r.policy.draw;i++){if(!s.drawPile.length){s.drawPile=shuffle(s,s.discardPile);s.discardPile=[];}r.offer.push(s.drawPile.shift()!);}r.state='offered';emit(s,'cards_drawn',`Vylosováno ${r.offer.length} karet; nabídka je uzamčená.`,'hider');
  }else if(c.type==='keep_reward'){
    requireValue(s.hand.length<=handLimit(s),'Nejprve zmenšete ruku.');const r=s.rewards.find(r=>r.id===c.rewardId);requireValue(r?.state==='offered'&&r.offer.includes(c.cardId),'Karta není v této nabídce.');s.hand.push(c.cardId);s.discardPile.push(...r.offer.filter(id=>id!==c.cardId));r.state='claimed';r.offer=[];emit(s,'card_kept','Jedna karta ponechána, ostatní odhozeny.','hider');
  }else if(c.type==='play_card'||c.type==='discard_card'){
    requireValue(s.hand.includes(c.cardId),'Karta není v ruce.');const card=cardDefinition(s,c.cardId);
    if(c.type==='play_card'){
      requireValue(card.effect!=='bonus','Časový bonus zůstává v ruce do konce kola.');
      if(card.effect==='capacity')s.effects.push({cardId:c.cardId,value:card.value??0,at:s.now});
      if(card.effect==='veto'){
        requireValue(s.rules.veto.enabled,'Veto nemá povolená pravidla.');const q=pendingQuestion(s);requireValue(q,'Veto vyžaduje čekající otázku.');q.state='vetoed';delete q.error;emit(s,'veto','Otázka byla zrušena kartou Veto.');if(s.rules.veto.reward)reward(s,q);
      }
      if(card.effect==='randomize'){
        requireValue(s.rules.randomize.enabled,'Randomize nemá povolená pravidla.');const q=pendingQuestion(s);requireValue(q,'Randomize vyžaduje čekající otázku.');
        const candidates=s.rules.questions.filter(d=>d.type===q.definition.type&&d.id!==q.definition.id&&d.answerMode==='automatic'&&d.target===q.definition.target&&env.availability(d).state==='ready');requireValue(candidates.length,'Není jiná kompatibilní otázka pro Randomize.');q.definition=structuredClone(candidates[Math.floor(random(s)*candidates.length)]);if(s.rules.randomize.restartTimer)q.deadline=q.definition.timeoutSeconds===null?null:s.now+q.definition.timeoutSeconds*1000;q.state='pending';delete q.error;emit(s,'randomized',`Otázka změněna: ${q.definition.label}.`);
      }
      if(card.effect==='curse'){
        requireValue(card.curse,'Chybí definice prokletí.');s.curses.push({id:`${s.id}:curse:${++s.sequence}`,cardId:c.cardId,name:card.name,description:card.description,icon:card.icon,activatedAt:s.now,...(card.curse.durationMs?{expiresAt:s.now+card.curse.durationMs}:{}),condition:card.curse.condition,blocksQuestions:card.curse.blocksQuestions,manual:card.curse.manual,target:'hunter',state:'active'});emit(s,'curse_activated',`Aktivní prokletí: ${card.name}.`);
      }
      emit(s,'card_played',`Zahraná karta: ${card.name}.`,'hider');
    }else emit(s,'card_discarded','Karta odhozena.','hider');
    s.hand=s.hand.filter(id=>id!==c.cardId);s.discardPile.push(c.cardId);
  }else if(c.type==='fulfill_curse'){
    const curse=s.curses.find(curse=>curse.id===c.curseId);requireValue(curse?.state==='active'&&curse.manual,'Toto prokletí nelze ručně splnit.');curse.state='fulfilled';emit(s,'curse_fulfilled',`Prokletí splněno: ${curse.name}.`);
  }else if(c.type==='finish'){requireValue(s.phase==='seeking','Nejprve zahajte hledání.');requireValue(s.hand.length<=handLimit(s),'Nejprve zmenšete ruku.');s.phase='finished';emit(s,'finished','Kolo ukončeno. Časové bonusy v ruce se započítají.');}
  s.processedCommands.push(envelope.id);return s;
}
/** This DTO boundary is the future server transport contract. Never send GameState
 * to a hunter client. The simulator's administrator owns the full local state. */
export function viewForRole(s:GameState,role:Role,env:GameEnvironment):RoleView {
  const pending=pendingQuestion(s),blocked=s.phase!=='seeking'?'Čeká se na uzamčení stanoviště.':pending?'Nejprve dokončete otázku.':s.curses.some(c=>c.state==='active'&&c.blocksQuestions)?'Aktivní prokletí brání položení otázky.':s.hand.length>handLimit(s)?'Dokončuje se karetní akce.':!validFix(s.fixes.hunter,s.now,s.rules)?'Chybí aktuální přesná GPS hledačů.':'';
  const own=s.fixes[role],gpsIssue=!own?'GPS není dostupná.':own.accuracy>s.rules.gpsMaxAccuracyM?'GPS je nepřesná. Vyčkejte na přesnější měření.':!validFix(own,s.now,s.rules)?'GPS je zastaralá nebo má neplatný čas.':null;
  const view:RoleView={gameId:s.id,releaseId:s.releaseId,role,phase:s.phase,elapsedMs:s.now-s.startedAt,now:s.now,hideRemainingMs:Math.max(0,s.hideDeadline-s.now),ownFix:s.fixes[role]??null,gpsIssue,canAsk:!blocked,blockingReason:blocked,questions:s.questions.map(q=>({id:q.id,definition:q.definition,state:q.state,askedAt:q.askedAt,deadline:q.deadline,secondCaptured:!!q.secondFix,...(q.state==='answered'?{answer:q.answer,photoId:q.photoId}:{}),...(role==='hider'?{draftPhotoId:q.draftPhotoId,...(q.error?{error:q.error}:{})}:{})})),availableQuestions:s.rules.questions.map(q=>({...q,availability:env.availability(q).state,reason:env.availability(q).reason})),curses:s.curses,events:s.events.filter(e=>e.audience==='all'||e.audience===role)};
  if(role==='hunter')view.walking=s.walking;
  else {view.proximityActive=s.proximity;view.finalScoreMs=s.phase==='finished'?scoreGame(s).totalMs:undefined;view.station=s.station;view.provisionalStopId=s.provisionalStopId;view.stops=s.phase==='needs_station'?(s.deadlineCandidates??[]):env.stops;view.hand=s.hand.map(instanceId=>({instanceId,definition:cardDefinition(s,instanceId)}));view.handLimit=handLimit(s);view.overflow=Math.max(0,s.hand.length-handLimit(s));view.bonusSeconds=s.hand.reduce((n,id)=>{const c=cardDefinition(s,id);return n+(c.effect==='bonus'?(c.value??0):0);},0);view.rewards=s.rewards;view.rewardCards=Object.fromEntries(s.rewards.flatMap(r=>r.offer).map(id=>[id,cardDefinition(s,id)]));}
  return structuredClone(view);
}

export function scoreGame(s:GameState){const bonusSeconds=s.hand.reduce((n,id)=>{const card=cardDefinition(s,id);return n+(card.effect==='bonus'?(card.value??0):0);},0),baseMs=s.now-s.startedAt;return {baseMs,bonusSeconds,totalMs:baseMs+bonusSeconds*1000};}
