import { bearing, destination, midpoint } from '@turf/turf';
import { distanceToPoiMeters, type GameDataRelease } from '../../../packages/geo-core/src/index';
import { createGame, transition, type Command, type GameEnvironment, type GameRules, type GameState, type Point, type Role } from '../../../packages/game-core/src/index';

export const SPATIAL_SCENARIOS = [
 ['thermo-warmer','Thermometer · přiblížení'],['thermo-colder','Thermometer · vzdálení'],
 ['thermo-short','Thermometer · nedostatečný přesun'],['thermo-boundary','Thermometer · přesně na limitu'],
 ['thermo-hider-moves','Thermometer · změna GPS schovaného'],['thermo-veto','Thermometer · Veto před druhým bodem'],
 ['thermo-reload','Thermometer · rozpracované měření pro reload'],
 ['tentacles-one','Tentacles · jedna knihovna v dosahu'],['tentacles-many','Tentacles · více knihoven v dosahu'],
 ['tentacles-none','Tentacles · žádný kandidát u hledačů'],['tentacles-far','Tentacles · stanoviště příliš daleko'],
 ['tentacles-tie','Tentacles · shodná vzdálenost (diagnostická GPS varianta)'],
 ['tentacles-reward','Tentacles · odměna 4 → 2'],['tentacles-chalice','Tentacles · skutečný Chalice, odměna 5 → 2'],
 ['tentacles-randomize','Tentacles · Randomize'],
] as const;

/** Fixtures use only the pinned public release. Boundary values are derived from
 * its actual points; no synthetic POI masquerade as published geography. */
export function spatialScenario(id:string,release:GameDataRelease,env:GameEnvironment,seed:number,rules:GameRules):GameState|null {
 if(!SPATIAL_SCENARIOS.some(([key])=>key===id))return null;
 const start=Date.parse(`${release.data.pidSnapshot.serviceDate}T10:00:00Z`);
 const libraries=release.data.pois.filter(p=>p.category==='library'&&p.status==='approved');
 const radius=rules.questions.find(q=>q.id==='tentacles:library')?.radiusMeters??1609.344;
 const near=(p:Point)=>[...env.stops].sort((a,b)=>env.distance(a.point,p)-env.distance(b.point,p)||a.id.localeCompare(b.id))[0];
 let station=near([14.42,50.08]);
 if(!station)throw new Error('Chybí publikovaná stanoviště.');
 let a:Point=[station.point[0]+.03,station.point[1]],b:Point=[station.point[0]+.005,station.point[1]];
 const candidates=(p:Point)=>libraries.filter(l=>distanceToPoiMeters(p,l,'geometry')<=radius);
 const thermometer=rules.questions.find(q=>q.type==='thermometer'&&q.spatialVersion===2);
 let questionId=thermometer?.id??'thermometer:half-mile';
 if(id.startsWith('thermo-')){
  if(!thermometer)throw new Error('Konfigurace nemá povolenou variantu Thermometer.');
  if(id==='thermo-colder')[a,b]=[b,a];
  if(id==='thermo-short')b=[a[0]-.001,a[1]];
  if(id==='thermo-boundary')b=destination(a,thermometer.minMoveMeters!,bearing(a,station.point),{units:'meters'}).geometry.coordinates as Point;
 }else{
  questionId='tentacles:library';
  if(!libraries.length)throw new Error('Chybí schválené publikované knihovny.');
  if(id==='tentacles-none'){
   const stop=env.stops.find(p=>!candidates(p.point).length);if(!stop)throw new Error('Žádné místo bez kandidátů v nastaveném dosahu.');a=stop.point;
  }else if(id==='tentacles-tie'){
   const pairs=libraries.flatMap((a,i)=>libraries.slice(i+1).map(b=>({a,b,d:env.distance(a.point,b.point)}))).filter(p=>p.d>0).sort((a,b)=>a.d-b.d||a.a.id.localeCompare(b.a.id));
   const pair=pairs.find(p=>env.insideArea(midpoint(p.a.point,p.b.point).geometry.coordinates as Point));if(!pair)throw new Error('Chybí dvojice pro diagnostiku shody.');
   a=midpoint(pair.a.point,pair.b.point).geometry.coordinates as Point;
   const q=rules.questions.find(q=>q.id===questionId)!;q.target='gps';q.description+=' Pouze diagnostický scénář: cíl je GPS přesně uprostřed dvou skutečných knihoven; běžná hra používá stanoviště.';
  }else{
   const library=libraries.find(p=>id==='tentacles-one'?candidates(p.point).length===1:candidates(p.point).length>1)??libraries[0];
   a=library.point;
   if(id==='tentacles-far'){
    const far=env.stops.find(p=>candidates(a).every(l=>distanceToPoiMeters(p.point,l,'geometry')>radius));if(!far)throw new Error('Chybí stanoviště mimo dosah kandidátů.');station=far;
   }else station=near(id==='tentacles-many'?(candidates(a).at(-1)?.point??library.point):library.point);
  }
 }
 let s=createGame({id:`simulation-${seed}`,releaseId:release.releaseId,now:start,seed,rules}),n=0;
 const send=(actor:Role|'clock',command:Command)=>{s=transition(s,{id:`spatial-${++n}`,actor,at:s.now,command},env);};
 const locate=(role:Role,point:Point)=>send(role,{type:'location',role,fix:{point,at:s.now,accuracy:5}});
 const grant=(name:string)=>{const card=s.drawPile.find(c=>c.startsWith(name+'@'));if(!card)throw new Error('Chybí karta scénáře.');s.drawPile=s.drawPile.filter(c=>c!==card);s.hand.push(card);return card;};
 locate('hider',station.point);locate('hunter',a);send('hider',{type:'lock_station',stopId:station.id});
 if(id==='tentacles-tie')locate('hider',a);
 if(id==='thermo-veto')grant('veto');
 if(id==='tentacles-randomize')grant('randomize');
 if(id==='tentacles-chalice'){
  const cost=grant('bonus-red'),card=grant('curse-overflowing-chalice');send('hider',{type:'begin_cast',cardId:card});send('hider',{type:'confirm_cast',curseId:s.curses.at(-1)!.id,proof:{discardIds:[cost]}});
 }
 send('hunter',{type:'ask',questionId});
 if(id.startsWith('thermo-')){
  if(id==='thermo-hider-moves')locate('hider',[station.point[0]-.02,station.point[1]]);
  if(id!=='thermo-reload'&&id!=='thermo-veto')locate('hunter',b);
 }else if(id==='tentacles-reward'||id==='tentacles-chalice'){
  send('hider',{type:'answer'});send('hider',{type:'draw_reward',rewardId:s.rewards.at(-1)!.id});
 }
 return s;
}
