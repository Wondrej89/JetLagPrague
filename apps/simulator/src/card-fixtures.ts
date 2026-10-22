import type { CardMechanics, GameRules } from '../../../packages/game-core/src/index';
/** These are explicit ENGINE TEST INPUTS, not replacements for the missing rule table. */
export function configureCardFixture(rules: GameRules, scenario: string) {
 const fixtures:Record<string,{id:string;mechanics:Partial<CardMechanics>}>= {
  curse:{id:'curse-cairn',mechanics:{effects:[{kind:'task',text:'Test mechanismu: potvrďte dokončení ručního úkolu. Bez předpisu počtu kamenů.',proof:'confirmation',blocksQuestions:true}]}},
  'curse-manual':{id:'curse-cairn',mechanics:{effects:[{kind:'task',text:'Test ručního potvrzení; konkrétní pravidlo věže chybí.',proof:'confirmation',blocksQuestions:true}]}},
  'curse-cost':{id:'curse-cairn',mechanics:{castingCost:[{id:'discard',kind:'discard',count:1,cardType:'time_bonus'},{id:'physical',kind:'physical',text:'Test ceny: potvrzuji bezpečné splnění fyzického úkolu.'}],effects:[{kind:'task',text:'Test úkolu po zaplacení ceny.',proof:'confirmation',blocksQuestions:true}]}},
  'curse-photo':{id:'curse-zoologist',mechanics:{castingCost:[{id:'photo',kind:'photo',text:'Test ceny: fotografie pro aktivaci.'}],effects:[{kind:'task',text:'Test úkolu: přiložte fotografii a výslovně potvrďte splnění. Kategorie zvířete není nastavena.',proof:'photo',blocksQuestions:true}]}},
  'curse-timed':{id:'curse-right-turn',mechanics:{effects:[{kind:'timer',text:'Test časovače 60 sekund; nejde o schválenou délku Right Turn. Fyzické pravé odbočení aplikace neověřuje.',durationMs:60000,blocksQuestions:false}]}},
  'curse-chalice':{id:'curse-overflowing-chalice',mechanics:{effects:[{kind:'reward_draw',amount:1,questions:3,text:'O 1 kartu navíc u 3 způsobilých odměn. Test bez dosud nedodané casting cost.'}]}},
  'curse-spotty':{id:'curse-spotty-memory',mechanics:{effects:[{kind:'block_category',category:'random',text:'Test náhodné blokace jedné kategorie do konce testovacího kola; skutečná délka chybí.'}]}},
  'curse-drained':{id:'curse-drained-brain',mechanics:{effects:[{kind:'block_questions',questionIds:['matching:zoo','matching:hospital','radar:800'],text:'Test blokace tří explicitních ID otázek; skutečný způsob výběru čeká na pravidla.'}]}},
  'curse-water':{id:'curse-water-weight',mechanics:{effects:[{kind:'task',text:'Potvrďte získání 2 litrů tekutiny na hledače.',proof:'confirmation',blocksQuestions:true},{kind:'round_obligation',text:'Tekutiny je nutné nést do konce kola. Výše skutečné penalizace zatím není doložená.',penaltySeconds:null}]}},
  'curse-penalty':{id:'curse-water-weight',mechanics:{effects:[{kind:'task',text:'Test první fáze: získat tekutiny.',proof:'confirmation',blocksQuestions:true},{kind:'round_obligation',text:'Test průběžné povinnosti: nést tekutiny. Pouze pro ověření výpočtu je zadána testovací penalizace 60 s.',penaltySeconds:60}]}},

 };
 const fixture=fixtures[scenario];if(!fixture)return null;
 const card=rules.cards.find(c=>c.id===fixture.id);if(!card)throw new Error('Chybí karta pro test mechanismu.');
 rules.id+=':fixture:'+scenario;rules.label+=' · TEST MECHANISMU: parametry nejsou oficiální pravidla';
 card.mechanics={status:'test_fixture',source:'Výslovná testovací konfigurace simulátoru, nikoliv schválená pravidla karty',fullTextEn:null,fullTextCs:null,missing:['Úplný text a skutečné parametry stále chybí.'],castingCost:[],effects:[],...fixture.mechanics};
 return fixture.id;
}
