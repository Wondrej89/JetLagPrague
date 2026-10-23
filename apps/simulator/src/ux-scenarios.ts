import {createLobbyGame,transition,type Command,type GameEnvironment,type GameState,type Role} from '../../../packages/game-core/src/index';
export const UX_SCENARIOS=[
 ['ux-new','UX · nová hra a souhlas na obou telefonech'],['ux-disagree','UX · rozdílná rozhodnutí o mapě'],['ux-map-on','UX · oba souhlasí s mapou'],['ux-ready-one','UX · připravenost jedné role'],['ux-clock-wait','UX · čas čeká na obě role'],['ux-clock-hiding','UX · souběžné časovače během 45 minut'],['ux-clock-seeking','UX · 75 minut bez resetu časomíry'],['ux-blocked','UX · blokující prokletí'],['ux-navigation','UX · kořen spodní navigace'],['ux-reward','UX · odměna nahoře'],['ux-reward-badge','UX · badge nedokončeného dobírání'],
 ['hangman-letter','Hangman · správné písmeno'],['hangman-seven','Hangman · sedm chyb'],['hangman-cooldown','Hangman · desetiminutové čekání'],['hangman-new-word','Hangman · nové slovo po prohře'],['hangman-won','Hangman · výhra hledačů'],['hangman-three','Hangman · třetí prohra a poslední cooldown'],['hangman-private','Hangman · soukromé slovo pouze u schovaného'],['hangman-reload','Hangman · stav pro obnovení stránky'],['hangman-manual','Hangman · manuální reakce a limit 30 sekund'],
] as const;
export function uxScenario(id:string,env:GameEnvironment,buildBase:(id:string)=>GameState):GameState|null{
 if(!UX_SCENARIOS.some(([key])=>key===id))return null;
 let s=buildBase('deck-100'),serial=0;
 const send=(actor:Role|'clock',command:Command,at=s.now)=>s=transition(s,{id:`ux-scenario-${++serial}`,at,actor,command},env);
 const advance=(ms:number)=>{const at=s.now+ms;for(const role of ['hider','hunter'] as const){const fix=s.fixes[role];if(fix)send(role,{type:'location',role,fix:{...fix,at}},at);}send('clock',{type:'tick'},at);};
 if(['ux-new','ux-disagree','ux-map-on','ux-ready-one','ux-clock-wait','ux-clock-hiding','ux-clock-seeking'].includes(id)){
  const base=s;s=createLobbyGame({id:`${base.id}:${id}`,releaseId:base.releaseId,rules:base.rules,now:base.now,seed:base.seed});s.fixes=base.fixes;
  if(id==='ux-new')return s;
  send('hunter',{type:'map_consent',enabled:true});send('hider',{type:'map_consent',enabled:id!=='ux-disagree'});
  if(['ux-disagree','ux-map-on'].includes(id))return s;
  send('hunter',{type:'ready'});if(['ux-ready-one','ux-clock-wait'].includes(id))return s;
  send('hider',{type:'ready'});if(id==='ux-clock-hiding')advance(18*60000+35000);
  else{send('hider',{type:'select_station',stopId:base.station!.id});advance(45*60000);advance(30*60000);}return s;
 }
 if(id==='ux-navigation')return s;
 if(id==='ux-reward'||id==='ux-reward-badge'){
  send('hunter',{type:'ask',questionId:'matching:zoo'});send('hider',{type:'answer'});if(id==='ux-reward-badge')send('hider',{type:'draw_reward',rewardId:s.rewards[0].id});return s;
 }
 const grant=(name:string)=>{const card=s.drawPile.find(c=>c.startsWith(name+'@'));if(!card)throw new Error('Chybí karta scénáře.');s.drawPile=s.drawPile.filter(c=>c!==card);s.hand.push(card);return card;};
 if(id==='hangman-manual')s.rules.manualHangmanResponses=true;
 const card=grant('curse-hidden-hangman'),cost=[grant('bonus-red'),grant('bonus-orange')];
 send('hider',{type:'begin_cast',cardId:card});send('hider',{type:'confirm_cast',curseId:s.curses.at(-1)!.id,proof:{discardIds:cost}});const curseId=s.curses.at(-1)!.id;
 if(id==='ux-blocked')return s;
 const word=()=>send('hider',{type:'set_hangman_word',curseId,word:'ŘÍČNÍ',manuallyConfirmed:true});
 const guess=(letter:string)=>send('hunter',{type:'guess_letter',curseId,letter});
 const lose=()=>{for(const letter of ['A','B','D','E','F','G','H'])guess(letter);};
 word();
 if(['hangman-letter','hangman-reload'].includes(id))guess('Í');
 if(['hangman-seven','hangman-cooldown','hangman-new-word','hangman-three'].includes(id)){lose();if(id==='hangman-cooldown')advance(5*60000);if(id==='hangman-new-word')advance(10*60000);if(id==='hangman-three')for(let i=0;i<2;i++){advance(10*60000);word();lose();}}
 if(id==='hangman-won')for(const l of ['Ř','Í','Č','N'])guess(l);
 if(id==='hangman-manual')guess('Í');return s;
}
