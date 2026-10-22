import { transition, viewForRole, type Command, type Fix, type GameEnvironment, type GameState, type Role, type RoleView } from '../../game-core/src/index';
export interface GameTransport { getView():RoleView; subscribe(listener:()=>void):()=>void; send(command:Command):Promise<void> }
export interface LocationProvider { start(onFix:(fix:Fix|null)=>void,onError:(message:string)=>void):()=>void }
export function browserLocationProvider():LocationProvider{return {start(onFix,onError){if(!navigator.geolocation){onError('Zařízení neposkytuje GPS.');return ()=>{};}const id=navigator.geolocation.watchPosition(p=>onFix({point:[p.coords.longitude,p.coords.latitude],accuracy:p.coords.accuracy,at:p.timestamp,speed:p.coords.speed}),error=>{onFix(null);onError(error.message);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});return ()=>navigator.geolocation.clearWatch(id);}};}
/** In-memory transport ONLY for the local administrative simulator. A production
 * transport must receive these already-filtered views from an authorized server. */
export class LocalGameSession {
  private listeners=new Set<()=>void>();
  constructor(public state:GameState,public readonly environment:GameEnvironment,private save:(state:GameState)=>void){if(state.mode!=='simulation')throw new Error('Lokální transport je určený pouze pro simulaci.');}
  dispatch(actor:Role|'clock',command:Command,at=this.state.now){const next=transition(this.state,{id:crypto.randomUUID(),at,actor,command},this.environment);this.save(next);this.state=next;this.listeners.forEach(fn=>fn());}
  transport(role:Role):GameTransport {let lastState:GameState|undefined,cached:RoleView;return {getView:()=>{if(lastState!==this.state){lastState=this.state;cached=viewForRole(this.state,role,this.environment);}return cached;},subscribe:listener=>{this.listeners.add(listener);return ()=>this.listeners.delete(listener);},send:async command=>{this.dispatch(role,command);}};}
  advance(ms:number){if(!Number.isFinite(ms)||ms<0)throw new Error('Neplatný posun času.');if(this.state.phase==='finished')return;const now=this.state.now+ms;
    // Simulated providers continuously report the explicitly set positions. A
    // missing fix stays missing. Browser GPS uses real timestamped measurements.
    for(const role of ['hider','hunter'] as const){const fix=this.state.fixes[role];if(fix)this.dispatch(role,{type:'location',role,fix:{...fix,at:now}},now);}
    this.dispatch('clock',{type:'tick'},now);
  }
}
