import type { AreaGeometry } from '@jetlag/geo-core';
import { approveLandArea } from '../../../packages/geo-core/src/river-land';
import { reviseRiverSeparation, type VltavaAssembly } from '../../../packages/geo-core/src/vltava-assembly';
import type { RiverSeparation } from '../../../packages/geo-core/src/vltava-assembly-schema';
import type { VltavaController } from './use-vltava';

interface Props {
 controller:VltavaController;
 draft:VltavaAssembly;
 disabled:boolean;
 onChange(value:VltavaAssembly):void;
 onFocus(point:[number,number]):void;
 onFit(geometry:AreaGeometry):void;
 onSaveLine():void;
}

export function RiverLandPanel({controller:c,draft,disabled,onChange,onFocus,onFit,onSaveLine}:Props){
 const lines=draft.separations??[];
 const line=lines.find(value=>value.id===c.lineId);
 const land=c.land;
 const selected=land?.areas.find(value=>value.id===c.areaId);
 const review=draft.landReview?.inputChecksum===land?.inputChecksum?draft.landReview:null;
 const reviewer=draft.landReviewer??'';
 const notes=draft.landNotes??'';
 const meta=(change:Partial<VltavaAssembly>)=>onChange({...draft,...change,updatedAt:new Date().toISOString()});
 const run=(task:()=>void)=>{c.setError('');try{task();}catch(error){c.setError((error as Error).message);}};
 const updateLine=(change:Partial<RiverSeparation>)=>run(()=>{
  if(line)onChange(reviseRiverSeparation(draft,{...line,status:'draft',...change,updatedAt:new Date().toISOString()},line.id));
 });
 const approvalAllowed=land&&!land.coverage?.unresolved.length&&!land.problems.length&&reviewer.trim()&&notes.trim();
 const ready=land&&land.areas.every(area=>review?.areaIds.includes(area.id))&&!land.problems.length&&
  !!land.coverage?.checked&&!land.coverage.unresolved.length;
 const status=(id:string)=>review?.areaIds.includes(id)?'schváleno':'čeká na ověření';
 const focusLine=(id:string)=>{
  const target=lines.find(value=>value.id===id);
  if(!target)return;
  c.setLineId(id);
  onFocus(target.geometry.coordinates[Math.floor(target.geometry.coordinates.length/2)]);
 };

 return <>
  <section aria-label="Oddělovací linie">
   <h3>Oddělovací linie</h3>
   <p>Schválené linie rozdělují souš. Nakreslete je přes přerušené rameno s oběma konci na břehu či ve vodě. Geometrii vody určuje výběr zdrojových polygonů.</p>
   {lines.length>0&&<label>Vybrat linii<select value={line?.id??''} disabled={disabled||!!c.editingLine} onChange={event=>focusLine(event.target.value)}>
    <option value="">Vyberte linii</option>
    {lines.map(item=><option key={item.id} value={item.id}>{item.name||item.id.slice(0,8)} · {item.status}</option>)}
   </select></label>}
   {line&&<fieldset disabled={disabled}>
    {c.editingLine===line.id?<><p>Přetáhněte vrcholy. Mezilehlým úchytem vložíte vrchol a pravým tlačítkem ho odstraníte.</p>
     <button onClick={()=>run(onSaveLine)}>Uložit vrcholy linie</button><button onClick={()=>c.setEditingLine(null)}>Zrušit úpravu linie</button>
    </>:<>
     <p><code>{line.id}</code> · {line.geometry.coordinates.length} vrcholů · {new Date(line.updatedAt).toLocaleString('cs-CZ')}</p>
     <label>Název linie<input value={line.name} maxLength={200} onChange={event=>updateLine({name:event.target.value})}/></label>
     <label>Důvod oddělení<textarea value={line.reason} maxLength={10000} onChange={event=>updateLine({reason:event.target.value})}/></label>
     <label>Zdroj nebo doklad ověření<textarea value={line.evidence} maxLength={10000} onChange={event=>updateLine({evidence:event.target.value})}/></label>
     <label>Autor linie<input value={line.author} maxLength={200} onChange={event=>updateLine({author:event.target.value})}/></label>
     <label>Stav linie<select value={line.status} onChange={event=>updateLine({status:event.target.value as RiverSeparation['status']})}>
      <option value="draft">Rozpracováno</option><option value="review">K revizi</option><option value="approved" disabled={[line.name,line.reason,line.evidence,line.author].some(value=>!value.trim())}>Schváleno pro výpočet</option>
     </select></label>
     <button onClick={()=>{focusLine(line.id);c.setEditingLine(line.id);}}>Upravit vrcholy linie</button>
     <button onClick={()=>run(()=>{onChange(reviseRiverSeparation(draft,null,line.id));c.setLineId(null);})}>Odstranit linii</button>
    </>}
   </fieldset>}
  </section>
  {land&&<section aria-label="Pevnina a ostrovy" data-testid="river-land-preview">
   <h3>Pevnina a ostrovy</h3>
   <p>{land.areas.length} oblastí · {land.areas.filter(area=>review?.areaIds.includes(area.id)).length} místně schváleno</p>
   {land.problems.map(problem=><div className="vltava-warning" key={problem.id}>
    <p role="alert">{problem.reason}</p>
    <button disabled={disabled||!!c.editingLine} onClick={()=>{focusLine(problem.id);c.setEditingLine(problem.id);}}>Upravit neúčinné oddělení</button>
   </div>)}
   <p>{land.coverage? `Jednoznačně přiřazená způsobilá stanoviště na souši: ${land.coverage.assigned} z ${land.coverage.checked}.`:'Kontrola stanovišť PID zatím není dostupná.'}</p>
   {!land.coverage?.checked&&<p>K dokončení kontroly pokrytí načtěte aktuální PID se způsobilými stanovišti na souši.</p>}
   {ready&&<p>Všechny oblasti jsou schválené a kontrolovaná stanoviště mají jednoznačnou oblast.</p>}
   {!!land.coverage?.unresolved.length&&<details><summary>Nejednoznačná stanoviště ({land.coverage.unresolved.length})</summary><ul>{land.coverage.unresolved.map(id=><li key={id}>{id}</li>)}</ul></details>}
   <fieldset disabled={disabled||!!c.editingLine}>
    <label>Vybrat pevninskou oblast<select value={selected?.id??''} onChange={event=>{
     const area=land.areas.find(value=>value.id===event.target.value);
     c.setAreaId(area?.id??null);
     if(area)onFit(area.geometry);
    }}>
     <option value="">Vyberte oblast v mapě nebo v seznamu</option>
     {land.areas.map(area=><option key={area.id} value={area.id}>{draft.landNames?.[area.id]||area.id.slice(0,12)} · {status(area.id)}</option>)}
    </select></label>
    {selected&&<>
     <dl className="feature-facts"><dt>ID oblasti</dt><dd><code>{selected.id}</code></dd>
      <dt>Plocha</dt><dd>{selected.areaM2.toLocaleString('cs-CZ',{maximumFractionDigits:1})} m²</dd>
      <dt>Ověření</dt><dd>{status(selected.id)}</dd>
      <dt>Použitá ruční oddělení</dt><dd>{selected.separationIds.length}</dd>
     </dl>
     <label>Název pevninské oblasti<input maxLength={200} value={draft.landNames?.[selected.id]??''} onChange={event=>run(()=>meta({
      landNames:{...draft.landNames,[selected.id]:event.target.value},
      landReview:review?{...review,areaIds:review.areaIds.filter(id=>id!==selected.id)}:null,
     }))}/></label>
     <label>Správce pevniny<input maxLength={200} value={reviewer} onChange={event=>run(()=>meta({landReviewer:event.target.value,landReview:null}))}/></label>
     <label>Doklad úplnosti pevniny a kontroly hranic<textarea maxLength={10000} value={notes} onChange={event=>run(()=>meta({landNotes:event.target.value,landReview:null}))}/></label>
     <button disabled={!approvalAllowed||review?.areaIds.includes(selected.id)} onClick={()=>run(()=>onChange(approveLandArea(draft,land,selected.id,reviewer,notes)))}>Schválit pevninskou oblast</button>
    </>}
   </fieldset>
  </section>}
  {draft.approvalHistory?.length? <details><summary>Historie schválení ({draft.approvalHistory.length})</summary><ul>
   {draft.approvalHistory.map((item,index)=><li key={index}>{item.kind==='water'?'Voda':item.kind==='land'?'Pevnina':'Linie'} · {item.author} · {new Date(item.at).toLocaleString('cs-CZ')} · <code>{item.id}</code></li>)}
  </ul></details>:null}
 </>;
}
