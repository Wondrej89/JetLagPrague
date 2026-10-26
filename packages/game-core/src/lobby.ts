import {initializeMatch} from './match';
import {createGame} from './engine';
import type {Command,GameState,Role} from './types';
/** A new party starts here. createGame retains the historical/scenario API. */
export function createLobbyGame(options:Parameters<typeof createGame>[0]):GameState {
 if(options.mode==='live')throw new Error('Úvod ostré hry vyžaduje autorizovaný serverový transport.');
 const rules={...structuredClone(options.rules),uxVersion:1 as const,automaticDeductionMap:false};delete rules.deductionConsent;
 const s=createGame({...options,rules});initializeMatch(s);s.phase='awaiting_map_consent';s.lobby={choices:{},ready:{hunter:false,hider:false}};s.events=[];s.sequence=0;return s;
}
export const awaitingStart=(s:Pick<GameState,'phase'>)=>s.phase==='awaiting_map_consent'||s.phase==='awaiting_ready';
export function lobbyCommand(s:GameState,c:Command,actor:Role|'clock'):boolean {
 if(c.type==='acknowledge_notice'){
  if(actor==='clock'||!s.events.some(e=>e.id===c.eventId&&(e.audience==='all'||e.audience===actor)))throw new Error('Upozornění není pro tuto roli dostupné.');
  const ids=(s.noticeAcknowledgements??={})[actor]??=[];if(!ids.includes(c.eventId))ids.push(c.eventId);return true;
 }
 if(c.type!=='map_consent'&&c.type!=='ready')return false;
 if(actor==='clock'||!s.lobby)throw new Error('Partie nemá úvodní proces.');
 if(c.type==='map_consent'){
  if(s.lobby.choices[actor]===c.enabled)return true;
  if(s.phase!=='awaiting_map_consent'||s.lobby.choices[actor]!==undefined)throw new Error('Souhlas je již uložen; během partie jej nelze měnit.');
  s.lobby.choices[actor]=c.enabled;
  if(s.lobby.choices.hunter!==undefined&&s.lobby.choices.hider!==undefined){
   s.rules.automaticDeductionMap=s.lobby.choices.hunter&&s.lobby.choices.hider;
   s.rules.deductionConsent={hunter:s.lobby.choices.hunter,hider:s.lobby.choices.hider,authority:'simulator'};s.phase='awaiting_ready';
  }
 }else{
  if(s.lobby.ready[actor])return true;
  if(s.phase!=='awaiting_ready')throw new Error('Nejprve musí obě role rozhodnout o mapě.');
  s.lobby.ready[actor]=true;
  if(s.lobby.ready.hunter&&s.lobby.ready.hider){s.startedAt=s.now;s.hideDeadline=s.now+s.rules.hideMs;s.lobby.startedAt=s.now;s.phase='hiding';s.events.push({id:`${s.id}:event:${++s.sequence}`,at:s.now,type:'started',audience:'all',text:'Obě role jsou připravené. Začíná celkový čas hry a 45 minut na výběr stanoviště.'});}
 }
 return true;
}
