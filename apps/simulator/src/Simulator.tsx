import {createMapyStreetProvider} from '../../../packages/geo-resolver/src/streets';
import {conflictGeometryFixture} from './map-scenarios';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {gamePublicationErrors,releaseGeography,type GameDataRelease} from '../../../packages/geo-core/src/game-release';
import {createGeoResolver} from '../../../packages/geo-resolver/src/index';
import {createLobbyGame,viewForRole,matchForState,roleForTeam,questionRegistry,THERMOMETER_VARIANTS,TENTACLES_CATEGORIES,deckRules,type GameSize,type GameState,type Point,type Role,type GameEnvironment} from '../../../packages/game-core/src/index';
import {GamePhone,GameMap,DeductionAgreement,LocalGameSession,type MapMarker} from '../../../packages/game-ui/src/index';
import {readSimulation,saveSimulation,validateSimulation,exportScenario,importScenario,photos,listSimulationArchives,readArchivedSimulation,type SavedSimulation,type SimulationArchive} from './storage';
import {buildScenario,SCENARIOS} from './scenarios';
import {loadPublicRelease} from './public-data';
import '../../../packages/game-ui/src/styles.css';
import './styles.css';
function download(text:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='jetlag-soukromy-scenar.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function Simulator(){
 const [release,setRelease]=useState<GameDataRelease|null>(null),[session,setSession]=useState<LocalGameSession|null>(null),[state,setState]=useState<GameState|null>(null),[error,setError]=useState(''),[paused,setPaused]=useState(true),[speed,setSpeed]=useState(1),[sessionSerial,setSessionSerial]=useState(0),[seed,setSeed]=useState(42),[scenario,setScenario]=useState('blank'),[showState,setShowState]=useState(false),[showCircle,setShowCircle]=useState(true),[clickRole,setClickRole]=useState<Role>('hunter'),[questionId,setQuestionId]=useState('matching:zoo'),[radarTarget,setRadarTarget]=useState<'station'|'gps'>('station');
 const [thermoEnabled,setThermoEnabled]=useState<string[]>(THERMOMETER_VARIANTS.map(v=>v.id)),[customMovement,setCustomMovement]=useState(''),[tentacleConfig,setTentacleConfig]=useState(TENTACLES_CATEGORIES.map(v=>({...v,enabled:true})));
 const [latestReleaseId,setLatestReleaseId]=useState<string>();
 const [archives,setArchives]=useState<SimulationArchive[]>([]);
 const [archiveId,setArchiveId]=useState('');
 const [switchBusy,setSwitchBusy]=useState(false);
 const switching=useRef(false);
 const [preserveGps,setPreserveGps]=useState(false);
 const [observeHunter,setObserveHunter]=useState(false);
 const [autoDeduction,setAutoDeduction]=useState(false),[consent,setConsent]=useState({hunter:false,hider:false});
 const agreement=<DeductionAgreement enabled={autoDeduction} onEnabled={value=>{setAutoDeduction(value);setConsent({hunter:false,hider:false});}} hunter={consent.hunter} hider={consent.hider} onConsent={(role,value)=>setConsent(s=>({...s,[role]:value}))}/>;
 const [size,setSize]=useState<GameSize|''>(''),[diagnosticCard,setDiagnosticCard]=useState('');
 const mapNote=import.meta.env.VITE_MAPY_API_KEY?'Dynamické Mapy.com: nativní zoom 0–20. Poskytovatel načítá dlaždice podle výřezu mapy.':'Chybí klientský klíč Mapy.com; geometrie a špendlíky fungují bez podkladu.';
 const previousParty=useRef<{id:string;matchId?:string;round?:number;phase:GameState['phase']}|null>(null);
 useEffect(()=>{if(!state)return;const previous=previousParty.current;if(state.phase==='hiding'&&(previous?.id===state.id&&previous.phase==='awaiting_ready'&&state.lobby?.startedAt!==undefined||previous?.matchId===state.match?.id&&previous?.round===1&&state.match?.round===2))setPaused(false);previousParty.current={id:state.id,matchId:state.match?.id,round:state.match?.round,phase:state.phase};},[state]);
 const settings=useRef({paused,speed,scenario});settings.current={paused,speed,scenario};
 const streetProvider=useMemo(()=>createMapyStreetProvider(import.meta.env.VITE_MAPY_API_KEY),[]),activeSession=useRef<LocalGameSession|null>(null);
 useEffect(()=>()=>activeSession.current?.dispose(),[]);
 const env=useMemo(()=>release?createGeoResolver(release):null,[release]);
 const bind=useCallback((next:GameState,environment:GameEnvironment)=>{
  activeSession.current?.dispose();
  const active=new LocalGameSession(next,environment,(value,previous)=>{
   if(!switching.current&&activeSession.current===active){
    void saveSimulation({version:1,state:value,...settings.current},{expectedState:previous}).catch(e=>setError(`Uložení selhalo: ${e.message}`));
   }
  },streetProvider);
  activeSession.current=active;
  setSession(active);setSessionSerial(n=>n+1);setState(next);
 },[streetProvider]);
 const activate=useCallback((doc:SavedSimulation,loaded:GameDataRelease,environment:GameEnvironment,currentId?:string,restorePreferences=false)=>{
  setRelease(loaded);
  if(currentId)setLatestReleaseId(currentId);
  settings.current={paused:doc.paused,speed:doc.speed,scenario:doc.scenario};
  setPaused(doc.paused);setSpeed(doc.speed);setScenario(doc.scenario);
  if(restorePreferences){
   setSeed(doc.state.seed);setSize(doc.state.rules.size??'');
   setAutoDeduction(doc.state.rules.automaticDeductionMap??false);
   setConsent({hunter:doc.state.rules.deductionConsent?.hunter??false,hider:doc.state.rules.deductionConsent?.hider??false});
  }
  setQuestionId(doc.scenario==='missing-data'?'matching:golf':doc.state.questions.at(-1)?.id??'matching:zoo');
  bind(doc.state,environment);
 },[bind]);
 useEffect(()=>{
  let cancelled=false;
  void (async()=>{
   try{
    const [stored,records]=await Promise.all([readSimulation(),listSimulationArchives()]);
    const {release,index}=await loadPublicRelease(stored?.state?.releaseId);
    if(cancelled)return;
    const environment=createGeoResolver(release);
    setArchives(records);
    if(stored)activate(validateSimulation(stored,environment),release,environment,index.current.releaseId,true);
    else {setRelease(release);setLatestReleaseId(index.current.releaseId);}
   }catch(err){if(!cancelled)setError(`${(err as Error).message} Uložený stav nebyl přepsán.`);}
  })();
  return()=>{cancelled=true;};
 },[activate]);
 useEffect(()=>{if(!session)return;const unsubscribe=session.transport('hider').subscribe(()=>setState(session.state));void session.resumeMatchingPreparation();return unsubscribe;},[session]);
 useEffect(()=>{
  if(state&&!switching.current&&activeSession.current?.state===state){
   void saveSimulation({version:1,state,paused,speed,scenario}).catch(e=>setError(e.message));
  }
 },[state,paused,speed,scenario]);
 useEffect(()=>{
  if(paused||!session)return;
  let previous=performance.now();
  const timer=setInterval(()=>{
   const now=performance.now(),elapsed=Math.min(now-previous,10000)*speed;previous=now;
   if(switching.current||activeSession.current!==session)return;
   try{session.advance(elapsed);}catch(e){setError((e as Error).message);setPaused(true);}
  },500);
  return()=>clearInterval(timer);
 },[paused,speed,session]);
 const transports=useMemo(()=>session?{'team-a':session.teamTransport('team-a'),'team-b':session.teamTransport('team-b')}:null,[session]);
 const attempt=(fn:()=>void)=>{setError('');try{fn();}catch(e){setError((e as Error).message);}};
 const move=(role:Role,point:Point)=>{if(!session)return;attempt(()=>session.dispatch(role,{type:'location',role,fix:{point,at:session.state.now,accuracy:5},...(role==='hunter'&&observeHunter?{observation:true}:{})}));};
 function createSimulation(id:string,loaded:GameDataRelease,environment:GameEnvironment):SavedSimulation{
  if(!size)throw new Error('Vyberte variantu Small / Medium / Large pro novou hru.');
  if(id!=='blank'&&(!consent.hunter||!consent.hider))throw new Error('Pro testovací scénář potvrďte simulovaná rozhodnutí rolí. Nová hra je vyžaduje přímo na telefonech.');
  const rules=deckRules(size);
  rules.automaticDeductionMap=autoDeduction;
  rules.deductionConsent={...consent,authority:'simulator'};
  const thermometer=[
   ...THERMOMETER_VARIANTS.map(v=>({...v,enabled:thermoEnabled.includes(v.id)})),
   ...(customMovement?[{id:'custom',label:`${customMovement} m · vlastní konfigurace`,meters:Number(customMovement),enabled:true}]:[]),
  ];
  rules.questions=questionRegistry({maxMovementMeters:environment.maxMovementMeters,thermometer,tentacles:tentacleConfig})
   .map(q=>q.type==='radar'?{...q,target:radarTarget}:q);
  const initial=buildScenario(id,loaded,environment,seed,rules);
  if(id!=='blank')return {version:1,state:initial,paused:true,speed,scenario:id};
  const next=createLobbyGame({id:`simulation-${crypto.randomUUID()}`,releaseId:loaded.releaseId,now:initial.now,seed,rules});
  const previous=activeSession.current?.state;
  const preserve=preserveGps&&previous?.releaseId===loaded.releaseId;
  next.fixes=structuredClone(preserve&&previous?previous.fixes:initial.fixes);
  for(const fix of Object.values(next.fixes))fix.at=next.now;
  return {version:1,state:next,paused:true,speed,scenario:id};
 }
 type LoadedSimulation={doc:SavedSimulation; release:GameDataRelease; environment:GameEnvironment; currentId?:string; restorePreferences?:boolean};
 async function changeSimulation(load:()=>Promise<LoadedSimulation>,archive:boolean,restoreId?:string){
  if(switching.current)return;
  switching.current=true;setSwitchBusy(true);setError('');
  try{
   const next=await load(),previous=activeSession.current;
   await saveSimulation(next.doc,{
    previous:previous?{version:1,state:previous.state,...settings.current}:undefined,archive,restoreId,
   });
   activate(next.doc,next.release,next.environment,next.currentId,next.restorePreferences);
   if(archive){
    setArchives(await listSimulationArchives());
    setArchiveId('');
   }
  }catch(error){setError((error as Error).message);}
  finally{switching.current=false;setSwitchBusy(false);}
 }
 function replace(id:string){
  if(!release||!env)return;
  const loaded=release,environment=env;
  void changeSimulation(async()=>({doc:createSimulation(id,loaded,environment),release:loaded,environment}),!activeSession.current);
 }
 function startWithLatest(){
  void changeSimulation(async()=>{
   const {release,index}=await loadPublicRelease(),environment=createGeoResolver(release);
   return {doc:createSimulation('blank',release,environment),release,environment,currentId:index.current.releaseId};
  },true);
 }
 function restoreArchive(){
  void changeSimulation(async()=>{
   const stored=await readArchivedSimulation(archiveId);
   const {release,index}=await loadPublicRelease(stored.state.releaseId),environment=createGeoResolver(release);
   return {doc:validateSimulation(stored,environment),release,environment,currentId:index.current.releaseId,restorePreferences:true};
  },true,archiveId);
 }
 function restoreFromFile(file:File){
  void changeSimulation(async()=>{
   const text=await file.text(),raw=JSON.parse(text);
   const {release,index}=await loadPublicRelease(raw.state?.releaseId),environment=createGeoResolver(release);
   return {doc:await importScenario(text,environment),release,environment,currentId:index.current.releaseId,restorePreferences:true};
  },false);
 }
 const latestButton=<button disabled={!size} onClick={startWithLatest}>Založit novou simulaci s aktuálními podklady</button>;
 const archiveControls=archives.length>0&&<div className="control-row">
  <label><span id="simulation-archive-label">Uložené starší simulace</span><select aria-labelledby="simulation-archive-label" value={archiveId} onChange={e=>setArchiveId(e.target.value)}>
   <option value="">Vyberte uloženou simulaci</option>
   {archives.map(a=><option key={a.id} value={a.id}>{new Date(a.savedAt).toLocaleString('cs-CZ')} · {a.releaseId.slice(8,20)}</option>)}
  </select></label>
  <button disabled={!archiveId} onClick={restoreArchive}>Obnovit uloženou simulaci</button>
 </div>;
 const {riverArea,landAreas}=release?releaseGeography(release.data):{};
 const questionStatus=(id:string)=>{
  const question=state?.rules.questions.find(q=>q.id===id);
  return question&&env?env.availability(question).state:'unsupported';
 };
 const markers:MapMarker[]=state?(['hunter','hider'] as const).flatMap(role=>state.fixes[role]?[{id:role,role,label:role==='hunter'?'GPS hledačů':'Skutečná GPS schovaného',point:state.fixes[role]!.point,draggable:true,onMove:(point:Point)=>move(role,point)}]:[]):[];
 for(const q of state?.questions??[])if(q.definition.type==='thermometer'&&(!state?.epochId||q.epochId===state.epochId)){markers.push({id:q.id+'-a',role:'measurement-a',label:`A · ${q.definition.label}`,point:q.hunterFix.point});if(q.secondFix)markers.push({id:q.id+'-b',role:'measurement-b',label:`B · ${q.definition.label}`,point:q.secondFix.point});}
 if(state?.station)markers.push({id:'station',role:'station',label:`Stanoviště: ${state.station.name}`,point:state.station.point});
 const selected=state?.questions.find(q=>q.id===questionId)??[...(state?.questions??[])].reverse().find(q=>q.definition.id===questionId),definition=selected?.definition??state?.rules.questions.find(q=>q.id===questionId);
 const diagnostics=selected&&env?env.resolve(selected):null;
 const saved=():SavedSimulation=>({version:1,state:session!.state,paused:settings.current.paused,speed:settings.current.speed,scenario:settings.current.scenario});
 return <div className="simulator-shell"><header className="sim-header"><a href={import.meta.env.DEV?'http://127.0.0.1:4173':'../'}>J / JetLagPrague</a><div><h1>Herní laboratoř</h1><span>Testovací simulace – nejde o skutečnou multiplayerovou hru</span></div><span className="local-badge">Pouze toto zařízení</span></header>
  {error&&<div role="alert" className="sim-error">{error}</div>}
  {switchBusy&&<p role="status">Ověřuji podklady a ukládám simulaci…</p>}
  <div inert={switchBusy}>
  {release&&!state&&!error?<section className="sim-controls"><h2>Nová simulace se 100 kartami</h2><p>Zvolte společnou variantu celé partie. V průběhu hry ji nelze změnit.</p><label>Varianta nové hry<select value={size} onChange={e=>setSize(e.target.value as GameSize| '')}><option value="">Vyberte Small / Medium / Large</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><div>{agreement}</div><button disabled={!size} onClick={()=>replace('blank')}>Založit simulaci</button>{archiveControls}</section>:!state||!release||!session||!env||!transports?<p className="sim-loading">{error?'Inicializace vyžaduje řešení; žádný prázdný svět nebyl uložen.':'Ověřuji publikovaný katalog a obnovuji soukromý scénář…'}{error&&<button onClick={()=>{if(!confirm('Nahradit pouze místní stav simulátoru novou hrou? Editor zůstane zachovaný.'))return;void loadPublicRelease().then(({release,index})=>{setRelease(release);setLatestReleaseId(index.current.releaseId);setError('');setSession(null);setState(null);setSize('');setPaused(true);}).catch(e=>setError(e.message));}}>Resetovat neplatnou simulaci</button>}</p>:<>
   <div className="sim-data-note"><strong>Publikovaná verze {release.releaseId.slice(8,20)}</strong> · PID {release.data.pidSnapshot.serviceDate} · {release.data.pidSnapshot.stops.length} zastávek. {gamePublicationErrors(release).length>0&&<span>Historická referenční data – neověřeno. Pouze pro místní simulaci.</span>}<details><summary>Testovací pravidla a známé WIP</summary><p>{state.rules.questionVersion!==2&&'Historická pravidla: pro nové otázky Thermometer/Tentacles založte novou simulaci. '}{state.rules.label}. Nový balíček má přesně 100 karet (55 bonusů / 21 powerupů / 24 prokletí). Všech 24 prokletí obsahuje dodané původní texty, český překlad a cenu. Fyzické úkoly a obsah důkazů potvrzují hráči; aplikace je nevydává za senzorové měření. Scénáře TEST MECHANISMU používají výslovné pracovní vstupy, nikoliv schválená pravidla. Historické hry ponechávají původní konfiguraci. Thermometer a Tentacles mají skutečné geografické výpočty a odměny 2 → 1 / 4 → 2. Pražská konfigurace dosahů je oddělená od velikosti karetních bonusů. Zvýšená cena opakovaných otázek zůstává WIP. Žádné pracovní drafty editoru se nenačítají.</p></details></div>
   <section className="sim-controls" aria-label="Ovládání simulátoru"><div className="control-row"><label>Varianta nové hry<select value={size} onChange={e=>setSize(e.target.value as GameSize|'')}><option value="">Vyberte variantu</option><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label><span>Rozehraná varianta: {state.rules.size??'historická MVP (beze změny)'}</span><label>Testovací scénář<select value={scenario} onChange={e=>setScenario(e.target.value)}>{SCENARIOS.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Seed<input type="number" value={seed} onChange={e=>setSeed(Number(e.target.value))}/></label><label>Radar – rozhodný cíl nové hry<select value={radarTarget} onChange={e=>setRadarTarget(e.target.value as 'station'|'gps')}><option value="station">Uzamčené stanoviště</option><option value="gps">Skutečná GPS schovaného</option></select></label><button onClick={()=>replace(scenario)}>Načíst testovací scénář</button><button onClick={()=>replace('blank')}>Nová hra</button>{latestButton}<label><input type="checkbox" checked={preserveGps} onChange={e=>setPreserveGps(e.target.checked)}/>Zachovat simulované GPS při nové hře</label><button onClick={()=>{if(confirm('Resetovat současnou místní simulaci? Uložený soubor scénáře zůstane zachovaný.'))replace(scenario);}}>Reset hry</button></div>
    {archiveControls}
    <details className="spatial-configuration"><summary>Testovací scénáře a geografické varianty (rozehraná hra se nemění)</summary>{agreement}<p>Thermometer: povolené vzdušné přesuny. Ověřený rozměr oblasti {Math.round(env.maxMovementMeters??0).toLocaleString('cs-CZ')} m; 50 mil se do Prahy nevejde.</p>{THERMOMETER_VARIANTS.map(v=><label key={v.id}><input type="checkbox" disabled={v.meters>(env.maxMovementMeters??Infinity)} checked={thermoEnabled.includes(v.id)&&v.meters<=(env.maxMovementMeters??Infinity)} onChange={e=>setThermoEnabled(old=>e.target.checked?[...old,v.id]:old.filter(id=>id!==v.id))}/>{v.label} · {v.meters.toLocaleString('cs-CZ')} m</label>)}<label>Thermometer – vlastní přesun (m)<input type="number" min="0.001" max={env.maxMovementMeters} step="any" value={customMovement} onChange={e=>setCustomMovement(e.target.value)}/></label><p>Tentacles: dosahy jsou samostatná pražská konfigurace, nezávislá na Small / Medium / Large karetního balíčku. Kategorie bez publikovaných dat zůstanou nedostupné.</p>{tentacleConfig.map((v,i)=><div key={v.category}><label><input type="checkbox" checked={v.enabled} onChange={e=>setTentacleConfig(old=>old.map((p,j)=>j===i?{...p,enabled:e.target.checked}:p))}/>{v.label} · {v.origin}</label><label>Dosah {v.label} (m)<input type="number" min="0.001" step="any" value={v.radiusMeters} onChange={e=>setTentacleConfig(old=>old.map((p,j)=>j===i?{...p,radiusMeters:Number(e.target.value)}:p))}/></label></div>)}</details>
    <div className="control-row"><button className={paused?'sim-primary':''} onClick={()=>setPaused(v=>!v)}>{paused?'Spustit čas':'Pozastavit simulaci'}</button><label>Rychlost<select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={1}>1×</option><option value={10}>10×</option><option value={60}>60×</option></select></label>{[30,300].map(seconds=><button key={seconds} onClick={()=>attempt(()=>session.advance(seconds*1000))}>+{seconds===30?'30 sekund':'5 minut'}</button>)}<button onClick={()=>attempt(()=>session.advance(Math.max(0,state.hideDeadline-state.now)))}>Konec 45 minut</button><button onClick={()=>{void exportScenario(saved()).then(download).catch(e=>setError(e.message));}}>Uložit scénář</button><label className="sim-file">Načíst soukromý scénář<input type="file" accept=".json" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)restoreFromFile(file);}}/></label></div>
    <div className="control-row"><label><input type="checkbox" checked={state.walking} onChange={e=>attempt(()=>session.dispatch('hunter',{type:'walking',value:e.target.checked}))}/>Hledači jsou pěšky</label><label><input type="checkbox" checked={showCircle} onChange={e=>setShowCircle(e.target.checked)}/>400m okruh stanoviště</label><label>Kliknutí do mapy přesune<select value={clickRole} onChange={e=>setClickRole(e.target.value as Role)}><option value="hunter">GPS hledačů</option><option value="hider">Skutečnou GPS schovaného</option></select></label><button onClick={()=>attempt(()=>session.dispatch('hunter',{type:'report_found'}))} disabled={state.phase!=='seeking'||!!state.cardState?.move&&state.cardState.move.stage!=='completed'}>Ohlásit nalezení</button><label><input type="checkbox" checked={observeHunter} onChange={e=>setObserveHunter(e.target.checked)}/>Diagnostický GPS záznam hledačů (případné porušení Move se zaznamená)</label><span className="save-status">Stav se automaticky ukládá do oddělené IndexedDB.</span></div>
   </section>
   <p className="sim-privacy">Simulace běží pouze v tomto prohlížeči, bez přihlášení. Herní stav, fotografie, karty a diagnostika se ukládají do oddělené místní IndexedDB. Sdílet je můžete vlastním exportem. Mapy.com dostávají požadavky na dlaždice podle výřezu a zoomu. Při přípravě Matching ulice se na jejich reverse geocoding odešlou oba simulované GPS body; názvy se uloží místně. Fotografie, karty ani zbytek herního stavu se jim neposílají. <span role="status" data-testid="basemap-status">{mapNote}</span></p>
   {scenario==='map-conflict'&&<p className="sim-data-note">DIAGNOSTIKA: administrátorská mapa ukazuje dvě synteticky protikladné podmínky. Nejsou uloženými herními odpověďmi; telefony a skutečná historie se nemění.</p>}<section className="sim-map-grid"><div className="sim-map"><GameMap release={release} view={scenario==='map-conflict'?{...viewForRole(state,'hunter',env),deductions:conflictGeometryFixture(state.deductions??[])}:viewForRole(state,'hunter',env)} storageKey={`jetlag-public-map:${state.id}:admin`} markers={markers} center={state.station?.point??state.fixes.hider?.point??state.fixes.hunter?.point} apiKey={import.meta.env.VITE_MAPY_API_KEY} area={release.data.gameArea.geometry} circle={showCircle?state.station?.point:null} onClick={point=>move(clickRole,point)}/></div><aside className="position-panel"><h2>Simulované polohy</h2>{(['hunter','hider'] as const).map(role=><form key={role} onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);move(role,[Number(data.get('lng')),Number(data.get('lat'))]);}}><h3>{role==='hunter'?'Hledači · modrá':'Schovaný · fialová'}</h3><label>Latitude<input key={`${role}-lat-${state.fixes[role]?.point[1]}`} name="lat" aria-label={`Latitude ${role}`} type="number" step="any" min="-90" max="90" required defaultValue={state.fixes[role]?.point[1]??''}/></label><label>Longitude<input key={`${role}-lng-${state.fixes[role]?.point[0]}`} name="lng" aria-label={`Longitude ${role}`} type="number" step="any" min="-180" max="180" required defaultValue={state.fixes[role]?.point[0]??''}/></label><button>Nastavit GPS {role==='hunter'?'hledačů':'schovaného'}</button><button type="button" onClick={()=>attempt(()=>session.dispatch(role,{type:'location',role,fix:null}))}>Vypnout GPS {role==='hunter'?'hledačů':'schovaného'}</button></form>)}<p>Stanoviště: <strong>{state.station?.name??'Není uzamčené'}</strong></p></aside></section>
   <section className="phone-workbench" aria-label="Dva virtuální telefony">{matchForState(state).teams.map((team,index)=>{const role=roleForTeam(state,team.id);return <div className="phone-column" key={team.id} data-team-id={team.id}><div className="phone-caption"><b>0{index+1}</b><span>{team.name}<small>{role==='hunter'?'Hledači · veřejný pohled':'Schovaný · soukromý pohled'} · 2 hráči / 1 telefon</small></span></div><div className="phone-frame"><div className="phone-island"/><GamePhone key={sessionSerial+team.id} transport={transports[team.id]} release={release} apiKey={import.meta.env.VITE_MAPY_API_KEY} photos={photos}/></div></div>;})}</section>
   <section className="sim-diagnostics"><h2>Diagnostika správce · mimo telefony</h2>
   <dl className="sim-release-diagnostics" aria-label="Diagnostika geografických podkladů">
    <dt>Načtené vydání</dt><dd data-testid="active-release-id"><code>{release.releaseId}</code></dd>
    <dt>Říční vrstva (riverArea)</dt><dd data-testid="river-area-status">{riverArea?'Dostupná':'Chybí'}</dd>
    <dt>Pevninské oblasti (landAreas)</dt><dd data-testid="land-area-count">{landAreas?.areas.length??0}</dd>
    <dt>measuring:vltava</dt><dd data-testid="river-question-status">{questionStatus('measuring:vltava')}</dd>
    <dt>matching:landmass</dt><dd data-testid="land-question-status">{questionStatus('matching:landmass')}</dd>
    <dt>Verze rozehrané simulace</dt><dd data-testid="pinned-release-status">{latestReleaseId===release.releaseId?'Aktuální ověřené vydání':'Připnutá ke staršímu vydání'}</dd>
   </dl><p>Balíček: {state.rules.deck.length} karet · {state.rules.deck.filter(id=>state.rules.cards.find(c=>c.id===id)?.type==='time_bonus').length} bonusů / {state.rules.deck.filter(id=>state.rules.cards.find(c=>c.id===id)?.type==='powerup').length} powerupů / {state.rules.deck.filter(id=>state.rules.cards.find(c=>c.id===id)?.type==='curse').length} prokletí. Pravidla: {state.rules.id}</p><label>Testovací karta do ruky<select value={diagnosticCard} onChange={e=>setDiagnosticCard(e.target.value)}><option value="">Vyberte kartu</option>{state.rules.cards.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><button disabled={!diagnosticCard||['awaiting_capture_confirmation','settling','finished'].includes(state.phase)} onClick={()=>attempt(()=>{const next=structuredClone(session.state);if(next.mode!=='simulation')throw new Error('Pouze simulátor.');if(['awaiting_capture_confirmation','settling','finished'].includes(next.phase))throw new Error('Po nalezení se karetní ruka nemění.');const card=next.drawPile.find(id=>id.startsWith(diagnosticCard+'@'));if(!card)throw new Error('Žádná instance této karty není v dobíracím balíčku.');next.drawPile=next.drawPile.filter(id=>id!==card);next.hand.push(card);next.events.push({id:`${next.id}:event:${++next.sequence}`,at:next.now,type:'diagnostic_grant',audience:'hider',text:'Diagnostický přesun existující instance z balíčku do ruky.'});bind(next,env);})}>Vložit existující instanci do ruky (jen simulátor)</button><label>Otázka pro diagnostiku<select value={questionId} onChange={e=>setQuestionId(e.target.value)}>{state.questions.map(q=><option key={q.id} value={q.id}>{q.definition.label} · {q.id}</option>)}{state.rules.questions.map(q=><option key={q.id} value={q.id}>{q.label} ({q.type})</option>)}</select></label><p>Rozhodný cíl: <strong>{definition?.target==='gps'?'Skutečná GPS schovaného':'Uzamčené stanoviště'}</strong>. Poloha hledačů je uzamčená v okamžiku otázky.</p><pre data-testid="question-diagnostics">{JSON.stringify({questionId:selected?.id??definition?.id,releaseId:state.releaseId,availability:definition?env.availability(definition):null,expected:diagnostics,actual:selected?.answer??null,error:selected?.error??null,hunterSnapshot:selected?.hunterFix??null,secondSnapshot:selected?.secondFix??null,measurementDistance:selected?.secondFix?env.distance(selected.hunterFix.point,selected.secondFix.point):null,phase:selected?.phase??null,targetSnapshot:selected?.targetPoint??null},null,2)}</pre><button onClick={()=>setShowState(v=>!v)}>{showState?'Skrýt interní herní stav':'Zobrazit interní herní stav'}</button>{showState&&<pre data-testid="internal-state">{JSON.stringify(state,null,2)}</pre>}<details><summary>Úplná historie správce ({state.events.length})</summary><ol>{state.events.map(e=><li key={e.id}>{e.type} · {e.audience} · {e.text}</li>)}</ol></details></section>
  </>}
  </div>
 </div>;
}
