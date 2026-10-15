import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { applyAdministrativeUpdate, classifyArea, compareAdministrativeLayers, createAdministrativeSnapshot, exportWorld, importWorld, inspectPosition, newFeature, newLayer, newWorld, readAdministrativeSnapshot, validateWorld, verifyAdministrativeSources, type GeoLayer, type SourceDataset } from './index';

// Výhradně syntetické testovací útvary. Nejde o mapu reálných městských částí či katastrů.
const left: Polygon = { type: 'Polygon', coordinates: [[[14.4, 50], [14.5, 50], [14.5, 50.1], [14.4, 50.1], [14.4, 50]]] };
const right: Polygon = { type: 'Polygon', coordinates: [[[14.5, 50], [14.6, 50], [14.6, 50.1], [14.5, 50.1], [14.5, 50]]] };
const metadata: Omit<SourceDataset, 'checksum' | 'featureCount'> = {
  id: 'praha-cadastral', provider: 'Syntetický testovací zdroj', sourceUrl: 'https://example.invalid/dataset',
  license: { name: 'Testovací licence', url: 'https://example.invalid/license' }, dataDate: '2026-01-01',
  retrievedAt: '2026-01-02T00:00:00.000Z', version: 'test-1', codeField: 'official_code', processing: 'Syntetická testovací data.',
};
async function snapshot(features = [{ code: '1', name: 'Levá', geometry: left }, { code: '2', name: 'Pravá', geometry: right }], version = 'test-1') {
  return createAdministrativeSnapshot({ type: 'FeatureCollection', features: features.map(f => ({ type: 'Feature', geometry: f.geometry, properties: { official_code: f.code, official_name: f.name } })) }, { ...metadata, version }, { code: 'official_code', name: 'official_name' });
}
function areas(): GeoLayer {
  const layer = newLayer('Testovací území');
  layer.features = [newFeature(left, 'Levá'), newFeature(right, 'Pravá')];
  return layer;
}
describe('klasifikace bodu', () => {
  it('správně rozlišuje vnitřní a vnější bod', () => {
    expect(classifyArea([14.45, 50.05], areas()).matches.map(f => f.name)).toEqual(['Levá']);
    expect(classifyArea([14.65, 50.05], areas()).status).toBe('outside');
  });
  it('na společné hranici nevybírá náhodně jedno území', () => {
    const result = classifyArea([14.5, 50.05], areas());
    expect(result.status).toBe('ambiguous');
    expect(result.matches.map(f => f.name).sort()).toEqual(['Levá', 'Pravá']);
    expect(classifyArea([14.4, 50.05], areas()).status).toBe('boundary');
  });
  it('podporuje nesouvislé části, otvor a jeho hranici', () => {
    const layer = areas();
    layer.features = [newFeature({ type: 'MultiPolygon', coordinates: [[...left.coordinates, [[14.42, 50.02], [14.44, 50.02], [14.44, 50.04], [14.42, 50.04], [14.42, 50.02]]], [[[14.7, 50], [14.8, 50], [14.8, 50.1], [14.7, 50.1], [14.7, 50]]]] }, 'Testovací multipolygon')];
    expect(classifyArea([14.75, 50.05], layer).status).toBe('inside');
    expect(classifyArea([14.65, 50.05], layer).status).toBe('outside');
    expect(classifyArea([14.43, 50.03], layer).status).toBe('outside');
    expect(classifyArea([14.42, 50.03], layer).status).toBe('boundary');
  });
  it('vrací nelze určit při chybějících datech nebo neplatné poloze', () => {
    expect(classifyArea([14.4, 50], undefined).status).toBe('unknown');
    expect(classifyArea([181, 50], areas()).status).toBe('unknown');
    const result = inspectPosition([14.4, 50], newWorld());
    expect(result.gameArea.status).toBe('unknown'); expect(result.municipal.status).toBe('unknown'); expect(result.cadastral.status).toBe('unknown');
  });
  it('překrývající se data jsou nejednoznačná; skrytá vrstva se vyhodnocuje', async () => {
    const layer = await readAdministrativeSnapshot(await snapshot([{ code: '1', name: 'A', geometry: left }, { code: '2', name: 'B', geometry: left }]));
    const world = applyAdministrativeUpdate(newWorld(), layer);
    expect(layer.visible).toBe(false);
    expect(inspectPosition([14.45, 50.05], world).cadastral.status).toBe('ambiguous');
  });
});
describe('správa zdrojů a migrace', () => {
  it('aktualizace zachová vlastní objekty, herní oblast, jejich ID i viditelnost zdroje', async () => {
    const world = newWorld(); world.layers[0].features.push(newFeature(left, 'Vlastní hranice')); world.layers[1].features.push(newFeature({ type: 'Point', coordinates: [14.45, 50.05] }, 'Vlastní bod'));
    const initial = await readAdministrativeSnapshot(await snapshot()); initial.visible = true; initial.color = '#123456';
    const previous = applyAdministrativeUpdate(world, initial);
    const candidate = await readAdministrativeSnapshot(await snapshot([{ code: '1', name: 'Nový název', geometry: left }, { code: '3', name: 'Nové území', geometry: right }], 'test-2'));
    const diff = compareAdministrativeLayers(initial, candidate);
    expect(diff).toEqual({ added: ['praha-cadastral:3'], removed: ['praha-cadastral:2'], changed: ['praha-cadastral:1'], unchanged: [] });
    const updated = applyAdministrativeUpdate(previous, candidate);
    expect(updated.layers.slice(0, 2)).toEqual(world.layers);
    expect(updated.layers[2].visible).toBe(true); expect(updated.layers[2].color).toBe('#123456');
    expect(previous.layers[2].features[0].name).toBe('Levá');
    expect(updated.layers[2].features[0].id).toBe('praha-cadastral:1');
    await verifyAdministrativeSources(updated);
    for (const format of ['json', 'geojson'] as const) expect(importWorld(exportWorld(updated, format))).toEqual(updated);
  });
  it('nový čas importu ani verze nepředstírá změnu hranice', async () => {
    const first = await readAdministrativeSnapshot(await snapshot());
    const next = await readAdministrativeSnapshot(await snapshot(undefined, 'test-2'));
    next.features.forEach(f => f.importedAt = '2026-02-01T00:00:00.000Z');
    expect(compareAdministrativeLayers(first, next).unchanged).toHaveLength(2);
  });
  it('odmítne poškozený checksum, chybějící kódy a nekompletních 57 městských částí', async () => {
    const data = await snapshot(); data.features[0].name = 'Nepovolená změna';
    await expect(readAdministrativeSnapshot(data)).rejects.toThrow('součet');
    const invalid = await snapshot(); invalid.features[0].id = 'random';
    await expect(readAdministrativeSnapshot(invalid)).rejects.toThrow('kód');
    const municipal = await snapshot(); municipal.dataset.id = 'praha-municipal';
    await expect(readAdministrativeSnapshot(municipal)).rejects.toThrow('57');
  });
  it('nedovolí nahradit vlastní vrstvu kolidujícím ID zdroje', async () => {
    const world = newWorld(); world.layers[1].id = 'praha-cadastral';
    await expect(async () => applyAdministrativeUpdate(world, await readAdministrativeSnapshot(await snapshot()))).rejects.toThrow('Vlastní data');
    expect(world.layers[1].dataset).toBeUndefined();
  });
  it('načte draft i export verze 1 bez změny ID a geometrie', () => {
    const world = newWorld(); world.layers[0].features = [newFeature(left)];
    const legacy = { ...world, schemaVersion: 1 };
    expect(validateWorld(legacy)).toEqual(world);
    const pack = JSON.parse(exportWorld(world)); pack.manifest.schemaVersion = 1; pack.world.schemaVersion = 1;
    expect(importWorld(pack)).toEqual(world);
  });
});
