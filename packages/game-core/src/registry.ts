import type { CardDefinition, GameRules, QuestionDefinition, QuestionType } from './types';
export const QUESTION_GROUPS: {id:QuestionType;name:string;icon:string;color:string;description:string}[] = [
  {id:'matching',name:'Matching',icon:'⇄',color:'#2275b7',description:'Je nejbližší lokalita stejná?'},
  {id:'measuring',name:'Measuring',icon:'↔',color:'#1d877c',description:'Je schovaný blíž, nebo dál?'},
  {id:'radar',name:'Radar',icon:'◎',color:'#be7a24',description:'Je cíl v zadaném okruhu?'},
  {id:'thermometer',name:'Thermometer',icon:'♨',color:'#c35765',description:'Dvě uložená měření po přesunu.'},
  {id:'tentacles',name:'Tentacles',icon:'✳',color:'#8057a4',description:'Nejbližší lokalita v dosahu varianty.'},
  {id:'photo',name:'Fotky',icon:'▣',color:'#536a84',description:'Schovaný pořídí a odešle fotografii.'},
];
const labels: Record<string,string> = {airport:'Letiště',transit_line:'Linka MHD',stop_name:'Délka názvu zastávky',street:'Ulice',municipal:'Městská část',cadastral:'Katastrální území',landmass:'Pevnina',park:'Přírodní park',zoo:'Zoo',golf:'Golfové hřiště',cinema:'Kino',aquapark:'Aquapark',hospital:'Nemocnice',library:'Knihovna',rail:'Železniční stanice',elevation:'Nadmořská výška',waterbody:'Vodní plochy',vltava:'Vltava – vzdálenost k řece'};
const supportedPoi = ['airport','zoo','cinema','hospital','library','waterbody'];
export function questionRegistry(): QuestionDefinition[] {
  const result: QuestionDefinition[]=[];
  for (const type of ['matching','measuring'] as const) {
    const categories=type==='matching'?['airport','transit_line','stop_name','street','municipal','cadastral','landmass','park','zoo','golf','cinema','aquapark','hospital','library']:['airport','rail','elevation','waterbody','vltava','zoo','golf','cinema','aquapark','hospital','library'];
    for(const category of categories){
      const manual=['transit_line','stop_name'].includes(category), admin=['municipal','cadastral'].includes(category);
      const supported=supportedPoi.includes(category)||admin;
      result.push({id:`${type}:${category}`,type,category,label:labels[category],description:category==='elevation'?'Je tvoje nadmořská výška vyšší, nebo nižší než moje?':type==='matching'?`Je tvoje nejbližší ${labels[category].toLocaleLowerCase('cs')} stejné jako moje nejbližší?`:`Jsi oproti mně blíž, nebo dál od ${labels[category].toLocaleLowerCase('cs')}?`,resolver:manual?'manual':admin?'same_area':supported?type==='matching'?'poi_matching':'poi_measuring':'unsupported',answerMode:manual?'manual':'automatic',rewardPolicy:{draw:3,keep:1},timeoutSeconds:300,availability:manual?'manual':supported?'ready':'missing_data',requirements:[category],target:'station',configured:true});
    }
  }
  for(const radiusMeters of [400,800,1500,3000,6000])result.push({id:`radar:${radiusMeters}`,type:'radar',category:'distance',label:`Radar ${radiusMeters.toLocaleString('cs-CZ')} m`,description:`Jsi do ${radiusMeters.toLocaleString('cs-CZ')} metrů ode mě?`,resolver:'radar',answerMode:'automatic',rewardPolicy:{draw:2,keep:1},timeoutSeconds:300,availability:'ready',requirements:[],target:'station',radiusMeters,configured:true});
  result.push({id:'thermometer:unconfigured',type:'thermometer',category:'distance',label:'Dvě měření',description:'Uložte první a druhou polohu po přesunu. Variantě chybí schválená minimální vzdálenost a odměna.',resolver:'thermometer',answerMode:'automatic',rewardPolicy:null,timeoutSeconds:null,availability:'unsupported',requirements:['thermometer_rules'],target:'station',configured:false});
  for(const category of ['library','park','museum','hospital'])result.push({id:`tentacles:${category}`,type:'tentacles',category,label:labels[category]??'Muzea',description:'Dosah, způsob výběru a odměna této varianty nejsou schválené.',resolver:'tentacles',answerMode:'automatic',rewardPolicy:null,timeoutSeconds:null,availability:'unsupported',requirements:[category,'tentacles_rules'],target:'station',configured:false});
  result.push({id:'photo:surroundings',type:'photo',category:'surroundings',label:'Fotografie okolí',description:'Pošli fotografii svého aktuálního okolí. Testovací zadání bez karetní odměny; finální foto karty čekají na pravidla.',resolver:'photo',answerMode:'photo',rewardPolicy:null,timeoutSeconds:null,availability:'manual',requirements:[],target:'gps',configured:true,testOnly:true});
  return result;
}
export const TEST_CARDS: CardDefinition[] = [
  {id:'bonus-60',type:'time_bonus',name:'Minuta navíc',icon:'◷',description:'Testovací bonus 60 sekund na konci kola. Zůstává v ruce.',effect:'bonus',value:60},
  {id:'bonus-180',type:'time_bonus',name:'Tři minuty navíc',icon:'◷',description:'Testovací bonus 180 sekund na konci kola.',effect:'bonus',value:180},
  {id:'capacity',type:'powerup',name:'Větší ruka',icon:'⊕',description:'Testovací zvýšení kapacity o dvě karty do konce kola.',effect:'capacity',value:2},
  {id:'veto',type:'powerup',name:'Veto',icon:'⊘',description:'Testovací pravidlo: zruší čekající otázku bez odměny.',effect:'veto'},
  {id:'randomize',type:'powerup',name:'Randomize',icon:'⤨',description:'Testovací pravidlo: nahradí otázku náhodnou dostupnou otázkou stejného typu; GPS a termín zůstanou.',effect:'randomize'},
  {id:'curse-pause',type:'curse',name:'Tiché dvě minuty',icon:'☾',description:'Testovací prokletí: dvě minuty nelze pokládat otázky.',effect:'curse',curse:{durationMs:120000,condition:'Počkejte do konce dvou minut.',blocksQuestions:true,manual:false}},
  {id:'curse-look',type:'curse',name:'Rozhlédněte se',icon:'✦',description:'Testovací ruční úkol: přečtěte název nejbližší ulice a potvrďte splnění.',effect:'curse',curse:{condition:'Přečtěte název nejbližší ulice.',blocksQuestions:false,manual:true}},
];
/** Explicit local test rules, never represented as the official card rules. */
export function simulationRules():GameRules {return {id:'prague-mvp-test-v1',label:'Testovací pravidla MVP · karty a doplňkové varianty nejsou schválené',testOnly:true,hideMs:45*60000,radiusMeters:400,gpsMaxAgeMs:120000,gpsMaxAccuracyM:50,handLimit:6,veto:{enabled:true,reward:false},randomize:{enabled:true,restartTimer:false},questions:questionRegistry(),cards:TEST_CARDS,deck:Array.from({length:8},()=>TEST_CARDS.map(c=>c.id)).flat()};}
