import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyAdministrativeUpdate, classifyArea, newWorld, readAdministrativeSnapshot, type GeoLayer, type WorldDraft } from './index';
import type { Geometry, Position } from 'geojson';

let world: WorldDraft;
let layers: GeoLayer[];
beforeAll(async () => {
  layers = await Promise.all(['municipal', 'cadastral'].map(async name => readAdministrativeSnapshot(await readFile(`apps/editor/public/administrative/${name}.json`, 'utf8'))));
  world = layers.reduce(applyAdministrativeUpdate, newWorld());
}, 20000);

describe('skutečné dodané hranice Prahy', () => {
  it('obsahuje 57 městských částí a 112 pražských katastrů s jedinečnými kódy', () => {
    expect(layers[0].features).toHaveLength(57); expect(layers[1].features).toHaveLength(112);
    for (const layer of layers) expect(new Set(layer.features.map(f => f.id)).size).toBe(layer.features.length);
    expect(layers[1].features.every(f => (f.attributes.original as Record<string, unknown>).kod_obec === '554782')).toBe(true);
  });
  it.each([
    ['Anděl', [14.403878, 50.071970], 'Praha 5', 'Smíchov'],
    ['Karlínské náměstí', [14.4473, 50.0921], 'Praha 8', 'Karlín'],
    ['Letenské náměstí', [14.4243, 50.1000], 'Praha 7', 'Holešovice'],
    ['Náměstí Míru', [14.4378, 50.0752], 'Praha 2', 'Vinohrady'],
  ] as [string, Position, string, string][])('%s je ve správné městské části i katastru', (_name, point, municipal, cadastral) => {
    for (const [index, expected] of [municipal, cadastral].entries()) {
      const result = classifyArea(point, world.layers.find(l => l.dataset?.id === layers[index].id));
      expect(result.status).toBe('inside'); expect(result.matches.map(m => m.name)).toEqual([expected]);
    }
  });
  it('bod za západní hranicí Prahy nepřiřadí k nejbližšímu území', () => {
    for (const layer of layers) expect(classifyArea([14.1, 50], layer).status).toBe('outside');
  });
  it('sdílený skutečný vrchol správních hranic vrací všechny shody', () => {
    const seen = new Map<string, { id: string; point: Position }>();
    for (const f of layers[0].features) {
      const geometry = f.geometry;
      if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') continue;
      const parts = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
      for (const part of parts) for (const point of part[0]) {
        const key = JSON.stringify(point); const previous = seen.get(key);
        if (previous && previous.id !== f.id) {
          const result = classifyArea(point, layers[0]);
          expect(result.status).toBe('ambiguous');
          expect(result.matches.map(m => m.id)).toEqual(expect.arrayContaining([previous.id, f.id]));
          return;
        }
        seen.set(key, { id: f.id, point });
      }
    }
    throw new Error('Ve vstupní sadě nebyl nalezen sdílený vrchol; zkontrolujte konzistenci hranic.');
  });
  it.each([
    ['municipal', 'mestskecasti.geojson', 'kod_mc'],
    ['cadastral', 'katastralni-uzemi-praha.geojson', 'kod_ku'],
  ])('%s zachovává všechny původní souřadnice a atributy a dokládá hash vstupu', async (kind, file, codeField) => {
    const bytes = await readFile(`data/raw/${file}`);
    const raw = JSON.parse(bytes.toString()) as { features: { geometry: Geometry; properties: Record<string, unknown> }[] };
    const layer = layers.find(l => l.id === `praha-${kind}`)!;
    expect(layer.dataset!.provenance!.rawSha256).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(raw.features.length).toBe(layer.features.length);
    for (const original of raw.features) {
      const f = layer.features.find(f => f.attributes.code === String(original.properties[codeField]))!;
      expect(f.geometry).toEqual(original.geometry);
      expect(f.attributes.original).toEqual(original.properties);
    }
  });
});
