import { useRef, useState, useEffect } from 'react';
import { filterWaterbodies, compareParkUpdate, type Poi, type PoiConfiguration, type PoiDecision, type ParkDataset } from '@jetlag/geo-core';

export function WaterControls({pois,configuration,disabled,onConfiguration,onSelect,onUpdate,onMerge}:{pois:Poi[];configuration:PoiConfiguration;disabled:boolean;onConfiguration(value:PoiConfiguration):void;onSelect(poi:Poi):void;onUpdate(source:ParkDataset):void;onMerge(ids:string[],name:string):void}) {
  const [search,setSearch]=useState(''),[members,setMembers]=useState<string[]>([]),[name,setName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[candidate,setCandidate]=useState<ParkDataset|null>(null);
  const active=useRef<Worker|null>(null);useEffect(()=>()=>active.current?.terminate(),[]);
  const all=pois.filter(p=>p.category==='waterbody'),filtered=filterWaterbodies(pois,configuration.waterStatusFilter,search);
  const diff=candidate?compareParkUpdate(configuration.waterSources?.find(s=>s.source.id===candidate.source.id),candidate):null;
  return <section className="water-controls" aria-label="Vodní plochy"><h3>Vodní plochy</h3>
    <fieldset disabled={disabled||busy}>
      <label className="poi-toggle"><input type="checkbox" checked={configuration.visibility.waterbodies??true} onChange={e=>onConfiguration({...configuration,visibility:{...configuration.visibility,waterbodies:e.target.checked}})}/>Vodní plochy</label>
      <p data-testid="water-counts">{all.filter(p=>p.status==='approved').length} schválených · {all.filter(p=>p.status==='review').length} k revizi · {all.filter(p=>p.status==='excluded').length} vyřazených</p>
      <label>Stav vodních ploch<select value={configuration.waterStatusFilter??'all'} onChange={e=>onConfiguration({...configuration,waterStatusFilter:e.target.value as PoiConfiguration['waterStatusFilter']})}><option value="all">Všechny stavy</option><option value="approved">Schválené (approved)</option><option value="review">K revizi (review)</option><option value="excluded">Vyřazené (excluded)</option></select></label>
      <p>Filtr mění seznam i mapu. Do herních výpočtů vstupují vždy jen schválené plochy.</p>
      <label>Hledat vodní plochu<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Název nebo GLOBALID"/></label>
      <div className="poi-list water-list">{filtered.slice(0,100).map(p=><div className={`water-row ${p.status}`} key={p.id} data-water-id={p.id}><input type="checkbox" aria-label={`Sloučit vodní plochu ${p.id}`} checked={members.includes(p.id)} onChange={e=>setMembers(old=>e.target.checked?[...old,p.id]:old.filter(id=>id!==p.id))}/><button onClick={()=>onSelect(p)}><span>{p.name}</span><small>{p.status} · {p.waterbody?.globalIds.length} GLOBALID</small></button></div>)}</div>
      <p data-testid="water-filter-count">Zobrazeno {Math.min(100,filtered.length)} z {filtered.length} ploch.</p>
      {members.length>0&&<div><label>Název sloučené vodní plochy<input value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={members.length<2||!name.trim()} onClick={()=>{onMerge(members,name);setMembers([]);setName('');}}>Sloučit vybrané vodní plochy ({members.length})</button><p>Skutečné sjednocení polygonů. Zdrojové části zůstanou zachované, výsledek vyžaduje schválení.</p></div>}
      <label>Import / aktualizace vodních ploch (GIS ZIP)<input type="file" accept=".zip" onChange={async e=>{
        const file=e.target.files?.[0];if(!file)return;setError('');setCandidate(null);setBusy(true);
        try{
          if(file.size>20*1024**2)throw new Error('ZIP překračuje limit 20 MB.');
          const bytes=await file.arrayBuffer(),worker=new Worker(new URL('./water-import.worker.ts',import.meta.url),{type:'module'});active.current=worker;
          const source=await new Promise<ParkDataset>((resolve,reject)=>{worker.onmessage=event=>event.data.error?reject(new Error(event.data.error)):resolve(event.data.value);worker.onerror=event=>reject(new Error(event.message||'Import selhal.'));worker.postMessage({bytes,filename:file.name},[bytes]);});
          setCandidate(source);
        }catch(error){setError((error as Error).message);}finally{active.current?.terminate();active.current=null;setBusy(false);e.target.value='';}
      }}/></label>
      {candidate&&<div role="status"><p>Připraveno {candidate.records.length} pojmenovaných ploch; {candidate.records.filter(p=>p.status==='approved').length} schválených, {candidate.records.filter(p=>p.status==='review').length} k revizi, {candidate.records.filter(p=>p.status==='excluded').length} vyřazených.</p>{diff&&<p>Přidáno: {diff.added}, změněno: {diff.changed}, odebráno: {diff.removed}.</p>}<button onClick={()=>{onUpdate(candidate);setCandidate(null);}}>Potvrdit import vodních ploch</button><button onClick={()=>setCandidate(null)}>Zrušit import vodních ploch</button></div>}
    </fieldset>{busy&&<p role="status">Načítám a ověřuji polygonové geometrie…</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}

export function WaterProperties({poi,onDecision,onSplit}:{poi:Poi;onDecision(change:Partial<PoiDecision>):void;onSplit():void}) {
  return <div className="water-properties"><h3>{poi.name}</h3><p className={`poi-status ${poi.status}`}>{poi.status}</p>
    <dl className="feature-facts"><dt>ID</dt><dd>{poi.id}</dd><dt>Geometrie</dt><dd>{poi.geometry.type}</dd><dt>GLOBALID</dt><dd>{poi.waterbody?.globalIds.map(id=><div key={id}>{id}</div>)}</dd></dl>
    <form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);onDecision({name:String(data.get('name')).trim(),note:String(data.get('note'))});}}><label>Název vodní plochy<input name="name" required defaultValue={poi.name}/></label><label>Poznámka k vodní ploše<textarea name="note" defaultValue={poi.note}/></label><button>Uložit vodní plochu</button></form>
    <div className="poi-review-actions"><button disabled={poi.status==='approved'} onClick={()=>onDecision({status:'approved'})}>{poi.status==='excluded'?'Obnovit vodní plochu do hry':'Schválit vodní plochu'}</button><button disabled={poi.status==='review'} onClick={()=>onDecision({status:'review'})}>Vodní plochu k revizi</button><button disabled={poi.status==='excluded'} onClick={()=>onDecision({status:'excluded'})}>Vyřadit vodní plochu</button></div>
    {poi.memberIds&&<button onClick={onSplit}>Rozdělit na původní zdrojové objekty</button>}
    <p>Vzdálenost se měří k polygonu; uvnitř i na jeho hranici je 0 m. Otvory jsou mimo vodní plochu. Bod uvnitř polygonu je pouze pomocný údaj.</p>
    <details open><summary>Zdroj a klasifikace</summary><p>{poi.source.provider}</p><a href={poi.source.url??undefined} target="_blank" rel="noreferrer">Geoportál Praha</a><p>{poi.note}</p><p>Datum dat: {poi.source.dataDate??'nedoloženo'} · Licence: {poi.source.license.name}</p></details>
    <details><summary>Původní GIS atributy a audit</summary><pre>{JSON.stringify(poi.attributes,null,2)}</pre></details>
  </div>;
}
