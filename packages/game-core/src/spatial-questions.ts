import type { QuestionDefinition } from './types';

export const QUESTION_RULE_SOURCE = 'https://jetlag.denull.ru/en/rules/questions/';
export const GEOGRAPHIC_EPSILON_METERS = 0.000001;
/** Deliberate tie band, separate from the numerical boundary epsilon. */
export const THERMOMETER_TOLERANCE_METERS = 1;
export const THERMOMETER_VARIANTS = [
  { id: 'half-mile', label: '0,5 míle', meters: 804.672 },
  { id: '3-miles', label: '3 míle', meters: 4828.032 },
  { id: '10-miles', label: '10 mil', meters: 16093.44 },
  { id: '50-miles', label: '50 mil', meters: 80467.2 },
] as const;
export const TENTACLES_CATEGORIES = [
  { category:'library', label:'Knihovny', radiusMeters:1609.344, origin:'Medium · 1 míle' },
  { category:'cinema', label:'Kina', radiusMeters:1609.344, origin:'Medium · 1 míle' },
  { category:'hospital', label:'Nemocnice', radiusMeters:1609.344, origin:'Medium · 1 míle' },
  { category:'museum', label:'Muzea', radiusMeters:1609.344, origin:'Medium · 1 míle' },
  { category:'zoo', label:'Zoo a místa se zvířaty', radiusMeters:24140.16, origin:'Large · 15 mil' },
  { category:'aquarium', label:'Akvária', radiusMeters:24140.16, origin:'Large · 15 mil' },
  { category:'amusement_park', label:'Zábavní parky', radiusMeters:24140.16, origin:'Large · 15 mil' },
  { category:'metro_line', label:'Linky metra', radiusMeters:24140.16, origin:'Large · 15 mil; vyžaduje liniový resolver' },
  { category:'airport', label:'Letiště', radiusMeters:1609.344, origin:'Pražská konfigurace simulátoru · 1 míle' },
  { category:'park', label:'Parky', radiusMeters:1609.344, origin:'Pražská konfigurace simulátoru · 1 míle' },
  { category:'waterbody', label:'Vodní plochy', radiusMeters:1609.344, origin:'Pražská konfigurace simulátoru · 1 míle' },
];
export interface QuestionConfiguration {
  legacy?: boolean;
  maxMovementMeters?: number;
  thermometer?: { id:string; label:string; meters:number; enabled?:boolean }[];
  tentacles?: { category:string; label:string; radiusMeters:number; origin?:string; enabled?:boolean }[];
}
/** Configuration is pinned in the game's rules. Editor drafts never supply POI. */
export function spatialQuestions(options:QuestionConfiguration = {}):QuestionDefinition[] {
  const enabled = (options.thermometer??THERMOMETER_VARIANTS).filter(v=>!('enabled' in v)||v.enabled!==false);
  for(const v of enabled)if(!Number.isFinite(v.meters)||v.meters<=0)throw new Error('Minimální přesun musí být kladný počet metrů.');
  const thermometer=enabled.filter(v=>options.maxMovementMeters===undefined||v.meters<=options.maxMovementMeters);
  const tentacles=(options.tentacles??TENTACLES_CATEGORIES).filter(v=>!('enabled' in v)||v.enabled!==false);
  for(const v of tentacles)if(!Number.isFinite(v.radiusMeters)||v.radiusMeters<=0)throw new Error('Dosah musí být kladný počet metrů.');
  return [
    ...thermometer.map(v=>({id:`thermometer:${v.id}`,type:'thermometer' as const,category:'distance',label:`Thermometer · ${v.label}`,description:`Po přesunu alespoň ${v.meters.toLocaleString('cs-CZ',{maximumFractionDigits:3})} m vzdušnou čarou: jsem blíž, nebo dál od tvého stanoviště?`,resolver:'thermometer' as const,answerMode:'automatic' as const,rewardPolicy:{draw:2,keep:1},timeoutSeconds:300,availability:'ready' as const,requirements:[],target:'station' as const,minMoveMeters:v.meters,toleranceMeters:THERMOMETER_TOLERANCE_METERS,configured:true,spatialVersion:2 as const,sourceRule:QUESTION_RULE_SOURCE})),
    ...tentacles.map(v=>({id:`tentacles:${v.category}`,type:'tentacles' as const,category:v.category,label:v.label,description:`Které místo kategorie ${v.label} v okruhu ${v.radiusMeters.toLocaleString('cs-CZ',{maximumFractionDigits:3})} m ode mě je ti nejblíže? Musíš být také v tomto dosahu od místa. ${v.origin??'Vlastní pražská konfigurace'}.`,resolver:'tentacles' as const,answerMode:'automatic' as const,rewardPolicy:{draw:4,keep:2},timeoutSeconds:300,availability:'ready' as const,requirements:[v.category],target:'station' as const,radiusMeters:v.radiusMeters,configured:true,spatialVersion:2 as const,sourceRule:QUESTION_RULE_SOURCE})),
  ];
}
