import { beforeAll, describe, expect, it } from 'vitest';
import { createGame, deckRules, transition, readGameState, viewForRole, handLimit, scoreGame, type Command, type GameRules, type GameState, type Role } from './index';
import { gameFixture } from './test-fixtures';
import { buildScenario } from '../../../apps/simulator/src/scenarios';
let f:Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async()=>{f=await gameFixture();});
function harness(rules:GameRules=deckRules('small')) {
 let state=createGame({id:'cards-test',releaseId:f.release.releaseId,now:f.now,seed:197,rules}),sequence=0;
 const send=(actor:Role|'clock',command:Command,at=state.now)=>state=transition(state,{id:`command-${++sequence}`,actor,command,at},f.env);
 for(const role of ['hunter','hider'] as const)send(role,{type:'location',role,fix:{point:f.station.point,at:state.now,accuracy:5}});
 send('hider',{type:'lock_station',stopId:f.station.id});
 const grant=(id:string)=>{const card=state.drawPile.find(c=>c.startsWith(id+'@'));if(!card)throw new Error('Missing card '+id);state.drawPile=state.drawPile.filter(c=>c!==card);state.hand.push(card);return card;};
 return {send,grant,get state(){return state;},set state(value:GameState){state=value;}};
}
function mechanism(id:string){const state=buildScenario(id,f.release,f.env,42,deckRules('small')),h=harness(state.rules);h.state=state;return h;}
function cast(h:ReturnType<typeof harness>,id:string){const card=h.grant(id);h.send('hider',{type:'begin_cast',cardId:card});return h.state.curses.at(-1)!.id;}
describe('Versioned 100-card deck',()=>{
 it.each(['small','medium','large'] as const)('%s has exact counts, IDs, instance counts and stable variant values',size=>{
  const r=deckRules(size),s=createGame({id:'composition',releaseId:f.release.releaseId,now:f.now,seed:42,rules:r});
  expect(r.deck).toHaveLength(100);expect(s.drawPile).toHaveLength(100);expect(new Set(s.drawPile).size).toBe(100);
  const counts=Object.fromEntries(r.cards.map(c=>[c.id,r.deck.filter(id=>id===c.id).length]));
  expect(r.cards.filter(c=>c.type==='curse')).toHaveLength(24);expect(new Set(r.cards.map(c=>c.id)).size).toBe(r.cards.length);
  expect(r.deck.filter(id=>r.cards.find(c=>c.id===id)?.type==='time_bonus')).toHaveLength(55);
  expect(r.deck.filter(id=>r.cards.find(c=>c.id===id)?.type==='powerup')).toHaveLength(21);
  expect(Object.values(counts).reduce((a,b)=>a+b,0)).toBe(100);
  expect(counts).toMatchObject({'bonus-red':25,'bonus-orange':15,'bonus-yellow':10,'bonus-green':3,'bonus-blue':2,randomize:4,veto:4,duplicate:2,move:1,'discard-1-draw-2':4,'discard-2-draw-3':4,'draw-1-expand-1':2});
  expect(r.cards.filter(c=>c.type==='curse').every(c=>counts[c.id]===1)).toBe(true);
  expect(r.cards.filter(c=>c.type==='time_bonus').map(c=>c.value)).toEqual(({small:[120,240,360,480,720],medium:[180,360,540,720,1080],large:[300,600,900,1200,1800]})[size]);
  expect(r.deck).toEqual(deckRules('small').deck);expect(readGameState(s,f.env)).toEqual(s);
 });
 it('requires a variant, preserves historical rules without silent migration and rejects a changed variant',()=>{
  expect(()=>deckRules('' as 'small')).toThrow('Vyberte');const old=readGameState(f.state,f.env);expect(old.version).toBe(1);expect(old.rules.id).toBe('prague-mvp-test-v1');expect(old.rules.deck).toHaveLength(56);
  const h=harness();expect(()=>readGameState({...h.state,rules:{...h.state.rules,size:'large'}},f.env)).toThrow('katalog');
 });
 it('has reproducible seeded shuffling and audited manual/seeded rolls',()=>{
  const a=harness(),b=harness();expect(a.state.drawPile).toEqual(b.state.drawPile);
  for(let i=0;i<10;i++){a.send('hunter',{type:'roll',count:2,condition:'even'});b.send('hunter',{type:'roll',count:2,condition:'even'});}
  expect(a.state.cardState!.rolls).toEqual(b.state.cardState!.rolls);a.send('hider',{type:'roll',count:1,condition:'five_or_six',manualValues:[5]});expect(a.state.cardState!.rolls.at(-1)).toMatchObject({source:'manual',passed:true,values:[5]});
  const before=structuredClone(a.state);expect(()=>a.send('hider',{type:'roll',count:2,condition:'any',manualValues:[0,7]})).toThrow('Kostka');expect(a.state).toEqual(before);readGameState(a.state,f.env);
 });
 it('stores all full curse texts and refuses an explicitly incomplete rule without consuming a card',()=>{
  const rules=deckRules('small');expect(rules.cards.filter(c=>c.type==='curse').every(c=>c.mechanics?.fullTextEn&&c.mechanics.fullTextCs&&c.mechanics.castingCost!==null)).toBe(true);
  rules.cards.find(c=>c.id==='curse-water-weight')!.mechanics!.status='incomplete';const h=harness(rules),id=h.grant('curse-water-weight'),before=structuredClone(h.state);
  expect(()=>h.send('hider',{type:'begin_cast',cardId:id})).toThrow('Work in progress');expect(h.state).toEqual(before);
 });
});
describe('Typed powerups, roles and atomic transitions',()=>{
 it('duplicates a selected time bonus with stable provenance and preserves it on reload',()=>{
  const h=harness(deckRules('large')),bonus=h.grant('bonus-blue'),duplicate=h.grant('duplicate');
  expect(()=>h.send('hunter',{type:'play_card',cardId:duplicate,targetCardId:bonus})).toThrow('oprávnění');
  h.send('hider',{type:'play_card',cardId:duplicate,targetCardId:bonus});expect(h.state.hand).toHaveLength(2);expect(h.state.discardPile).toContain(duplicate);expect(h.state.cardState!.copies[0]).toMatchObject({sourceInstanceId:bonus,createdBy:duplicate,definitionId:'bonus-blue'});
  expect(viewForRole(h.state,'hider',f.env).bonusSeconds).toBe(3600);expect(readGameState(JSON.stringify(h.state),f.env)).toEqual(h.state);
  const before=structuredClone(h.state);expect(()=>h.send('hider',{type:'play_card',cardId:duplicate,targetCardId:bonus})).toThrow('ruce');expect(h.state).toEqual(before);
 });
 it.each([['discard-1-draw-2',1,2],['discard-2-draw-3',2,3]] as const)('%s pays exactly the selected cost and draws into hand', (id,count,draw)=>{
  const h=harness(),power=h.grant(id),ids=Array.from({length:count},()=>h.grant('bonus-red')),before=structuredClone(h.state);
  expect(()=>h.send('hider',{type:'play_card',cardId:power,discardIds:[]})).toThrow('Vyberte');expect(h.state).toEqual(before);
  h.send('hider',{type:'play_card',cardId:power,discardIds:ids});expect(h.state.hand).toHaveLength(draw);expect(h.state.discardPile).toEqual([...ids,power]);readGameState(h.state,f.env);
 });
 it('Draw 1 Expand 1 changes hand capacity and persists its effect',()=>{
  const h=harness(),id=h.grant('draw-1-expand-1');h.send('hider',{type:'play_card',cardId:id});expect(h.state.hand).toHaveLength(1);expect(handLimit(h.state)).toBe(7);expect(handLimit(readGameState(h.state,f.env))).toBe(7);
 });
 it('Move pays the entire hand, discloses the origin stop, freezes hunters and subtracts relocation time',()=>{
  const h=mechanism('power-move'),origin=h.state.station!.id,destination=f.env.stops.find(p=>p.id!==origin&&f.env.distance(p.point,h.state.station!.point)>1000)!;
  expect(h.state.hand).toEqual([]);expect(h.state.discardPile.some(id=>id.startsWith('bonus-red@'))).toBe(true);
  expect(viewForRole(h.state,'hunter',f.env).events.some(e=>e.text.includes(h.state.station!.name))).toBe(true);
  expect(h.state.cardState!.move!.deadline-h.state.now).toBe(20*60000);
  expect(()=>h.send('hunter',{type:'ask',questionId:'radar:800'})).toThrow('Move');
  expect(()=>h.send('hunter',{type:'location',role:'hunter',fix:{point:destination.point,at:h.state.now,accuracy:5}})).toThrow('nesmí pohybovat');
  expect(()=>h.send('hider',{type:'complete_move',stopId:destination.id,confirmed:true})).toThrow('GPS');expect(h.state.station!.id).toBe(origin);
  const at=h.state.now+60000;h.send('hider',{type:'location',role:'hider',fix:{point:destination.point,at,accuracy:5}},at);h.send('hider',{type:'complete_move',stopId:destination.id,confirmed:true});expect(h.state.station!.id).toBe(destination.id);expect(scoreGame(h.state).pausedMs).toBe(60000);expect(scoreGame(h.state).totalMs).toBe(0);readGameState(h.state,f.env);
 });
});
describe('Casting costs and concurrent curse lifecycles',()=>{
 it('casts atomically; partial payment consumes neither the card, selected cost, nor confirmation',()=>{
  const h=mechanism('curse-cost'),c=h.state.curses[0],bonus=h.state.hand.find(id=>id.startsWith('bonus-red@'))!,before=structuredClone(h.state);
  expect(viewForRole(h.state,'hunter',f.env).curses).toEqual([]);
  expect(()=>h.send('hider',{type:'confirm_cast',curseId:c.id,proof:{discardIds:[bonus]}})).toThrow('potvrzení');expect(h.state).toEqual(before);
  h.send('hider',{type:'confirm_cast',curseId:c.id,proof:{discardIds:[bonus],confirmations:['physical']}});expect(h.state.hand).toEqual([]);expect(h.state.discardPile).toEqual([bonus,c.cardId]);expect(h.state.curses[0].state).toBe('blocking');
  expect(()=>h.send('hider',{type:'confirm_cast',curseId:c.id,proof:{}})).toThrow('rozpracované');readGameState(h.state,f.env);
 });
 it('requires media for photo cost and task and retains auditable evidence without hidden GPS',()=>{
  const h=mechanism('curse-photo'),c=h.state.curses[0];expect(()=>h.send('hider',{type:'confirm_cast',curseId:c.id,proof:{}})).toThrow('photo');
  h.send('hider',{type:'confirm_cast',curseId:c.id,proof:{media:{photo:{id:'photo:cast',kind:'photo'}}}});const e=h.state.curses[0].effects![0];
  expect(()=>h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:e.id,confirmed:true})).toThrow('fotografií');
  h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:e.id,confirmed:true,media:{id:'photo:task',kind:'photo'}});
  expect(h.state.curses[0].state).toBe('fulfilled');expect(h.state.curses[0].evidence).toHaveLength(2);expect(viewForRole(h.state,'hunter',f.env).curses[0]).not.toHaveProperty('casterPoint');readGameState(h.state,f.env);
 });
 it('Water Weight unlocks questions after the task but keeps the round obligation and reports an unknown penalty honestly',()=>{
  const h=mechanism('curse-water'),c=h.state.curses[0];expect(c.effects![1].state).toBe('waiting_task');expect(()=>h.send('hunter',{type:'violate_curse',curseId:c.id,effectId:c.effects![1].id,confirmed:true})).toThrow();expect(viewForRole(h.state,'hunter',f.env).canAsk).toBe(false);
  h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![0].id,confirmed:true});expect(h.state.curses[0].state).toBe('ongoing');expect(viewForRole(h.state,'hunter',f.env).canAsk).toBe(true);
  expect(()=>h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![1].id,confirmed:true})).toThrow('Průběžnou');
  h.send('hunter',{type:'violate_curse',curseId:c.id,effectId:c.effects![1].id,confirmed:true});expect(scoreGame(h.state).penaltyUnknown).toBe(true);expect(h.state.curses[0].state).toBe('failed');readGameState(h.state,f.env);
 });
 it('applies an explicitly configured test penalty once and ends obligations at round end',()=>{
  const h=mechanism('curse-penalty'),c=h.state.curses[0];h.send('hunter',{type:'complete_curse_task',curseId:c.id,effectId:c.effects![0].id,confirmed:true});h.send('hunter',{type:'violate_curse',curseId:c.id,effectId:c.effects![1].id,confirmed:true});expect(scoreGame(h.state).penaltySeconds).toBe(60);expect(()=>h.send('hunter',{type:'violate_curse',curseId:c.id,effectId:c.effects![1].id,confirmed:true})).toThrow('potvrzení');
  h.send('hider',{type:'finish'});expect(h.state.cardState!.penalties).toHaveLength(1);readGameState(h.state,f.env);
 });
 it('expires a timed effect using game time and preserves it through reload before expiry',()=>{
  const h=mechanism('curse-timed'),c=h.state.curses[0];expect(c.state).toBe('timed');h.state=readGameState(h.state,f.env);h.send('clock',{type:'tick'},h.state.now+60000);expect(h.state.curses[0].state).toBe('ended');
 });
 it('blocks exact Drained Brain IDs in the engine, not only the UI, and leaves other questions usable',()=>{
  const h=mechanism('curse-drained');for(const questionId of ['matching:zoo','matching:hospital','radar:800'])expect(()=>h.send('hunter',{type:'ask',questionId})).toThrow('zakázaná');expect(viewForRole(h.state,'hunter',f.env).availableQuestions.find(q=>q.id==='radar:800')?.availability).toBe('unsupported');h.send('hunter',{type:'ask',questionId:'radar:400'});readGameState(h.state,f.env);
 });
 it('selects and persistently blocks one seeded Spotty Memory category on repeated attempts',()=>{
  const h=mechanism('curse-spotty'),same=mechanism('curse-spotty'),category=h.state.curses[0].effects![0].selectedCategory;
  expect(category).toBe(same.state.curses[0].effects![0].selectedCategory);const question=h.state.rules.questions.find(q=>q.type===category)!;
  for(let i=0;i<3;i++)expect(()=>h.send('hunter',{type:'ask',questionId:question.id})).toThrow('kategorie');expect(h.state.cardState!.rolls).toHaveLength(1);readGameState(h.state,f.env);
 });
 it('Overflowing Chalice grants +1 draw for exactly three eligible question rewards',()=>{
  const h=mechanism('curse-chalice');
  for(let i=0;i<4;i++){h.send('hunter',{type:'ask',questionId:'radar:800'});h.send('hider',{type:'answer'});expect(h.state.rewards[i].policy.draw).toBe(i<3?3:2);}
  expect(h.state.curses[0].state).toBe('fulfilled');readGameState(h.state,f.env);
 });
 it('rejects unavailable geographic casting data instead of guessing',()=>{
  const rules=deckRules('small'),card=rules.cards.find(c=>c.id==='curse-water-weight')!;
  card.mechanics={status:'test_fixture',source:'Test geography',missing:[],fullTextEn:null,fullTextCs:null,castingCost:[{id:'water',kind:'geography',subject:'hunter',reference:'named_water',minMeters:100,text:'Test 100m'}],effects:[{kind:'task',text:'Test',proof:'confirmation',blocksQuestions:true}]};
  const h=harness(rules),id=cast(h,card.id),before=structuredClone(h.state);
  expect(()=>transition(h.state,{id:'no-data',actor:'hider',at:h.state.now,command:{type:'confirm_cast',curseId:id,proof:{}}},{...f.env,namedWaterDistance:()=>({state:'unknown',reason:'missing'})})).toThrow('nelze určit');expect(h.state).toEqual(before);
 });
});

