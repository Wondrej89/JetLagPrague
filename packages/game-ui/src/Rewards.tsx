import { useState } from 'react';
import type { Command, Reward, RoleView } from '../../game-core/src/index';

function Offer({reward:r,view,send}:{reward:Reward;view:RoleView;send:(c:Command)=>Promise<void>}) {
 const [selected,setSelected]=useState<string[]>([]);
 const blocked=!!view.overflow;
 return <article className="reward-card"><h3>Lízni {r.policy.draw}, ponech {r.policy.keep}</h3>
  {r.state==='pending'?<button disabled={blocked} onClick={()=>void send({type:'draw_reward',rewardId:r.id})}>Otevřít karetní odměnu</button>:<>
   <p>Nabídka je uložená a po reloadu se nezmění.</p>
   {r.offer.map(id=><button className={`offered-card ${selected.includes(id)?'selected':''}`} key={id} disabled={blocked} aria-pressed={r.policy.keep>1?selected.includes(id):undefined} onClick={()=>r.policy.keep===1?void send({type:'keep_reward',rewardId:r.id,cardId:id}):setSelected(old=>old.includes(id)?old.filter(x=>x!==id):old.length<r.policy.keep?[...old,id]:old)}><span>{view.rewardCards?.[id]?.icon} {view.rewardCards?.[id]?.name}</span><small>{r.policy.keep===1?'Ponechat tuto kartu':selected.includes(id)?'Vybráno – zrušit výběr':'Vybrat kartu'}</small></button>)}
   {r.policy.keep>1&&<><p role="status">Vybráno {selected.length} / {r.policy.keep}. Obě karty se přidají společně; případný přebytek ruky pak odhoďte nebo zahrajte.</p><button className="primary phone-wide" disabled={blocked||selected.length!==r.policy.keep} onClick={()=>void send({type:'keep_reward',rewardId:r.id,cardIds:selected})}>Ponechat vybrané karty</button></>}
  </>}
 </article>;
}
export function Rewards({view,send}:{view:RoleView;send:(c:Command)=>Promise<void>}) {
 return <><h3>Karetní odměny</h3>{view.rewards?.filter(r=>r.state!=='claimed').map(r=><Offer key={r.id} reward={r} view={view} send={send}/>)}</>;
}
