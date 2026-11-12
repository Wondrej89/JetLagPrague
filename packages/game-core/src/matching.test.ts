import {beforeAll,expect,it,vi} from 'vitest';
import {gameFixture} from './test-fixtures';
import {completeMatchingReference,matchingNameLength,readGameState,sameStreetName,transition,viewForRole,type Command,type GameState,type Point,type Role} from './index';
import {createGeoResolver} from '../../geo-resolver/src/index';
let f:Awaited<ReturnType<typeof gameFixture>>,baseline:GameState;
beforeAll(async()=>{f=await gameFixture();f.seeking();baseline=structuredClone(f.state);});
function harness(){let state=structuredClone(baseline),sequence=0;return {get state(){return state;},set state(s:GameState){state=s;},send(actor:Role|'clock',command:Command,at=state.now){state=transition(state,{id:`matching-test-${++sequence}`,actor,at,command},f.env);},locate(role:Role,point:Point){this.send(role,{type:'location',role,fix:{point,at:state.now,accuracy:5}});},prepare(id='matching:street'){this.send('hunter',{type:'prepare_matching',questionId:id});return state.matchingPreparation!;},complete(hunter='Seifertova',hider='Husitská'){const p=state.matchingPreparation!;for(const [role,name] of [['hunter',hunter],['hider',hider]] as const)state=completeMatchingReference(state,p.id,role,{reference:{source:'mapy-reverse-geocoding',name,capturedAt:p.capturedAt}});},ask(id='matching:street'){this.send('hunter',{type:'ask',questionId:id,preparationId:state.matchingPreparation!.id});return state.questions.at(-1)!;}};}
it.each([['Českomoravská',13],['Štěpánská',9],['Náměstí Míru',11],['Nádraží–Vršovice!',15],['A. B., 123',2],['e\u030c',1],['ch',2]])('counts Unicode letters only in %s → %s',(name,length)=>expect(matchingNameLength(name)).toBe(length));
it('uses aggregated published nearest stops, deterministic ID ties and the locked target, not the hider GPS',()=>{
 const h=harness(),hunter=f.env.stops.find(p=>f.env.distance(p.point,f.station.point)>2000)!;h.locate('hunter',hunter.point);h.locate('hider',hunter.point);const p=h.prepare('matching:stop_name');
 expect(p.targetPoint).toEqual(f.station.point);expect(p.references.hunter?.id).toBe(f.env.nearestStop!(hunter.point)!.id);expect(p.references.hider?.id).toBe(f.env.nearestStop!(f.station.point)!.id);expect(p.references.hunter?.id).not.toBe(p.references.hider?.id);expect(h.state.questions).toEqual([]);
 const q=h.ask('matching:stop_name');expect(q.definition.target).toBe('station');expect(q.targetPoint).toEqual(f.station.point);expect(q.targetFix).toBeUndefined();expect(q.matchingReferences?.hunter.letters).toBe(matchingNameLength(hunter.name));
 const template=f.release.data.pidSnapshot.stops[0],source={...f.release,data:{...f.release.data,pidSnapshot:{...f.release.data.pidSnapshot,stops:['z','a'].map(id=>({...template,id,point:f.station.point,name:id,groupIds:[id]}))}}};
 expect(createGeoResolver(source).nearestStop!(f.station.point)?.id).toBe('a');
});
it('keeps both exact street GPS snapshots and source version, requiring current accurate GPS from BOTH roles',()=>{
 const h=harness(),actual:Point=[f.station.point[0]+.002,f.station.point[1]];h.locate('hider',actual);const p=h.prepare();h.complete();const q=h.ask();
 expect(q.targetPoint).toEqual(actual);expect(q.targetPoint).not.toEqual(f.station.point);expect(q.targetFix).toEqual(p.targetFix);expect(q.hunterFix).toEqual(p.hunterFix);expect(q.matchingReferences).toMatchObject({releaseId:f.release.releaseId,measurementAt:q.askedAt});expect(q.deadline!-q.askedAt).toBe(300000);
 h.locate('hunter',actual);h.locate('hider',f.station.point);expect(h.state.questions[0]).toEqual(q);
 for(const role of ['hunter','hider'] as const)for(const bad of [null,{point:actual,at:baseline.now,accuracy:51},{point:actual,at:baseline.now-120001,accuracy:5}]){const invalid=harness();invalid.send(role,{type:'location',role,fix:bad});expect(()=>invalid.prepare()).toThrow(/GPS/);expect(invalid.state.questions).toEqual([]);}
});
it('does not send an incomplete question, start a timer or perform HTTP in the reducer; moved GPS requires a new preparation',()=>{
 const h=harness(),fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 try{const p=h.prepare();expect(()=>h.ask()).toThrow('obou názvů');expect(h.state.questions).toEqual([]);expect(h.state.rewards).toEqual([]);h.complete();h.locate('hunter',[f.station.point[0]+.001,f.station.point[1]]);expect(()=>h.ask()).toThrow('aktuální');expect(fetcher).not.toHaveBeenCalled();expect(viewForRole(h.state,'hunter',f.env).matchingPreparation?.ready).toBe(false);expect(h.state.matchingPreparation?.id).toBe(p.id);}finally{vi.unstubAllGlobals();}
});
it('lets the hider manually confirm either verdict, never auto-answers at timeout, and preserves Matching 3 → 1',()=>{
 const h=harness();h.prepare();h.complete('Seifertova','seifertova');h.ask();expect(viewForRole(h.state,'hider',f.env).questions[0].matchingReferences?.suggestedAnswer).toBe('ANO');
 h.send('clock',{type:'tick'},h.state.now+300001);expect(h.state.questions[0].state).toBe('pending');expect(h.state.rewards).toEqual([]);expect(()=>h.send('hider',{type:'answer',answer:'NE'})).toThrow('ověřte');
 h.send('hider',{type:'answer',answer:'NE',matchingVerified:true});expect(h.state.questions[0].answer).toBe('NE');expect(h.state.rewards).toHaveLength(1);expect(h.state.rewards[0].policy).toEqual({draw:3,keep:1});expect(readGameState(JSON.stringify(h.state),f.env).questions).toEqual(h.state.questions);
 expect(sameStreetName(' Seifertova ','seifertova')).toBe(true);expect(sameStreetName('Husitská','Seifertova')).toBe(false);
});
it('records manual fallback/corrections and keeps the hider name, GPS and audit private before AND after the answer',()=>{
 const h=harness(),actual:Point=[f.station.point[0]+.002,f.station.point[1]],secret='Soukromá ulice schovaného';h.locate('hider',actual);const p=h.prepare();
 h.state=completeMatchingReference(h.state,p.id,'hunter',{reference:{source:'mapy-reverse-geocoding',name:'Seifertova',capturedAt:p.capturedAt}});h.state=completeMatchingReference(h.state,p.id,'hider',{issue:'API nedokáže určit ulici.'});
 expect(viewForRole(h.state,'hunter',f.env).matchingPreparation).not.toHaveProperty('hider');h.send('hider',{type:'correct_matching_reference',preparationId:p.id,name:secret});h.ask();
 const assertPrivate=()=>{const dto=viewForRole(h.state,'hunter',f.env);expect(JSON.stringify(dto)).not.toContain(secret);expect(JSON.stringify(dto)).not.toContain(JSON.stringify(actual));expect(dto.questions[0]).not.toHaveProperty('targetFix');expect(dto.questions[0].matchingReferences).not.toHaveProperty('hider');expect(dto.questions[0].matchingReferences?.corrections).toEqual([]);};
 assertPrivate();expect(()=>h.send('hunter',{type:'correct_matching_reference',questionId:h.state.questions[0].id,name:'Pokus'})).toThrow('vlastní ulici');
 h.send('hider',{type:'correct_matching_reference',questionId:h.state.questions[0].id,name:secret+' II'});assertPrivate();h.send('hider',{type:'answer',answer:'NE',matchingVerified:true});assertPrivate();
 const restored=readGameState(JSON.stringify(h.state),f.env),privateRefs=viewForRole(restored,'hider',f.env).questions[0].matchingReferences!;expect(privateRefs.hider?.manuallyCorrected).toBe(true);expect(privateRefs.corrections).toHaveLength(2);expect(privateRefs.verifiedAt).toBe(h.state.questions[0].answeredAt);
});
it('accepts historical drafts unchanged and rejects a forged GPS or missing references in new helper questions',()=>{
 const old=structuredClone(baseline);for(const d of old.rules.questions){delete d.referenceVersion;if(d.id==='matching:street'){d.target='station';d.resolver='unsupported';d.availability='missing_data';}}
 expect(readGameState(JSON.stringify(old),f.env)).toEqual(old);
 const h=harness();h.prepare();h.complete();h.ask();const bad=structuredClone(h.state);bad.questions[0].targetFix!.point=[0,0];expect(()=>readGameState(bad,f.env)).toThrow('GPS snapshot');delete h.state.questions[0].matchingReferences;expect(()=>readGameState(h.state,f.env)).toThrow('referenční názvy');
});
