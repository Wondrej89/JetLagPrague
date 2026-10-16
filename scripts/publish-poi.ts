import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importWorld, poiConfigurationSchema, resolvePois, validatePoiConfiguration, verifyPoiSources } from '../packages/geo-core/src/index';

// Explicit, local publication step. Normal builds never import browser data or
// download upstream data. Review and commit the resulting static catalog.
const argument = process.argv.indexOf('--world');
if (argument < 0 || !process.argv[argument + 1]) throw new Error('Použití: npm run poi:publish -- --world cesta/k/exportu-sveta.json');
const world = importWorld(await readFile(resolve(process.argv[argument + 1]), 'utf8'));
if (!world.poi) throw new Error('Svět neobsahuje parkové zdroje ani rozhodnutí.');
const parks = poiConfigurationSchema.parse(world.poi);
validatePoiConfiguration(parks); await verifyPoiSources(parks);
for (const park of resolvePois([], parks).filter(p => p.status === 'approved')) {
  if (park.source.id !== 'manual' && (!park.source.license.url || /nedoložen|neznám|neověřen/i.test(park.source.license.name))) throw new Error(`Park ${park.id}: před publikací doložte licenci původního zdroje i její URL.`);
  if (Array.isArray(park.attributes.origins)) for (const origin of park.attributes.origins) {
    if (!origin || typeof origin !== 'object' || Array.isArray(origin) || !origin.source || typeof origin.source !== 'object' || Array.isArray(origin.source)) throw new Error(`Park ${park.id}: chybí metadata původních částí.`);
    const source = origin.source;
    if (source.id !== 'manual' && (!source.license || typeof source.license !== 'object' || Array.isArray(source.license) || !source.license.url)) throw new Error(`Park ${park.id}: doložte licenci původních sloučených částí.`);
  }
}
const path = 'apps/editor/src/data/poi-catalog.json';
const catalog = JSON.parse(await readFile(path, 'utf8'));
await writeFile(path, `${JSON.stringify({ ...catalog, parks }, null, 2)}\n`);
console.log(`Připraven statický katalog: ${resolvePois([], parks).filter(p => p.status === 'approved').length} schválených parků. Zkontrolujte diff a publikujte přes GitHub Pages.`);
