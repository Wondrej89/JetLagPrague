import {beforeAll,expect,it} from 'vitest';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {deductionFromQuestion,questionRegistry,viewForRole,type QuestionInstance} from '../../game-core/src/index';
import {VLTAVA_MISSING_DATA_REASON} from '../../geo-core/src/index';
import {createGeoResolver} from './index';
import {publishedGameLayers} from './catalog';
let f:Awaited<ReturnType<typeof gameFixture>>;beforeAll(async()=>{f=await gameFixture();});
it('keeps the correct question and policy but reports the specific missing authoritative river geometry',()=>{
 const d=questionRegistry().find(q=>q.id==='measuring:vltava')!;expect(d).toMatchObject({description:'Jsi blíž, nebo dál od Vltavy než já?',resolver:'unsupported',target:'station',timeoutSeconds:300,rewardPolicy:{draw:3,keep:1}});
 expect(f.env.availability(d)).toEqual({state:'missing_data',reason:VLTAVA_MISSING_DATA_REASON});expect(f.env.availability(f.rules.questions.find(q=>q.id==='matching:landmass')!).state).toBe('missing_data');
 const q:QuestionInstance={id:'missing-river',definition:d,askedAt:f.now,deadline:f.now+300000,hunterFix:{point:[14.44,50.08],at:f.now,accuracy:5},targetPoint:f.station.point,state:'pending'};
 expect(f.env.resolve(q)).toEqual({state:'unknown',reason:VLTAVA_MISSING_DATA_REASON});expect(deductionFromQuestion(f.state,{...q,state:'answered',answer:'BLÍŽ',answeredAt:f.now})).toBeNull();
});
it('does not substitute a waterbody named Vltava, a centroid, island parks or an unsupported adapter',()=>{
 const source=structuredClone(f.release),pond=source.data.pois.find(p=>p.category==='waterbody')!;pond.name='Vltava';
 const env=createGeoResolver(source),d={...f.rules.questions.find(q=>q.id==='measuring:vltava')!,resolver:'poi_measuring' as const};expect(env.availability(d)).toEqual({state:'missing_data',reason:VLTAVA_MISSING_DATA_REASON});
 const layer=publishedGameLayers(source).find(l=>l.id==='vltava')!;expect(layer).toMatchObject({state:'missing',features:[],note:VLTAVA_MISSING_DATA_REASON});expect(publishedGameLayers(source).find(l=>l.id==='waterbody')!.features.length).toBeGreaterThan(0);
});
it('cannot start a Vltava timer, create a reward or disclose a hidden position from missing data',()=>{
 f.seeking();const before=structuredClone(f.state);expect(()=>f.command('hunter',{type:'ask',questionId:'measuring:vltava'})).toThrow(VLTAVA_MISSING_DATA_REASON);expect(f.state).toEqual(before);expect(f.state.questions).toEqual([]);expect(f.state.deductions).toEqual([]);expect(f.state.rewards).toEqual([]);
 const view=viewForRole(f.state,'hunter',f.env);expect(view).not.toHaveProperty('station');expect(view.availableQuestions.find(q=>q.id==='measuring:vltava')).toMatchObject({availability:'missing_data',reason:VLTAVA_MISSING_DATA_REASON});
 expect(f.env.availability(f.rules.questions.find(q=>q.id==='measuring:waterbody')!).state).toBe('ready');expect(f.env.availability(f.rules.questions.find(q=>q.id==='radar:800')!).state).toBe('ready');
});
