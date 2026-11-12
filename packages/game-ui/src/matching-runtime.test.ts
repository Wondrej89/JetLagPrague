import {beforeAll,expect,it,vi} from 'vitest';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {readGameState,type GameState,type Point} from '../../game-core/src/index';
import type {StreetNameProvider,StreetResolution} from '../../geo-resolver/src/streets';
import {LocalGameSession} from './runtime';
let f:Awaited<ReturnType<typeof gameFixture>>,baseline:GameState;
beforeAll(async()=>{f=await gameFixture();f.seeking();baseline=structuredClone(f.state);});
function delayed(){const requests:{point:Point;resolve(r:StreetResolution):void}[]=[];const resolve=vi.fn((point:Point)=>new Promise<StreetResolution>(done=>requests.push({point,resolve:done})));return {provider:{resolve} satisfies StreetNameProvider,requests};}
it('coalesces duplicate preparation/resume calls, saves partial work and resumes only the missing role after reload',async()=>{
 const data=delayed(),save=vi.fn(),host=new LocalGameSession(structuredClone(baseline),f.env,save,data.provider);
 const actual:Point=[f.station.point[0]+.002,f.station.point[1]];host.dispatch('hider',{type:'location',role:'hider',fix:{point:actual,at:host.state.now,accuracy:5}});
 await host.transport('hunter').send({type:'prepare_matching',questionId:'matching:street'});const id=host.state.matchingPreparation!.id;
 await host.transport('hunter').send({type:'prepare_matching',questionId:'matching:street'});void host.resumeMatchingPreparation();expect(host.state.matchingPreparation!.id).toBe(id);expect(data.provider.resolve).toHaveBeenCalledTimes(2);expect(data.requests.map(r=>r.point)).toEqual([baseline.fixes.hunter!.point,actual]);
 data.requests[0].resolve({state:'known',name:'Seifertova'});await vi.waitFor(()=>expect(host.state.matchingPreparation!.references.hunter?.name).toBe('Seifertova'));
 const restored=readGameState(JSON.stringify(host.state),f.env);host.dispose();const savedCount=save.mock.calls.length,nextData=delayed(),next=new LocalGameSession(restored,f.env,()=>{},nextData.provider),task=next.resumeMatchingPreparation();expect(nextData.provider.resolve).toHaveBeenCalledTimes(1);expect(nextData.requests[0].point).toEqual(actual);
 nextData.requests[0].resolve({state:'known',name:'Husitská'});await task;expect(next.transport('hunter').getView().matchingPreparation).not.toHaveProperty('hider');expect(next.transport('hider').getView().matchingPreparation?.hider?.name).toBe('Husitská');
 await next.transport('hunter').send({type:'ask',questionId:'matching:street',preparationId:id});expect(next.state.questions[0].targetPoint).toEqual(actual);expect(next.state.questions[0].matchingReferences?.hunter.name).toBe('Seifertova');
 data.requests[1].resolve({state:'known',name:'Old session must never save'});await host.resumeMatchingPreparation();await Promise.resolve();expect(save).toHaveBeenCalledTimes(savedCount);next.dispose();
});
it('ignores late results from an abandoned preparation and never re-geocodes saved question names or street corrections',async()=>{
 const data=delayed(),host=new LocalGameSession(structuredClone(baseline),f.env,()=>{},data.provider);host.dispatch('hunter',{type:'prepare_matching',questionId:'matching:street'});const old=host.state.matchingPreparation!.id;
 host.dispatch('hunter',{type:'prepare_matching',questionId:'matching:street',retry:true});const current=host.state.matchingPreparation!.id;expect(current).not.toBe(old);
 data.requests[0].resolve({state:'known',name:'OLD HUNTER'});data.requests[1].resolve({state:'known',name:'OLD HIDER'});data.requests[2].resolve({state:'known',name:'Seifertova'});data.requests[3].resolve({state:'known',name:'Husitská'});await host.resumeMatchingPreparation();
 expect(host.state.matchingPreparation!.references.hunter?.name).toBe('Seifertova');host.dispatch('hunter',{type:'ask',questionId:'matching:street',preparationId:current});host.dispatch('hider',{type:'correct_matching_reference',questionId:host.state.questions[0].id,name:'Ověřená soukromá ulice'});
 const saved=readGameState(JSON.stringify(host.state),f.env),provider={resolve:vi.fn()},restored=new LocalGameSession(saved,f.env,()=>{},provider);await restored.resumeMatchingPreparation();expect(provider.resolve).not.toHaveBeenCalled();expect(restored.transport('hunter').getView().questions[0].matchingReferences).not.toHaveProperty('hider');expect(restored.transport('hider').getView().questions[0].matchingReferences?.hider?.name).toBe('Ověřená soukromá ulice');host.dispose();restored.dispose();
});
it('keeps provider failures as manual preparation with no timer, and never uses a street provider for PID names',async()=>{
 const provider={resolve:vi.fn(async()=>({state:'unknown' as const,reason:'Mapy.com: HTTP 429.'}))},host=new LocalGameSession(structuredClone(baseline),f.env,()=>{},provider);host.dispatch('hunter',{type:'prepare_matching',questionId:'matching:street'});await host.resumeMatchingPreparation();expect(host.state.questions).toEqual([]);expect(host.state.matchingPreparation!.issues.hider).toContain('429');
 host.dispatch('hunter',{type:'correct_matching_reference',preparationId:host.state.matchingPreparation!.id,name:'Seifertova'});host.dispatch('hider',{type:'correct_matching_reference',preparationId:host.state.matchingPreparation!.id,name:'Husitská'});expect(host.transport('hunter').getView().matchingPreparation?.ready).toBe(true);
 const count=provider.resolve.mock.calls.length;host.dispatch('hunter',{type:'prepare_matching',questionId:'matching:stop_name'});await host.resumeMatchingPreparation();expect(provider.resolve).toHaveBeenCalledTimes(count);expect(host.state.matchingPreparation?.references.hider?.source).toBe('pid');host.dispose();
});
it('allows a future line-data provider through the same transport without mislabelling it as Mapy.com',async()=>{
 const provider:StreetNameProvider={source:'street-lines',note:'Syntetický test budoucího poskytovatele, nikoli skutečný import.',resolve:async()=>({state:'known',name:'Testovaná ulice'})},host=new LocalGameSession(structuredClone(baseline),f.env,()=>{},provider);
 host.dispatch('hunter',{type:'prepare_matching',questionId:'matching:street'});await host.resumeMatchingPreparation();host.dispatch('hunter',{type:'ask',questionId:'matching:street',preparationId:host.state.matchingPreparation!.id});
 expect(host.transport('hider').getView().questions[0].matchingReferences?.hider?.source).toBe('street-lines');expect(readGameState(JSON.stringify(host.state),f.env).questions[0].matchingReferences?.hunter.source).toBe('street-lines');host.dispose();
});
