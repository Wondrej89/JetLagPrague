import {beforeAll,expect,it} from 'vitest';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {buildScenario,SCENARIOS} from '../../../apps/simulator/src/scenarios';
import {readGameState,viewForRole} from '../../game-core/src/index';
import {createGeoResolver} from './index';
let f:Awaited<ReturnType<typeof gameFixture>>;beforeAll(async()=>{f=await gameFixture();});
it('resolves real published Matching/Measuring/Radar without consulting editor sources',()=>{
 for(const [id,answer]of [['same-zoo','ANO'],['different-hospital','NE'],['measuring','DÁL'],['radar-in','ANO'],['radar-out','NE']] as const){const s=buildScenario(id,f.release,f.env,42),q=s.questions[0],r=f.env.resolve(q);expect(r,JSON.stringify({id,r})).toMatchObject({state:'known',answer});expect(r.details?.releaseId).toBe(f.release.releaseId);}
});
it('repeats every predefined scenario with identical seed/state and valid card partitions',()=>{for(const [id]of SCENARIOS){const a=buildScenario(id,f.release,f.env,97),b=buildScenario(id,f.release,f.env,97);expect(a).toEqual(b);readGameState(a,f.env);}});
it('missing categories and unconfigured Thermometer/Tentacles stay unavailable; elevation label compares altitude',()=>{
 const questions=f.rules.questions;for(const id of ['measuring:vltava','measuring:elevation','matching:golf'])expect(f.env.availability(questions.find(q=>q.id===id)!).state).toBe('missing_data');for(const q of questions.filter(q=>q.type==='thermometer'||q.type==='tentacles'))expect(f.env.availability(q).state).toBe('unsupported');expect(questions.find(q=>q.category==='elevation')!.description).toContain('nadmořská výška');
 const withoutZoo=createGeoResolver({...f.release,data:{...f.release.data,pois:f.release.data.pois.filter(p=>p.category!=='zoo')}});expect(withoutZoo.availability(questions.find(q=>q.id==='matching:zoo')!).state).toBe('missing_data');
});
it('uses exact water polygons with a zero distance inside; reference-point distance never substitutes them',()=>{
 const water=f.release.data.pois.find(p=>p.category==='waterbody')!,s=buildScenario('radar-in',f.release,f.env),q=s.questions[0];q.definition=f.rules.questions.find(q=>q.id==='measuring:waterbody')!;q.hunterFix.point=water.point;q.targetPoint=water.point;expect(f.env.resolve(q)).toMatchObject({state:'known',answer:'STEJNĚ',details:{hunterDistance:0,targetDistance:0}});
});
it('supports exact administrative Matching and explicit second positions for a configured thermometer adapter',()=>{
 const s=buildScenario('same-zoo',f.release,f.env),q=s.questions[0];q.definition=f.rules.questions.find(q=>q.id==='matching:municipal')!;expect(f.env.resolve(q)).toMatchObject({state:'known',answer:'ANO'});
 q.definition={...f.rules.questions.find(q=>q.type==='thermometer')!,configured:true,minMoveMeters:400,testOnly:true};expect(f.env.resolve(q).state).toBe('unknown');q.secondFix={...q.hunterFix,point:[q.hunterFix.point[0]+.01,q.hunterFix.point[1]]};expect(f.env.resolve(q)).toMatchObject({state:'known',answer:'CHLADNĚJI'});expect(viewForRole(s,'hunter',f.env).questions[0]).not.toHaveProperty('targetPoint');
});
