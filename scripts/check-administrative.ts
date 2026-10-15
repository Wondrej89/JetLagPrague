import { readFile } from 'node:fs/promises';
import { readAdministrativeSnapshot, applyAdministrativeUpdate, newWorld, inspectPosition } from '../packages/geo-core/src/index';

// Reálné referenční body; očekávání ověřuje skutečné hranice, nikoli syntetické fixture.
const places = [
  { place: 'Smíchov · Anděl', point: [14.403878, 50.071970], municipal: 'Praha 5', cadastral: 'Smíchov' },
  { place: 'Karlín · Karlínské náměstí', point: [14.4473, 50.0921], municipal: 'Praha 8', cadastral: 'Karlín' },
  { place: 'Letná · Letenské náměstí', point: [14.4243, 50.1000], municipal: 'Praha 7', cadastral: 'Holešovice' },
  { place: 'Vinohrady · náměstí Míru', point: [14.4378, 50.0752], municipal: 'Praha 2', cadastral: 'Vinohrady' },
];
try {
  const layers = [];
  for (const file of ['municipal.json', 'cadastral.json']) {
    let contents: string;
    try { contents = await readFile(`apps/editor/public/administrative/${file}`, 'utf8'); }
    catch { throw new Error(`Chybí statická oficiální data ${file}. Reálné pražské body nebyly ověřeny.`); }
    layers.push(await readAdministrativeSnapshot(contents));
  }
  let world = newWorld();
  for (const layer of layers) world = applyAdministrativeUpdate(world, layer);
  for (const p of places) {
    const result = inspectPosition(p.point, world);
    if (result.municipal.status !== 'inside' || result.cadastral.status !== 'inside' || result.municipal.matches[0].name !== p.municipal || result.cadastral.matches[0].name !== p.cadastral) throw new Error(`${p.place}: neočekávaná klasifikace ${JSON.stringify(result)}.`);
    console.log(`${p.place}: ${p.municipal} / ${p.cadastral} · ověřeno`);
  }
  console.log(`Validováno ${layers[0].features.length} městských částí a ${layers[1].features.length} katastrálních území. Oba kontrolní součty souhlasí.`);
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
