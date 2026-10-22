import {readFile} from 'node:fs/promises';
import {readGameReleaseArtifact,readGameReleaseIndex} from '../../geo-core/src/game-release';
import {createGeoResolver} from '../../geo-resolver/src/index';
import {createGame,simulationRules,transition,type Command,type GameState,type Role} from './index';
export async function gameFixture(){
 const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8'))),release=await readGameReleaseArtifact(await readFile('data/releases/'+index.current.file,'utf8'),index.current),env=createGeoResolver(release);
 const rules=simulationRules(),now=Date.parse('2026-10-22T10:00:00Z');let state=createGame({id:'test-game',releaseId:release.releaseId,now,seed:42,rules}),n=0;
 const station=env.stops.find(p=>env.distance(p.point,[14.42,50.08])<800)!;
 const command=(actor:Role|'clock',command:Command,at=state.now)=>state=transition(state,{id:`cmd-${++n}`,at,actor,command},env);
 const location=(role:Role,point=station.point)=>command(role,{type:'location',role,fix:{point,at:state.now,accuracy:5}});
 const seeking=()=>{location('hider');location('hunter');command('hider',{type:'lock_station',stopId:station.id});return state;};
 const grant=(id:string,count=1)=>{for(let i=0;i<count;i++){const card=state.drawPile.find(c=>c.startsWith(id+'@'))!;if(!card)throw new Error('Test card missing');state.drawPile=state.drawPile.filter(c=>c!==card);state.hand.push(card);}return state.hand.at(-1)!;};
 return {env,release,station,now,rules,command,location,seeking,grant,get state(){return state;},set state(next:GameState){state=next;}};
}
