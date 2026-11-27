import {booleanPointInPolygon, pointToPolygonDistance} from '@turf/turf';
import {beforeAll,expect,it} from 'vitest';
import {canonicalJson,createGameDataRelease,readGameReleaseArtifact,releaseEntry,sha256,type GameDataRelease} from '../../geo-core/src/index';
import {landAreaAt} from '../../geo-core/src/river-land';
import {deductionFromQuestion,questionRegistry,readGameState,viewForRole,type Fix,type Point,type QuestionInstance} from '../../game-core/src/index';
import {prepareRiverLayers,reviewRiverLayers} from '../../../scripts/river-release-preparation';
import {createGeoResolver} from './index';
import {publishedGameLayers} from './catalog';
import {DeductionComputer} from './deduction/geometry';
import {createRiverDistance} from './river';
import {gameFixture} from '../../game-core/src/test-fixtures';
import {riverFixture} from './river-test-fixture';

let f:Awaited<ReturnType<typeof riverFixture>>;
beforeAll(async()=>{f=await riverFixture();},30_000);

const left:Point=[14.36,50.08],right:Point=[14.48,50.08];
const bridge:Point=[14.411,50.0813],vltava:Point=[14.41,50.0863],berounka:Point=[14.35,49.974];
function question(id:'measuring:vltava'|'matching:landmass',a:Point,b:Point):QuestionInstance {
 const definition=questionRegistry().find(q=>q.id===id)!;
 const snapshot=(point:Point)=>({point,at:f.base.now,accuracy:5});
 return {id,definition,hunterFix:snapshot(a),targetPoint:b,...(definition.target==='gps'?{targetFix:snapshot(b)}:{}),askedAt:f.base.now,deadline:f.base.now+300_000,state:'pending'};
}
const stop=(name:string)=>f.release.data.pidSnapshot.stops.find(stop=>stop.name===name)!.point;
const park=(name:string)=>f.release.data.pois.find(poi=>poi.name===name)!.point;

async function landGame(target:'station'|'gps'='gps'){
 const game=await gameFixture();
 const station=game.env.stops.find(stop=>stop.name==='Národní divadlo')!;
 const rules=game.state.rules;
 const definition=rules.questions.find(q=>q.id==='matching:landmass')!;
 expect(definition.target).toBe('gps');
 definition.target=target;
 rules.automaticDeductionMap=true;
 rules.deductionConsent={hunter:true,hider:true,authority:'simulator'};
 game.location('hider',station.point);
 game.command('hider',{type:'lock_station',stopId:station.id});
 return {game,station};
}

it('uses the private GPS of both players at ask time for Pevnina and draws a GPS deduction',async()=>{
 const {game,station}=await landGame(),zofin=park('Ostrov Žofín');
 game.location('hunter',right);
 game.location('hider',zofin);
 game.command('hunter',{type:'ask',questionId:'matching:landmass'});
 const first=structuredClone(game.state.questions[0]);
 expect(first).toMatchObject({definition:{target:'gps'},hunterFix:{point:right},targetFix:{point:zofin},targetPoint:zofin});
 expect(game.env.resolve(first)).toMatchObject({state:'known',answer:'NE'});
 game.location('hider',station.point);
 game.state=readGameState(game.state,game.env);
 game.command('clock',{type:'tick'},first.deadline!);
 expect(game.state.questions[0]).toMatchObject({answer:'NE',hunterFix:first.hunterFix,targetFix:first.targetFix});
 expect(game.state.deductions).toMatchObject([{geometryTarget:'gps',result:'NE',parameters:{hunterPoint:right}}]);
 const hunter=JSON.stringify(viewForRole(game.state,'hunter',game.env));
 expect(hunter).not.toContain(JSON.stringify(zofin));
 expect(hunter).not.toContain('"targetFix"');
 expect(hunter).not.toContain('"targetPoint"');

 game.location('hunter',[14.41317,50.07812]);
 game.location('hider',zofin);
 game.command('hunter',{type:'ask',questionId:'matching:landmass'});
 game.location('hunter',right);
 game.command('hider',{type:'answer'});
 expect(readGameState(game.state,game.env).questions[1]).toMatchObject({answer:'ANO',targetFix:{point:zofin}});
 expect(game.state.deductions?.[1]).toMatchObject({geometryTarget:'gps',result:'ANO'});
 delete game.state.questions[1].targetFix;
 expect(()=>readGameState(game.state,game.env)).toThrow('GPS snapshoty');
});