describe('Full supplied curse rules',()=>{
 it('Duplicate can copy a powerup or curse and maintains a complete identity audit',()=>{
  for(const target of ['veto','curse-water-weight','duplicate']){const h=harness(),original=h.grant(target),power=h.grant('duplicate');h.send('hider',{type:'play_card',cardId:power,targetCardId:original});expect(h.state.cardState!.copies[0].definitionId).toBe(target);readGameState(h.state,f.env);}
 });
 it('Spotty Memory rerolls only after an asked question and enforces the selected category repeatedly',()=>{
  const h=harness(),power=h.grant('curse-spotty-memory'),cost=h.grant('bonus-red');h.send('hider',{type:'begin_cast',cardId:power});const id=h.state.curses[0].id;h.send('hider',{type:'confirm_cast',curseId:id,proof:{discardIds:[cost]}});const effect=h.state.curses[0].effects![0];
  expect(()=>h.send('hunter',{type:'ask',questionId:'radar:800'})).toThrow('hodit');
  h.send('hunter',{type:'roll',count:1,condition:'any',manualValues:[1]});h.send('hunter',{type:'curse_roll',curseId:id,effectId:effect.id,rollId:h.state.cardState!.rolls.at(-1)!.id});
  expect(()=>h.send('hunter',{type:'ask',questionId:'matching:zoo'})).toThrow('kategorie');h.send('hunter',{type:'ask',questionId:'radar:800'});expect(h.state.curses[0].effects![0].selectedCategory).toBeUndefined();h.send('hider',{type:'answer'});expect(()=>h.send('hunter',{type:'ask',questionId:'radar:400'})).toThrow('hodit');readGameState(h.state,f.env);
 });
 it.each([['curse-endless-tumble',5],['curse-gamblers-feet',2]] as const)('%s is consumed without activation for its no-effect casting roll',(cardId,roll)=>{
  const h=harness(),id=cast(h,cardId);h.send('hider',{type:'roll',count:1,condition:'any',manualValues:[roll]});h.send('hider',{type:'confirm_cast',curseId:id,proof:{rollIds:{roll:h.state.cardState!.rolls.at(-1)!.id}}});expect(h.state.curses[0].state).toBe('ended');expect(h.state.hand).toEqual([]);readGameState(h.state,f.env);
 });
 it('Drained Brain requires three different question types and atomically discards the rest of the hand',()=>{
  const h=harness(),power=h.grant('curse-drained-brain'),bonus=h.grant('bonus-red');expect(()=>h.send('hider',{type:'begin_cast',cardId:power,setup:{questionIds:['matching:zoo','matching:hospital','radar:800']}})).toThrow('různých');
  h.send('hider',{type:'begin_cast',cardId:power,setup:{questionIds:['matching:zoo','measuring:airport','radar:800']}});const id=h.state.curses[0].id;
  expect(()=>h.send('hider',{type:'confirm_cast',curseId:id,proof:{}})).toThrow('celé');h.send('hider',{type:'confirm_cast',curseId:id,proof:{discardIds:[bonus]}});expect(h.state.hand).toEqual([]);expect(()=>h.send('hunter',{type:'ask',questionId:'measuring:airport'})).toThrow('zakázaná');readGameState(h.state,f.env);
 });
 it('Water Weight uses the hunters real published-water geometry and keeps its obligation after acquisition',()=>{
  const h=harness(),water=f.release.data.pois.find(p=>p.category==='waterbody')!;h.send('hunter',{type:'location',role:'hunter',fix:{point:water.point,at:h.state.now,accuracy:5}});const id=cast(h,'curse-water-weight');h.send('hider',{type:'confirm_cast',curseId:id,proof:{}});const c=h.state.curses[0];h.send('hunter',{type:'complete_curse_task',curseId:id,effectId:c.effects![0].id,confirmed:true});expect(h.state.curses[0].state).toBe('ongoing');h.send('hunter',{type:'violate_curse',curseId:id,effectId:c.effects![1].id,confirmed:true});expect(scoreGame(h.state).penaltySeconds).toBe(1800);readGameState(h.state,f.env);
 });
 it('Jammed Door requires sum 7, blocks retry and alternate-door entry, then allows one confirmed entry',()=>{
  const h=harness(),power=h.grant('curse-jammed-door'),cost=[h.grant('bonus-red'),h.grant('bonus-orange')];h.send('hider',{type:'begin_cast',cardId:power});const c=h.state.curses[0];h.send('hider',{type:'confirm_cast',curseId:c.id,proof:{discardIds:cost}});const e=h.state.curses[0].effects![0];
  const roll=(values:number[])=>{h.send('hunter',{type:'roll',count:2,condition:'any',manualValues:values});return h.state.cardState!.rolls.at(-1)!.id;};
  h.send('hunter',{type:'attempt_door',curseId:c.id,effectId:e.id,spaceId:'station hall',rollId:roll([1,2])});expect(()=>h.send('hunter',{type:'enter_space',curseId:c.id,spaceId:'station hall',confirmed:true})).toThrow('povolen');const success=roll([4,4]);expect(()=>h.send('hunter',{type:'attempt_door',curseId:c.id,effectId:e.id,spaceId:'station hall',rollId:success})).toThrow('znovu');h.send('clock',{type:'tick'},h.state.now+5*60000);h.send('hunter',{type:'attempt_door',curseId:c.id,effectId:e.id,spaceId:'station hall',rollId:success});h.send('hunter',{type:'enter_space',curseId:c.id,spaceId:'station hall',confirmed:true});expect(()=>h.send('hunter',{type:'enter_space',curseId:c.id,spaceId:'station hall',confirmed:true})).toThrow('povolen');readGameState(h.state,f.env);
 });
 it('Gambler steps consume a real audited roll budget and end at the selected variant deadline',()=>{
  const h=harness(),id=cast(h,'curse-gamblers-feet');h.send('hider',{type:'roll',count:1,condition:'any',manualValues:[1]});h.send('hider',{type:'confirm_cast',curseId:id,proof:{rollIds:{roll:h.state.cardState!.rolls.at(-1)!.id}}});const e=h.state.curses[0].effects![0];expect(()=>h.send('hunter',{type:'steps_taken',curseId:id,effectId:e.id,count:1,confirmed:true})).toThrow('kroků');h.send('hunter',{type:'roll',count:1,condition:'any',manualValues:[3]});h.send('hunter',{type:'curse_roll',curseId:id,effectId:e.id,rollId:h.state.cardState!.rolls.at(-1)!.id});h.send('hunter',{type:'steps_taken',curseId:id,effectId:e.id,count:3,confirmed:true});expect(h.state.curses[0].effects![0].remainingSteps).toBe(0);h.send('clock',{type:'tick'},h.state.now+20*60000);expect(h.state.curses[0].state).toBe('ended');readGameState(h.state,f.env);
 });
 it('Chalice does not spend a charge on a vetoed question or a free Consumer question',()=>{
  const h=mechanism('curse-chalice'),veto=h.grant('veto');h.send('hunter',{type:'ask',questionId:'radar:800'});h.send('hider',{type:'play_card',cardId:veto});expect(h.state.curses[0].effects![0].remainingQuestions).toBe(3);
  const id=cast(h,'curse-impressionable-consumer');h.send('hider',{type:'confirm_cast',curseId:id,proof:{}});const c=h.state.curses.at(-1)!;h.send('hunter',{type:'complete_curse_task',curseId:id,effectId:c.effects![0].id,confirmed:true});h.send('hunter',{type:'ask',questionId:'radar:800'});h.send('hider',{type:'answer'});expect(h.state.rewards).toHaveLength(0);expect(h.state.curses[0].effects![0].remainingQuestions).toBe(3);readGameState(h.state,f.env);
 });
});

