import {beforeAll,expect,it} from 'vitest';
import {createGame,deckRules,transition,readGameState,viewForRole,questionRegistry,THERMOMETER_VARIANTS,type Command,type GameState,type Point,type Role} from './index';
import {gameFixture} from './test-fixtures';
let f:Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async()=>{f=await gameFixture();});
function harness(){
 let state=createGame({id:'spatial-test',releaseId:f.release.releaseId,now:f.now,seed:42,rules:deckRules('medium')}),n=0;
 const send=(actor:Role|'clock',command:Command,at=state.now)=>{state=transition(state,{actor,command,at,id:`s-${++n}`},f.env);return state;};
 const locate=(role:Role,point:Point=f.station.point)=>send(role,{type:'location',role,fix:{point,at:state.now,accuracy:5}});
 const grant=(name:string)=>{const id=state.drawPile.find(c=>c.startsWith(name+'@'))!;expect(id).toBeTruthy();state.drawPile=state.drawPile.filter(c=>c!==id);state.hand.push(id);return id;};
 locate('hider');locate('hunter');send('hider',{type:'lock_station',stopId:f.station.id});
 return {send,locate,grant,get state(){return state;},set state(s:GameState){state=s;}};
}
it('configures original distances, custom metres, disabled variants and verified area limits without modifying legacy rules',()=>{
 expect(THERMOMETER_VARIANTS.map(v=>v.meters)).toEqual([804.672,4828.032,16093.44,80467.2]);
 const qs=questionRegistry({maxMovementMeters:f.env.maxMovementMeters});expect(qs.filter(q=>q.type==='thermometer')).toHaveLength(3);expect(qs.find(q=>q.id==='thermometer:50-miles')).toBeUndefined();
 const custom=questionRegistry({thermometer:[{id:'custom',label:'250 m',meters:250},{id:'disabled',label:'off',meters:100,enabled:false}]});expect(custom.filter(q=>q.type==='thermometer').map(q=>q.minMoveMeters)).toEqual([250]);
 expect(()=>questionRegistry({thermometer:[{id:'bad',label:'bad',meters:NaN}]})).toThrow('kladný');
 expect(f.rules.questions.find(q=>q.type==='thermometer')?.configured).toBe(false);
});
it('starts A without a response timer, survives reload, then snapshots B and starts exactly five minutes',()=>{
 const h=harness(),a:Point=[f.station.point[0]+.03,f.station.point[1]],b:Point=[f.station.point[0]+.01,f.station.point[1]];
 h.locate('hunter',a);h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});const q=structuredClone(h.state.questions[0]);expect(q).toMatchObject({phase:'awaiting_second_measurement',deadline:null,hunterFix:{point:a},targetPoint:f.station.point});
 h.send('clock',{type:'tick'},h.state.now+600000);expect(h.state.questions[0].state).toBe('pending');expect(h.state.rewards).toEqual([]);expect(()=>h.send('hider',{type:'answer'})).toThrow('druhé');
 h.state=readGameState(JSON.stringify(h.state),f.env);h.locate('hunter',b);h.locate('hider',[f.station.point[0]-.02,f.station.point[1]]);h.send('hunter',{type:'second_measurement'});
 const completed=structuredClone(h.state.questions[0]);expect(completed).toMatchObject({phase:'awaiting_response',responseStartedAt:h.state.now,deadline:h.state.now+300000,secondFix:{point:b},hunterFix:q.hunterFix,targetPoint:q.targetPoint});
 h.state=readGameState(h.state,f.env);h.locate('hunter');h.send('clock',{type:'tick'},completed.deadline!-1);expect(h.state.questions[0].state).toBe('pending');h.send('clock',{type:'tick'},completed.deadline!);expect(h.state.questions[0]).toMatchObject({phase:'answered',answer:'TEPLEJI',secondFix:completed.secondFix,targetPoint:q.targetPoint});expect(h.state.rewards[0].policy).toEqual({draw:2,keep:1});
 h.send('clock',{type:'tick'},h.state.now+1);expect(h.state.rewards).toHaveLength(1);readGameState(h.state,f.env);
});
it('enforces displacement, GPS freshness/accuracy, area and the exact numerical boundary in core and role view',()=>{
 const h=harness();h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});expect(viewForRole(h.state,'hunter',f.env).questions[0].measurement?.canFinish).toBe(false);expect(()=>h.send('hunter',{type:'second_measurement'})).toThrow('vzdálenost');
 h.send('hunter',{type:'location',role:'hunter',fix:null});expect(()=>h.send('hunter',{type:'second_measurement'})).toThrow('GPS');expect(viewForRole(h.state,'hunter',f.env).questions[0].measurement?.movement).toBeNull();
 h.send('hunter',{type:'location',role:'hunter',fix:{point:[14.45,50.08],at:h.state.now,accuracy:200}});expect(()=>h.send('hunter',{type:'second_measurement'})).toThrow('GPS');
 h.locate('hunter',[0,0]);expect(()=>h.send('hunter',{type:'second_measurement'})).toThrow('oblast');
 const b:Point=[f.station.point[0]+.02,f.station.point[1]];h.locate('hunter',b);h.state.questions[0].definition.minMoveMeters=f.env.distance(f.station.point,b);h.send('hunter',{type:'second_measurement'});expect(h.state.questions[0].phase).toBe('awaiting_response');expect(()=>h.send('hunter',{type:'second_measurement'})).toThrow('již');
});
it('uses an explicit recoverable tie and requires a confirmed manual agreement before awarding cards',()=>{
 const h=harness(),a:Point=[f.station.point[0]-.01,f.station.point[1]],b:Point=[f.station.point[0]+.01,f.station.point[1]];h.locate('hunter',a);h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});h.locate('hunter',b);h.send('hunter',{type:'second_measurement'});h.send('hider',{type:'answer'});
 expect(h.state.questions[0]).toMatchObject({state:'error',phase:'error',errorCode:'thermometer_tie'});expect(h.state.rewards).toEqual([]);h.state=readGameState(h.state,f.env);
 expect(()=>h.send('hider',{type:'resolve_thermometer_tie',answer:'TEPLEJI',confirmed:false,note:'Dohoda obou týmů.'})).toThrow('dohodu');expect(()=>h.send('hunter',{type:'resolve_thermometer_tie',answer:'TEPLEJI',confirmed:true,note:'Dohoda obou týmů.'})).toThrow('oprávnění');
 h.send('hider',{type:'resolve_thermometer_tie',answer:'TEPLEJI',confirmed:true,note:'Dohoda obou týmů pro nerozhodné měření.'});expect(h.state.questions[0].manualResolution).toBeDefined();expect(h.state.rewards).toHaveLength(1);readGameState(h.state,f.env);
});
it.each(['before','after'] as const)('Veto %s B cancels Thermometer with no cards and no later timeout answer',when=>{
 const h=harness(),veto=h.grant('veto');h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});if(when==='after'){h.locate('hunter',[f.station.point[0]+.02,f.station.point[1]]);h.send('hunter',{type:'second_measurement'});}h.send('hider',{type:'play_card',cardId:veto});h.send('clock',{type:'tick'},h.state.now+900000);expect(h.state.questions[0].state).toBe('vetoed');expect(h.state.rewards).toEqual([]);readGameState(h.state,f.env);
});
it('Randomize preserves A/B/H/deadline and only selects variants compatible with a completed movement',()=>{
 const h=harness(),randomize=h.grant('randomize');h.locate('hunter',[f.station.point[0]+.1,f.station.point[1]]);h.send('hunter',{type:'ask',questionId:'thermometer:3-miles'});h.locate('hunter');h.send('hunter',{type:'second_measurement'});const before=structuredClone(h.state.questions[0]);h.send('hider',{type:'play_card',cardId:randomize});expect(h.state.questions[0].definition.id).toBe('thermometer:half-mile');expect(h.state.questions[0]).toMatchObject({hunterFix:before.hunterFix,secondFix:before.secondFix,targetPoint:before.targetPoint,deadline:before.deadline});readGameState(h.state,f.env);
});
it('Tentacles snapshots both decisions, publishes the exact selected POI only after answer and draws 4 → 2 atomically',()=>{
 const h=harness(),library=f.release.data.pois.find(p=>p.category==='library')!;h.locate('hunter',library.point);h.send('hunter',{type:'ask',questionId:'tentacles:library'});const q=structuredClone(h.state.questions[0]);expect(q.deadline).toBe(h.state.now+300000);h.locate('hunter');h.locate('hider',library.point);expect(viewForRole(h.state,'hunter',f.env).questions[0]).not.toHaveProperty('answerPoi');h.send('hider',{type:'answer'});expect(h.state.questions[0]).toMatchObject({hunterFix:q.hunterFix,targetPoint:q.targetPoint});
 const r=h.state.rewards[0];expect(r.policy).toEqual({draw:4,keep:2});h.send('hider',{type:'draw_reward',rewardId:r.id});const offer=[...h.state.rewards[0].offer];h.state=readGameState(JSON.stringify(h.state),f.env);expect(h.state.rewards[0].offer).toEqual(offer);
 const saved=structuredClone(h.state);for(const ids of [[offer[0]],[offer[0],offer[0]],[offer[0],'absent'],offer]){expect(()=>h.send('hider',{type:'keep_reward',rewardId:r.id,cardIds:ids})).toThrow('přesně');expect(h.state).toEqual(saved);}
 h.send('hider',{type:'keep_reward',rewardId:r.id,cardIds:[offer[2],offer[0]]});expect(h.state.hand).toEqual([offer[2],offer[0]]);expect(h.state.discardPile).toEqual([offer[1],offer[3]]);expect(h.state.rewards[0].state).toBe('claimed');readGameState(h.state,f.env);
});
it('general N → K validates configuration, preserves exact card partition and persists hand overflow',()=>{
 const h=harness();const q=h.state.rules.questions.find(q=>q.id==='tentacles:library')!;q.rewardPolicy={draw:5,keep:3};for(let i=0;i<5;i++)h.grant('bonus-red');h.send('hunter',{type:'ask',questionId:q.id});h.send('hider',{type:'answer'});const r=h.state.rewards[0];h.send('hider',{type:'draw_reward',rewardId:r.id});const offer=h.state.rewards[0].offer;h.send('hider',{type:'keep_reward',rewardId:r.id,cardIds:offer.slice(0,3)});expect(h.state.hand).toHaveLength(8);expect(viewForRole(h.state,'hider',f.env).overflow).toBe(2);expect(()=>h.send('hunter',{type:'ask',questionId:'radar:400'})).toThrow('karetní');readGameState(h.state,f.env);
 const bad=deckRules('small');bad.questions[0].rewardPolicy={draw:2,keep:3};expect(()=>createGame({id:'bad',releaseId:f.release.releaseId,now:f.now,seed:42,rules:bad})).toThrow('keep');
});
it('Chalice adds draws, never keeps; partial measurements do not consume question effects or rewards',()=>{
 const h=harness(),cost=h.grant('bonus-red'),chalice=h.grant('curse-overflowing-chalice');h.send('hider',{type:'begin_cast',cardId:chalice});h.send('hider',{type:'confirm_cast',curseId:h.state.curses[0].id,proof:{discardIds:[cost]}});
 h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});expect(h.state.questions[0].rewardModifierIds).toBeUndefined();h.locate('hunter',[f.station.point[0]+.02,f.station.point[1]]);h.send('hunter',{type:'second_measurement'});h.send('hider',{type:'answer'});expect(h.state.rewards[0].policy).toEqual({draw:3,keep:1});
 h.send('hunter',{type:'ask',questionId:'tentacles:library'});const randomize=h.grant('randomize');h.send('hider',{type:'play_card',cardId:randomize});h.send('hider',{type:'answer'});expect(h.state.rewards[1].policy).toEqual({draw:5,keep:2});readGameState(h.state,f.env);
});
it('checks active category restrictions again at B, and rejects tampered phases, snapshots and keep counts',()=>{
 const h=harness();h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});h.locate('hunter',[f.station.point[0]+.02,f.station.point[1]]);
 h.state.curses.push({id:'fixture-curse',cardId:'fixture',name:'Test kategorie',description:'fixture',icon:'!',activatedAt:h.state.now,condition:'test',blocksQuestions:false,manual:false,target:'hunter',state:'ongoing',effects:[{id:'blocked',state:'active',spec:{kind:'block_category',category:'thermometer',text:'test'}}],evidence:[]});expect(()=>h.send('hunter',{type:'second_measurement'})).toThrow('kategorie');h.state.curses=[];h.send('hunter',{type:'second_measurement'});h.send('hider',{type:'answer'});
 for(const change of [(s:GameState)=>{s.questions[0].phase='awaiting_second_measurement';},(s:GameState)=>{s.questions[0].secondFix!.at=s.now+1;},(s:GameState)=>{s.rewards[0].policy.keep=4;}]){const bad=structuredClone(h.state);change(bad);expect(()=>readGameState(bad,f.env)).toThrow();}
});
it('role DTO exposes hunter movement but no H, diagnostic distances or private hand to the wrong role',()=>{
 const h=harness();h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});const hunter=viewForRole(h.state,'hunter',f.env),hider=viewForRole(h.state,'hider',f.env);expect(hunter.questions[0].measurement?.first).toEqual(f.station.point);expect(hider.questions[0]).not.toHaveProperty('measurement');for(const q of [hunter.questions[0],hider.questions[0]])for(const key of ['targetPoint','hunterFix','secondFix','before','after'])expect(q).not.toHaveProperty(key);expect(hunter.rewards).toBeUndefined();
});

