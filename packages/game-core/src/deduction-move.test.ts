import {destination} from '@turf/turf';
import {beforeAll,expect,it} from 'vitest';
import {gameFixture} from './test-fixtures';
import {buildScenario} from '../../../apps/simulator/src/scenarios';
import {createGame,deckRules,readGameState,scoreGame,transition,viewForRole,type Command,type Role} from './index';
let f:Awaited<ReturnType<typeof gameFixture>>;beforeAll(async()=>{f=await gameFixture();});
function harness(){
 const rules=deckRules('medium');rules.automaticDeductionMap=true;rules.deductionConsent={hunter:true,hider:true,authority:'simulator'};
 let state=buildScenario('radar-in',f.release,f.env,42,rules),serial=0;
 const send=(actor:Role|'clock',command:Command,at=state.now)=>state=transition(state,{id:`deduc-${++serial}`,at,actor,command},f.env);
 const grant=(id:string)=>{const card=state.drawPile.find(c=>c.startsWith(id+'@'))!;state.drawPile=state.drawPile.filter(c=>c!==card);state.hand.push(card);return card;};
 return {send,grant,get state(){return state;},set state(next){state=next;}};
}
it('requires both explicit consents to enable deduction, forbids a fake live-client agreement, and defaults off',()=>{
 const rules=deckRules('medium');expect(rules.automaticDeductionMap).toBe(false);rules.automaticDeductionMap=true;
 expect(()=>createGame({id:'g',releaseId:f.release.releaseId,now:1000,seed:1,rules})).toThrow('souhlas');rules.deductionConsent={hunter:true,hider:false,authority:'simulator'};
 expect(()=>createGame({id:'g',releaseId:f.release.releaseId,now:1000,seed:1,rules})).toThrow('souhlas');rules.deductionConsent.hider=true;rules.testOnly=false;
 expect(()=>createGame({id:'g',releaseId:f.release.releaseId,now:1000,seed:1,rules,mode:'live'})).toThrow('server');
});
it('stores only public reproducible constraints; reload validates their immutable question provenance',()=>{
 const h=harness();h.send('hider',{type:'answer'});expect(h.state.deductions).toHaveLength(1);expect(readGameState(h.state,f.env)).toEqual(h.state);
 const view=viewForRole(h.state,'hunter',f.env),d=view.deductions![0];expect(d.parameters.hunterPoint).toEqual(h.state.questions[0].hunterFix.point);expect(d).not.toHaveProperty('targetPoint');expect(view).not.toHaveProperty('fixes');expect(view.station).toBeUndefined();expect(viewForRole(h.state,'hider',f.env).deductions).toEqual([]);
 const bad=structuredClone(h.state);bad.deductions![0].parameters.radiusMeters=9999;expect(()=>readGameState(bad,f.env)).toThrow('Dedukce');
 const altered=structuredClone(h.state);altered.rules.deductionConsent!.hider=false;expect(()=>readGameState(altered,f.env)).toThrow('souhlas');
});
it('Move archives deductions, reveals only the origin, pauses a full 20 minutes and preserves history/cards through reload',()=>{
 const h=harness();h.send('hider',{type:'answer'});const origin=h.state.station!,oldEpoch=h.state.epochId,card=h.grant('move');h.grant('bonus-red');h.send('hider',{type:'play_card',cardId:card});
 const move=h.state.cardState!.move!,destination=f.env.stops.find(s=>s.id!==origin.id&&f.env.distance(s.point,origin.point)>1500)!;
 expect(h.state.hand).toEqual([]);expect(h.state.questions).toHaveLength(1);expect(h.state.deductions![0].status).toBe('archived');expect(h.state.epochId).not.toBe(oldEpoch);
 const at=h.state.now+60000;h.send('hider',{type:'location',role:'hider',fix:{point:destination.point,at,accuracy:5}},at);h.send('hider',{type:'complete_move',stopId:destination.id,confirmed:true});
 expect(h.state.station!.id).toBe(origin.id);expect(h.state.cardState!.move!.stage).toBe('moving');expect(scoreGame(h.state).pausedMs).toBe(60000);
 const publicView=viewForRole(h.state,'hunter',f.env);expect(publicView.revealedStations).toEqual([origin]);expect(publicView.move).not.toHaveProperty('selectedStopId');expect(publicView.move).not.toHaveProperty('lastFix');expect(publicView.move).not.toHaveProperty('selectionFix');expect(publicView.move).not.toHaveProperty('destinationId');
 h.state=readGameState(JSON.stringify(h.state),f.env);expect(()=>h.send('hunter',{type:'ask',questionId:'radar:800'})).toThrow('Move');expect(()=>h.send('hunter',{type:'walking',value:true})).toThrow('Move');
 h.send('hider',{type:'location',role:'hider',fix:{point:destination.point,at:move.deadline,accuracy:5}},move.deadline);
 expect(h.state.cardState!.move!.stage).toBe('completed');expect(h.state.station!.id).toBe(destination.id);expect(scoreGame(h.state).pausedMs).toBe(20*60000);expect(h.state.questions).toHaveLength(1);readGameState(h.state,f.env);
 h.send('hunter',{type:'location',role:'hunter',fix:{point:origin.point,at:h.state.now,accuracy:5}});h.send('hunter',{type:'ask',questionId:'radar:800'});h.send('hider',{type:'answer'});expect(h.state.deductions!.filter(d=>d.status==='active')).toHaveLength(1);expect(h.state.deductions!.filter(d=>d.status==='active')[0].epochId).toBe(h.state.epochId);
});
it('Move cannot use a late GPS fix as evidence of the deadline, and never guesses an ambiguous or missing destination',()=>{
 const h=harness();h.send('hider',{type:'answer'});h.send('hider',{type:'play_card',cardId:h.grant('move')});const move=h.state.cardState!.move!,destination=f.env.stops.find(s=>s.id!==move.origin.id)!;
 h.send('hider',{type:'location',role:'hider',fix:{point:destination.point,at:move.deadline+1000,accuracy:5}},move.deadline+1000);
 expect(h.state.cardState!.move!.stage).toBe('needs_destination');expect(h.state.cardState!.move!.candidates).toEqual([]);expect(()=>h.send('hider',{type:'complete_move',stopId:destination.id,confirmed:true})).toThrow('vypršení');
});
it('rejects Move during declared endgame and refuses movement/other actions during an active pause',()=>{
 const h=harness();h.send('hider',{type:'answer'});const card=h.grant('move');h.send('hider',{type:'declare_endgame',confirmed:true});expect(()=>h.send('hider',{type:'play_card',cardId:card})).toThrow('endgame');expect(h.state.hand).toContain(card);
 const g=harness();g.send('hider',{type:'answer'});g.send('hider',{type:'play_card',cardId:g.grant('move')});const p=g.state.fixes.hunter!.point;
 expect(()=>g.send('hunter',{type:'location',role:'hunter',fix:{point:[p[0]+.01,p[1]],at:g.state.now,accuracy:5}})).toThrow('nesmí');g.send('hunter',{type:'location',role:'hunter',fix:{point:[p[0]+.01,p[1]],at:g.state.now,accuracy:5},observation:true});expect(g.state.events.at(-1)?.type).toBe('move_movement_observed');expect(()=>g.send('hunter',{type:'ask',questionId:'radar:800'})).toThrow('Move');expect(()=>g.send('hider',{type:'roll',count:1,condition:'any'})).toThrow('Move');
});

it('Move includes the exact 400m GPS boundary and preserves the same candidate set on reload',()=>{
 const h=harness();h.send('hider',{type:'answer'});h.send('hider',{type:'play_card',cardId:h.grant('move')});const move=h.state.cardState!.move!;
 const candidate=f.env.stops.find(stop=>stop.id!==move.origin.id&&f.env.insideArea(destination(stop.point,400,90,{units:'meters'}).geometry.coordinates as [number,number]))!;
 const point=destination(candidate.point,400,90,{units:'meters'}).geometry.coordinates as [number,number];h.send('hider',{type:'location',role:'hider',fix:{point,at:h.state.now,accuracy:5}});h.send('hider',{type:'complete_move',stopId:candidate.id,confirmed:true});h.send('hider',{type:'location',role:'hider',fix:{point,at:move.deadline,accuracy:5}},move.deadline);expect(h.state.station!.id).toBe(candidate.id);expect(readGameState(h.state,f.env).cardState!.move!.destinationId).toBe(candidate.id);
});