it('rejects unavailable or ambiguous GPS for either role before starting the question',async()=>{
 const {game}=await landGame(),zofin=park('Ostrov Žofín');
 const area=landAreaAt(f.release.data.landAreas!.areas,zofin)!;
 const [longitude,latitude]=(area.geometry.type==='Polygon'?area.geometry.coordinates:area.geometry.coordinates[0])[0][0];
 const ask=()=>game.command('hunter',{type:'ask',questionId:'matching:landmass'});
 game.location('hunter',right);
 game.location('hider',zofin);
 for(const role of ['hunter','hider'] as const){
  const point=game.state.fixes[role]!.point,at=game.state.now;
  const badFixes:(Fix|null)[]=[null,{point,at:at-game.rules.gpsMaxAgeMs-1,accuracy:5},{point,at,accuracy:game.rules.gpsMaxAccuracyM+1}];
  for(const fix of badFixes){
   game.command(role,{type:'location',role,fix});
   expect(ask).toThrow('Chybí aktuální přesná GPS');
  }
  game.location(role,[longitude,latitude]);
  expect(ask).toThrow('jednoznačně uvnitř');
  expect(game.state.questions).toEqual([]);
  expect(game.state.rewards).toEqual([]);
  game.location(role,point);
 }
});

it('reloads a historical Pevnina question and still answers using its station target',async()=>{
 const {game,station}=await landGame('station');
 game.location('hunter',right);
 game.location('hider',park('Ostrov Žofín'));
 game.command('hunter',{type:'ask',questionId:'matching:landmass'});
 game.state=readGameState(game.state,game.env);
 expect(game.state.questions[0]).toMatchObject({definition:{target:'station'},targetPoint:station.point});
 expect(game.state.questions[0].targetFix).toBeUndefined();
 game.command('hider',{type:'answer'});
 expect(readGameState(game.state,game.env).questions[0].answer).toBe('ANO');
 expect(game.state.deductions?.[0].geometryTarget).toBe('station');
});

it('preserves the river polygon and measures the closest water or bank on both rivers, including holes and bridges',()=>{
 const water=f.candidate.feature.geometry;
 const {distanceToRiver}=createRiverDistance(water);
 const bank=(water.type==='Polygon'?water.coordinates:water.coordinates[0])[0][0] as Point;
 for(const point of [bank,vltava,bridge])expect(distanceToRiver(point)).toBe(0);
 for(const point of [berounka,park('Ostrov Žofín'),left,right,stop('Podolská vodárna')]){
  expect(distanceToRiver(point)).toBeGreaterThan(0);
  expect(distanceToRiver(point)).toBeCloseTo(pointToPolygonDistance(point,water,{units:'meters',method:'geodesic'}),6);
 }
 expect(distanceToRiver(berounka)).toBeCloseTo(110.724,2);
 expect(distanceToRiver(stop('Podolská vodárna'))).toBeCloseTo(72.542,2);
 const env=createGeoResolver(f.release);
 expect(env.resolve(question('measuring:vltava',berounka,vltava))).toMatchObject({state:'known',answer:'BLÍŽ'});
 expect(env.resolve(question('measuring:vltava',vltava,berounka))).toMatchObject({state:'known',answer:'DÁL'});
 expect(env.resolve(question('measuring:vltava',vltava,bridge))).toMatchObject({state:'known',answer:'STEJNĚ'});
 const layer=publishedGameLayers(f.release).find(layer=>layer.id==='vltava')!;
 expect(layer.features.map(item=>item.geometry)).toEqual([water]);
});

