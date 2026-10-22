import catalogue from './card-catalog.json' with {type:'json'};
import { curseRules } from './curse-rules';
import { questionRegistry, simulationRules } from './registry';
import type { CardDefinition, GameRules } from './types';
import type { CardMechanics, GameSize } from './card-types';

export const CARD_CATALOGUE = catalogue;
const incomplete = (missing: string[]): CardMechanics => ({
  status: 'incomplete', source: catalogue.source, fullTextEn: null, fullTextCs: null,
  missing, castingCost: null, effects: [],
});
/** Explicit size selection. No Prague => Medium assumption. Legacy games keep their stored rules. */
export function deckRules(size: GameSize): GameRules {
  if (!['small', 'medium', 'large'].includes(size)) throw new Error('Vyberte variantu Small / Medium / Large.');
  const cards: CardDefinition[] = [
    ...catalogue.bonuses.map(c => ({ id: c.id, name: `${c.name} · ${c.minutes[size]} min`, type: 'time_bonus' as const,
      icon: '◷', effect: 'bonus' as const, value: c.minutes[size] * 60,
      description: `Časový bonus ${c.minutes[size]} minut pro variantu ${size}. Zůstává v ruce do konce kola.` })),
    ...catalogue.powerups.map(c => ({ id: c.id, name: c.name, type: 'powerup' as const, icon: '✦',
      effect: c.effect as CardDefinition['effect'], description: c.summary,
      mechanics:{status:'ready' as const,source:catalogue.source+' · upřesnění powerupů uživatelem',fullTextEn:null,fullTextCs:c.summary,missing:[],castingCost:[],effects:[]},
      ...(c.id === 'move' ? {mechanics:{...incomplete([]),status:'ready' as const,castingCost:[{id:'hand',kind:'discard_hand' as const}],fullTextCs:'Odhoďte všechny ostatní karty a oznamte hledačům dosavadní zastávku. Na přesun na nové místo máte 20 minut. Během přesunu se nezapočítává čas schovaného a hledači se nesmějí pohybovat.',move:{durationMs:20*60000}}} : {}) })),
    ...catalogue.curses.map(c => ({ id: c.id, name: c.name, type: 'curse' as const, icon: '☾', effect: 'curse' as const,
      description: c.summary, mechanics: curseRules(c.id,size) })),
  ];
  return { ...simulationRules(), id: `${catalogue.version}:${size}`, cardVersion: 2, questionVersion: 2, questions:questionRegistry(), size,
    label: `100 karet · ${size} · pravidla z dodané tabulky; rozporné a nedodané mechanismy jsou WIP`, testOnly: true, cards,
    deck: [...catalogue.bonuses.flatMap(c => Array<string>(c.count).fill(c.id)),
      ...catalogue.powerups.flatMap(c => Array<string>(c.count).fill(c.id)), ...catalogue.curses.map(c => c.id)] };
}
