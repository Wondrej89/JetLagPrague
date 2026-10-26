import {beforeAll,describe,expect,it,vi} from 'vitest';
import {createGame,createLobbyGame,deckRules,readGameState,scoreGame,transition,viewForRole,type CastingProof,type Command,type GameState,type Role} from './index';
import {gameFixture} from './test-fixtures';
import {LocalGameSession} from '../../game-ui/src/runtime';
import {buildScenario} from '../../../apps/simulator/src/scenarios';
import {MATCH_SCENARIOS} from '../../../apps/simulator/src/match-scenarios';
let f:Awaited<ReturnType<typeof gameFixture>>;beforeAll(async()=>{f=await gameFixture();});
function harness(lobby=true){
 let state=(lobby?createLobbyGame:createGame)({id:'two-teams',releaseId:f.env.releaseId,now:f.now,seed:42,rules:deckRules('small')}),serial=0;
 const send=(actor:Role|'clock',command:Command,at=state.now)=>state=transition(state,{id:`match-test-${++serial}`,actor,at,command},f.env);
 const locate=(role:Role)=>send(role,{type:'location',role,fix:{point:f.station.point,at:state.now,accuracy:5}});
 const grant=(name:string)=>{const card=state.drawPile.find(c=>c.startsWith(name+'@'))!;if(!card)throw new Error('Missing card');state.drawPile=state.drawPile.filter(c=>c!==card);state.hand.push(card);return card;};
 const start=()=>{if(state.lobby){for(const role of ['hunter','hider'] as const)send(role,{type:'map_consent',enabled:role==='hunter'});send('hunter',{type:'ready'});send('hider',{type:'ready'});}locate('hider');locate('hunter');send('hider',{type:'lock_station',stopId:f.station.id});};
 const cast=(name:string,roll=1)=>{
  const definition=state.rules.cards.find(c=>c.id===name)!,proof:CastingProof={discardIds:[],confirmations:[],rollIds:{}};
  if(name==='curse-water-weight'){const p=f.release.data.pois.find(p=>p.category==='waterbody')!.point;send('hunter',{type:'location',role:'hunter',fix:{point:p,at:state.now,accuracy:5}});}
  send('hunter',{type:'walking',value:true});const card=grant(name);
  for(const cost of definition.mechanics!.castingCost??[])if(cost.kind==='discard')for(let i=0;i<cost.count;i++)proof.discardIds!.push(grant(cost.cardType==='powerup'?'veto':'bonus-red'));
  send('hider',{type:'begin_cast',cardId:card,setup:{targetPoint:state.fixes.hunter!.point}});const id=state.curses.at(-1)!.id;
  for(const cost of definition.mechanics!.castingCost??[]){if(cost.kind==='roll'){send('hider',{type:'roll',count:cost.count,condition:cost.condition,manualValues:[roll]});proof.rollIds![cost.id]=state.cardState!.rolls.at(-1)!.id;}else if('text' in cost&&cost.kind!=='geography')proof.confirmations!.push(cost.id);}
  send('hider',{type:'confirm_cast',curseId:id,proof});return state.curses.at(-1)!;
 };
 const found=()=>{send('hunter',{type:'report_found'});return state.roundEnd!.id;};
 const review=()=>{const claimId=found();send('hider',{type:'respond_found',claimId,accepted:true});};
 const finalize=()=>send('hider',{type:'finalize_round',confirmed:true});
 const reload=()=>state=readGameState(JSON.stringify(state),f.env);
 return {send,locate,grant,start,cast,found,review,finalize,reload,get state(){return state;},set state(s:GameState){state=s;}};
}
describe('stable two-person teams and two-round match',()=>{
 it('stores two named teams with one active phone each before readiness and preserves old API',()=>{
  const h=harness();h.send('hunter',{type:'set_team_name',name:'  Říční   tým  '});h.send('hider',{type:'set_team_name',name:'Pražské lišky'});expect(h.state.match!.teams.map(t=>t.name)).toEqual(['Říční tým','Pražské lišky']);expect(h.state.match!.teams.every(t=>t.members===2&&t.activePhones===1)).toBe(true);h.reload();h.start();expect(()=>h.send('hider',{type:'set_team_name',name:'jiný'})).toThrow();expect(harness(false).state.match).toBeUndefined();
 });
 it('rejects duplicate, empty, excessive and control-character names without mutation',()=>{
  const h=harness(),before=structuredClone(h.state);for(const name of [' ','Tým 2','x'.repeat(41),'a\u0000b'])expect(()=>h.send('hunter',{type:'set_team_name',name})).toThrow();expect(h.state).toEqual(before);h.send('hunter',{type:'map_consent',enabled:true});h.send('hider',{type:'map_consent',enabled:true});h.send('hunter',{type:'ready'});expect(()=>h.send('hunter',{type:'set_team_name',name:'Pozdě'})).toThrow();
 });
 it('freezes at the hunters report, requires hider confirmation and final review, and survives each reload',()=>{
  const h=harness();h.start();h.grant('bonus-red');h.send('clock',{type:'tick'},h.state.now+123456);const claimId=h.found(),cut=scoreGame(h.state);h.reload();expect(h.state.phase).toBe('awaiting_capture_confirmation');expect(()=>h.send('hunter',{type:'respond_found',claimId,accepted:true})).toThrow('Role');expect(()=>h.send('hider',{type:'finalize_round',confirmed:true})).toThrow();expect(()=>h.send('hider',{type:'finish'})).toThrow();h.send('clock',{type:'tick'},h.state.now+600000);expect(scoreGame(h.state)).toEqual(cut);h.send('hider',{type:'respond_found',claimId,accepted:true});h.reload();h.send('clock',{type:'tick'},h.state.now+600000);h.finalize();const r=h.state.match!.results[0];expect(r.elapsedMs).toBe(123456);expect(r.cardBonusMs).toBe(120000);expect(r.totalMs).toBe(243456);h.reload();h.send('hider',{type:'finalize_round',confirmed:true},h.state.now+60000);expect(h.state.match!.results).toHaveLength(1);expect(scoreGame(h.state)).toEqual(cut);h.reload();
 });
 it('rejected claims restore the full waiting time and can be reported again without stale replies',()=>{
  const h=harness();h.start();const first=h.found();h.send('hider',{type:'respond_found',claimId:first,accepted:false},h.state.now+50000);expect(scoreGame(h.state).baseMs).toBe(50000);h.reload();const second=h.found();expect(second).not.toBe(first);expect(()=>h.send('hider',{type:'respond_found',claimId:first,accepted:true})).toThrow();h.send('hider',{type:'respond_found',claimId:second,accepted:true});h.finalize();expect(h.state.match!.results[0].elapsedMs).toBe(50000);h.reload();
 });
 it('repeated reports and identical command envelopes never count twice',()=>{
  const h=harness();h.start();const first=h.found();h.send('hunter',{type:'report_found'},h.state.now+10000);expect(h.state.roundEnd!.id).toBe(first);h.send('hider',{type:'respond_found',claimId:first,accepted:true});const c={id:'finalize-once',at:h.state.now,actor:'hider' as const,command:{type:'finalize_round' as const,confirmed:true}};h.state=transition(h.state,c,f.env);expect(transition(h.state,c,f.env)).toBe(h.state);h.reload();
 });
 it('requires both teams for role swap, resets private game state, preserves results, rules, fixes and command idempotency',()=>{
  const h=harness();h.send('hunter',{type:'set_team_name',name:'Sovy'});h.send('hider',{type:'set_team_name',name:'Lišky'});h.start();h.grant('bonus-red');h.grant('veto');h.send('hunter',{type:'ask',questionId:'radar:800'});h.send('hider',{type:'answer'});h.send('clock',{type:'tick'},h.state.now+600000);h.review();h.finalize();const old=structuredClone(h.state);h.send('hunter',{type:'next_round',confirmed:true});h.reload();expect(h.state.id).toBe(old.id);h.send('hider',{type:'next_round',confirmed:true},h.state.now+1000);expect(h.state.phase).toBe('hiding');expect(h.state.match!.round).toBe(2);expect(h.state.players.hider.name).toBe('Sovy');expect(h.state.players.hunter.name).toBe('Lišky');expect(h.state.match!.results).toEqual(old.match!.results);expect(h.state.rules.deductionConsent).toEqual({hunter:false,hider:true,authority:'simulator'});expect(h.state.rules.size).toBe(old.rules.size);expect(h.state.releaseId).toBe(old.releaseId);expect(h.state.fixes.hider).toEqual(old.fixes.hunter);expect(h.state.fixes.hunter).toEqual(old.fixes.hider);expect(h.state.processedCommands).toEqual(expect.arrayContaining(old.processedCommands));expect(h.state.epochId).not.toBe(old.epochId);expect(h.state.station).toBeNull();for(const key of ['hand','questions','rewards','curses','effects','deductions'] as const)expect(h.state[key]).toEqual([]);expect(h.state.cardState!.penalties).toEqual([]);expect(h.state.drawPile).toHaveLength(100);h.reload();
 });
 it.each([['higher',90000,'team-a'],['lower',30000,'team-b'],['tie',60000,'tie']] as const)('compares both teams after the second round: %s',(label,second,winner)=>{
  const h=harness();h.start();h.send('clock',{type:'tick'},h.state.now+60000);h.review();h.finalize();h.send('hider',{type:'next_round',confirmed:true});h.send('hunter',{type:'next_round',confirmed:true});h.locate('hider');h.send('hider',{type:'lock_station',stopId:f.station.id});h.send('clock',{type:'tick'},h.state.now+second);h.review();h.finalize();h.reload();for(const role of ['hunter','hider'] as const)expect(viewForRole(h.state,role,f.env).match!.winner).toBe(winner);expect(()=>h.send('hunter',{type:'next_round',confirmed:true})).toThrow();expect(h.state.match!.results).toHaveLength(2);
 });
 it('legacy scenarios adopt teams without losing state and require consent if their old rules have none',()=>{
  const h=harness(false);h.start();h.review();h.finalize();h.reload();h.send('hunter',{type:'next_round',confirmed:true});h.send('hider',{type:'next_round',confirmed:true});expect(h.state.phase).toBe('awaiting_map_consent');h.reload();
 });
 it('team-bound transports change role and private data atomically without changing phones',async()=>{
  const h=harness();h.start();h.review();h.finalize();const save=vi.fn(),s=new LocalGameSession(h.state,f.env,save),a=s.teamTransport('team-a'),b=s.teamTransport('team-b'),notify=vi.fn();a.subscribe(notify);expect(a.getView().role).toBe('hunter');expect(b.getView().station).toBeTruthy();await a.send({type:'next_round',confirmed:true});await b.send({type:'next_round',confirmed:true});expect(a.getView().role).toBe('hider');expect(b.getView().role).toBe('hunter');expect(a.getView().ownFix).toEqual(h.state.fixes.hunter);expect(b.getView()).not.toHaveProperty('station');expect(b.getView()).not.toHaveProperty('hand');expect(b.getView()).not.toHaveProperty('hunterLocation');await expect(b.send({type:'lock_station',stopId:f.station.id})).rejects.toThrow('Role');expect(notify).toHaveBeenCalledTimes(2);expect(save).toHaveBeenCalledTimes(2);readGameState(s.state,f.env);
 });
});
describe('settlement of applied bonus-bearing curses',()=>{
 it.each(['curse-lemon-phylactery','curse-egg-partner','curse-water-weight'])('%s records an actual violation once and keeps an auditable final score',id=>{
  const h=harness();h.start();const c=h.cast(id);h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![0].id,confirmed:true});h.grant('bonus-orange');h.review();expect(h.state.roundEnd!.checks).toHaveLength(1);const check=h.state.roundEnd!.checks[0];expect(check.wasWaiting).toBe(false);expect(()=>h.send('hider',{type:'answer_settlement_check',checkId:check.id,answer:'not_applicable'})).toThrow();expect(()=>h.finalize()).toThrow('všechny');h.send('hider',{type:'answer_settlement_check',checkId:check.id,answer:'violated'});h.reload();h.finalize();expect(h.state.match!.results[0]).toMatchObject({curseBonusMs:1800000,cardBonusMs:240000,totalMs:2040000});expect(h.state.cardState!.penalties).toHaveLength(1);h.reload();h.finalize();expect(h.state.cardState!.penalties).toHaveLength(1);
 });
 it('already reported violations are locked and not added a second time, including historical penalties without effectId',()=>{
  for(const legacy of [false,true]){const h=harness();h.start();const c=h.cast('curse-water-weight');h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![0].id,confirmed:true});h.send('hunter',{type:'violate_curse',curseId:c.id,effectId:c.effects![1].id,confirmed:true});if(legacy)delete h.state.cardState!.penalties[0].effectId;h.review();const check=h.state.roundEnd!.checks[0];expect(check).toMatchObject({alreadyAwarded:true,answer:'violated'});expect(()=>h.send('hider',{type:'answer_settlement_check',checkId:check.id,answer:'fulfilled'})).toThrow();h.finalize();h.reload();expect(h.state.cardState!.penalties).toHaveLength(1);expect(h.state.match!.results[0].curseBonusMs).toBe(1800000);}
 });
 it('offers explicit not-started for waiting objects and does not invent a loss bonus',()=>{
  const h=harness();h.start();h.cast('curse-mediocre-travel-agent');h.review();const c=h.state.roundEnd!.checks[0];expect(c.wasWaiting).toBe(true);expect(c.question).toContain('suvenýr');h.send('hider',{type:'answer_settlement_check',checkId:c.id,answer:'not_applicable'});h.finalize();h.reload();expect(h.state.match!.results[0].curseBonusMs).toBe(0);
 });
 it('does not count cancelled casts or no-effect rolls but reviews a completed Endless Tumble task even in old exports',()=>{
  const h=harness();h.start();h.cast('curse-endless-tumble',5);delete h.state.curses[0].noEffect;const card=h.grant('curse-lemon-phylactery');h.send('hider',{type:'begin_cast',cardId:card});h.send('hider',{type:'cancel_cast',curseId:h.state.curses.at(-1)!.id});h.review();expect(h.state.roundEnd!.checks).toHaveLength(0);h.finalize();h.reload();
  const g=harness();g.start();const c=g.cast('curse-endless-tumble',1);g.send('hunter',{type:'roll',count:1,condition:'any',manualValues:[5]});g.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![0].id,confirmed:true,rollId:g.state.cardState!.rolls.at(-1)!.id});delete g.state.curses[0].noEffect;g.review();expect(g.state.roundEnd!.checks).toHaveLength(1);g.send('hider',{type:'answer_settlement_check',checkId:g.state.roundEnd!.checks[0].id,answer:'violated'});g.finalize();g.reload();expect(g.state.match!.results[0].curseBonusMs).toBe(600000);
 });
 it('cannot finalize an unknown penalty and never substitutes zero',()=>{
  const h=harness();h.state=buildScenario('curse-water',f.release,f.env,42,deckRules('small'));const c=h.state.curses[0];h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![0].id,confirmed:true});h.review();h.send('hider',{type:'answer_settlement_check',checkId:h.state.roundEnd!.checks[0].id,answer:'violated'});expect(()=>h.finalize()).toThrow('nelze určit');expect(h.state.phase).toBe('settling');h.reload();
 });
 it('prevents late rewards and playing, permits only necessary overflow discards, and excludes powerups from public result',()=>{
  const h=harness();h.start();const veto=h.grant('veto');for(let i=0;i<6;i++)h.grant('bonus-red');h.review();expect(()=>h.send('hider',{type:'play_card',cardId:veto})).toThrow();expect(()=>h.send('hunter',{type:'ask',questionId:'radar:800'})).toThrow();expect(()=>h.finalize()).toThrow('ruku');h.send('hider',{type:'discard_card',cardId:h.state.hand.find(c=>c!==veto)!});expect(()=>h.send('hider',{type:'discard_card',cardId:veto})).toThrow();h.finalize();h.reload();expect(h.state.match!.results[0].cards).toHaveLength(5);const view=viewForRole(h.state,'hunter',f.env);expect(view).not.toHaveProperty('hand');expect(view.match!.results[0].cards.every(c=>c.definitionId==='bonus-red')).toBe(true);
 });
 it('freezes Hangman deadlines while confirmation is pending and catches up if rejected',()=>{
  for(const accepted of [false,true]){const h=harness();h.start();h.state.rules.manualHangmanResponses=true;const c=h.cast('curse-hidden-hangman');h.send('hider',{type:'set_hangman_word',curseId:c.id,word:'ŘÍČNÍ',manuallyConfirmed:true});h.send('hunter',{type:'guess_letter',curseId:c.id,letter:'Í'});const claimId=h.found();h.send('clock',{type:'tick'},h.state.now+60000);h.reload();expect(h.state.curses[0].hangman!.pendingResponse).toBeTruthy();h.send('hider',{type:'respond_found',claimId,accepted});if(accepted){h.finalize();expect(h.state.curses[0].hangman!.resolution).toBe('round_ended');}else expect(h.state.curses[0].hangman!.resolution).toBe('response_timeout');h.reload();expect(JSON.stringify(viewForRole(h.state,'hunter',f.env))).not.toContain('ŘÍČNÍ');}
 });
 it('simulator runs pending confirmation time for rejection but never advances during settlement',()=>{
  const h=harness();h.start();h.found();const s=new LocalGameSession(h.state,f.env,()=>{});s.advance(60000);expect(s.state.now).toBe(h.state.now+60000);s.dispatch('hider',{type:'respond_found',claimId:s.state.roundEnd!.id,accepted:true});const before=s.state;s.advance(60000);expect(s.state).toBe(before);readGameState(s.state,f.env);
 });
 it('capture is blocked throughout Move and a completed relocation is subtracted from the final score',()=>{
  const h=harness(),rules=deckRules('small');rules.automaticDeductionMap=true;rules.deductionConsent={hunter:true,hider:true,authority:'simulator'};h.state=buildScenario('move-reload',f.release,f.env,42,rules);expect(()=>h.found()).toThrow('Move');const session=new LocalGameSession(h.state,f.env,()=>{});session.advance(20*60000);h.state=session.state;expect(h.state.cardState!.move!.stage).toBe('completed');h.send('clock',{type:'tick'},h.state.now+60000);h.review();h.finalize();h.reload();const r=h.state.match!.results[0];expect(r.pausedMs).toBe(20*60000);expect(r.elapsedMs).toBe(r.wallMs-r.pausedMs);expect(r.totalMs).toBe(r.elapsedMs);
 });
 it('rejects corrupted names, result arithmetic, checks, duplicate penalties and changed round identity',()=>{
  const h=harness();h.start();h.cast('curse-lemon-phylactery');h.review();h.send('hider',{type:'answer_settlement_check',checkId:h.state.roundEnd!.checks[0].id,answer:'violated'});h.finalize();h.reload();const corruptions:((s:GameState)=>void)[]=[s=>{s.match!.teams[0].name='';},s=>{s.match!.results[0].totalMs++;},s=>{s.roundEnd!.checks=[];},s=>{s.cardState!.penalties.push(s.cardState!.penalties[0]);},s=>{s.match!.roleTeams.hider='team-a';},s=>{s.match!.id='other-match';}];for(const corrupt of corruptions){const bad=structuredClone(h.state);corrupt(bad);expect(()=>readGameState(bad,f.env)).toThrow();}
 });
});
for(const [id] of MATCH_SCENARIOS)it(`actual simulator scenario ${id} validates and never exposes hider GPS`,()=>{
 const s=buildScenario(id,f.release,f.env,42,deckRules('small'));readGameState(s,f.env);const hunter=viewForRole(s,'hunter',f.env);expect(hunter).not.toHaveProperty('station');expect(hunter).not.toHaveProperty('hand');if(id==='match-review')expect(s.roundEnd!.checks).toHaveLength(4);
});
