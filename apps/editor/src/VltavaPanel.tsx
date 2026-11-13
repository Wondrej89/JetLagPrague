import {useRef,useState} from 'react';
import {approvedVltavaInput,approveVltavaAssembly,changeVltavaSelection,importVltavaAssembly,newVltavaAssembly,reviewVltavaAssembly,reviseVltavaAssembly,VLTAVA_CHECKS,type VltavaAssembly} from '../../../packages/geo-core/src/vltava-assembly';
import type {AreaGeometry} from '@jetlag/geo-core';
import type {VltavaController,VltavaMode} from './use-vltava';

function download(value:unknown,filename:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
interface Common {controller:VltavaController;draft:VltavaAssembly|undefined;disabled:boolean;onChange(value:VltavaAssembly):void;onFit(geometry:AreaGeometry):void;onFocus(point:[number,number]):void}
export function VltavaControls({controller:c,draft,disabled,onChange,onFit,onOpen,onUndo,onRedo,canUndo,canRedo,onSave}:{onOpen():void;onUndo():void;onRedo():void;canUndo:boolean;canRedo:boolean;onSave():Promise<unknown>} & Common){
 const [search,setSearch]=useState('');
 const blocked=disabled||!!c.busy||!!c.compatibilityError||!c.source||!draft;
 const matches=c.source?.records.filter(r=>search.trim()?r.globalId.toLowerCase().includes(search.trim().toLowerCase()):draft?.selectedIds.includes(r.globalId))??[];
 const run=(fn:()=>void|Promise<unknown>)=>{c.setError('');void Promise.resolve().then(fn).catch(error=>c.setError((error as Error).message));};
 return <section className="vltava-controls" aria-label="Vltava – sestavení řeky"><h3>Vltava – sestavení řeky</h3>
  <button disabled={disabled} aria-expanded={c.enabled} onClick={()=>c.enabled?c.setEnabled(false):onOpen()}>{c.enabled?'Zavřít nástroj Vltava':'Otevřít nástroj Vltava'}</button>
  {c.enabled&&<>
   <p>Výběr původních toků pro ruční revizi. Lokální draft ani schválení nezapíná Measuring.</p>
   {c.busy&&<p role="status">{c.busy}<button onClick={c.reload}>Zrušit a znovu načíst zdroj</button></p>}
   {c.error&&<div role="alert" className="vltava-warning">{c.error}<button disabled={!!c.busy} onClick={c.reload}>Znovu načíst zdroj</button></div>}
   {c.compatibilityError&&c.source&&<button onClick={()=>{if(confirm('Nahradit pouze starý výběr Vltavy novým prázdným výběrem? Nejprve exportujte starý draft.'))onChange(newVltavaAssembly(c.source!));}}>Založit nový výběr pro tento zdroj</button>}
   {draft&&<p data-testid="vltava-selection-count">Vybráno: {draft.selectedIds.length} · stav: {draft.status} · vyřazených kandidátů: {draft.excludedCandidateIds.length}</p>}
   <fieldset disabled={blocked}>
    <label>Zobrazení toků<select value={c.mode} onChange={e=>c.setMode(e.target.value as VltavaMode)}><option value="candidates">Pouze 62 automatických kandidátů</option><option value="related">Celá propojená skupina 173 polygonů</option><option value="all">Všechny původní vodní toky T</option><option value="selected">Pouze ručně vybrané polygony</option><option value="result" disabled={!c.preview}>Výsledná sjednocená geometrie</option></select></label>
    <label>Průhlednost vodních polygonů<input type="range" min="0" max="0.8" step="0.05" value={c.opacity} onChange={e=>c.setOpacity(Number(e.target.value))}/></label>
    <label className="vltava-check"><input type="checkbox" checked={c.neighbors} onChange={e=>c.setNeighbors(e.target.checked)}/>Zobrazit sousední nevybrané polygony</label>
    <label className="vltava-check"><input type="checkbox" checked={c.showSites} onChange={e=>c.setShowSites(e.target.checked)}/>Orientační značky ostrovů</label>
    <div className="vltava-legend"><span className="included">■ zařazeno</span><span className="candidate">■ kandidát</span><span className="other">■ ostatní</span><span className="problem">□ problém</span></div>
    <button onClick={()=>run(()=>onChange(changeVltavaSelection(draft!,c.source!,c.source!.records.filter(r=>r.candidate).map(r=>r.globalId))))}>Načíst 62 kandidátů z auditu</button>
    <p>Nahradí výběr kandidátní množinou. Nejde o schválení; změnu lze vrátit.</p>
    <div className="vltava-actions"><button disabled={!canUndo} onClick={onUndo}>Zpět ve výběru</button><button disabled={!canRedo} onClick={onRedo}>Znovu ve výběru</button></div>
    <p>Undo/Redo používají společnou historii světa.</p>
    <button disabled={!draft?.selectedIds.length} onClick={()=>run(async()=>{if(await c.compute(draft!))c.setMode('result');})}>Vytvořit náhled sjednocené řeky</button>
    <button disabled={!draft?.selectedIds.length} onClick={()=>run(async()=>{if(await c.compute(draft!))c.setNotice('Oddělené komponenty a ostrovní otvory jsou v pravém panelu. Žádné mezery nebyly doplněné.');})}>Najít přerušená místa</button>
    <button onClick={()=>{c.setMode('related');c.setNeighbors(true);const r=c.source!.records.find(r=>r.globalId==='{B692D262-C6E7-4A76-AE55-7139B85B96E7}');if(r){c.setSelectedId(r.globalId);onFit(r.geometry);}c.setNotice('Prověřte soutok s Berounkou a navazující toky. Společná hranice není důvodem k zařazení.');}}>Prověřit přítoky</button>
    <label>Hledat tok podle GLOBALID<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="GLOBALID"/></label>
    <p>{search?'Výsledky hledání':'Vybrané GLOBALID'}: {matches.length}</p>
    <div className="vltava-id-list">{matches.slice(0,200).map(r=><button key={r.globalId} onClick={()=>{c.setSelectedId(r.globalId);if(c.mode==='result'||c.mode==='candidates'&&!r.candidate||c.mode==='related'&&!r.related||c.mode==='selected'&&!draft?.selectedIds.includes(r.globalId))c.setMode(r.candidate?'candidates':r.related?'related':'all');onFit(r.geometry);}}><strong>#{r.row} · {draft?.selectedIds.includes(r.globalId)?'zařazeno':r.candidate?'kandidát':'ostatní'}</strong><small>{r.globalId}</small></button>)}</div>
    {matches.length>200&&<p>Zpřesněte hledání pro další ID (seznam ukazuje prvních 200).</p>}
    <button onClick={()=>run(async()=>{await onSave();c.setNotice('Draft Vltavy je uložený společně se světem v tomto prohlížeči.');})}>Uložit draft Vltavy</button>
   </fieldset>
   <button disabled={!draft} onClick={()=>download(draft,'vltava-vyber-draft.json')}>Export výběru Vltavy JSON</button>
   <label>Import výběru Vltavy JSON<input type="file" accept=".json" disabled={disabled||!c.source||!!c.busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;run(async()=>{if(file.size>2*1024**2)throw new Error('Výběr překračuje 2 MB; neimportujte geometrii jako draft.');onChange(importVltavaAssembly(JSON.parse(await file.text()),c.source!));c.setNotice('Výběr importován. Ostatní data světa zůstala zachovaná.');});e.target.value='';}}/></label>
   {c.notice&&<p role="status" className="vltava-warning">{c.notice}</p>}
   {draft&&<small>Upraveno: {new Date(draft.updatedAt).toLocaleString('cs-CZ')}</small>}
  </>}
 </section>;
}

export function VltavaInspector({controller:c,draft,disabled,onChange,onFit,onFocus,onToggle}:{onToggle(id:string):void}&Common){
 const blocked=disabled||!!c.busy||!!c.compatibilityError||!c.source||!draft;
 const [working,setWorking]=useState(false);
 const latest=useRef(draft);latest.current=draft;
 const apply=async(operation:()=>Promise<VltavaAssembly>)=>{const before=draft,result=await operation();if(latest.current!==before)throw new Error('Výběr se během kontroly změnil. Novější úpravy zůstaly zachované; zopakujte revizi.');onChange(result);};
 const run=(fn:()=>Promise<unknown>)=>{setWorking(true);c.setError('');void fn().catch(error=>c.setError((error as Error).message)).finally(()=>setWorking(false));};
 const revise=(change:Parameters<typeof reviseVltavaAssembly>[1])=>{if(draft)onChange(reviseVltavaAssembly(draft,change));};
 const preview=c.preview;
 return <div className="vltava-inspector" aria-label="Kontrola Vltavy">
  <h3>Vltava – kontrola výběru</h3>
  <p>Kliknutí na polygon jej přidá nebo odebere. Výběr postupuje bez dialogů; podkladové geometrie se nemění.</p>
  {c.focus&&<section aria-label="Vybraný úsek Vltavy"><h3>Úsek #{c.focus.row}</h3><dl className="feature-facts"><dt>GLOBALID</dt><dd>{c.focus.globalId}</dd><dt>Typ</dt><dd>T</dd><dt>Automatických 62 kandidátů</dt><dd>{c.focus.candidate?'ano':'ne'}</dd><dt>Širší skupina 173</dt><dd>{c.focus.related?'ano':'ne'}</dd><dt>Výběr</dt><dd>{draft?.selectedIds.includes(c.focus.globalId)?'zařazeno do Vltavy':'nezařazeno'}</dd></dl>
   <button disabled={blocked} onClick={()=>onToggle(c.focus!.globalId)}>{draft?.selectedIds.includes(c.focus.globalId)?'Odebrat z Vltavy':'Přidat do Vltavy'}</button>
   <button onClick={()=>onFit(c.focus!.geometry)}>Přiblížit na polygon</button>
   <details><summary>Původní atributy úseku</summary><pre>{JSON.stringify(c.focus.attributes,null,2)}</pre></details>
   <p>{c.focus.neighbors.length} sousedních polygonů. Zvýraznění sousedů může ukazovat rameno i jiný tok.</p>
  </section>}
  {preview&&<section aria-label="Sjednocená řeka" data-testid="vltava-preview"><h3>Platný sjednocený náhled</h3>
   <p>{preview.sourceCount} zdrojových polygonů · {preview.geometry.type}<br/>{preview.parts.length} oddělených komponent · {preview.holes.length} otvorů<br/>{preview.areaM2.toLocaleString('cs-CZ',{maximumFractionDigits:1})} m² · {preview.vertices} vrcholů<br/>Topologie GEOS: platná</p>
   <p>Platnost nepotvrzuje úplnost. {preview.parts.length>1?'Oddělené části vyžadují vizuální kontrolu; mezery se automaticky nevyplňují.':'Zkontrolujte také případná chybějící ramena a přítoky.'}</p>
   <button onClick={()=>onFit(preview.geometry)}>Přiblížit výslednou řeku</button>
   <details><summary>Oddělené komponenty ({preview.parts.length})</summary>{preview.parts.map((part,i)=><button key={i} onClick={()=>onFit(part)}>Komponenta {i+1}</button>)}</details>
   <details><summary>Ostrovní otvory ({preview.holes.length})</summary>{preview.holes.map((hole,i)=><button key={i} onClick={()=>onFit(hole)}>Otvor {i+1}</button>)}</details>
   <button disabled={blocked||working} onClick={()=>run(()=>apply(()=>reviewVltavaAssembly(draft!,c.source!,preview)))}>Předat náhled k revizi</button>
  </section>}
  {draft&&c.source&&<fieldset disabled={blocked||working}>
   <h3>Kontrolní místa</h3><p>Body parků slouží jen k orientaci. Jejich poloha ani existence otvoru nedokazuje správnost břehů.</p>
   {c.source.sites.map(site=>{const state=draft.sites.find(s=>s.id===site.id)!,check=preview?.siteChecks.find(s=>s.id===site.id);return <div key={site.id} className="vltava-site"><button onClick={()=>onFocus(site.point)}>{site.name}</button>
    {check&&<p>{check.insideIslandHole?'Orientační bod je v otvoru.':check.insideWater?'Pozor: orientační bod parku leží ve vodním polygonu.':'Orientační bod není v ostrovním otvoru; prověřte ramena.'}</p>}
    <label htmlFor={'vltava-review-'+site.id}>Revize: {site.name}</label><select id={'vltava-review-'+site.id} value={state.status} onChange={e=>revise({sites:draft.sites.map(s=>s.id===site.id?{...s,status:e.target.value as typeof s.status}:s)})}><option value="pending">Nezkontrolováno</option><option value="unresolved">Nevyřešeno</option><option value="verified">Ručně ověřeno</option></select>
    <label>Poznámka: {site.name}<input value={state.note} onChange={e=>revise({sites:draft.sites.map(s=>s.id===site.id?{...s,note:e.target.value}:s)})}/></label>
   </div>;})}
   <h3>Doklady a metadata</h3><p className="mono">ZIP SHA-256: {draft.source.rawChecksum}</p>
   <p>Licence a skutečné datum dat nejsou v ZIPu doložené. Doplňte je podle ověřeného podkladu před schválením.</p>
   {([['provider','Poskytovatel'],['url','URL zdroje'],['version','Verze zdroje'],['dataDate','Datum dat (nikoli synchronizace)'],['licenseName','Název licence'],['licenseUrl','URL licence'],['evidence','Doklad ověření zdroje, licence a data']] as const).map(([key,label])=><label key={key}>{label}<input type={key==='dataDate'?'date':'text'} value={draft.metadata[key]} onChange={e=>revise({metadata:{...draft.metadata,[key]:e.target.value}})}/></label>)}
   <label htmlFor="vltava-note">Poznámky správce</label><textarea id="vltava-note" value={draft.note} onChange={e=>revise({note:e.target.value})}/>
   <label>Jméno kontrolujícího správce<input value={draft.reviewer} onChange={e=>revise({reviewer:e.target.value})}/></label>
   <h3>Ruční kontrolní seznam</h3>
   {Object.entries(VLTAVA_CHECKS).map(([key,label])=><label key={key} className="vltava-check"><input type="checkbox" checked={draft.checks[key as keyof typeof VLTAVA_CHECKS]} disabled={draft.status==='draft'} onChange={e=>revise({checks:{...draft.checks,[key]:e.target.checked}})}/>{label}</label>)}
   <p>Schválení vyžaduje platný náhled, všechna místa a všechny kontroly. Nevyřešené místo schválení blokuje.</p>
   <button disabled={draft.status!=='review'||!preview||!Object.values(draft.checks).every(Boolean)||draft.sites.some(s=>s.status!=='verified')||!draft.reviewer.trim()||!draft.metadata.dataDate||!draft.metadata.licenseUrl||!draft.metadata.licenseName||!draft.metadata.evidence.trim()} onClick={()=>run(()=>apply(()=>approveVltavaAssembly(draft,c.source!,preview!)))}>Schválit výslednou Vltavu</button>
   <button disabled={draft.status!=='approved'||!preview} onClick={()=>run(async()=>download(await approvedVltavaInput(draft,c.source!,preview!),'vltava-approved.geojson'))}>Export schválené Vltavy GeoJSON</button>
   {draft.approval&&<p>Schválil {draft.approval.reviewedBy} · {new Date(draft.approval.reviewedAt).toLocaleString('cs-CZ')}</p>}
   <p>Export je podklad pro následnou publikaci. Současný GameDataRelease Vltavu ještě nepodporuje; veřejná hra a Measuring zůstávají beze změny.</p>
  </fieldset>}
 </div>;
}
