import {readFile} from 'node:fs/promises';
import {readGameReleaseArtifact,readGameReleaseIndex,type GameDataRelease} from '../../geo-core/src/game-release';
import {createGeoResolver} from '../../geo-resolver/src/index';
import {createGame,simulationRules,transition,type Command,type GameState,type Role} from './index';
export const PRE_RIVER_RELEASE_ID='release:db8e4958e46888be47302ea9998b787572549856497da3adcd04e5850e32222c';
const verifiedReleases=new Map<string,Promise<GameDataRelease>>();
function freezeRelease<T>(value:T):T{
 if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  for(const child of Object.values(value))freezeRelease(child);
  Object.freeze(value);
 }
 return value;
}
export async function gameFixture(releaseId?:string){
 const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
 const entry=releaseId?index.versions.find(item=>item.releaseId===releaseId):index.current;
 if(!entry)throw new Error(`Testovací vydání ${releaseId} chybí v katalogu.`);
 let verified=verifiedReleases.get(entry.checksum);
 if(!verified){
  // The verified catalog is immutable; each fixture still gets a new game and resolver.
  verified=readFile('data/releases/'+entry.file,'utf8').then(bytes=>readGameReleaseArtifact(bytes,entry)).then(freezeRelease);
  verifiedReleases.set(entry.checksum,verified);
 }
 const release=await verified,env=createGeoResolver(release);
 const rules=simulationRules(),now=Date.parse('2026-10-22T10:00:00Z');let state=createGame({id:'test-game',releaseId:release.releaseId,now,seed:42,rules}),n=0;
 const station=env.stops.find(p=>env.distance(p.point,[14.42,50.08])<800)!;
 const command=(actor:Role|'clock',command:Command,at=state.now)=>state=transition(state,{id:`cmd-${++n}`,at,actor,command},env);
 const location=(role:Role,point=station.point)=>command(role,{type:'location',role,fix:{point,at:state.now,accuracy:5}});
 const seeking=()=>{location('hider');location('hunter');command('hider',{type:'lock_station',stopId:station.id});return state;};
 const grant=(id:string,count=1)=>{for(let i=0;i<count;i++){const card=state.drawPile.find(c=>c.startsWith(id+'@'))!;if(!card)throw new Error('Test card missing');state.drawPile=state.drawPile.filter(c=>c!==card);state.hand.push(card);}return state.hand.at(-1)!;};
 return {env,release,station,now,rules,command,location,seeking,grant,get state(){return state;},set state(next:GameState){state=next;}};
}
