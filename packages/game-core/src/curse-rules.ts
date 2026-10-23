import source from './curse-catalog.json' with {type:'json'};
import type { CardMechanics, CastingRequirement, CurseEffectSpec, CurseSetup, GameSize } from './card-types';
import type { GameEnvironment, GameState } from './types';
import { validFix } from './engine';
export const CURSE_SOURCE=source;
const amount=(size:GameSize,values:[number,number,number])=>values[['small','medium','large'].indexOf(size)];
const discard=(count:number,cardType?:'time_bonus'|'powerup'):CastingRequirement=>({id:'discard',kind:'discard',count,...(cardType?{cardType}:{})});
const manual=(id:string,text:string):CastingRequirement=>({id,kind:'special',text});
const task=(text:string,proof:'confirmation'|'photo'|'video'='confirmation',extra:Partial<Extract<CurseEffectSpec,{kind:'task'}>>={}):CurseEffectSpec=>({kind:'task',text,proof,blocksQuestions:true,...extra});
const obligation=(text:string,penaltySeconds:number):CurseEffectSpec=>({kind:'round_obligation',text,penaltySeconds});
export function curseRules(id:string,size:GameSize):CardMechanics {
 const c=source.curses.find(c=>c.id===id);if(!c)throw new Error('Neznámé prokletí.');
 let cost:CastingRequirement[]=[],effects:CurseEffectSpec[]=[];const missing:string[]=[];
 const bonus=amount(size,[30,45,60])*60, long=amount(size,[20,40,60])*60000;
 switch(id){
 case 'curse-zoologist':cost=[{id:'animal',kind:'photo',text:c.castingCostCs}];effects=[task(c.effectCs,'photo',{approvalByHider:true})];break;
 case 'curse-unguided-tourist':cost=[{id:'outside',kind:'outdoors',text:c.castingCostCs},{id:'streetview',kind:'photo',text:'Nepřiblížený snímek Google Street View, horizontální a se stavbou kromě silnice.'},manual('streetview-rules','Snímek splňuje zadání a cílová ulice odpovídá zadanému bodu.')];effects=[task(c.effectCs,'photo',{approvalByHider:true}),{kind:'travel',text:'Do nalezení místa a ověření fotografie nelze použít dopravu.',noTransit:true,confirmOutsideStation:false,endsWithTask:true,preventBoarding:true}];break;
 case 'curse-endless-tumble':cost=[{id:'roll',kind:'roll',count:1,condition:'any',noEffectWhen:'five_or_six'}];effects=[task(c.effectCs,'confirmation',{rollCondition:'five_or_six'}),{kind:'round_obligation',text:'Neúmyslné zasažení jiné osoby kostkou během úkolu; oznámení incidentu, nikoli pobídka k riskování.',penaltySeconds:amount(size,[10,20,30])*60,endsWithTask:true}];break;
 case 'curse-hidden-hangman':cost=[discard(2)];effects=[task(c.effectCs,'confirmation',{approvalByHider:true}),{kind:'travel',noTransit:true,confirmOutsideStation:false,endsWithTask:true,preventBoarding:true,text:'Před nástupem do další dopravy je nutné vyhrát šibenici.'}];break;
 case 'curse-overflowing-chalice':cost=[discard(1)];effects=[{kind:'reward_draw',amount:1,questions:3,text:c.effectCs}];break;
 case 'curse-mediocre-travel-agent':cost=[{id:'transit',kind:'off_transit',text:'Hledači právě nejsou v dopravě.'},manual('public-place','Zadané místo je veřejně přístupné.')];effects=[task(c.effectCs,'photo',{minMedia:3,waitMs:amount(size,[5,5,10])*60000,approvalByHider:true}),obligation('Opatřit a uchovat suvenýr až do setkání se schovaným.',bonus)];break;
 case 'curse-luxury-car':cost=[{id:'car',kind:'photo',text:c.castingCostCs}];effects=[task(c.effectCs,'photo',{approvalByHider:true})];break;
 case 'curse-u-turn':cost=[manual('service','Na další zastávce jede jiná doprava do '+amount(size,[30,30,60])+' minut; potvrzení hráče, aplikace nemá jízdní řád.'),manual('on-transit','Hledači nyní jedou dopravním prostředkem.')];effects=[task(c.effectCs)];break;
 case 'curse-bridge-troll':cost=[{id:'distance',kind:'geography',subject:'hunter',reference:'caster',minMeters:amount(size,[300,1500,9100]),text:'Rozhodnutí správce: kilometrové limity Small 300 m / Medium 1 500 m / Large 9 100 m od schovaného.'}];effects=[{kind:'next_question',confirmation:'Potvrzuji, že otázku pokládám z místa pod mostem.',text:c.effectCs}];break;
 case 'curse-water-weight':cost=[{id:'water',kind:'geography',subject:'hunter',reference:'named_water',maxMeters:300,text:c.castingCostCs}];effects=[task('Každý hledač získal 2 litry tekutiny; tekutiny lze mezi hledači rozdělit.'),obligation('Nést celkové množství 2 litry na hledače až do konce kola; ztráta či odložení znamená penalizaci.',amount(size,[30,30,60])*60)];break;
 case 'curse-jammed-door':cost=[discard(2)];effects=[{kind:'door_gate',durationMs:amount(size,[0.5,1,3])*3600000,retryMs:amount(size,[5,10,15])*60000,text:c.effectCs}];break;
 case 'curse-cairn':cost=[{id:'tower',kind:'physical',text:c.castingCostCs},manual('tower-rules','Jeden pokus, přírodní kameny, pravidlo dotyku, bez odebírání, 5 s stability mezi kameny a rozptýlení kamenů po stavbě podle plného textu.')];effects=[task(c.effectCs,'confirmation',{approvalByHider:true})];break;
 case 'curse-urban-explorer':cost=[discard(2)];effects=[{kind:'travel',noTransit:true,confirmOutsideStation:true,text:c.effectCs}];break;
 case 'curse-impressionable-consumer':effects=[task(c.effectCs),{kind:'free_question',text:c.castingCostCs,questions:1}];break;
 case 'curse-egg-partner':cost=[discard(2),manual('not-endgame','Právě neprobíhá endgame; ruční potvrzení, bez odhadu podle GPS.')];effects=[task('Opatřete vejce, které se stává členem týmu.'),obligation('Neopustit vejce a neporušit skořápku do konce kola.',bonus)];break;
 case 'curse-distant-cuisine':cost=[manual('restaurant','Jsem v restauraci ve své zóně, která výslovně podává kuchyni zadané cizí země.')];effects=[task(c.effectCs,'confirmation',{approvalByHider:true})];break;
 case 'curse-right-turn':cost=[discard(1)];effects=[{kind:'timer',durationMs:long,blocksQuestions:false,text:c.effectCs}];break;
 case 'curse-labyrinth':cost=[{id:'maze',kind:'physical',text:c.castingCostCs},{id:'maze-photo',kind:'photo',text:'Fotografie řešitelného bludiště pro hledače.'},manual('maze-rules','Bludiště je řešitelné, kreslení trvalo nejvýše '+amount(size,[10,20,30])+' minut a nebyl použit internet.')];effects=[task(c.effectCs)];break;
 case 'curse-bird-guide':cost=[{id:'bird-video',kind:'video',text:c.castingCostCs},manual('continuous','Jediný souvislý pokus, pták byl celou uvedenou dobu v záběru.')];effects=[task(c.effectCs,'video',{approvalByHider:true,blocksQuestions:false})];missing.push('Text neříká, že úkol blokuje další otázku; tato blokace se nevymýšlí.');break;
 case 'curse-spotty-memory':cost=[discard(1,'time_bonus')];effects=[{kind:'block_category',category:'random',rerollAfterQuestion:true,text:c.effectCs}];break;
 case 'curse-lemon-phylactery':cost=[discard(1,'powerup'),manual('not-endgame','Právě neprobíhá endgame; ruční potvrzení, bez odhadu podle GPS.')];effects=[task('Každý hledač našel citron a připevnil jej ke kůži nebo vnější vrstvě oblečení.'),obligation('Každý citron musí zůstat v kontaktu s hledačem do konce kola.',bonus)];break;
 case 'curse-drained-brain':cost=[{id:'hand',kind:'discard_hand'}];effects=[{kind:'block_questions',questionIds:[],text:c.effectCs}];break;
 case 'curse-ransom-note':cost=[{id:'ransom',kind:'physical',text:c.castingCostCs}];effects=[{kind:'next_question',confirmation:'Otázku jsem sestavil ze slov a písmen vystřižených z tištěného materiálu; je souvislá a dává smysl.',minWords:5,text:c.effectCs}];break;
 case 'curse-gamblers-feet':cost=[{id:'roll',kind:'roll',count:1,condition:'any',noEffectWhen:'even'}];effects=[{kind:'step_budget',durationMs:long,text:c.effectCs}];break;
 }
 const blocked=missing.some(s=>s.startsWith('Rozpor'));
 return {status:blocked?'incomplete':'ready',source:source.sourceUrl+' · text vložený uživatelem 2026-10-22',fullTextEn:c.effectEn+'\nCasting Cost: '+c.castingCostEn,fullTextCs:c.effectCs+'\nCena zahrání: '+c.castingCostCs+(id==='curse-bridge-troll'?'\nRozhodnutí správce 2026-10-22: použít výhradně 0,3 / 1,5 / 9,1 km.':id==='curse-mediocre-travel-agent'?'\nRozhodnutí správce 2026-10-22: použít výhradně 0,40 / 0,40 / 0,50 km.':''),castingCost:cost,effects,missing};
}
function check(value:unknown,text:string):asserts value{if(!value)throw new Error(text);}
/** Private setup stays in the hider state. These checks use published geometry only. */
export function preparedEffects(s:GameState,cardId:string,setup:CurseSetup,env:GameEnvironment):CurseEffectSpec[]{
 const card=s.rules.cards.find(c=>c.id===cardId)!;const effects=structuredClone(card.mechanics!.effects);
 if(card.mechanics!.status==='test_fixture')return effects;
 const firstTask=effects.find(e=>e.kind==='task');
 switch(cardId){
 case 'curse-zoologist':check(['fish','bird','mammal','reptile','amphibian','bug'].includes(setup.animalCategory??''),'Vyberte kategorii vyfotografovaného zvířete.');if(firstTask)firstTask.text+=' Kategorie: '+setup.animalCategory;break;
 case 'curse-unguided-tourist':check(setup.targetPoint&&validFix(s.fixes.hunter,s.now,s.rules),'Zadejte rozhodný bod Street View; chybí-li GPS hledačů, nelze vzdálenost ověřit.');check(env.distance(setup.targetPoint,s.fixes.hunter.point)<=152,'Snímek Street View musí být do 152 m od aktuální GPS hledačů.');break;
 case 'curse-hidden-hangman':if(s.rules.hangmanVersion!==1)check(setup.secretWord&&/^[\p{L} -]{1,100}$/u.test(setup.secretWord)&&/\p{L}/u.test(setup.secretWord),'Zadejte slovo pro šibenici, pouze písmena.');break; // New games enter the private word after casting.
 case 'curse-mediocre-travel-agent':check(setup.targetPoint&&validFix(s.fixes.hunter,s.now,s.rules),'Zadejte veřejně přístupné cílové místo; je nutná GPS hledačů.');check(env.distance(setup.targetPoint,s.fixes.hunter.point)<=(s.rules.size==='large'?500:400),'Cílové místo musí být v předepsaném kilometrovém dosahu od hledačů.');break;
 case 'curse-u-turn':{check(!s.walking,'U-Turn vyžaduje hledače v dopravě.');const stop=env.stops.find(p=>p.id===setup.nextStopId);check(stop&&validFix(s.fixes.hunter,s.now,s.rules)&&validFix(s.fixes.hider,s.now,s.rules),'Vyberte následující zastávku z katalogu; obě polohy musí být spolehlivé.');check(env.distance(stop.point,s.fixes.hider.point)>env.distance(s.fixes.hunter.point,s.fixes.hider.point),'Následující zastávka není dál od schovaného než aktuální poloha hledačů.');if(firstTask)firstTask.text+=' Následující zastávka: '+stop.name;break;}
 case 'curse-cairn':check(Number.isInteger(setup.rockCount)&&setup.rockCount!>0,'Zadejte počet kamenů poslední věže, která stála 5 sekund.');if(firstTask)firstTask.text+=' Požadovaná výška: '+setup.rockCount+' kamenů.';break;
 case 'curse-distant-cuisine':check(setup.country?.trim(),'Zadejte doloženou cizí zemi kuchyně.');check(s.station&&validFix(s.fixes.hider,s.now,s.rules)&&env.distance(s.fixes.hider.point,s.station.point)<=s.rules.radiusMeters,'Restaurace musí být ve vaší zóně; ověřte aktuální GPS.');if(firstTask)firstTask.text+=' Výchozí země: '+setup.country;break;
 case 'curse-bird-guide':check(setup.durationSeconds!==undefined&&setup.durationSeconds>0&&setup.durationSeconds<=(s.rules.size==='small'?5:s.rules.size==='medium'?10:15)*60,'Zadejte souvislou dobu záběru v mezích varianty.');if(firstTask&&firstTask.kind==='task'){firstTask.minimumDurationSeconds=setup.durationSeconds;firstTask.text+=' Požadované video: alespoň '+setup.durationSeconds+' sekund.';}break;
 case 'curse-drained-brain':{const ids=setup.questionIds??[],qs=ids.map(id=>s.rules.questions.find(q=>q.id===id));check(ids.length===3&&new Set(ids).size===3&&qs.every(Boolean)&&new Set(qs.map(q=>q!.type)).size===3,'Vyberte přesně 3 otázky ze 3 různých kategorií.');const e=effects.find(e=>e.kind==='block_questions');if(e?.kind==='block_questions')e.questionIds=ids;break;}
 }
 return effects;
}
