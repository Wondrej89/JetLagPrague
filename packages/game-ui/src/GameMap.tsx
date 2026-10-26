import {showHunterLocation} from './HunterDistance';
import {useEffect,useMemo,useState,useRef} from 'react';
import type {GameDataRelease} from '../../geo-core/src/index';
import {publishedGameLayers} from '../../geo-resolver/src/catalog';
import type {Point,RoleView,TargetPolicy} from '../../game-core/src/index';
import {MapSurface,type MapOverlay,type MapFocus} from './MapSurface';
import {useDeductionGeometry} from './use-deduction-geometry';

const EMPTY_IDS:string[]=[];
const EMPTY_DEDUCTIONS:import('../../game-core/src/index').Deduction[]=[];
type MapProps=Parameters<typeof MapSurface>[0];
export function GameMap({release,view,storageKey,...mapProps}:MapProps&{release?:GameDataRelease;view?:RoleView;storageKey?:string}){
 const [panel,setPanel]=useState<'layers'|'deductions'|null>(null),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[focus,setFocus]=useState<MapFocus>();
 const focusSequence=useRef(0),moveCamera=(point:Point)=>setFocus({point,requestId:++focusSequence.current});
 useEffect(()=>{if(mapProps.focus)setFocus(mapProps.focus);},[mapProps.focus]);
 const [settings,setSettings]=useState(()=>{try{return JSON.parse(localStorage.getItem(storageKey??'jetlag-public-map')??'{}') as {visible?:string[];fill?:boolean;borders?:boolean;target?:TargetPolicy;gpsQuestionId?:string;possible?:boolean;excluded?:boolean};}catch{return {};}});
 const [individual,setIndividual]=useState<{epoch?:string;ids:string[]}>({ids:[]});
 const layers=useMemo(()=>release?publishedGameLayers(release):[],[release]);
 useEffect(()=>{try{localStorage.setItem(storageKey??'jetlag-public-map',JSON.stringify(settings));}catch{/* Display preferences never block a game. */}},[settings,storageKey]);
 const visible=settings.visible??EMPTY_IDS,target=settings.target??'station',deductions=view?.deductions??EMPTY_DEDUCTIONS;
 const ids=individual.epoch===view?.epochId?individual.ids:EMPTY_IDS;
 const geometry=useDeductionGeometry(release,deductions,target,ids,settings.gpsQuestionId);
 const publicOverlays=useMemo<MapOverlay[]>(()=>layers.filter(layer=>visible.includes(layer.id)).map(layer=>({id:layer.id,data:{type:'FeatureCollection',features:layer.features},color:layer.color,icon:layer.icon,fill:settings.fill!==false,weight:settings.borders===false?0:2,onSelect:props=>setSelected(layer.id+'|'+String(props.id))})),[layers,visible,settings.fill,settings.borders]);
 const overlays=useMemo(()=>{
  const items:MapOverlay[]=[...publicOverlays];
  const chosen=layers.flatMap(l=>l.features.map(f=>({layer:l,feature:f}))).find(p=>p.layer.id+'|'+String(p.feature.id)===selected);
  if(chosen&&visible.includes(chosen.layer.id))items.push({id:'selection',interactive:false,focusKey:selected,data:{type:'FeatureCollection',features:[chosen.feature]},color:'#f0ad25',weight:5,fill:false,icon:chosen.layer.icon});
  if(geometry.combined){
   for(const operation of ['include','exclude'] as const)if((operation==='include'?settings.possible!==false:settings.excluded!==false)&&geometry.combined.guides[operation].features.length)items.push({id:'guide-'+operation,data:geometry.combined.guides[operation],interactive:false,color:operation==='include'?'#258355':'#c33c43',fill:false,weight:2});
   if(settings.excluded!==false&&geometry.combined.excluded)items.push({id:'excluded',interactive:false,data:geometry.combined.excluded,color:'#c33c43',opacity:.24});
   if(settings.possible!==false&&geometry.combined.possible)items.push({id:'possible',interactive:false,data:geometry.combined.possible,color:'#258355',opacity:.2});
   if(geometry.combined.lines.features.length)items.push({id:'measurement-lines',interactive:false,data:geometry.combined.lines,color:'#555c7a',fill:false,weight:2});
  }
  for(const [i,value] of (geometry.individual??[]).entries()){
   for(const operation of ['include','exclude'] as const)if(value.guides[operation].features.length)items.push({id:`individual-guide-${i}-${operation}`,data:value.guides[operation],interactive:false,color:operation==='include'?'#258355':'#c33c43',fill:false,weight:4});
   if(value.excluded)items.push({id:`individual-excluded-${i}`,interactive:false,data:value.excluded,color:'#d13c50',fill:false,weight:4});
   if(value.possible)items.push({id:`individual-possible-${i}`,interactive:false,data:value.possible,color:'#188052',fill:false,weight:4});
   if(value.lines.features.length)items.push({id:`individual-lines-${i}`,interactive:false,data:value.lines,color:'#9a6a28',fill:false,weight:3});
  }
  return items;
 },[publicOverlays,layers,visible,selected,settings.excluded,settings.possible,geometry.combined,geometry.individual]);
 const toggleLayer=(id:string)=>setSettings(s=>({...s,visible:visible.includes(id)?visible.filter(v=>v!==id):[...visible,id]}));
 const query=search.toLocaleLowerCase('cs');
 const matches=search?layers.flatMap(layer=>layer.features.filter(f=>String(f.properties?.name).toLocaleLowerCase('cs').includes(query)||String(f.id).toLocaleLowerCase('cs').includes(query)).map(feature=>({layer,feature}))).slice(0,25):[];
 const markers=[...mapProps.markers];for(const revealed of view?.revealedStations??[])if(!markers.some(m=>m.id==='revealed-'+revealed.id))markers.push({id:'revealed-'+revealed.id,role:'station',label:`Odhalené původní stanoviště: ${revealed.name}`,point:revealed.point});for(const d of deductions.filter(d=>d.sourceType==='thermometer'&&(d.status==='active'&&d.geometryTarget===target||ids.includes(d.id)))){markers.push({id:d.id+'-a',role:'measurement-a',label:'Thermometer A · uložené měření',point:d.parameters.hunterPoint});if(d.parameters.secondPoint)markers.push({id:d.id+'-b',role:'measurement-b',label:'Thermometer B · uložené měření',point:d.parameters.secondPoint});}
 return <div className="game-map-tools" data-testid="game-map-tools" data-deduction-state={geometry.loading?'loading':geometry.error?'error':geometry.combined?'ready':'none'} data-deduction-count={geometry.combined?.deductionIds.length??0} data-possible-empty={geometry.combined?.possible===null?'true':'false'}>
  <MapSurface {...mapProps} markers={markers} focus={focus} overlays={overlays}/>
  <div className="game-map-toolbar">{view&&<button disabled={!view.ownFix} onClick={()=>{if(view.ownFix)moveCamera(view.ownFix.point);}}>Moje GPS</button>}{showHunterLocation(view)&&<button disabled={!view?.hunterLocation?.fix} onClick={()=>{if(view?.hunterLocation?.fix)moveCamera(view.hunterLocation.fix.point);}}>Zobrazit hledače</button>}<button aria-expanded={panel==='layers'} onClick={()=>setPanel(panel==='layers'?null:'layers')}>Vrstvy</button>{view?.role!=='hider'&&<button aria-expanded={panel==='deductions'} onClick={()=>setPanel(panel==='deductions'?null:'deductions')}>Dedukce</button>}</div>
  {geometry.loading&&<p className="deduction-status" role="status">Počítám dedukční oblasti…</p>}
  {geometry.error&&<p className="deduction-status error" role="alert">{geometry.error} Výsledek nelze určit.</p>}
  {panel&&<section className="game-map-panel" aria-label={panel==='layers'?'Vrstvy mapy':'Dedukční mapa'}>
   <header><strong>{panel==='layers'?'Vrstvy mapy':'Dedukce'}</strong><button onClick={()=>setPanel(null)} aria-label="Zavřít mapový panel">×</button></header>
   {panel==='layers'?<>
    {!release&&<p>Chybí ověřený publikovaný katalog.</p>}
    <label><input type="checkbox" checked={settings.fill!==false} onChange={e=>setSettings(s=>({...s,fill:e.target.checked}))}/>Výplň polygonů</label><label><input type="checkbox" checked={settings.borders!==false} onChange={e=>setSettings(s=>({...s,borders:e.target.checked}))}/>Hranice polygonů</label>
    {layers.map(layer=><div className="game-layer-row" key={layer.id}><label><input type="checkbox" checked={visible.includes(layer.id)} disabled={layer.state==='missing'} onChange={()=>toggleLayer(layer.id)}/><span style={{color:layer.color}}>{layer.icon}</span> {layer.label} <b>{layer.features.length}</b></label><small>{layer.note}</small></div>)}
    <label>Hledat objekt v publikovaném katalogu<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Název nebo ID"/></label>
    {matches.map(({layer,feature})=><button className="map-search-result" key={String(feature.id)} onClick={()=>{setSelected(layer.id+'|'+String(feature.id));setSettings(s=>({...s,visible:[...new Set([...visible,layer.id])]}));if(Array.isArray(feature.properties?.point))moveCamera(feature.properties.point as Point);setPanel(null);}}>{feature.properties?.name} · {layer.label}</button>)}
   </>:<>
    <p>{view?.questions.length??0} otázek · {deductions.filter(d=>d.status==='active').length} aktivních dedukcí</p>
    <p>{view?.automaticDeductionMap?'Automatické zakreslování odsouhlasené oběma rolemi.':'Automatické zakreslování je vypnuté. Historie i veřejné vrstvy zůstávají dostupné.'}</p>
    <label>Rozhodný cíl<select value={target} onChange={e=>setSettings(s=>({...s,target:e.target.value as TargetPolicy}))}><option value="station">Uzamčené stanoviště</option><option value="gps">Skutečná GPS v okamžiku otázky</option></select></label>
    {target==='gps'&&<label>Okamžik GPS<select value={settings.gpsQuestionId??deductions.filter(d=>d.status==='active'&&d.geometryTarget==='gps').at(-1)?.questionId??''} onChange={e=>setSettings(s=>({...s,gpsQuestionId:e.target.value}))}>{deductions.filter(d=>d.status==='active'&&d.geometryTarget==='gps').map(d=><option key={d.id} value={d.questionId}>{d.sourceType} · {view?.questions.find(q=>q.id===d.questionId)?.definition.label??d.parameters.category} · {d.result} · {new Date(d.createdAt).toLocaleTimeString('cs-CZ')}</option>)}</select></label>}
    <p>Stanoviště a GPS se nekombinují. Různé okamžiky skutečné GPS mají samostatný výpočet.</p>
    <label><input type="checkbox" checked={settings.possible!==false} onChange={e=>setSettings(s=>({...s,possible:e.target.checked}))}/>Možná oblast (zelená)</label>
    <label><input type="checkbox" checked={settings.excluded!==false} onChange={e=>setSettings(s=>({...s,excluded:e.target.checked}))}/>Vyloučené území (červená)</label>
    <p>Neutrální plocha znamená nejistotu, nikoli vyloučení. Zobrazení používá buňky 64 m a konzervativní vzdálenostní meze s rezervou 2 m; nejde o přesnou matematickou hranici.</p>
    {!!geometry.combined?.metricErrorMeters&&<p>Další rezerva geometrické metriky: {geometry.combined.metricErrorMeters.toFixed(2)} m. Nejisté hranice zůstávají neutrální.</p>}
    {geometry.combined?.limited&&<p role="status">Dosažen výpočetní limit; nevyhodnocené buňky zůstaly neutrální.</p>}
    {[...deductions].reverse().map(d=><article className={`deduction-row ${d.status}`} key={d.id}><label><input type="checkbox" checked={ids.includes(d.id)} onChange={e=>{setIndividual({epoch:view?.epochId,ids:e.target.checked?[...ids,d.id]:ids.filter(id=>id!==d.id)});if(e.target.checked)moveCamera(d.parameters.hunterPoint);}}/>{d.sourceType} · {view?.questions.find(q=>q.id===d.questionId)?.definition.label??d.parameters.category} · {d.result}</label><small>{layers.find(layer=>layer.id===d.parameters.category)?.label??(d.parameters.category==='distance'?'Vzdálenost':d.parameters.category)}{d.parameters.radiusMeters?` · ${d.parameters.radiusMeters} m`:d.parameters.minMoveMeters?` · přesun ${d.parameters.minMoveMeters} m`:''} · {d.geometryTarget==='station'?'stanoviště':'GPS'} · {new Date(d.createdAt).toLocaleString('cs-CZ')} · {d.status==='active'?'aktivní':'archivováno po Move'}</small></article>)}
    {view?.questions.filter(q=>q.state==='answered'&&!deductions.some(d=>d.questionId===q.id)).map(q=><p key={q.id}>{q.definition.label}: {q.answer} · bez automatického prostorového zakreslení</p>)}
    <p>Přepínače mění pouze zobrazení. Platnost uložených odpovědí ani průnik všech aktivních podmínek se nemění.</p>
   </>}
  </section>}
 </div>;
}
