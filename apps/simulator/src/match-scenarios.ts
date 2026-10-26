import {createLobbyGame,transition,type CastingProof,type Command,type GameEnvironment,type GameState,type Role} from '../../../packages/game-core/src/index';
import type {GameDataRelease} from '../../../packages/geo-core/src/index';
export const MATCH_SCENARIOS=[['match-seeking','Dva týmy · před nalezením'],['match-found','Dva týmy · čekání na potvrzení nalezení'],['match-review','Dva týmy · kontrola citronu, suvenýru, vejce a vody']] as const;
export function matchScenario(id:string,release:GameDataRelease,env:GameEnvironment,base:()=>GameState):GameState|null {
 if(!MATCH_SCENARIOS.some(([key])=>key===id))return null;
 const b=base();let s=createLobbyGame({id:`${b.id}:${id}`,releaseId:b.releaseId,rules:b.rules,now:b.now,seed:b.seed}),serial=0;
 const send=(actor:Role|'clock',command:Command,at=s.now)=>s=transition(s,{id:`match-scenario-${++serial}`,at,actor,command},env);
 for(const [role,name] of [['hunter','Vltavští běžci'],['hider','Pražské lišky']] as const){send(role,{type:'set_team_name',name});send(role,{type:'map_consent',enabled:true});}
 send('hunter',{type:'ready'});send('hider',{type:'ready'});
 for(const role of ['hunter','hider'] as const)send(role,{type:'location',role,fix:{...b.fixes[role]!,at:s.now}});
 send('hider',{type:'select_station',stopId:b.station!.id});
 const at=s.now+45*60000;for(const role of ['hider','hunter'] as const)send(role,{type:'location',role,fix:{...s.fixes[role]!,at}},at);
 send('clock',{type:'tick'},at+15*60000);
 // These scenarios use real card costs and the same commands as the phones.
 const grant=(name:string)=>{const card=s.drawPile.find(c=>c.startsWith(name+'@'))!;s.drawPile=s.drawPile.filter(c=>c!==card);s.hand.push(card);return card;};
 for(const role of ['hunter','hider'] as const)send(role,{type:'location',role,fix:{...s.fixes[role]!,at:s.now}});
 const water=release.data.pois.find(p=>p.category==='waterbody');if(!water)throw new Error('Scénář vyžaduje publikovanou vodní plochu.');
 send('hunter',{type:'location',role:'hunter',fix:{point:water.point,at:s.now,accuracy:5}});
 send('hunter',{type:'walking',value:true});
 for(const id of ['curse-water-weight','curse-lemon-phylactery','curse-egg-partner','curse-mediocre-travel-agent']){
  const card=grant(id),definition=s.rules.cards.find(c=>c.id===id)!,proof:CastingProof={discardIds:[],confirmations:[]};
  for(const cost of definition.mechanics!.castingCost??[]){if(cost.kind==='discard')for(let i=0;i<cost.count;i++)proof.discardIds!.push(grant(cost.cardType==='powerup'?'veto':'bonus-red'));else if('text' in cost&&cost.kind!=='geography')proof.confirmations!.push(cost.id);}
  send('hider',{type:'begin_cast',cardId:card,setup:{targetPoint:s.fixes.hunter!.point}});const curse=s.curses.at(-1)!;
  send('hider',{type:'confirm_cast',curseId:curse.id,proof});
  // Water, lemon and egg have acquired their objects; the vacation task remains
  // pending to exercise the explicit 'obligation has not started' choice.
  if(id!=='curse-mediocre-travel-agent')send('hunter',{type:'complete_curse_task',curseId:curse.id,effectId:s.curses.at(-1)!.effects![0].id,confirmed:true});
 }
 grant('bonus-red');grant('bonus-orange');
 if(id==='match-seeking')return s;
 send('hunter',{type:'report_found'});
 if(id==='match-review')send('hider',{type:'respond_found',claimId:s.roundEnd!.id,accepted:true});
 return s;
}
