export function DeductionAgreement({enabled,onEnabled,hunter,hider,onConsent}:{enabled:boolean;onEnabled(value:boolean):void;hunter:boolean;hider:boolean;onConsent(role:'hunter'|'hider',value:boolean):void}){
 return <fieldset className="deduction-agreement"><legend>Dedukční mapa nové partie</legend>
  <label>Automatické zakreslování<select value={enabled?'on':'off'} onChange={e=>onEnabled(e.target.value==='on')}><option value="off">Automatické zakreslování vypnuto</option><option value="on">Automatické zakreslování zapnuto</option></select></label>
  <label><input type="checkbox" checked={hunter} onChange={e=>onConsent('hunter',e.target.checked)}/>Souhlas hledačů s tímto nastavením</label>
  <label><input type="checkbox" checked={hider} onChange={e=>onConsent('hider',e.target.checked)}/>Souhlas schovaného s tímto nastavením</label>
  <p>Simulátor zaznamenává rozhodnutí za obě role. Nastavení platí pro celou novou partii. Ostrá hra vyžaduje souhlasy uložené autorizovaným serverem.</p>
 </fieldset>;
}
