import {MATCH_SCENARIOS,matchScenario} from './match-scenarios';
import {UX_SCENARIOS,uxScenario} from './ux-scenarios';
import {MAP_SCENARIOS,mapScenario} from './map-scenarios';
import {SPATIAL_SCENARIOS,spatialScenario} from './spatial-scenarios';
import {createGame,deckRules,transition,type GameState,type GameEnvironment,type GameRules,type Point,type Role} from '../../../packages/game-core/src/index';
import {configureCardFixture} from './card-fixtures';
import type {GameDataRelease} from '../../../packages/geo-core/src/index';
export const SCENARIOS=[...MATCH_SCENARIOS,...UX_SCENARIOS,...SPATIAL_SCENARIOS,...MAP_SCENARIOS,
 ['deck-100','Rozložení přesného balíčku 100 karet'],['power-duplicate','Duplicate časového bonusu'],['power-discard-1','Discard 1 Draw 2'],['power-discard-2','Discard 2 Draw 3'],['power-expand','Draw 1 Expand 1'],['power-move','Move · 20 minut a pozastavený čas'],['curse-chalice','TEST Overflowing Chalice · tři odměny'],['curse-spotty','TEST Spotty Memory · blokace kategorie'],['curse-drained','TEST Drained Brain · blokace tří otázek'],['curse-water','TEST Water Weight · úkol a průběžná povinnost'],['curse-timed','TEST časově omezeného efektu'],['curse-cost','TEST atomické ceny zahrání'],['curse-photo','TEST ceny a úkolu s fotografií'],['curse-manual','TEST ručního potvrzení'],['curse-penalty','TEST penalizace průběžné povinnosti'],
 ['blank','Nová hra – výběr stanoviště'],['same-zoo','Matching · stejná nejbližší zoo'],['different-hospital','Matching · rozdílné nemocnice'],['measuring','Measuring · letiště'],['radar-in','Radar 800 m · uvnitř'],['radar-out','Radar 800 m · mimo'],['veto','Testovací Veto před odpovědí'],['randomize','Testovací Randomize'],['reward','Dobírání 3 → 1'],['overflow','Překročený limit ruky'],['curse','Testovací prokletí a splnění'],['walk-in','Přiblížení pěšky pod 400 m'],['transit-in','V dopravě pod 400 m bez upozornění'],['overlap','Překryv zastávkových okruhů'],['timeout','Pětiminutové reakční okno'],['missing-gps','Chybějící GPS'],['missing-data','Chybějící geografická vrstva'],
] as const;
export function buildScenario(id:string,release:GameDataRelease,env:GameEnvironment,seed=42,rules:GameRules=deckRules('small')):GameState{
 if(!SCENARIOS.some(([key])=>key===id))throw new Error('Neznámý testovací scénář.');
 rules=structuredClone(rules);const match=matchScenario(id,release,env,()=>buildScenario('deck-100',release,env,seed,rules));if(match)return match;const ux=uxScenario(id,env,base=>buildScenario(base,release,env,seed,rules));if(ux)return ux;const mapped=mapScenario(id,release,env,rules,base=>buildScenario(base,release,env,seed,rules));if(mapped)return mapped;const spatial=spatialScenario(id,release,env,seed,rules);if(spatial)return spatial;const fixtureCard=configureCardFixture(rules,id);
 const start=Date.parse(`${release.data.pidSnapshot.serviceDate}T10:00:00Z`);let s=createGame({id:`simulation-${seed}`,releaseId:release.releaseId,seed,now:start,rules});let sequence=0;
 const send=(actor:Role|'clock',command:Parameters<typeof transition>[1]['command'],at=s.now)=>{s=transition(s,{id:`scenario-${++sequence}`,at,actor,command},env);};
 const nearestStop=(p:Point)=>[...env.stops].sort((a,b)=>env.distance(a.point,p)-env.distance(b.point,p)||a.id.localeCompare(b.id))[0];
 const anchor=release.data.pois.find(p=>p.category==='zoo'),defaultStop=nearestStop(anchor?.point??[14.43,50.08]);if(!defaultStop)throw new Error('Publikace nemá způsobilé zastávky pro simulaci.');
 const locate=(role:Role,point:Point)=>send(role,{type:'location',role,fix:{point,at:s.now,accuracy:5}});
 const grant=(cardName:string)=>{const card=s.drawPile.find(c=>c.startsWith(cardName+'@'));if(!card)throw new Error('Chybí testovací karta.');s.drawPile=s.drawPile.filter(c=>c!==card);s.hand.push(card);};
 locate('hider',defaultStop.point);locate('hunter',defaultStop.point);
 if(['blank','overlap','missing-gps'].includes(id)){
  if(id==='overlap'){const pair=env.stops.map(a=>({a,b:env.stops.find(b=>b.id!==a.id&&env.distance(a.point,b.point)>1&&env.distance(a.point,b.point)<500)})).find(p=>p.b);if(!pair)throw new Error('V katalogu nebyl nalezen překryv okruhů.');locate('hider',[(pair.a.point[0]+pair.b!.point[0])/2,(pair.a.point[1]+pair.b!.point[1])/2]);}
  if(id==='missing-gps')send('hider',{type:'location',role:'hider',fix:null});return s;
 }
 send('hider',{type:'lock_station',stopId:defaultStop.id});
 if(id==='different-hospital'){const hospital=release.data.pois.find(p=>p.category==='hospital');if(!hospital)throw new Error('Chybí publikované nemocnice.');locate('hunter',hospital.point);send('hunter',{type:'ask',questionId:'matching:hospital'});}
 if(id==='same-zoo')send('hunter',{type:'ask',questionId:'matching:zoo'});
 if(id==='measuring'){const airport=release.data.pois.find(p=>p.category==='airport');if(!airport)throw new Error('Chybí publikované letiště.');locate('hunter',airport.point);send('hunter',{type:'ask',questionId:'measuring:airport'});}
 if(['radar-in','radar-out','timeout'].includes(id)){if(id==='radar-out')locate('hunter',[defaultStop.point[0]+.03,defaultStop.point[1]]);send('hunter',{type:'ask',questionId:'radar:800'});}
 if(id==='veto'||id==='randomize'){grant(id);send('hunter',{type:'ask',questionId:'matching:zoo'});}
 if(id==='reward'){send('hunter',{type:'ask',questionId:'matching:zoo'});send('hider',{type:'answer'});send('hider',{type:'draw_reward',rewardId:s.rewards[0].id});}
 if(id==='overflow'){for(let i=0;i<7;i++)grant('bonus-red');}
 if(fixtureCard){if(id==='curse-cost')grant('bonus-red');grant(fixtureCard);if(id==='power-move')send('hider',{type:'play_card',cardId:s.hand.at(-1)!});else {send('hider',{type:'begin_cast',cardId:s.hand.at(-1)!});if(!['curse-cost','curse-photo'].includes(id))send('hider',{type:'confirm_cast',curseId:s.curses.at(-1)!.id,proof:{}});}}
 if(id==='power-move'){grant('bonus-red');grant('move');send('hider',{type:'play_card',cardId:s.hand.at(-1)!});}
 if(id==='power-duplicate'){grant('bonus-red');grant('duplicate');}
 if(id==='power-discard-1'||id==='power-discard-2'){grant('bonus-red');if(id==='power-discard-2')grant('bonus-orange');grant(id==='power-discard-1'?'discard-1-draw-2':'discard-2-draw-3');}
 if(id==='power-expand')grant('draw-1-expand-1');
 if(id==='walk-in'||id==='transit-in'){locate('hunter',[defaultStop.point[0]+.02,defaultStop.point[1]]);send('hunter',{type:'walking',value:id==='walk-in'});}
 return s;
}
