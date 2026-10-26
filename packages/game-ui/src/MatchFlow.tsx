import {useEffect,useRef,useState} from 'react';
import type {CheckAnswer,Command,RoleView,RoundResult} from '../../game-core/src/index';

/** Scores retain milliseconds so equal-looking rounded seconds never decide a winner. */
export function formatResultTime(ms:number){const value=Math.round(ms),seconds=Math.floor(value/1000);return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}${value%1000?'.'+String(value%1000).padStart(3,'0'):''}`;}
const answerLabels:Record<CheckAnswer,string>={fulfilled:'Podmínka dodržena',violated:'Podmínka porušena',not_applicable:'Povinnost ještě nezačala'};
function Score({result}:{result:RoundResult}){
 return <div className="round-score" data-testid="round-score">
  <dl><div><dt>Čas do nalezení</dt><dd>{formatResultTime(result.wallMs)}</dd></div><div><dt>Pauzy Move</dt><dd>−{formatResultTime(result.pausedMs)}</dd></div><div><dt>Započtený herní čas</dt><dd>{formatResultTime(result.elapsedMs)}</dd></div><div><dt>Bonusy z karet</dt><dd>+{formatResultTime(result.cardBonusMs)}</dd></div><div><dt>Bonusy z prokletí</dt><dd>+{formatResultTime(result.curseBonusMs)}</dd></div><div className="score-total"><dt>Celkový čas</dt><dd data-testid="round-total">{formatResultTime(result.totalMs)}</dd></div></dl>
  {result.cards.length>0&&<details><summary>Započtené časové karty ({result.cards.length})</summary><ul>{result.cards.map(c=><li key={c.instanceId}>{c.name}: +{formatResultTime(c.seconds*1000)}</li>)}</ul></details>}
  {result.checks.length>0&&<details><summary>Potvrzená kontrola prokletí ({result.checks.length})</summary><ul>{result.checks.map(c=><li key={c.id}>{c.curseName}: {answerLabels[c.answer!]}{c.answer==='violated'?` · +${formatResultTime((c.penaltySeconds??0)*1000)}`:''}{c.alreadyAwarded?' (již evidováno během kola)':''}</li>)}</ul></details>}
  {result.unclaimedRewards>0&&<p>Nedokončené odměny: {result.unclaimedRewards}. Po nalezení se nové karty nelížou; počítají se časové karty v uzavřené ruce.</p>}
 </div>;
}
export function MatchFlow({view,send}:{view:RoleView;send(c:Command):Promise<void>}){
 const [busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false);
 const run=async(c:Command)=>{if(busy)return;setBusy(true);try{await send(c);}finally{setBusy(false);}};
 const end=view.roundEnd!,match=view.match!,hider=view.role==='hider',name=(id:string)=>match.teams.find(t=>t.id===id)?.name??id;
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{const scroller=panel.current?.closest('.phone-scroll');if(scroller)scroller.scrollTop=0;if(hider)panel.current?.focus({preventScroll:true});},[end.id,end.status,hider]);
 if(end.status==='pending')return <section ref={panel} tabIndex={-1} className="phone-section round-review" role={hider?'dialog':'status'} aria-modal={hider?true:undefined} aria-label="Potvrzení nalezení">
  <p className="match-eyebrow">{match.round}. kolo · {name(match.roleTeams.hider)}</p><h2>{hider?'Hledači: Našli jsme tě':'Čekáme na potvrzení schovaného'}</h2><p>Čas při hlášení: <strong>{formatResultTime(view.elapsedMs)}</strong>. Potvrzení ani kontrola prokletí jej neprodlužují.</p>
  {hider?<><p>Jste skutečně nalezeni? Potvrzení otevře společnou závěrečnou kontrolu.</p><button className="primary phone-wide" disabled={busy} onClick={()=>void run({type:'respond_found',claimId:end.id,accepted:true})}>Ano, našli jste nás</button><button className="phone-wide" disabled={busy} onClick={()=>void run({type:'respond_found',claimId:end.id,accepted:false})}>Ne, ještě nejsme nalezeni</button><p>Při odmítnutí hra pokračuje a čekání se do času započítá.</p></>:<p>Potvrzení provede tým {name(match.roleTeams.hider)} na svém telefonu.</p>}
 </section>;
 if(end.status==='settling'){
  const incomplete=end.checks.some(c=>c.answer===null||c.answer==='violated'&&c.penaltySeconds===null),overflow=view.overflow??0;
  return <section ref={panel} tabIndex={-1} className="phone-section round-review" role={hider?'dialog':'status'} aria-modal={hider?true:undefined} aria-label="Závěrečná kontrola prokletí">
   <p className="match-eyebrow">{match.round}. kolo · Nalezení potvrzeno</p><h2>Závěrečná kontrola prokletí</h2><p>Společně ověřte podmínky použitých karet. Odpovědi zapíše schovaný; jde o potvrzení hráčů.</p>
   {end.checks.length===0&&<p>V tomto kole nebylo použito prokletí s časovým bonusem za porušení.</p>}
   {end.checks.map(c=><fieldset key={c.id} className="settlement-check" data-check-id={c.cardDefinitionId} disabled={!hider||busy||c.alreadyAwarded}><legend>{c.curseName}</legend><p>{c.question}</p><details><summary>Podmínka karty</summary><p>{c.detail}</p></details><p>Bonus za porušení: {c.penaltySeconds===null?'nelze určit':formatResultTime(c.penaltySeconds*1000)}{c.alreadyAwarded?' · již započteno, nebude přidáno podruhé':''}.</p>
    {c.wasWaiting&&<p>Úvodní úkol při nalezení ještě čekal na splnění. Pokud povinnost nevznikla, zvolte „Povinnost ještě nezačala“. Samotné nezískání předmětu nepřidává bonus za jeho pozdější ztrátu.</p>}
    {(['fulfilled','violated',...(c.wasWaiting?['not_applicable' as const]:[])] as CheckAnswer[]).map(answer=><label key={answer}><input type="radio" name={c.id} value={answer} checked={c.answer===answer} onChange={()=>{setConfirmed(false);void run({type:'answer_settlement_check',checkId:c.id,answer});}}/>{answerLabels[answer]}</label>)}
   </fieldset>)}
   {!hider?<p>Čekáme na společné vyhodnocení a potvrzení týmu {name(match.roleTeams.hider)}.</p>:<>
    {overflow>0&&<div className="phone-alert"><h3>Přebytečné karty: {overflow}</h3><p>Před uzavřením výsledku upravte ruku na limit {view.handLimit}. Nové karty se už nelížou ani nehrají.</p>{view.hand?.map(c=><button key={c.instanceId} disabled={busy} onClick={()=>void run({type:'discard_card',cardId:c.instanceId})}>Odhodit: {c.definition.name}</button>)}</div>}
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>Společně jsme ověřili všechny podmínky a potvrzuji konečné vyhodnocení.</label>
    <button className="primary phone-wide" disabled={busy||!confirmed||incomplete||overflow>0} onClick={()=>void run({type:'finalize_round',confirmed:true})}>Potvrdit a zobrazit konečný čas</button>
    {end.checks.some(c=>c.answer==='violated'&&c.penaltySeconds===null)&&<p role="alert">Výši bonusu nelze určit z pravidel této hry. Konečný čas nelze spolehlivě uzavřít.</p>}
   </>}
  </section>;
 }
 const result=match.results.at(-1)!;
 return <section ref={panel} tabIndex={-1} className="phone-section round-results" aria-label="Výsledky partie">
  <p className="match-eyebrow">{result.round}. kolo · Schovával se tým {name(result.hiderTeamId)}</p><h2>Konečný čas</h2><Score result={result}/>
  {match.round===1?<><h3>Druhé kolo · výměna rolí</h3><p>{name(match.roleTeams.hunter)} se bude schovávat, {name(match.roleTeams.hider)} bude hledat. Každý tým pokračuje na svém telefonu.</p><button className="primary phone-wide" disabled={busy||match.nextReady[match.ownTeamId]} onClick={()=>void run({type:'next_round',confirmed:true})}>{match.nextReady[match.ownTeamId]?'Připraveno · čekáme na druhý tým':'Prohodit role a pokračovat'}</button><p>Po potvrzení obou týmů začne nový 45minutový výběr stanoviště. Otázky, karty a stanoviště se připraví znovu, výsledek prvního kola zůstane uložený.</p></>:<><h3>Porovnání týmů</h3><p>Vyhrává vyšší celkový čas schovávání včetně bonusů.</p><table className="match-comparison"><thead><tr><th>Tým</th><th>Celkový čas</th></tr></thead><tbody>{match.results.map(r=><tr key={r.gameId}><th scope="row">{name(r.hiderTeamId)}</th><td>{formatResultTime(r.totalMs)}</td></tr>)}</tbody></table><p className="match-winner" data-testid="match-winner">{match.winner==='tie'?'Remíza':`Vítězný tým: ${name(match.winner!)}`}</p><details><summary>Výsledek prvního kola</summary><Score result={match.results[0]}/></details></>}
 </section>;
}