it('classifies the banks, Zbraslav, and the islands as distinct actual components',()=>{
 const env=createGeoResolver(f.release);
 const zofin=park('Ostrov Žofín'),shooter=park('Střelecký ostrov'),zbraslav=stop('Zbraslav');
 const cases:[Point,Point,string][]=[
  [left,stop('Klamovka'),'ANO'],[left,right,'NE'],[left,zbraslav,'NE'],[zbraslav,right,'NE'],
  [shooter,[14.41,50.08],'ANO'],[shooter,zofin,'NE'],[shooter,left,'NE'],[zofin,stop('Národní divadlo'),'NE'],
 ];
 for(const [a,b,answer] of cases)expect(env.resolve(question('matching:landmass',a,b))).toMatchObject({state:'known',answer});
 const land=f.layers.land.areas;
 const zofinArea=landAreaAt(land,zofin)!;
 const rings=zofinArea.geometry.type==='Polygon'?zofinArea.geometry.coordinates:zofinArea.geometry.coordinates[0];
 for(const point of [vltava,rings[0][0] as Point])expect(env.resolve(question('matching:landmass',point,zofin)))
   .toMatchObject({state:'unknown',reason:expect.stringContaining('jednoznačně')});
 expect(f.candidate.report.land).toMatchObject({total:24,boundaryComponents:6,islandComponents:18,zofinSeparated:true,
   zofinAreaId:zofinArea.id,appliedSeparations:[{name:'mánes'}],problems:[]});
 expect(f.candidate.report.pid).toMatchObject({eligible:1457,checked:1457,assigned:1457,unresolved:[]});
 expect(new Set(land.map(area=>area.id)).size).toBe(24);
 const map=publishedGameLayers(f.release).find(layer=>layer.id==='landmass')!;
 expect(map.features.map(item=>item.geometry)).toEqual(land.map(area=>area.geometry));
 expect(new Set(map.features.map(item=>item.properties?.color)).size).toBe(24);
});

it('reports missing real separation input and refuses to export unverified original metadata',async()=>{
 const preview=await reviewRiverLayers(f.base.release.data,f.feature,null);
 expect(preview.report.land).toMatchObject({total:23,zofinSeparated:false,appliedSeparations:[]});
 expect(landAreaAt(preview.areas,park('Ostrov Žofín'))?.id)
   .toBe(landAreaAt(preview.areas,stop('Národní divadlo'))?.id);
 expect(preview.report.land.problems).toEqual(expect.arrayContaining([expect.stringContaining('Mánesa'),expect.stringContaining('Chybí schválený JSON')]));
 const stable=preview.areas.filter(a=>a.kind==='island').map(a=>a.id);
 expect(f.layers.land.areas.filter(a=>a.kind==='island'&&a.name!=='Ostrov Žofín').map(a=>a.id)).toEqual(stable);
 await expect(prepareRiverLayers(preview,f.proof)).rejects.toThrow('Mánesa');
 const source=f.candidate.feature.properties.source;
 await expect(prepareRiverLayers(f.candidate,{review:f.layers.river.metadataReview,license:source.license,dataDate:source.dataDate})).rejects.toThrow('není doložená');
},20_000);

