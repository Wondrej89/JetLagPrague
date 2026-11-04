import {useState} from 'react';
import {normalizeTeamName,type Command,type RoleView} from '../../game-core/src/index';
export function PartyStart({view,send}:{view:RoleView;send(c:Command):Promise<void>}){
 const lobby=view.lobby!,role=view.role,other=role==='hunter'?'hider':'hunter',choice=lobby.choices[role],hunter=role==='hunter';
 const team=view.match?.teams.find(t=>t.id===view.match?.ownTeamId),[name,setName]=useState(team?.name??''),dirty=!!team&&normalizeTeamName(name)!==team.name;
 const teamForm=team&&view.match?.round===1&&<form className="team-name-form" onSubmit={e=>{e.preventDefault();void send({type:'set_team_name',name});}}><label>Jméno týmu<input value={name} maxLength={80} disabled={lobby.ready[role]} onChange={e=>setName(e.target.value)} autoComplete="off"/></label><button disabled={!dirty||lobby.ready[role]} type="submit">Uložit jméno týmu</button>{dirty&&<p>Uložte jméno před potvrzením připravenosti.</p>}</form>;
 return <section className="phone-section party-start" aria-label="Začátek partie">
 {view.phase==='awaiting_map_consent'?<>
 <p>{view.match?.round===2?'Druhé kolo':'Nová partie'} · dva týmy po dvou hráčích · jeden aktivní telefon na tým</p>{teamForm}
 <h2>Automatické zakreslování odpovědí</h2><p>Souhlasíte s tím, že hledači uvidí na mapě polygony vyznačující výsledky geografických otázek?</p><p>Při zapnutí této funkce bude hra automaticky označovat oblasti, ve kterých se schovaný podle odpovědí může nebo nemůže nacházet. Hra tak bude přehlednější a jednodušší.</p>
 {choice===undefined?<><button className="primary phone-wide" onClick={()=>void send({type:'map_consent',enabled:true})}>Ano, souhlasím</button><button className="phone-wide" onClick={()=>void send({type:'map_consent',enabled:false})}>Ne, hrát bez zakreslování</button></>:<p role="status">Vaše volba: {choice?'Ano':'Bez zakreslování'}. Čekáme na rozhodnutí druhé role.</p>}
 <p>Druhá role: {lobby.choices[other]===undefined?'zatím nerozhodla':lobby.choices[other]?'souhlasí':'hra bez zakreslování'}.</p></>:<>
 <h2>Jste připraveni začít?</h2>
 <section className="role-instructions" aria-label={hunter?'Pokyny pro hledače':'Pokyny pro schovaného'}><h3>{hunter?'Jste hledači.':'Jsi schovaný.'}</h3><p>{hunter?'Po začátku hry zůstaňte na místě a dejte schovanému 45 minut na nalezení úkrytu a výběr stanoviště. Jakmile čas schovávání skončí, můžete vyrazit hledat.':'Po začátku hry máš 45 minut na nalezení místa, kde se chceš schovat. Na mapě vybereš a potvrdíš zastávku, která bude středem tvého úkrytového území o poloměru 400 metrů.'}</p></section>
 <button className="primary phone-wide" disabled={lobby.ready[role]||dirty} onClick={()=>void send({type:'ready'})}>{lobby.ready[role]?'Připraveno':'Jsem připraven'}</button>
 <p className="agreement-result" role="status">Výsledek dohody: {view.automaticDeductionMap?'Automatické zakreslování zapnuto':'Hrajeme bez automatického zakreslování'}. Obě rozhodnutí jsou uložená a během partie se nemění.</p>
 <p role="status">Druhá role: {lobby.ready[other]?'připravena':'čekáme na připravenost'}. Čas začne až po potvrzení obou.</p>{teamForm}</>}
 </section>;
}
