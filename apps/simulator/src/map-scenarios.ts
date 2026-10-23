import {transition,type Command,type Deduction,type GameEnvironment,type GameRules,type GameState,type Point,type Role} from '../../../packages/game-core/src/index';
import type {GameDataRelease} from '../../../packages/geo-core/src/index';
export const MAP_SCENARIOS=[
 ['map-radar-no','Mapa · Radar NE – červený okruh'],['map-radar-yes','Mapa · Radar ANO – možná oblast'],['map-radar-overlap','Mapa · dva překrývající se radary'],
 ['map-measuring-points','Mapa · Measuring bodových POI'],['map-measuring-polygons','Mapa · Measuring nepravidelných vodních polygonů'],['map-measuring-different','Mapa · Measuring s různými nejbližšími objekty'],
 ['map-thermo-warmer','Mapa · Thermometer TEPLEJI'],['map-thermo-colder','Mapa · Thermometer CHLADNĚJI'],['map-matching-same','Mapa · Matching stejných POI'],['map-matching-different','Mapa · Matching různých POI'],
 ['map-combined','Mapa · kombinace více podmínek'],['map-conflict','DIAGNOSTIKA · syntetický konflikt mimo herní historii'],['map-targets','Mapa · oddělené stanoviště a okamžiky GPS'],
 ['move-origin','Move · odhalené původní stanoviště'],['move-time','Move · pozastavený herní čas'],['move-blocked','Move · blokované otázky a přesuny hledačů'],['move-destination','Move · předběžný výběr nového stanoviště'],['move-epoch','Move · archivace a čistá nová etapa'],['move-reload','Move · rozpracovaný stav pro reload'],['move-endgame','Move · zákaz během potvrzeného endgame'],
] as const;
export function mapScenario(id:string,release:GameDataRelease,env:GameEnvironment,rules:GameRules,buildBase:(id:string)=>GameState):GameState|null {
 if(!MAP_SCENARIOS.some(([key])=>key===id))return null;
 if(!rules.automaticDeductionMap||!rules.deductionConsent?.hunter||!rules.deductionConsent.hider)throw new Error('Pro mapové scénáře zapněte automatické zakreslování v konfiguraci nové hry a potvrďte souhlas obou rolí.');
 if(id==='map-targets')for(const q of rules.questions)if(q.type==='radar'&&q.id!=='radar:800')q.target='gps';
 const thermo=id==='map-combined'||id.startsWith('map-thermo');
 let s=buildBase(thermo?(id==='map-thermo-colder'?'thermo-colder':'thermo-warmer'):'radar-in'),serial=0;
 const send=(actor:Role|'clock',command:Command,at=s.now)=>s=transition(s,{id:`map-scenario-${++serial}`,at,actor,command},env);
 const locate=(role:Role,point:Point,at=s.now)=>send(role,{type:'location',role,fix:{point,accuracy:5,at}},at);
 const advance=(ms:number)=>{const at=s.now+ms;for(const role of ['hider','hunter'] as const)if(s.fixes[role])locate(role,s.fixes[role]!.point,at);send('clock',{type:'tick'},at);};
 const answer=()=>send('hider',{type:'answer'});
 const ask=(questionId:string)=>{send('hunter',{type:'ask',questionId});answer();};
 const grant=(id:string)=>{const card=s.drawPile.find(c=>c.startsWith(id+'@'));if(!card)throw new Error('Chybí skutečná instance karty.');s.drawPile=s.drawPile.filter(c=>c!==card);s.hand.push(card);return card;};
 // The initial pending question is resolved using real, pinned release data.
 if(thermo){send('hunter',{type:'second_measurement'});answer();}
 else if(id==='map-radar-no'){
  // Replace the initial pending fixture with a real snapshot farther from H.
  s=buildBase('radar-out');answer();
 }else answer();
 if(id==='map-radar-overlap'){locate('hunter',[s.station!.point[0]+.004,s.station!.point[1]]);ask('radar:1500');}
 if(id.startsWith('map-measuring')){
  const category=id==='map-measuring-polygons'?'waterbody':'hospital',poi=release.data.pois.find(p=>p.category===category&&p.geometry.type!=='Point')??release.data.pois.find(p=>p.category===category);
  if(!poi)throw new Error('Chybí schválené objekty scénáře.');locate('hunter',poi.point);ask('measuring:'+category);
 }
 if(id.startsWith('map-matching')){
  const definition=s.rules.questions.find(q=>q.id==='matching:hospital')!;
  if(id==='map-matching-different'){
   const candidate=release.data.pois.filter(p=>p.category==='hospital').find(p=>env.resolve({...s.questions[0],definition,hunterFix:{point:p.point,at:s.now,accuracy:5},targetPoint:s.station!.point}).answer==='NE');
   if(!candidate)throw new Error('Publikace neumožňuje scénář rozdílných nemocnic.');locate('hunter',candidate.point);
  }else locate('hunter',s.station!.point);
  ask('matching:hospital');
 }
 if(id==='map-combined'){ask('radar:3000');ask('measuring:hospital');ask('matching:municipal');}
 if(id==='map-targets'){
  // Explicit simulator rule fixture: separate public GPS snapshots, never merge.
  ask('radar:1500');locate('hider',[s.station!.point[0]+.001,s.station!.point[1]]);ask('radar:3000');
 }
 if(id.startsWith('move-')){
  const moveCard=grant('move');
  if(id==='move-endgame'){send('hider',{type:'declare_endgame',confirmed:true});return s;}
  grant('bonus-red');send('hider',{type:'play_card',cardId:moveCard});
  if(['move-destination','move-epoch','move-reload'].includes(id)){
   const destination=env.stops.find(stop=>env.distance(stop.point,s.station!.point)>1500);if(!destination)throw new Error('Chybí jiné způsobilé stanoviště.');
   advance(60000);locate('hider',destination.point);send('hider',{type:'complete_move',stopId:destination.id,confirmed:true});
   if(id==='move-epoch'){advance(19*60000);ask('radar:800');}
  }
  if(id==='move-time')advance(5*60000);
 }
 return s;
}
/** Administrator-only geometry fixture. It never modifies saved GameState,
 * question answers, role DTOs, consent or scoring. */
export function conflictGeometryFixture(deductions:Deduction[]):Deduction[] {
 const first=deductions.find(d=>d.sourceType==='radar'&&d.status==='active');
 return first?[first,{...first,id:first.id+':diagnostic-opposite',questionId:first.questionId+':diagnostic',result:first.result==='ANO'?'NE':'ANO',operation:first.operation==='include'?'exclude':'include'}]:[];
}
