import { completeMatchingReference,transition, viewForRole, roleForTeam, type TeamId, type Command, type Fix, type GameEnvironment, type GameState, type Role, type RoleView } from '../../game-core/src/index';
import type {StreetNameProvider} from '../../geo-resolver/src/streets';
export interface GameTransport { getView():RoleView; subscribe(listener:()=>void):()=>void; send(command:Command):Promise<void> }
export interface LocationProvider { start(onFix:(fix:Fix|null)=>void,onError:(message:string)=>void):()=>void }
export function browserLocationProvider():LocationProvider{return {start(onFix,onError){if(!navigator.geolocation){onError('Zařízení neposkytuje GPS.');return ()=>{};}const id=navigator.geolocation.watchPosition(p=>onFix({point:[p.coords.longitude,p.coords.latitude],accuracy:p.coords.accuracy,at:p.timestamp,speed:p.coords.speed}),error=>{onFix(null);onError(error.message);},{enableHighAccuracy:true,maximumAge:0,timeout:15000});return ()=>navigator.geolocation.clearWatch(id);}};}
/** In-memory transport ONLY for the local administrative simulator. A production
 * transport must receive these already-filtered views from an authorized server. */
export class LocalGameSession {
  private listeners=new Set<()=>void>();
  private matchingRequests=new Map<string,Promise<void>>();
  private disposed=false;
  private abort=new AbortController();
  constructor(public state:GameState,public readonly environment:GameEnvironment,private save:(state:GameState)=>void,private streets?:StreetNameProvider){if(state.mode!=='simulation')throw new Error('Lokální transport je určený pouze pro simulaci.');}
  private publish(next:GameState){if(this.disposed||next===this.state)return;this.save(next);this.state=next;this.listeners.forEach(fn=>fn());}
  dispose(){this.disposed=true;this.abort.abort();this.listeners.clear();}
  dispatch(actor:Role|'clock',command:Command,at=this.state.now){if(this.disposed)throw new Error('Tato simulace již není aktivní.');this.publish(transition(this.state,{id:crypto.randomUUID(),at,actor,command},this.environment));if(command.type==='prepare_matching')void this.resumeMatchingPreparation();}
  /** Runs only in the privileged local host; a real hunter transport receives
   * filtered names and never either private fix or provider request payload. */
  async resumeMatchingPreparation(){
    const p=this.state.matchingPreparation;if(!p||this.disposed||this.state.rules.questions.find(d=>d.id===p.definitionId)?.category!=='street')return;
    await Promise.all((['hunter','hider'] as const).map(role=>{
      if(p.references[role]||p.issues[role])return;const key=p.id+':'+role,existing=this.matchingRequests.get(key);if(existing)return existing;
      const task=(async()=>{try{const result=this.streets?await this.streets.resolve([...(role==='hunter'?p.hunterFix.point:p.targetPoint)],this.abort.signal):{state:'unknown' as const,reason:'Poskytovatel ulic není dostupný. Určete název ručně.'};this.publish(completeMatchingReference(this.state,p.id,role,result.state==='known'?{reference:{source:this.streets?.source??'mapy-reverse-geocoding',name:result.name,capturedAt:p.capturedAt,note:this.streets?.note??'Automatický návrh pojmenované ulice; název ručně ověřte.'}}:{issue:result.reason}));}catch{this.publish(completeMatchingReference(this.state,p.id,role,{issue:'Zjištění ulice selhalo. Určete ji ručně nebo opakujte přípravu.'}));}})();
      this.matchingRequests.set(key,task);void task.finally(()=>this.matchingRequests.delete(key));return task;
    }));
  }
  transport(role:Role):GameTransport {let lastState:GameState|undefined,cached:RoleView;return {getView:()=>{if(lastState!==this.state){lastState=this.state;cached=viewForRole(this.state,role,this.environment);}return cached;},subscribe:listener=>{this.listeners.add(listener);return ()=>this.listeners.delete(listener);},send:async command=>{this.dispatch(role,command);}};}
  /** A physical team phone follows its team's role when the next round starts. */
  teamTransport(team:TeamId):GameTransport {let lastState:GameState|undefined,cached:RoleView;return {getView:()=>{if(lastState!==this.state){lastState=this.state;cached=viewForRole(this.state,roleForTeam(this.state,team),this.environment);}return cached;},subscribe:listener=>{this.listeners.add(listener);return ()=>this.listeners.delete(listener);},send:async command=>{this.dispatch(roleForTeam(this.state,team),command);}};}
  advance(ms:number){if(!Number.isFinite(ms)||ms<0)throw new Error('Neplatný posun času.');if(['finished','settling','awaiting_map_consent','awaiting_ready'].includes(this.state.phase))return;const now=this.state.now+ms;
    // This provider simulates continuous observations of explicitly set points.
    // Split jumps at deadlines, so a +5 min step cannot pretend a late GPS fix
    // existed at the earlier Move/hiding deadline. Real GPS is never interpolated.
    const deadlines=[...(this.state.phase==='hiding'?[this.state.hideDeadline]:[]),...(this.state.cardState?.move?.stage==='moving'?[this.state.cardState.move.deadline]:[])];
    const instants=[...new Set([...deadlines.filter(at=>at>this.state.now&&at<=now),now])].sort((a,b)=>a-b);
    for(const at of instants){for(const role of ['hider','hunter'] as const){const fix=this.state.fixes[role];if(fix)this.dispatch(role,{type:'location',role,fix:{...fix,at},observation:true},at);}this.dispatch('clock',{type:'tick'},at);}
  }
}
