import {cardDefinition,createGame,handLimit,scoreGame} from './engine';
import {finishCardEffects,rollPassed} from './card-effects';
import {createLobbyGame} from './lobby';
import type {Command,Curse,GameState,Role} from './types';
import type {MatchView,RoundResult,SettlementCheck,TeamId,TeamMatch} from './match-types';
const TEAM_IDS:TeamId[]=['team-a','team-b'];
function check(value:unknown,message:string):asserts value {if(!value)throw new Error(message);}
function emit(s:GameState,type:string,text:string){s.events.push({id:`${s.id}:event:${++s.sequence}`,at:s.now,type,text,audience:'all'});}
export function normalizeTeamName(value:string){return value.normalize('NFC').trim().replace(/\s+/gu,' ');}
function initialName(s:GameState,role:Role,fallback:string){const name=s.players[role].name;return ['Hledači','Schovaný'].includes(name)?fallback:normalizeTeamName([...normalizeTeamName(name.replace(/[\p{Cc}]/gu,''))].slice(0,40).join(''))||fallback;}
export function matchForState(s:GameState):TeamMatch {
 if(s.match)return s.match;
 const a=initialName(s,'hunter','Tým 1');let b=initialName(s,'hider','Tým 2');if(a.toLocaleLowerCase('cs')===b.toLocaleLowerCase('cs'))b=a.toLocaleLowerCase('cs')==='tým 2'?'Tým B':'Tým 2';
 return {version:1,id:`${s.id}:match`,teams:[{id:'team-a',name:a,members:2,activePhones:1},{id:'team-b',name:b,members:2,activePhones:1}],round:1,roleTeams:{hunter:'team-a',hider:'team-b'},results:[],nextReady:{}};
}
export function initializeMatch(s:GameState){s.match=structuredClone(matchForState(s));syncPlayers(s);}
function syncPlayers(s:GameState){for(const role of ['hunter','hider'] as const){const team=s.match!.teams.find(t=>t.id===s.match!.roleTeams[role])!;s.players[role]={id:team.id,name:team.name};}}
export function roleForTeam(s:GameState,id:TeamId):Role {const m=matchForState(s);check(TEAM_IDS.includes(id),'Neznámý tým.');return m.roleTeams.hunter===id?'hunter':'hider';}
export function matchView(s:GameState,role:Role):MatchView {
 const m=structuredClone(matchForState(s));return {...m,ownTeamId:m.roleTeams[role],winner:winner(m)};
}
export function winner(m:TeamMatch):TeamId|'tie'|null {
 if(m.results.length!==2)return null;
 const [a,b]=m.results;return Math.round(a.totalMs)===Math.round(b.totalMs)?'tie':Math.round(a.totalMs)>Math.round(b.totalMs)?a.hiderTeamId:b.hiderTeamId;
}
export function roundClockAt(s:GameState){const end=s.roundEnd;return end&&end.status!=='rejected'?end.reportedAt:s.now;}
function questionFor(id:string,detail:string){
 switch(id){
 case 'curse-lemon-phylactery':return 'Mají všichni hledači stále citron na kůži nebo vnější vrstvě oblečení a zůstal v kontaktu po celou dobu účinku?';
 case 'curse-mediocre-travel-agent':return 'Přinesli hledači získaný suvenýr a neztratili ho před setkáním?';
 case 'curse-egg-partner':return 'Přinesli hledači nepoškozené vejce a neopustili ho od jeho získání?';
 case 'curse-water-weight':return 'Uchovali hledači po získání alespoň 2 litry tekutiny na osobu až do konce kola?';
 case 'curse-endless-tumble':return 'Proběhl úkol bez zasažení jiné osoby kostkou?';
 default:return `Byla dodržena povinnost: ${detail}`;
 }
}
function previousPenalty(s:GameState,curseId:string,effectId:string,seconds:number|null,count:number){return (s.cardState?.penalties??[]).slice(0,count).some(p=>p.curseId===curseId&&(p.effectId===effectId||!p.effectId&&p.seconds===seconds));}
/** Historical exports did not store noEffect; reconstruct it from the casting roll audit. */
function castingHadNoEffect(s:GameState,c:Curse){return (cardDefinition(s,c.cardId).mechanics?.castingCost??[]).some(cost=>cost.kind==='roll'&&cost.noEffectWhen&&(s.cardState?.rolls??[]).some(r=>r.usedBy===c.id&&r.actor==='hider'&&r.values.length===cost.count&&rollPassed(r.values,cost.noEffectWhen!)));}
/** Only applied effects, never curses merely held or cancelled during casting. */
export function settlementChecks(s:GameState,penaltyCount=s.cardState?.penalties.length??0):SettlementCheck[]{
 return s.curses.flatMap(c=>{
  if(c.state==='casting'||castingHadNoEffect(s,c))return [];
  return (c.effects??[]).flatMap((e,i)=>{
   if(e.spec.kind!=='round_obligation')return [];
   const id=cardDefinition(s,c.cardId).id,already=previousPenalty(s,c.id,e.id,e.spec.penaltySeconds,penaltyCount);
   return [{id:e.id,curseId:c.id,effectId:e.id,effectIndex:i,cardDefinitionId:id,curseName:c.name,question:questionFor(id,e.spec.text),detail:e.spec.text,penaltySeconds:e.spec.penaltySeconds,alreadyAwarded:already,wasWaiting:e.state==='waiting_task',answer:already?'violated' as const:null}];
  });
 });
}
function resultFor(s:GameState):RoundResult {
 const m=s.match!,end=s.roundEnd!,score=scoreGame(s);
 check(end.status==='settling'||end.status==='finalized','Nečeká závěrečné vyhodnocení.');
 check(!score.penaltyUnknown,'Výši jednoho bonusu z prokletí nelze určit; konečné skóre se neodhaduje.');
 return {gameId:s.id,round:m.round,hiderTeamId:m.roleTeams.hider,hunterTeamId:m.roleTeams.hunter,releaseId:s.releaseId,rulesId:s.rules.id,...(s.rules.size?{size:s.rules.size}:{}),startedAt:s.startedAt,foundAt:end.reportedAt,confirmedAt:end.respondedAt!,finalizedAt:end.finalizedAt??s.now,wallMs:score.baseMs,pausedMs:score.pausedMs??0,elapsedMs:score.baseMs-(score.pausedMs??0),cardBonusMs:score.bonusSeconds*1000,curseBonusMs:(score.penaltySeconds??0)*1000,totalMs:score.totalMs,cards:s.hand.flatMap(instanceId=>{const d=cardDefinition(s,instanceId);return d.effect==='bonus'?[{instanceId,definitionId:d.id,name:d.name,seconds:d.value??0}]:[];}),checks:structuredClone(end.checks),unclaimedRewards:s.rewards.filter(r=>r.state!=='claimed').length};
}
function nextRound(s:GameState,at:number):GameState {
 const m=structuredClone(s.match!),rules=structuredClone(s.rules);rules.uxVersion=1;m.round=2;m.roleTeams={hunter:m.roleTeams.hider,hider:m.roleTeams.hunter};
 const consent=rules.deductionConsent;if(consent)rules.deductionConsent={...consent,hunter:consent.hider,hider:consent.hunter};
 const options={id:`${m.id}:round:2`,releaseId:s.releaseId,now:at,seed:(s.seed^0x9e3779b9)>>>0||1,rules,mode:s.mode};
 const fresh=consent?createGame(options):createLobbyGame(options);
 if(consent)fresh.lobby={choices:{hunter:consent.hider,hider:consent.hunter},ready:{hunter:true,hider:true},startedAt:at};
 fresh.match=m;syncPlayers(fresh);
 // Teams keep their own observations. Never restamp an old fix as fresh.
 fresh.fixes={...(s.fixes.hunter?{hider:structuredClone(s.fixes.hunter)}:{}),...(s.fixes.hider?{hunter:structuredClone(s.fixes.hider)}:{})};
 fresh.processedCommands=[...s.processedCommands];emit(fresh,'roles_swapped',`Druhé kolo: schovává se ${fresh.players.hider.name}, hledá ${fresh.players.hunter.name}.`);return fresh;
}
export function matchCommand(s:GameState,c:Command,actor:Role|'clock',at:number):GameState|null {
 if(!['set_team_name','report_found','respond_found','answer_settlement_check','finalize_round','next_round'].includes(c.type))return null;
 check(actor!=='clock','Časovač nemůže rozhodovat za tým.');
 if(!s.match)initializeMatch(s);const m=s.match!,teamId=m.roleTeams[actor];
 if(c.type==='set_team_name'){
  check(m.round===1&&['awaiting_map_consent','awaiting_ready'].includes(s.phase)&&!s.lobby?.ready[actor],'Jméno týmu lze zvolit před potvrzením připravenosti v prvním kole.');
  const name=normalizeTeamName(c.name);check([...name].length>=1&&[...name].length<=40&&!/[\p{Cc}]/u.test(name),'Jméno týmu musí mít 1 až 40 znaků.');
  check(!m.teams.some(t=>t.id!==teamId&&t.name.toLocaleLowerCase('cs')===name.toLocaleLowerCase('cs')),'Týmy musí mít různá jména.');
  m.teams.find(t=>t.id===teamId)!.name=name;syncPlayers(s);
 }else if(c.type==='report_found'){
  check(actor==='hunter','Nalezení hlásí hledači.');if(s.roundEnd?.status==='pending')return s;
  check(s.phase==='seeking'&&s.station&&(!s.cardState?.move||s.cardState.move.stage==='completed'),'Nalezení lze oznámit během hledání po dokončení Move.');
  for(const curse of s.curses)if(curse.state!=='casting'&&curse.effects?.length&&curse.noEffect===undefined)curse.noEffect=castingHadNoEffect(s,curse);
  const count=s.cardState?.penalties.length??0;
  s.roundEnd={id:`${s.id}:found:${++s.sequence}`,reportedAt:s.now,reportedBy:teamId,status:'pending',penaltyCountAtReport:count,checks:settlementChecks(s,count)};s.phase='awaiting_capture_confirmation';emit(s,'found_reported',`${s.players.hunter.name}: Našli jsme tě. Čeká se na potvrzení týmu ${s.players.hider.name}.`);
 }else if(c.type==='respond_found'){
  check(actor==='hider'&&s.roundEnd?.id===c.claimId,'Nalezení potvrzuje schovaný u aktuálního oznámení.');
  if(c.accepted&&['settling','finalized'].includes(s.roundEnd.status))return s;
  if(!c.accepted&&s.roundEnd.status==='rejected')return s;
  check(s.roundEnd.status==='pending'&&s.phase==='awaiting_capture_confirmation','Oznámení již bylo vyřešeno.');
  s.roundEnd.respondedAt=s.now;s.roundEnd.status=c.accepted?'settling':'rejected';s.phase=c.accepted?'settling':'seeking';emit(s,c.accepted?'found_confirmed':'found_rejected',c.accepted?'Schovaný potvrdil nalezení. Následuje společná kontrola prokletí.':'Schovaný nepotvrdil nalezení. Hra pokračuje, čekání se započítává.');
 }else if(c.type==='answer_settlement_check'){
  check(actor==='hider'&&s.phase==='settling'&&s.roundEnd?.status==='settling','Kontrolu prokletí zapisuje schovaný po potvrzení nalezení.');
  const item=s.roundEnd.checks.find(i=>i.id===c.checkId);check(item&&['fulfilled','violated','not_applicable'].includes(c.answer),'Neznámá kontrola nebo odpověď.');
  check(!item.alreadyAwarded||c.answer==='violated','Již zaznamenané porušení nelze zrušit závěrečnou kontrolou.');check(c.answer!=='not_applicable'||item.wasWaiting,'Tato povinnost již byla aktivní.');item.answer=c.answer;
 }else if(c.type==='finalize_round'){
  check(actor==='hider'&&c.confirmed,'Konečné vyhodnocení vyžaduje potvrzení schovaného po společné kontrole.');
  if(s.roundEnd?.status==='finalized')return s;
  check(s.phase==='settling'&&s.roundEnd?.status==='settling','Nejprve potvrďte nalezení.');check(s.hand.length<=handLimit(s),'Nejprve zmenšete přebytečnou ruku na povolený limit.');
  check(s.roundEnd.checks.every(i=>i.answer!==null),'Potvrďte všechny podmínky použitých prokletí.');
  check(s.roundEnd.checks.every(i=>i.answer!=='violated'||i.penaltySeconds!==null),'Výši bonusu z prokletí nelze určit; konečný čas se neodhaduje.');
  for(const item of s.roundEnd.checks)if(item.answer==='violated'&&!item.alreadyAwarded){
   const curse=s.curses.find(x=>x.id===item.curseId)!,effect=curse.effects!.find(e=>e.id===item.effectId)!;effect.state='failed';s.cardState!.penalties.push({curseId:curse.id,effectId:effect.id,seconds:item.penaltySeconds,at:s.now,verification:'player_confirmed'});
  }
  s.roundEnd.finalizedAt=s.now;const result=resultFor(s);finishCardEffects(s);s.roundEnd.status='finalized';s.phase='finished';m.results.push(result);emit(s,'round_finalized',`${m.round}. kolo vyhodnoceno. Celkový čas týmu ${s.players.hider.name}: ${result.totalMs} ms.`);
 }else if(c.type==='next_round'){
  check(c.confirmed&&s.phase==='finished'&&s.roundEnd?.status==='finalized'&&m.round===1&&m.results.length===1,'Role lze prohodit po dokončení prvního kola.');
  if(m.nextReady[teamId])return s;m.nextReady[teamId]=true;emit(s,'next_round_ready',`${s.players[actor].name}: připraveno na výměnu rolí.`);
  if(m.nextReady['team-a']&&m.nextReady['team-b'])return nextRound(s,at);
 }
 return s;
}
function stable(value:unknown):string{return JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);}
export function validateMatch(s:GameState){
 const m=s.match;if(!m){check(!s.roundEnd&&!['settling','awaiting_capture_confirmation'].includes(s.phase),'Chybí týmový stav partie.');return;}
 check(m.teams[0].id==='team-a'&&m.teams[1].id==='team-b'&&m.teams.every(t=>t.name===normalizeTeamName(t.name)&&[...t.name].length>0&&[...t.name].length<=40&&!/[\p{Cc}]/u.test(t.name))&&m.teams[0].name.toLocaleLowerCase('cs')!==m.teams[1].name.toLocaleLowerCase('cs'),'Neplatné týmy.');
 check(m.roleTeams.hider===(m.round===1?'team-b':'team-a')&&m.roleTeams.hunter===(m.round===1?'team-a':'team-b'),'Neplatné přiřazení rolí.');
 for(const role of ['hunter','hider'] as const){const team=m.teams.find(t=>t.id===m.roleTeams[role])!;check(s.players[role].id===team.id&&s.players[role].name===team.name,'Role neodpovídá týmu.');}
 check(m.round!==2||m.nextReady['team-a']&&m.nextReady['team-b'],'Druhé kolo vyžaduje připravenost obou týmů.');
 check(m.results.length===(s.phase==='finished'?m.round:m.round-1),'Nesouhlasí počet dokončených kol.');
 if(m.results.length)check(m.id===`${m.results[0].gameId}:match`,'Výsledek odkazuje na jinou partii.');
 if(m.round===2)check(m.results[0].finalizedAt<=s.startedAt,'Druhé kolo začalo před dokončením prvního.');
 check(m.round===1?m.id===`${s.id}:match`:s.id===`${m.id}:round:2`,'Neplatná identita partie nebo kola.');
 for(const [index,r] of m.results.entries()){
  check(r.round===index+1&&r.hiderTeamId===(r.round===1?'team-b':'team-a')&&r.hunterTeamId!==r.hiderTeamId&&r.releaseId===s.releaseId&&r.rulesId===s.rules.id&&r.size===s.rules.size,'Nekonzistentní výsledek týmu.');
  check(r.foundAt>=r.startedAt&&r.confirmedAt>=r.foundAt&&r.finalizedAt>=r.confirmedAt&&r.wallMs===r.foundAt-r.startedAt&&r.elapsedMs===r.wallMs-r.pausedMs&&r.pausedMs<=r.wallMs&&r.totalMs===r.elapsedMs+r.cardBonusMs+r.curseBonusMs,'Nekonzistentní výsledný čas.');
  check(r.cards.reduce((n,c)=>n+c.seconds*1000,0)===r.cardBonusMs&&new Set(r.cards.map(c=>c.instanceId)).size===r.cards.length&&r.cards.every(c=>{const d=s.rules.cards.find(d=>d.id===c.definitionId);return d?.effect==='bonus'&&c.seconds===d.value&&c.instanceId.startsWith(d.id+'@');}),'Neplatný bonus karet.');
  check(r.checks.every(c=>c.answer!==null)&&new Set(r.checks.map(c=>c.id)).size===r.checks.length&&r.checks.every(c=>{const p=s.rules.cards.find(d=>d.id===c.cardDefinitionId)?.mechanics?.effects[c.effectIndex];return p?.kind==='round_obligation'&&p.penaltySeconds===c.penaltySeconds;}),'Neplatný audit prokletí.');
  check(r.checks.reduce((n,c)=>n+(c.answer==='violated'?(c.penaltySeconds??0)*1000:0),0)===r.curseBonusMs,'Nesouhlasí bonusy prokletí.');
 }
 const end=s.roundEnd;if(!end){check(!['finished','settling','awaiting_capture_confirmation'].includes(s.phase),'Chybí vyhodnocení kola.');return;}
 check(end.reportedAt>=s.startedAt&&end.reportedAt<=s.now&&end.reportedBy===m.roleTeams.hunter,'Neplatné oznámení nalezení.');
 check(end.status==='pending'?s.phase==='awaiting_capture_confirmation'&&end.respondedAt===undefined:end.status==='rejected'?s.phase==='seeking'&&end.respondedAt!==undefined:end.status==='settling'?s.phase==='settling'&&end.respondedAt!==undefined:s.phase==='finished'&&end.respondedAt!==undefined&&end.finalizedAt!==undefined,'Neplatná fáze vyhodnocení.');
 check(end.respondedAt===undefined||end.respondedAt>=end.reportedAt&&end.respondedAt<=s.now,'Neplatný čas potvrzení.');
 check(end.status==='finalized'?end.finalizedAt!==undefined&&end.finalizedAt>=end.respondedAt!&&end.finalizedAt<=s.now:end.finalizedAt===undefined,'Neplatný čas uzavření výsledku.');
 if(end.status==='rejected')return;
 const penalties=s.cardState?.penalties??[];check(end.penaltyCountAtReport<=penalties.length,'Chybí zaznamenané bonusy.');
 const expected=settlementChecks(s,end.penaltyCountAtReport);
 check(expected.length===end.checks.length&&expected.every((e,i)=>{const a=end.checks[i];return a&&(end.status==='finalized'||e.wasWaiting===a.wasWaiting)&&stable({...e,wasWaiting:a.wasWaiting,answer:a.answer})===stable(a)&&(!a.alreadyAwarded||a.answer==='violated')&&(a.answer!=='not_applicable'||a.wasWaiting);}),'Kontroly neodpovídají použitým prokletím.');
 const newPenalties=end.status==='finalized'?end.checks.filter(c=>c.answer==='violated'&&!c.alreadyAwarded):[];
 check(penalties.length===end.penaltyCountAtReport+newPenalties.length&&newPenalties.every((c,i)=>{const p=penalties[end.penaltyCountAtReport+i];return p.curseId===c.curseId&&p.effectId===c.effectId&&p.seconds===c.penaltySeconds&&p.at===end.finalizedAt;}),'Bonus byl započten vícekrát nebo nesouhlasí s kontrolou.');
 if(end.status==='finalized')check(stable(resultFor(s))===stable(m.results.at(-1)),'Výsledek neodpovídá uzamčenému kolu.');
}
