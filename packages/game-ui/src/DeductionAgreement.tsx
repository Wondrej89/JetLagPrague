export function DeductionAgreement({enabled,onEnabled,hunter,hider,onConsent}:{enabled:boolean;onEnabled(value:boolean):void;hunter:boolean;hider:boolean;onConsent(role:'hunter'|'hider',value:boolean):void}){
 return <fieldset className="deduction-agreement"><legend>Dedukční mapa testovacích scénářů</legend>
  <label>Automatické zakreslování<select value={enabled?'on':'off'} onChange={e=>onEnabled(e.target.value==='on')}><option value="off">Automatické zakreslování vypnuto</option><option value="on">Automatické zakreslování zapnuto</option></select></label>
  <label><input type="checkbox" checked={hunter} onChange={e=>onConsent('hunter',e.target.checked)}/>Souhlas hledačů s tímto nastavením</label>
  <label><input type="checkbox" checked={hider} onChange={e=>onConsent('hider',e.target.checked)}/>Souhlas schovaného s tímto nastavením</label>
  <p>Pouze rychlé testovací scénáře simulují tato rozhodnutí. Standardní Nová hra vždy vyžaduje souhlas a připravenost přímo na obou telefonech. Ostrá hra vyžaduje souhlasy uložené autorizovaným serverem.</p>
 </fieldset>;
}