it('verifies both content checksums and stops layers from being paired with different river versions or unresolved PID stops',async()=>{
 const entry=await releaseEntry(f.release);
 const restored=await readGameReleaseArtifact(canonicalJson(f.release),entry);
 expect(restored.schemaVersion).toBe(9);
 expect(restored.kind).toBe('reference');
 expect(restored.data.riverArea).toEqual(f.layers.river);
 expect(restored.data.landAreas).toEqual(f.layers.land);
 const {riverArea:publishedRiver,landAreas:publishedLand,...baseData}=restored.data;
 expect(baseData).toEqual(f.base.release.data);
 expect(publishedRiver?.feature.properties.source).toMatchObject({dataDate:'2026-07-31',license:{name:'CC BY 4.0'}});
 expect(publishedLand?.areas).toHaveLength(24);
 expect(publishedLand?.riverGeometryChecksum).toBe(publishedRiver?.geometryChecksum);
 expect(restored.checksums.riverArea).toBe(f.layers.land.riverChecksum);
 expect(restored.checksums.landAreas).toBe(await sha256(canonicalJson(f.layers.land)));
 const options={kind:'reference' as const,publishedAt:restored.publishedAt};
 await expect(createGameDataRelease({...restored.data,riverArea:undefined},options)).rejects.toThrow('neodpovídá verzi');
 const river={...f.layers.river,metadataReview:{...f.layers.river.metadataReview,reviewedBy:'Another test reviewer'}};
 await expect(createGameDataRelease({...restored.data,riverArea:river},options)).rejects.toThrow('neodpovídá verzi');
 await expect(createGameDataRelease(restored.data,{...options,schemaVersion:7})).rejects.toThrow('schéma 9');
 const land={...f.layers.land,areas:f.layers.land.areas.filter(area=>area.id!==landAreaAt(f.layers.land.areas,right)!.id)};
 await expect(createGameDataRelease({...restored.data,landAreas:land},options)).rejects.toThrow('stanovištím PID');
 await expect(createGameDataRelease({...restored.data,landAreas:{...f.layers.land,riverGeometryChecksum:'0'.repeat(64)}},options))
  .rejects.toThrow('neodpovídá verzi');
 const previous=await gameFixture('release:4d682371276cac0514ba829e9b1cdd76ccf8b3926b428a36f55c46ff07b2ac45');
 expect(previous.release.schemaVersion).toBe(8);
 expect(previous.env.resolve(question('matching:landmass',left,right))).toMatchObject({state:'known',answer:'NE'});
 const old:GameDataRelease=f.base.release;
 expect(old.checksums).not.toHaveProperty('river');
 expect(createGeoResolver(old).availability(question('matching:landmass',left,right).definition).state).toBe('missing_data');
},40_000);

it('uses the exact island for ANO, excludes that island for NE, and clips measuring deductions against land',()=>{
 const make=(q:QuestionInstance,answer:string)=>deductionFromQuestion({id:'test',releaseId:f.release.releaseId,epochId:'epoch:0'},
   {...q,answer,state:'answered',answeredAt:f.base.now})!;
 const calculator=new DeductionComputer(f.release),zofin=park('Ostrov Žofín');
 const landQuestion=question('matching:landmass',zofin,stop('Národní divadlo'));
 const include=calculator.compute([make(landQuestion,'ANO')],'gps');
 expect(include.possible).toEqual(landAreaAt(f.layers.land.areas,zofin)?.geometry);
 expect(include.guides.include.features[0].geometry).toEqual(include.possible);
 const exclude=calculator.compute([make(landQuestion,'NE')],'gps');
 expect(booleanPointInPolygon(zofin,exclude.excluded!)).toBe(true);
 expect(booleanPointInPolygon(right,exclude.possible!)).toBe(true);
 const measuring=make(question('measuring:vltava',left,zofin),'BLÍŽ');
 expect(measuring.parameters).not.toHaveProperty('targetPoint');
 const standalone=calculator.compute([measuring],'station');
 expect(booleanPointInPolygon(zofin,standalone.possible!)).toBe(true);
 expect(booleanPointInPolygon(stop('Běchovice'),standalone.excluded!)).toBe(true);
 const farther=calculator.compute([{...measuring,operation:'exclude',result:'DÁL'}],'station');
 expect(booleanPointInPolygon(stop('Běchovice'),farther.possible!)).toBe(true);
 expect(booleanPointInPolygon(zofin,farther.excluded!)).toBe(true);
 const historical={...landQuestion,definition:{...landQuestion.definition,target:'station' as const},targetFix:undefined};
 const intersection=calculator.compute([measuring,make(historical,'ANO')],'station');
 expect(booleanPointInPolygon(zofin,intersection.possible!)).toBe(true);
 expect(booleanPointInPolygon(right,intersection.excluded!)).toBe(true);
 expect(make(question('measuring:vltava',vltava,bridge),'STEJNĚ')).toBeNull();
},60_000);
