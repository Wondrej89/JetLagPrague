import {beforeAll,expect,it} from 'vitest';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {questionRegistry,type Point,type QuestionInstance} from '../../game-core/src/index';
import {distanceMeters,type GameDataRelease} from '../../geo-core/src/index';
import {createGeoResolver} from './index';
import {buildScenario} from '../../../apps/simulator/src/scenarios';
let f:Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async()=>{f=await gameFixture();});
const s:Point=[14.42,50.08];
function question(type:'tentacles'|'thermometer'='tentacles'):QuestionInstance{return {id:'synthetic',definition:questionRegistry().find(q=>q.id===(type==='tentacles'?'tentacles:library':'thermometer:half-mile'))!,askedAt:f.now,deadline:f.now+300000,state:'pending',hunterFix:{point:s,at:f.now,accuracy:5},targetPoint:[14.438,50.08]};}
function pointPoi(id:string,point:Point){return {...f.release.data.pois.find(p=>p.category==='library')!,id,name:id,point,geometry:{type:'Point' as const,coordinates:point},status:'approved' as const};}
function resolver(pois:GameDataRelease['data']['pois']){return createGeoResolver({...f.release,data:{...f.release.data,pois}});}
it('selects the closest H candidate in C, ignoring a globally closer but hunter-ineligible POI and no direct S–H cap',()=>{
 const included=pointPoi('included',[14.429,50.08]),outside=pointPoi('global-nearest',[14.438,50.08]),q=question();q.definition.radiusMeters=1000;
 const r=resolver([outside,included]).resolve(q);expect(distanceMeters(q.hunterFix.point,q.targetPoint)).toBeGreaterThan(1000);expect(r).toMatchObject({state:'known',answer:'included',publicPoi:{id:'included',name:'included',point:included.point},details:{candidateCount:1,targetPoi:'included'}});
});
it('chooses from multiple candidates by distance to H, never distance to S',()=>{
 const nearS=pointPoi('near-S',[14.422,50.08]),nearH=pointPoi('near-H',[14.429,50.08]),q=question();q.definition.radiusMeters=1000;expect(resolver([nearS,nearH]).resolve(q)).toMatchObject({answer:'near-H',details:{candidateCount:2}});
});
it('returns out of reach for no C and for a nonempty C too far from H',()=>{
 const q=question();q.definition.radiusMeters=100;const none=resolver([pointPoi('far',[14.44,50.08])]).resolve(q);expect(none).toMatchObject({state:'known',answer:'NEJSEM V DOSAHU',details:{candidateCount:0}});expect(none.publicPoi).toBeUndefined();const distant=resolver([pointPoi('at-S',s)]).resolve(q);expect(distant).toMatchObject({state:'known',answer:'NEJSEM V DOSAHU',details:{candidateCount:1}});expect(distant.publicPoi).toBeUndefined();
});
it('includes the exact radius boundary at both S and H',()=>{
 const q=question(),poi=pointPoi('edge',[14.429,50.08]);q.targetPoint=s;q.definition.radiusMeters=distanceMeters(s,poi.point);expect(resolver([poi]).resolve(q)).toMatchObject({state:'known',answer:'edge'});
 q.definition.radiusMeters-=.01;expect(resolver([poi]).resolve(q)).toMatchObject({state:'known',answer:'NEJSEM V DOSAHU'});
});
it('resolves exact distance ties by stable ID irrespective of input ordering',()=>{
 const q=question();q.targetPoint=s;const a=pointPoi('a',[14.421,50.08]),b=pointPoi('b',[14.419,50.08]);for(const pois of [[b,a],[a,b]])expect(resolver(pois).resolve(q)).toMatchObject({answer:'a',publicPoi:{id:'a'}});
});
it('ignores excluded/review records; missing approved data means unknown rather than out of reach',()=>{
 const q=question(),poi=pointPoi('excluded',s),env=resolver([{...poi,status:'excluded'},{...poi,id:'review',status:'review'}] as unknown as GameDataRelease['data']['pois']);expect(env.availability(q.definition).state).toBe('missing_data');expect(env.resolve(q).state).toBe('unknown');
});
it('measures a polygon surface, holes and detached MultiPolygon parts instead of the reference point',()=>{
 const q=question(),poi=pointPoi('polygon',[14.5,50.12]);q.targetPoint=[14.42,50.08];q.definition.radiusMeters=20;
 const ring=(x:number,y:number,d:number)=>[[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]];
 const poly={...poi,geometry:{type:'Polygon' as const,coordinates:[ring(14.42,50.08,.002)]}};expect(resolver([poly]).resolve(q)).toMatchObject({answer:'polygon',details:{targetDistance:0,hunterDistance:0},publicPoi:{point:poi.point}});
 const hole={...poly,geometry:{...poly.geometry,coordinates:[ring(14.42,50.08,.002),ring(14.42,50.08,.001)]}};expect(resolver([hole]).resolve(q)).toMatchObject({answer:'NEJSEM V DOSAHU'});
 const multi={...poly,geometry:{type:'MultiPolygon' as const,coordinates:[[ring(14.45,50.1,.001)],[ring(14.42,50.08,.001)]]}};expect(resolver([multi]).resolve(q)).toMatchObject({answer:'polygon',details:{targetDistance:0}});
});
it('never substitutes a stop for a metro line and rejects unreliable geometry',()=>{
 const q=question();q.definition.category='metro_line';expect(resolver([]).availability(q.definition)).toMatchObject({state:'missing_data'});
 const invalid={...pointPoi('broken',s),geometry:{type:'Polygon' as const,coordinates:[]}};expect(resolver([invalid]).resolve(question())).toMatchObject({state:'unknown'});
});
it.each([['thermo-warmer','TEPLEJI'],['thermo-colder','CHLADNĚJI'],['thermo-hider-moves','TEPLEJI'],['thermo-boundary','TEPLEJI']] as const)('published %s yields %s using immutable A/B/H snapshots', (id,answer)=>{
 const state=buildScenario(id,f.release,f.env),q=state.questions[0];q.secondFix=structuredClone(state.fixes.hunter);expect(f.env.resolve(q)).toMatchObject({state:'known',answer});if(id==='thermo-hider-moves')expect(q.targetPoint).not.toEqual(state.fixes.hider!.point);
});
it('rejects insufficient movement and a second fix outside Prague',()=>{
 const state=buildScenario('thermo-short',f.release,f.env),q=state.questions[0];q.secondFix=state.fixes.hunter;expect(f.env.resolve(q)).toMatchObject({state:'unknown',reason:expect.stringContaining('vzdálenost')});q.secondFix={...q.hunterFix,point:[0,0]};expect(f.env.resolve(q)).toMatchObject({state:'unknown',reason:expect.stringContaining('oblast')});
});
it('returns explicit unknown for identical distances or differences within one metre',()=>{
 const q=question('thermometer');q.targetPoint=[14.43,50.08];q.hunterFix.point=[14.42,50.08];q.secondFix={...q.hunterFix,point:[14.44,50.08]};expect(f.env.resolve(q)).toMatchObject({state:'unknown',code:'thermometer_tie'});q.secondFix.point[0]+=.000001;expect(f.env.resolve(q)).toMatchObject({state:'unknown',code:'thermometer_tie'});
});
it('runs real library scenarios, exact real-catalog tie and persisted public POI without editor data',()=>{
 const one=buildScenario('tentacles-one',f.release,f.env),many=buildScenario('tentacles-many',f.release,f.env),tie=buildScenario('tentacles-tie',f.release,f.env);
 expect(f.env.resolve(one.questions[0]).details?.candidateCount).toBe(1);expect(Number(f.env.resolve(many.questions[0]).details?.candidateCount)).toBeGreaterThan(1);
 const r=f.env.resolve(tie.questions[0]);expect(r.state).toBe('known');const distances=f.release.data.pois.filter(p=>p.category==='library').map(p=>({p,d:distanceMeters(p.point,tie.questions[0].targetPoint)}));const min=Math.min(...distances.map(p=>p.d));const candidates=distances.filter(p=>p.d-min<=.000001).map(p=>p.p);expect(candidates.length).toBeGreaterThanOrEqual(2);expect(r.publicPoi?.id).toBe(candidates.map(p=>p.id).sort()[0]);
 for(const id of ['tentacles-none','tentacles-far'])expect(f.env.resolve(buildScenario(id,f.release,f.env).questions[0])).toMatchObject({state:'known',answer:'NEJSEM V DOSAHU'});
});
it('makes every published POI category available without UI-specific adapters while absent types remain missing',()=>{
 const qs=questionRegistry();for(const category of ['airport','park','waterbody','zoo','hospital','library','cinema'])expect(f.env.availability(qs.find(q=>q.id===`tentacles:${category}`)!)).toMatchObject({state:'ready'});for(const category of ['museum','aquarium','amusement_park','metro_line'])expect(f.env.availability(qs.find(q=>q.id===`tentacles:${category}`)!)).toMatchObject({state:'missing_data'});
});
