import {beforeAll,describe,expect,it} from 'vitest';
import {createGame,transition,viewForRole,readGameState,handLimit,validFix,scoreGame} from './index';
import {gameFixture} from './test-fixtures';
let source:Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async()=>{source=await gameFixture();});
async function fixture(){const base=source;const f=await gameFixture();expect(f.env.releaseId).toBe(base.env.releaseId);return f;}
describe('Deterministic, role-authorized game transitions',()=>{
 it('replays the same events and seed, rejects wrong roles, backwards clocks, other releases and duplicate commands',async()=>{
  const f=await fixture();const a=createGame({id:'replay',releaseId:f.release.releaseId,now:f.now,seed:5,rules:f.rules}),b=createGame({id:'replay',releaseId:f.release.releaseId,now:f.now,seed:5,rules:f.rules});expect(a).toEqual(b);
  const envelope={id:'walking',at:a.now,actor:'hunter' as const,command:{type:'walking' as const,value:true}},next=transition(a,envelope,f.env);expect(transition(b,envelope,f.env)).toEqual(next);expect(transition(next,envelope,f.env)).toBe(next);expect(a.walking).toBe(false);
  expect(()=>transition(a,{...envelope,actor:'hider'},f.env)).toThrow('oprávnění');expect(()=>transition(a,{...envelope,at:a.now-1},f.env)).toThrow('zpět');expect(()=>transition({...a,releaseId:'other'},envelope,f.env)).toThrow('katalog');
 });
 it('validates GPS accuracy, age, future records and absent locations without substituting zeroes',async()=>{
  const f=await fixture();expect(validFix(undefined,f.now,f.rules)).toBe(false);for(const fix of [{point:[0,0],at:f.now,accuracy:100},{point:[14,50],at:f.now+1,accuracy:5},{point:[14,50],at:f.now-120001,accuracy:5}])expect(validFix(fix as Parameters<typeof validFix>[0],f.now,f.rules)).toBe(false);
  f.location('hunter');f.command('hunter',{type:'location',role:'hunter',fix:null});expect(f.state.fixes.hunter).toBeUndefined();
 });
 it('locks an eligible station exactly once; missing GPS and outside circles cannot be confirmed',async()=>{
  const f=await fixture();expect(()=>f.command('hider',{type:'lock_station',stopId:f.station.id})).toThrow('způsobilá');f.location('hider',[14.3,50.15]);expect(()=>f.command('hider',{type:'lock_station',stopId:f.station.id})).toThrow();f.location('hider');f.command('hider',{type:'select_station',stopId:f.station.id});f.command('hider',{type:'lock_station',stopId:f.station.id});expect(f.state.station?.id).toBe(f.station.id);expect(()=>f.command('hider',{type:'select_station',stopId:f.env.stops[0].id})).toThrow('45');
 });
 it('expires 45 minutes with frozen overlapping choices, never invents a station and preserves all choices after reload',async()=>{
  const f=await fixture();f.command('clock',{type:'tick'},f.state.hideDeadline);expect(f.state.phase).toBe('needs_station');expect(f.state.station).toBeNull();expect(f.state.deadlineCandidates).toEqual([]);
  const g=await fixture();g.command('hider',{type:'location',role:'hider',fix:{point:g.station.point,at:g.state.hideDeadline,accuracy:5}},g.state.hideDeadline);expect(g.state.deadlineCandidates!.length).toBeGreaterThan(1);expect(g.state.phase).toBe('needs_station');const restored=readGameState(JSON.stringify(g.state),g.env);expect(restored.deadlineCandidates).toEqual(g.state.deadlineCandidates);g.command('hider',{type:'lock_station',stopId:g.station.id});expect(g.state.phase).toBe('seeking');
 });
 it('freezes both decisive positions at ask time and resolves automatically at exactly five minutes with one reward',async()=>{
  const f=await fixture();f.seeking();f.command('hunter',{type:'ask',questionId:'radar:800'});const q=structuredClone(f.state.questions[0]);f.location('hunter',[14.5,50.1]);f.location('hider',[14.3,50.1]);f.command('clock',{type:'tick'},q.deadline!-1);expect(f.state.questions[0].state).toBe('pending');f.command('clock',{type:'tick'},q.deadline!);expect(f.state.questions[0]).toMatchObject({answer:'ANO',state:'answered',hunterFix:q.hunterFix,targetPoint:q.targetPoint});expect(f.state.rewards).toHaveLength(1);f.command('clock',{type:'tick'},q.deadline!+5000);expect(f.state.rewards).toHaveLength(1);
 });
 it('uses the explicitly configured real-GPS radar target and still snapshots it',async()=>{
  const f=await fixture();f.state.rules.questions.find(q=>q.id==='radar:800')!.target='gps';f.seeking();f.location('hider',[f.station.point[0]+.03,f.station.point[1]]);f.command('hunter',{type:'ask',questionId:'radar:800'});f.location('hider');f.command('hider',{type:'answer'});expect(f.state.questions[0].answer).toBe('NE');
 });
 it('manual/photo timeouts never synthesize answers; missing layers cannot be submitted',async()=>{
  const f=await fixture();f.seeking();expect(()=>f.command('hunter',{type:'ask',questionId:'matching:golf'})).toThrow('vrstva');f.command('hunter',{type:'ask',questionId:'matching:transit_line'});f.command('clock',{type:'tick'},f.state.now+300000);expect(f.state.questions[0].state).toBe('pending');expect(f.state.rewards).toHaveLength(0);f.command('hider',{type:'answer',answer:'NE'});expect(f.state.rewards).toHaveLength(1);
  f.location('hunter');f.location('hider');f.command('hunter',{type:'ask',questionId:'photo:surroundings'});f.command('hider',{type:'attach_photo',photoId:'photo:private'});f.command('clock',{type:'tick'},f.state.now+300000);expect(f.state.questions[1].state).toBe('pending');expect(viewForRole(f.state,'hunter',f.env).questions[1]).not.toHaveProperty('draftPhotoId');expect(readGameState(JSON.stringify(f.state),f.env).questions[1].draftPhotoId).toBe('photo:private');f.command('hider',{type:'answer',photoId:'photo:private'});expect(viewForRole(f.state,'hunter',f.env).questions[1].photoId).toBe('photo:private');
 });
 it('resolver failure records a recoverable error without a fabricated result or reward',async()=>{
  const f=await fixture();f.seeking();f.command('hunter',{type:'ask',questionId:'matching:zoo'});const broken={...f.env,resolve:()=>({state:'unknown' as const,reason:'Chybí geometrie.'})};const s=transition(f.state,{id:'timeout',actor:'clock',at:f.state.questions[0].deadline!,command:{type:'tick'}},broken);expect(s.questions[0]).toMatchObject({state:'error',error:'Chybí geometrie.'});expect(s.questions[0].answer).toBeUndefined();expect(s.rewards).toEqual([]);
 });
});
describe('Cards, persistent rewards and enforceable curses',()=>{
 it.each([['matching:zoo',3],['radar:800',2]] as const)('%s draws %s, keeps one and discards all remaining cards',async(questionId,count)=>{
  const f=await fixture();f.seeking();f.command('hunter',{type:'ask',questionId});f.command('hider',{type:'answer'});const id=f.state.rewards[0].id;f.command('hider',{type:'draw_reward',rewardId:id});const offer=[...f.state.rewards[0].offer];expect(offer).toHaveLength(count);const restored=readGameState(JSON.stringify(f.state),f.env);expect(restored.rewards[0].offer).toEqual(offer);expect(()=>f.command('hider',{type:'draw_reward',rewardId:id})).toThrow('nabídku');f.command('hider',{type:'keep_reward',rewardId:id,cardId:offer[0]});expect(f.state.hand).toEqual([offer[0]]);expect(f.state.discardPile).toEqual(offer.slice(1));expect(f.state.drawPile.length).toBe(f.rules.deck.length-count);readGameState(f.state,f.env);
 });
 it('veto cancels without answering or rewarding; a late veto is rejected',async()=>{
  const f=await fixture();f.seeking();const card=f.grant('veto');f.command('hunter',{type:'ask',questionId:'matching:zoo'});f.command('hider',{type:'play_card',cardId:card});expect(f.state.questions[0].state).toBe('vetoed');expect(f.state.rewards).toEqual([]);expect(f.state.discardPile).toContain(card);
  f.command('hunter',{type:'ask',questionId:'radar:800'});f.command('clock',{type:'tick'},f.state.questions[1].deadline!);const late=f.grant('veto');expect(()=>f.command('hider',{type:'play_card',cardId:late})).toThrow('čekající');
 });
 it('randomize selects a deterministic compatible question, keeping GPS/deadline and a single eventual reward',async()=>{
  const f=await fixture();f.seeking();const card=f.grant('randomize');f.command('hunter',{type:'ask',questionId:'matching:zoo'});const old=structuredClone(f.state.questions[0]),input=structuredClone(f.state);f.command('hider',{type:'play_card',cardId:card});expect(f.state.questions[0].definition.id).not.toBe(old.definition.id);expect(f.state.questions[0]).toMatchObject({deadline:old.deadline,hunterFix:old.hunterFix,targetPoint:old.targetPoint});const replay=transition(input,{id:'replay',actor:'hider',at:input.now,command:{type:'play_card',cardId:card}},f.env);expect(replay.questions).toEqual(f.state.questions);f.command('hider',{type:'answer'});expect(f.state.rewards).toHaveLength(1);expect(f.state.rewards[0].policy).toEqual({draw:3,keep:1});
 });
 it('persists overflow, blocks questions and bonus activation; capacity changes are real',async()=>{
  const f=await fixture();f.seeking();f.grant('bonus-60',7);const restored=readGameState(JSON.stringify(f.state),f.env);expect(viewForRole(restored,'hider',f.env).overflow).toBe(1);expect(viewForRole(restored,'hunter',f.env).canAsk).toBe(false);expect(()=>f.command('hunter',{type:'ask',questionId:'radar:800'})).toThrow('karetní');expect(()=>f.command('hider',{type:'play_card',cardId:f.state.hand[0]})).toThrow('bonus');f.command('hider',{type:'discard_card',cardId:f.state.hand[0]});const capacity=f.grant('capacity');f.command('hider',{type:'play_card',cardId:capacity});expect(handLimit(f.state)).toBe(8);expect(f.state.hand).toHaveLength(6);readGameState(f.state,f.env);
 });
 it('enforces a blocking curse in core and expires it; manual tasks can be fulfilled by hunters',async()=>{
  const f=await fixture();f.seeking();const card=f.grant('curse-pause');f.command('hider',{type:'play_card',cardId:card});expect(()=>f.command('hunter',{type:'ask',questionId:'radar:800'})).toThrow('prokletí');expect(()=>f.command('hunter',{type:'fulfill_curse',curseId:f.state.curses[0].id})).toThrow('ručně');f.command('clock',{type:'tick'},f.state.now+120000);expect(f.state.curses[0].state).toBe('ended');const task=f.grant('curse-look');f.command('hider',{type:'play_card',cardId:task});f.command('hunter',{type:'fulfill_curse',curseId:f.state.curses[1].id});expect(f.state.curses[1].state).toBe('fulfilled');
 });
 it('scores only time bonuses still in hand at round end and never allows test rules in live mode',async()=>{
  const f=await fixture();expect(()=>createGame({id:'live',releaseId:f.release.releaseId,now:f.now,seed:42,rules:f.rules,mode:'live'})).toThrow('Testovací');f.seeking();f.grant('bonus-60',2);const discarded=f.state.hand[0];f.command('hider',{type:'discard_card',cardId:discarded});f.command('clock',{type:'tick'},f.state.now+10000);f.command('hider',{type:'finish'});expect(scoreGame(f.state)).toEqual({baseMs:10000,bonusSeconds:60,totalMs:70000});expect(viewForRole(f.state,'hider',f.env).finalScoreMs).toBe(70000);const end=f.state.now;f.command('clock',{type:'tick'},end+50000);expect(f.state.now).toBe(end);
 });
 it('rejects corrupt or foreign states and duplicated cards without mutating the original',async()=>{
  const f=await fixture();f.seeking();expect(()=>readGameState({...f.state,releaseId:'release:'+'a'.repeat(64)},f.env)).toThrow('katalog');const broken=structuredClone(f.state);broken.hand.push(broken.drawPile[0]);expect(()=>readGameState(broken,f.env)).toThrow('karet');expect(f.state.hand).toEqual([]);
 });
});
describe('Proximity and role privacy',()=>{
 it('notifies only the hider on an on-foot entry, never in transit or on reload, and keeps questions available',async()=>{
  const f=await fixture();f.seeking();f.command('hunter',{type:'walking',value:false});expect(f.state.events.filter(e=>e.type==='proximity')).toHaveLength(0);f.command('hunter',{type:'walking',value:true});expect(f.state.events.filter(e=>e.type==='proximity')).toHaveLength(1);const restored=readGameState(JSON.stringify(f.state),f.env);f.state=restored;f.command('clock',{type:'tick'},f.state.now+1);expect(f.state.events.filter(e=>e.type==='proximity')).toHaveLength(1);expect(viewForRole(f.state,'hunter',f.env).events.some(e=>e.type==='proximity')).toBe(false);expect(viewForRole(f.state,'hunter',f.env).canAsk).toBe(true);f.location('hunter',[f.station.point[0]+.03,f.station.point[1]]);f.location('hunter');expect(f.state.events.filter(e=>e.type==='proximity')).toHaveLength(2);
 });
 it('hunter DTO/history contain no target GPS, stop ID, card hand, deck, offers or diagnostic answer',async()=>{
  const f=await fixture();f.seeking();f.location('hunter',[14.43,50.1]);f.grant('veto');f.command('hunter',{type:'ask',questionId:'matching:zoo'});const hunter=viewForRole(f.state,'hunter',f.env),serialized=JSON.stringify(hunter);for(const key of ['station','targetPoint','hunterFix','hand','drawPile','discardPile','rewards','rng','proximity'])expect(hunter).not.toHaveProperty(key);expect(serialized).not.toContain(f.station.id);expect(serialized).not.toContain(JSON.stringify(f.station.point));expect(hunter.questions[0]).not.toHaveProperty('answer');expect(viewForRole(f.state,'hider',f.env).station?.id).toBe(f.station.id);
 });
});
