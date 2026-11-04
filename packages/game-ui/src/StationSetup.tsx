import type {GameDataRelease} from '../../geo-core/src/index';
import type {RoleView,Stop} from '../../game-core/src/index';
import {stationEligibility,stationMode} from './station-selection';

export function HidingInstructions({view}:{view:RoleView}){
 const hunter=view.role==='hunter',confirmed=view.stops?.find(s=>s.id===view.provisionalStopId);
 return <section className="hiding-instructions role-instructions" aria-label={hunter?'Pokyny při schovávání pro hledače':'Pokyny při schovávání pro schovaného'}>
  <h2>{hunter?'Počkejte na místě, než skončí čas schovávání':view.phase==='needs_station'?'Potvrď stanoviště pro hledání':'Najdi úkryt a vyber stanoviště'}</h2>
  <p>{hunter?'Schovaný má 45 minut na nalezení úkrytu a výběr stanoviště. Během této doby zůstaňte na místě. Čas hry už běží.':view.phase==='needs_station'?view.stops?.length?'Čas schovávání skončil. Vyber a potvrď zastávku způsobilou v okamžiku vypršení lhůty. Pozdější pohyb ani GPS tento seznam nemění.':'V okamžiku vypršení lhůty nebyla dostupná spolehlivá GPS nebo způsobilá zastávka. Stanoviště nelze odhadnout; je nutné řešení správcem nebo reset testu.':'Na výběr máš 45 minut od začátku hry. Klepni na zastávku na mapě a potvrď ji jako střed svého úkrytového území o poloměru 400 m.'}</p>
  {hunter?<strong className="hiding-question-status">Otázky zatím nejsou dostupné.</strong>:view.phase==='hiding'&&<>{confirmed&&<p className="confirmed-station" role="status">Předběžně potvrzeno: <strong>{confirmed.name}</strong>. Volbu můžeš změnit; hledání začne až po 45 minutách.</p>}{view.gpsIssue&&<p className="station-gps-issue" role="status">{view.gpsIssue}</p>}</>}
 </section>;
}

export function StationConfirmation({view,stop,release,busy,onConfirm,onCancel}:{view:RoleView;stop:Stop;release?:GameDataRelease;busy:boolean;onConfirm():void;onCancel():void}){
 const issue=stationEligibility(view,stop);
 return <section className="station-confirmation" aria-label="Potvrzení stanoviště" data-testid="station-confirmation">
  <div className="station-choice-title"><div><span>Vybraná zastávka</span><h3>{stop.name}</h3><p>{stationMode(stop,release)} · úkrytové území 400 m</p></div><button onClick={onCancel} disabled={busy} aria-label="Zrušit výběr zastávky">Zrušit</button></div>
  {issue&&<p className="station-choice-issue" role="status">{issue}</p>}
  <button className="primary phone-wide" disabled={busy||!!issue} onClick={onConfirm}>Potvrdit stanoviště</button>
  <small>{view.phase==='hiding'?'Předběžná volba do konce 45 minut. Jinou zastávku vybereš klepnutím do mapy.':'Potvrzení uzamkne stanoviště a zahájí hledání.'}</small>
 </section>;
}
