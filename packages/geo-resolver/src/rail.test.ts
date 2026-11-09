import {beforeAll,beforeEach,expect,it} from 'vitest';
import {buildGameDataRelease,distanceMeters,nearestApprovedPoi,type GameDataRelease} from '../../geo-core/src/index';
import {releaseTestInput,releaseTestAirports,releaseTestDate} from '../../geo-core/src/game-release-test-fixtures';
import {testPlatform,testSnapshot} from '../../geo-core/src/pid-test-fixtures';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {questionRegistry,readGameState,transition,viewForRole,type GameState,type Point,type QuestionInstance} from '../../game-core/src/index';
import {createGeoResolver} from './index';
import {publishedGameLayers} from './catalog';
import {publishedRailCatalog} from './rail';

let f:Awaited<ReturnType<typeof gameFixture>>,baseline:GameState;
beforeAll(async()=>{f=await gameFixture();f.seeking();baseline=structuredClone(f.state);});
beforeEach(()=>{f.state=structuredClone(baseline);});
type PublishedStop=GameDataRelease['data']['pidSnapshot']['stops'][number];
const a:Point=[14.40,50.07],b:Point=[14.44,50.07];
function stop(id:string,point:Point,patch:Partial<PublishedStop>={}):PublishedStop {
 return {id,name:id,point,groupIds:[id],activity:'active',modes:['train'],referenceModes:['train'],dominantMode:'train',eligibility:'allowed',service:'day',...patch};
}
function release(stops:PublishedStop[]):GameDataRelease {
 return {...f.release,data:{...f.release.data,pidSnapshot:{...f.release.data.pidSnapshot,stops}}};
}
function question(hunter:Point,target:Point):QuestionInstance {
 return {id:'rail-test',definition:questionRegistry().find(q=>q.id==='measuring:rail')!,askedAt:f.now,deadline:f.now+300000,hunterFix:{point:hunter,at:f.now,accuracy:5},targetPoint:target,state:'pending'};
}
it('enables the existing automatic question, exact text, fixed station target, five minutes and 3 → 1',()=>{
 expect(question(a,b).definition).toMatchObject({id:'measuring:rail',description:'Jsi blíž, nebo dál od nejbližší železniční stanice než já?',resolver:'poi_measuring',availability:'ready',target:'station',timeoutSeconds:300,rewardPolicy:{draw:3,keep:1}});
});
it.each([
 [a,[14.405,50.07] as Point,'DÁL'],
 [[14.405,50.07] as Point,a,'BLÍŽ'],
 [a,b,'STEJNĚ'],
])('compares geographic distances for %j and %j → %s',(hunter,target,answer)=>{
 const result=createGeoResolver(release([stop('rail-a',a),stop('rail-b',b)])).resolve(question(hunter,target));
 expect(result).toMatchObject({state:'known',answer});
 expect(result.details!.hunterDistance).toBeCloseTo(Math.min(distanceMeters(hunter,a),distanceMeters(hunter,b)),6);
 expect(result.details!.targetDistance).toBeCloseTo(Math.min(distanceMeters(target,a),distanceMeters(target,b)),6);
});
it('finds a different nearest station for each player and keeps ties deterministic by stable ID',()=>{
 const source=release([stop('rail-b',b),stop('rail-a',a)]),q=question([14.405,50.07],[14.441,50.07]);
 expect(createGeoResolver(source).resolve(q)).toMatchObject({answer:'BLÍŽ',details:{hunterPoi:'rail-a',hunterStationName:'rail-a',targetPoi:'rail-b',targetStationName:'rail-b'}});
 const candidates=publishedRailCatalog(release([stop('z',a),stop('a',a)])).stations;
 expect(nearestApprovedPoi(a,'rail',candidates)).toMatchObject({state:'known',poi:{id:'a'},tiedIds:['a','z']});
});
it('retains train + metro interchanges and ignores hiding eligibility without changing hiding stops',()=>{
 const source=release([stop('interchange',a,{modes:['train','metro'],eligibility:'review'}),stop('metro-only',b,{modes:['metro'],referenceModes:['metro'],dominantMode:'metro'})]);
 const env=createGeoResolver(source),stations=publishedRailCatalog(source).stations;
 expect(stations.map(s=>s.id)).toEqual(['interchange']);expect(env.stops.map(s=>s.id)).toEqual(['metro-only']);
 expect(env.availability(question(a,b).definition).state).toBe('ready');
 const layer=publishedGameLayers(source).find(l=>l.id==='rail')!;
 expect(layer.features.map(s=>({id:s.id,point:s.geometry.type==='Point'?s.geometry.coordinates:null}))).toEqual(stations.map(s=>({id:s.id,point:s.point})));
});
it('uses one published group reference for multiple train platforms and lines, never the metro platform',async()=>{
 const {world}=await releaseTestInput();
 const first=testPlatform('platform-1','interchange','train',a);first.services.push({...first.services[0]});
 const snapshot=await testSnapshot([first,testPlatform('platform-2','interchange','train',[14.402,50.07]),testPlatform('metro','interchange','metro',b)]);
 const published=await buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate);
 const {stations}=publishedRailCatalog(published);
 expect(stations).toHaveLength(1);expect(stations[0]).toMatchObject({id:'pid-group:interchange',point:[14.401,50.07]});
 expect(published.data.pidSnapshot.stops[0].groupIds).toEqual(['interchange']);
});
it('rejects inactive trains, absent/invalid WGS84 and non-railway reference points defensively',()=>{
 // Validated releases already reject these malformed records. Check the adapter
 // as well so missing coordinates can never turn into [0, 0] or an invented POI.
 const invalid=[stop('inactive',a,{activity:'inactive' as PublishedStop['activity']}),stop('missing',null as unknown as Point),stop('invalid',[NaN,50]),stop('outside-wgs84',[181,50]),stop('bus-reference',a,{referenceModes:['bus'],modes:['train','bus']})];
 expect(publishedRailCatalog(release(invalid)).stations).toEqual([]);
 const env=createGeoResolver(release(invalid));expect(env.availability(question(a,b).definition)).toMatchObject({state:'missing_data',reason:expect.stringContaining('referenčním bodem')});expect(env.resolve(question(a,b)).state).toBe('unknown');
});
it('reports no trains or inconsistent data honestly, retaining historical reference-only access',()=>{
 const source=release([]),definition=question(a,b).definition;
 expect(createGeoResolver(source).availability(definition)).toMatchObject({state:'missing_data',reason:expect.stringContaining('železniční')});
 source.data.pidSnapshot.stops=[stop('rail',a)];source.data.pidSnapshot.quality='review';
 expect(createGeoResolver(source).availability(definition)).toMatchObject({state:'missing_data',reason:expect.stringContaining('konzistenci')});
 expect(publishedGameLayers(source).find(l=>l.id==='rail')!.features).toEqual([]);
 source.data.pidSnapshot.quality='verified';source.kind='reference';
 expect(createGeoResolver(source).availability(definition)).toMatchObject({state:'ready',reason:expect.stringContaining('Historická referenční data')});
 expect(publishedGameLayers(source).find(l=>l.id==='rail')!.state).toBe('reference');
});
it('uses the 42 current published aggregate stations without mutating the release or adding a stored POI catalog',()=>{
 const before=JSON.stringify(f.release),{stations}=publishedRailCatalog(f.release);
 expect(stations).toHaveLength(42);expect(new Set(stations.map(s=>s.id)).size).toBe(42);
 for(const s of stations)expect(s.point).toEqual(f.release.data.pidSnapshot.stops.find(p=>p.id===s.id)!.point);
 expect(f.release.data.pois.some(p=>String(p.category)==='rail')).toBe(false);expect(JSON.stringify(f.release)).toBe(before);
});
it('freezes GPS, resolves once at timeout, keeps 3 → 1, persists and filters private diagnostics from role history',()=>{
 f.state.rules.automaticDeductionMap=true;f.state.rules.deductionConsent={hunter:true,hider:true,authority:'simulator'};f.command('hunter',{type:'ask',questionId:'measuring:rail'});
 const original=structuredClone(f.state.questions[0]),expected=f.env.resolve(original);expect(expected.state).toBe('known');
 f.location('hunter',a);f.location('hider',b);f.command('clock',{type:'tick'},original.deadline!);
 expect(f.state.questions[0]).toMatchObject({hunterFix:original.hunterFix,targetPoint:original.targetPoint,answer:expected.answer,state:'answered'});
 expect(f.state.rewards).toHaveLength(1);expect(f.state.rewards[0].policy).toEqual({draw:3,keep:1});
 const restored=readGameState(JSON.stringify(f.state),f.env);expect(restored.questions).toEqual(f.state.questions);
 const view=viewForRole(restored,'hunter',f.env);expect(view.questions[0].answer).toBe(expected.answer);
 for(const key of ['targetPoint','details','hunterPoi','targetPoi','targetStationName','targetDistance'])expect(JSON.stringify(view.questions)).not.toContain(`"${key}"`);
 expect(view).not.toHaveProperty('station');expect(view.questions[0]).not.toHaveProperty('answerPoi');
 f.command('clock',{type:'tick'},original.deadline!+1);expect(f.state.rewards).toHaveLength(1);
});
it('preserves Veto and deterministic Randomize for the railway question',()=>{
 const veto=f.grant('veto');f.command('hunter',{type:'ask',questionId:'measuring:rail'});f.command('hider',{type:'play_card',cardId:veto});expect(f.state.questions[0].state).toBe('vetoed');expect(f.state.rewards).toEqual([]);
 f.state=structuredClone(baseline);const card=f.grant('randomize');f.command('hunter',{type:'ask',questionId:'measuring:rail'});
 const before=structuredClone(f.state),q=before.questions[0];f.command('hider',{type:'play_card',cardId:card});
 expect(f.state.questions[0].definition.id).not.toBe(q.definition.id);expect(f.state.questions[0]).toMatchObject({deadline:q.deadline,hunterFix:q.hunterFix,targetPoint:q.targetPoint});
 const replay=transition(before,{id:'rail-randomize-replay',actor:'hider',at:before.now,command:{type:'play_card',cardId:card}},f.env);expect(replay.questions).toEqual(f.state.questions);
});
