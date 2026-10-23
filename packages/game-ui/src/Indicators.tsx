import type {Command,GameIndicator,RoleView} from '../../game-core/src/index';
const time=(ms:number)=>`${Math.floor(Math.max(0,ms)/60000)}:${String(Math.floor(Math.max(0,ms)/1000)%60).padStart(2,'0')}`;
export function Indicators({view,navigate,send}:{view:RoleView;navigate(target:GameIndicator['target']):void;send(c:Command):Promise<void>}){
 const items=view.indicators??[];if(!items.length)return null;
 return <aside className="game-indicators" aria-label="Aktivní úkoly">{items.map(i=><section key={i.id} className={`game-indicator ${i.kind}`} data-indicator={i.kind} role="status"><strong>{i.text}</strong><p>{i.detail}</p>{i.deadline!==undefined&&<p>Zbývá {time(i.deadline-view.now)}</p>}<button className={i.kind==='question'?'incoming-banner':undefined} onClick={()=>navigate(i.target)}>{i.action}</button>{i.eventId&&<button onClick={()=>void send({type:'acknowledge_notice',eventId:i.eventId!})}>Rozumím</button>}</section>)}</aside>;
}
