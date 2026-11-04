import {beforeAll,describe,it,expect} from 'vitest';
import {gameFixture} from './test-fixtures';
import {createLobbyGame,readGameState,transition,viewForRole,type Command,type Role} from './index';
import {stationEligibility,stationMode} from '../../game-ui/src/station-selection';
let f:Awaited<ReturnType<typeof gameFixture>>;
beforeAll(async()=>{f=await gameFixture();});
function party(){
 let state=createLobbyGame({id:'station-start',releaseId:f.env.releaseId,now:f.now,seed:42,rules:f.rules}),n=0;
 const send=(actor:Role|'clock',command:Command,at=state.now)=>state=transition(state,{id:`start-${++n}`,actor,command,at},f.env);
 const fix=(at=state.now,accuracy=5)=>send('hider',{type:'location',role:'hider',fix:{point:f.station.point,at,accuracy}},at);
 for(const actor of ['hunter','hider'] as const)send(actor,{type:'map_consent',enabled:false});
 send('hunter',{type:'ready'});send('hider',{type:'ready'});
 return {send,fix,get state(){return state;}};
}
describe('confirmed station choice and the full hiding period',()=>{
 it('stores a validated provisional choice without starting seeking; a direct early lock and a forged early saved station are rejected',()=>{
  const p=party();p.fix();p.send('hider',{type:'select_station',stopId:f.station.id});
  expect(p.state).toMatchObject({phase:'hiding',station:null,provisionalStopId:f.station.id,rules:{stationSelectionVersion:1}});
  expect(viewForRole(p.state,'hunter',f.env).canAsk).toBe(false);
  expect(()=>p.send('hider',{type:'lock_station',stopId:f.station.id})).toThrow('45 minutách');
  expect(readGameState(JSON.stringify(p.state),f.env)).toEqual(p.state);
  expect(()=>readGameState({...p.state,station:f.station,phase:'seeking'},f.env)).toThrow('před koncem');
  p.fix(p.state.hideDeadline-1);expect(p.state.phase).toBe('hiding');
  p.fix(p.state.hideDeadline);expect(p.state.phase).toBe('seeking');expect(p.state.station).toEqual(f.station);
  expect(viewForRole(p.state,'hider',f.env).elapsedMs).toBe(45*60000);
 });
 it('rejects unapproved IDs, missing, inaccurate, stale and outside-area GPS at confirmation, leaving the original choice untouched',()=>{
  const p=party();expect(()=>p.send('hider',{type:'select_station',stopId:f.station.id})).toThrow('GPS');
  p.fix(undefined,100);expect(()=>p.send('hider',{type:'select_station',stopId:f.station.id})).toThrow('GPS');
  p.fix();p.send('hider',{type:'select_station',stopId:f.station.id});
  expect(()=>p.send('hider',{type:'select_station',stopId:'not-published'})).toThrow('katalogu');
  p.send('clock',{type:'tick'},p.state.now+180000);expect(()=>p.send('hider',{type:'select_station',stopId:f.station.id})).toThrow('GPS');
  p.send('hider',{type:'location',role:'hider',fix:{point:[0,0],at:p.state.now,accuracy:5}});expect(()=>p.send('hider',{type:'select_station',stopId:f.station.id})).toThrow('GPS');
  expect(p.state.provisionalStopId).toBe(f.station.id);
 });
 it('keeps deadline candidates frozen, permits their explicit confirmation despite later GPS loss, and does not allow later positions to add candidates',()=>{
  const p=party();p.fix(p.state.hideDeadline);expect(p.state.phase).toBe('needs_station');expect(p.state.deadlineCandidates!.length).toBeGreaterThan(1);
  const candidates=structuredClone(p.state.deadlineCandidates!);p.send('hider',{type:'location',role:'hider',fix:null});
  const view=viewForRole(p.state,'hider',f.env);expect(view.stops).toEqual(candidates);expect(stationEligibility(view,candidates[0])).toBeNull();
  const outside=f.env.stops.find(s=>!candidates.some(c=>c.id===s.id))!;expect(stationEligibility(view,outside)).not.toBeNull();expect(()=>p.send('hider',{type:'lock_station',stopId:outside.id})).toThrow('způsobilá');
  p.send('hider',{type:'lock_station',stopId:candidates[0].id});expect(p.state.station).toEqual(candidates[0]);expect(p.state.phase).toBe('seeking');
 });
 it('retains the missing-GPS timeout and historical scenario semantics without silently migrating saved rules',async()=>{
  const p=party();p.send('clock',{type:'tick'},p.state.hideDeadline);expect(p.state).toMatchObject({phase:'needs_station',station:null,deadlineCandidates:[]});
  const old=await gameFixture();old.seeking();expect(old.state.rules.stationSelectionVersion).toBeUndefined();expect(readGameState(old.state,old.env).station).toEqual(old.station);
 });
 it('uses the published dominant transport mode and exact role-filtered GPS eligibility',()=>{
  const p=party(),stop=f.station;p.fix();const view=viewForRole(p.state,'hider',f.env);expect(stationEligibility(view,stop)).toBeNull();
  expect(stationEligibility({...view,gpsIssue:'GPS je nepřesná.'},stop)).toBe('GPS je nepřesná.');
  expect(stationEligibility({...view,ownFix:{point:[14.6,50.1],accuracy:5,at:p.state.now}},stop)).toContain('400 m');
  expect(stationMode(stop,f.release)).not.toContain('nelze určit');expect(stationMode({id:'unknown',name:'Unknown',point:stop.point},f.release)).toContain('nelze určit');
  expect(viewForRole(p.state,'hunter',f.env)).not.toHaveProperty('stops');
 });
});