it('Randomize before B retains the measurement phase and does not start a response timer',()=>{
 const h=harness(),card=h.grant('randomize');h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});const before=structuredClone(h.state.questions[0]);h.send('hider',{type:'play_card',cardId:card});expect(h.state.questions[0].definition.id).not.toBe(before.definition.id);expect(h.state.questions[0]).toMatchObject({phase:'awaiting_second_measurement',deadline:null,hunterFix:before.hunterFix,targetPoint:before.targetPoint});expect(h.state.questions[0].rewardModifierIds).toBeUndefined();readGameState(h.state,f.env);
});
it('an explicitly configured timer restart cannot change B capture time or invalidate its historic GPS',()=>{
 const h=harness();h.state.rules.randomize.restartTimer=true;h.locate('hunter',[f.station.point[0]+.1,f.station.point[1]]);h.send('hunter',{type:'ask',questionId:'thermometer:3-miles'});h.locate('hunter');h.send('hunter',{type:'second_measurement'});const before=structuredClone(h.state.questions[0]),card=h.grant('randomize');h.send('clock',{type:'tick'},h.state.now+240000);h.send('hider',{type:'play_card',cardId:card});const after=h.state.questions[0];expect(after.secondCapturedAt).toBe(before.secondCapturedAt);expect(after.secondFix).toEqual(before.secondFix);expect(after.responseStartedAt).toBe(h.state.now);expect(after.deadline).toBe(h.state.now+300000);h.state=readGameState(h.state,f.env);h.send('clock',{type:'tick'},after.deadline!);expect(h.state.questions[0].answer).toBe('TEPLEJI');readGameState(h.state,f.env);
});
it('Veto also cancels a tied Thermometer error without retaining a manual-resolution marker or giving cards',()=>{
 const h=harness(),card=h.grant('veto');h.locate('hunter',[f.station.point[0]-.01,f.station.point[1]]);h.send('hunter',{type:'ask',questionId:'thermometer:half-mile'});h.locate('hunter',[f.station.point[0]+.01,f.station.point[1]]);h.send('hunter',{type:'second_measurement'});h.send('hider',{type:'answer'});expect(h.state.questions[0].errorCode).toBe('thermometer_tie');h.send('hider',{type:'play_card',cardId:card});expect(h.state.questions[0]).toMatchObject({state:'vetoed'});expect(h.state.questions[0].errorCode).toBeUndefined();expect(h.state.rewards).toEqual([]);readGameState(h.state,f.env);
});

it('retains the existing Radar outside-area error flow while new spatial questions reject invalid starting points',()=>{
 const h=harness();h.locate('hunter',[0,0]);h.send('hunter',{type:'ask',questionId:'radar:400'});expect(h.state.questions[0].state).toBe('pending');h.send('hider',{type:'answer'});expect(h.state.questions[0]).toMatchObject({state:'error',error:expect.stringContaining('oblast')});const g=harness();g.locate('hunter',[0,0]);expect(()=>g.send('hunter',{type:'ask',questionId:'tentacles:library'})).toThrow('oblast');
});