it('all 24 supplied curses cast through their real typed costs and survive state validation',()=>{
 for(const definition of deckRules('small').cards.filter(c=>c.type==='curse')){
  const h=harness();h.send('hunter',{type:'walking',value:true});
  const setup:import('./index').CurseSetup={animalCategory:'bird',targetPoint:f.station.point,rockCount:3,durationSeconds:60,country:'Japonsko',secretWord:'PRAHA',questionIds:['matching:zoo','measuring:airport','radar:800']};
  if(definition.id==='curse-bridge-troll')h.send('hunter',{type:'location',role:'hunter',fix:{point:[f.station.point[0]+.02,f.station.point[1]],at:h.state.now,accuracy:5}});
  if(definition.id==='curse-water-weight'){const water=f.release.data.pois.find(p=>p.category==='waterbody')!;h.send('hunter',{type:'location',role:'hunter',fix:{point:water.point,at:h.state.now,accuracy:5}});}
  if(definition.id==='curse-u-turn'){h.send('hunter',{type:'walking',value:false});setup.nextStopId=f.env.stops.find(p=>f.env.distance(p.point,f.station.point)>1000)!.id;}
  const card=h.grant(definition.id),proof:import('./index').CastingProof={discardIds:[],confirmations:[],media:{},rollIds:{}};
  for(const cost of definition.mechanics!.castingCost??[])if(cost.kind==='discard')for(let i=0;i<cost.count;i++)proof.discardIds!.push(h.grant(cost.cardType==='powerup'?'veto':'bonus-red'));
  h.send('hider',{type:'begin_cast',cardId:card,setup});const id=h.state.curses[0].id;
  for(const cost of definition.mechanics!.castingCost??[]){if(cost.kind==='roll'){h.send('hider',{type:'roll',count:cost.count,condition:cost.condition,manualValues:[1]});proof.rollIds![cost.id]=h.state.cardState!.rolls.at(-1)!.id;}else if(cost.kind==='photo'||cost.kind==='video')proof.media![cost.id]={id:cost.kind+':test-'+definition.id,kind:cost.kind};else if('text' in cost&&cost.kind!=='geography')proof.confirmations!.push(cost.id);}
  h.send('hider',{type:'confirm_cast',curseId:id,proof});expect(h.state.curses[0].state,definition.id).not.toBe('casting');expect(()=>readGameState(h.state,f.env),definition.id).not.toThrow();
 }
});

