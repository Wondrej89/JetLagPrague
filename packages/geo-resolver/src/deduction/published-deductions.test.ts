import {beforeAll,expect,it} from 'vitest';
import {booleanPointInPolygon} from '@turf/turf';
import {gameFixture} from '../../../game-core/src/test-fixtures';
import {deckRules} from '../../../game-core/src/index';
import {MAP_SCENARIOS} from '../../../../apps/simulator/src/map-scenarios';
import {buildScenario} from '../../../../apps/simulator/src/scenarios';
import {DeductionComputer} from './geometry';
let fixture:Awaited<ReturnType<typeof gameFixture>>,computer:DeductionComputer,original:string;
beforeAll(async()=>{fixture=await gameFixture();original=JSON.stringify(fixture.release);computer=new DeductionComputer(fixture.release);});
it.each(MAP_SCENARIOS)('never excludes the true immutable target in the published scenario %s',(id)=>{
 const rules=deckRules('medium');rules.automaticDeductionMap=true;rules.deductionConsent={hunter:true,hider:true,authority:'simulator'};
 const state=buildScenario(id,fixture.release,fixture.env,42,rules),station=computer.compute(state.deductions??[],'station');
 if(station.excluded)expect(booleanPointInPolygon(state.station!.point,station.excluded)).toBe(false);
 for(const deduction of state.deductions!.filter(d=>d.status==='active'&&d.geometryTarget==='gps')){const snapshot=state.questions.find(q=>q.id===deduction.questionId)!,result=computer.compute([deduction],'gps');if(result.excluded)expect(booleanPointInPolygon(snapshot.targetPoint,result.excluded)).toBe(false);}
},15000);
it('keeps the published geometries, coordinates, metadata and checksums unchanged',()=>{expect(JSON.stringify(fixture.release)).toBe(original);});
