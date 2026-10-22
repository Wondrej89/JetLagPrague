import {afterEach,expect,it,vi} from 'vitest';
import {LocalGameSession,browserLocationProvider} from './runtime';
import {gameFixture} from '../../game-core/src/test-fixtures';
afterEach(()=>vi.unstubAllGlobals());
it('uses a role-bound transport and saves the common state, without exposing an admin state in hunter views',async()=>{
 const f=await gameFixture(),save=vi.fn(),session=new LocalGameSession(f.state,f.env,save),hunter=session.transport('hunter'),notify=vi.fn(),unsubscribe=hunter.subscribe(notify);
 await expect(hunter.send({type:'lock_station',stopId:f.station.id})).rejects.toThrow('oprávnění');expect(session.state.station).toBeNull();await hunter.send({type:'walking',value:true});expect(save).toHaveBeenCalledTimes(1);expect(notify).toHaveBeenCalledTimes(1);expect(hunter.getView()).not.toHaveProperty('station');expect(hunter.getView()).not.toHaveProperty('drawPile');unsubscribe();
 const old=session.state;session.advance(3000);expect(session.state.now).toBe(old.now+3000);expect(session.state.fixes).toEqual({});expect(()=>new LocalGameSession({...old,mode:'live'},f.env,save)).toThrow('simulaci');
});
it('starts real GPS only when requested, preserving timestamps/accuracy and clearing the watch on stop',()=>{
 let receive:PositionCallback=()=>{};const clearWatch=vi.fn(),watchPosition=vi.fn((success:PositionCallback)=>{receive=success;return 77;});vi.stubGlobal('navigator',{geolocation:{watchPosition,clearWatch}});
 const provider=browserLocationProvider(),onFix=vi.fn(),onError=vi.fn();expect(watchPosition).not.toHaveBeenCalled();const stop=provider.start(onFix,onError);receive({coords:{longitude:14.42,latitude:50.08,accuracy:12,speed:3},timestamp:12345} as GeolocationPosition);expect(onFix).toHaveBeenCalledWith({point:[14.42,50.08],accuracy:12,at:12345,speed:3});stop();expect(clearWatch).toHaveBeenCalledWith(77);
});