it('overflow can be resolved by playing Draw 1 Expand 1 rather than losing a card',()=>{
 const h=harness();for(let i=0;i<6;i++)h.grant('bonus-red');const card=h.grant('draw-1-expand-1');expect(viewForRole(h.state,'hider',f.env).overflow).toBe(1);h.send('hider',{type:'play_card',cardId:card});expect(h.state.hand).toHaveLength(7);expect(handLimit(h.state)).toBe(7);expect(viewForRole(h.state,'hunter',f.env).canAsk).toBe(true);readGameState(h.state,f.env);
});
it('Move keeps its freeze after a missing hunters GPS and caps score pause at its deadline',()=>{
 const h=mechanism('power-move'),move=h.state.cardState!.move!,point=h.state.fixes.hunter!.point;
 h.send('hunter',{type:'location',role:'hunter',fix:null});expect(()=>h.send('hunter',{type:'location',role:'hunter',fix:{point:[point[0]+.01,point[1]],at:h.state.now,accuracy:5}})).toThrow('nesmí pohybovat');
 h.send('hider',{type:'location',role:'hider',fix:null});h.send('clock',{type:'tick'},move.deadline);expect(h.state.cardState!.move!.stage).toBe('needs_destination');expect(h.state.cardState!.move!.candidates).toEqual([]);expect(()=>h.send('hider',{type:'complete_move',stopId:f.env.stops[0].id,confirmed:true})).toThrow();h.send('clock',{type:'tick'},move.deadline+60000);expect(scoreGame(h.state).pausedMs).toBe(20*60000);readGameState(h.state,f.env);
});

it('Bridge Troll pays against fresh positions at activation, never the old preparation position',()=>{
 const h=harness(),start=f.station.point;h.send('hunter',{type:'location',role:'hunter',fix:{point:[start[0]+.006,start[1]],at:h.state.now,accuracy:5}});const id=cast(h,'curse-bridge-troll');h.send('hider',{type:'location',role:'hider',fix:{point:[start[0]+.003,start[1]],at:h.state.now,accuracy:5}});const before=structuredClone(h.state);
 expect(()=>h.send('hider',{type:'confirm_cast',curseId:id,proof:{}})).toThrow('geografická');expect(h.state).toEqual(before);
 h.send('hider',{type:'location',role:'hider',fix:null});expect(()=>h.send('hider',{type:'confirm_cast',curseId:id,proof:{}})).toThrow('poloha');expect(h.state.curses[0].state).toBe('casting');
});
