/** Deterministic source import. Missing coordinates stay null, never [0, 0]. */
import {readFile,writeFile} from 'node:fs/promises';
import {unlocatedEmbassySchema,embassyId,sha256} from '../packages/geo-core/src/index';
const input=JSON.parse(await readFile('data/raw/embassies-selection.json','utf8'));
if(await sha256(new Uint8Array(await readFile(`data/raw/${input.sourceFile}`)))!==input.sourceChecksum)throw new Error('Nesouhlasí kontrolní součet původního Excelu.');
const source={id:'diplomatic-selection-2026-10-22',provider:'Pracovní výběr správce podle diplomatické listiny MZV',url:input.sourceUrl,license:{name:'Licence výběru a diplomatické listiny nedoložena',url:null},dataDate:input.dataDate,retrievedAt:'2026-10-31T00:00:00.000Z',rawChecksum:input.sourceChecksum,verification:'user_supplied',note:'Ručně dodaný pracovní výběr, nikoli úplný registr. Souřadnice nejsou součástí Excelu. Odkaz na MZV pochází z metodiky souboru; obsah PDF nebyl nezávisle ověřen.'};
const unlocated=input.records.map((r:typeof input.records[number])=>unlocatedEmbassySchema.parse({id:embassyId(r.countryCode,r.officeType),category:'embassy',sourceId:r.id,name:r.name,address:r.address,point:null,geometry:null,embassy:{country:r.country,countryCode:r.countryCode,officeType:r.officeType,selectionRow:r.sourceRow,sourcePage:r.sourcePage,officialSourceUrl:input.sourceUrl},source,status:'review',reviewedAt:null,note:'Poloha není doložena. Vyžaduje přesný adresní bod a kontrolu adresy; odhad podle ulice nestačí.',attributes:{original:r,sourceFile:input.sourceFile,sourceChecksum:input.sourceChecksum}}));
if(unlocated.length!==60||new Set(unlocated.map((r:{id:string})=>r.id)).size!==60)throw new Error('Očekáváno 60 jednoznačných pracovišť.');
await writeFile('apps/editor/src/data/embassy-catalog.json',`${JSON.stringify({records:[],unlocated},null,2)}\n`);
console.log(JSON.stringify({located:0,unlocated:unlocated.length,reason:'Adresní souřadnice zatím nejsou doloženy.'}));
