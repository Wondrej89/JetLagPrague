import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { administrativeChecksum, canonicalJson, defaultGameAreaFeature, exportWorld, importWorld, municipalGameArea, newFeature, newWorld, pointInArea, prepareDefaultGameArea, readAdministrativeSnapshot, readDefaultGameArea, setGameArea, sha256, validateWorld, type DefaultGameArea, type GeoLayer } from './index';

let prepared: DefaultGameArea, municipal: GeoLayer;
beforeAll(async () => {
  [prepared, municipal] = await Promise.all([
    readDefaultGameArea(await readFile('apps/editor/public/defaults/prague-game-area.geojson', 'utf8')),
    readAdministrativeSnapshot(await readFile('apps/editor/public/administrative/municipal.json', 'utf8')),
  ]);
}, 30000);
describe('Static default game territory', () => {
  it('exactly matches municipalGameArea of all 57 verified real districts, including provenance', async () => {
    const recomputed = municipalGameArea(municipal);
    expect(prepared.geometry).toEqual(recomputed.geometry);
    expect(prepared.properties.geometryChecksum).toBe(await sha256(canonicalJson(recomputed.geometry)));
    expect(prepared.properties.dataset).toEqual(municipal.dataset);
    expect(prepared.properties.codes).toEqual(recomputed.attributes.codes);
    expect(prepared.properties.dataset.dataDate).toBeNull();
    expect(prepared.properties.dataset.license.name).toContain('neuvedena');
    for (const p of [[14.403878, 50.071970], [14.4473, 50.0921], [14.4243, 50.1], [14.4378, 50.0752]]) expect(pointInArea(p, prepared.geometry)).toBe(true);
    expect(pointInArea([14.1, 50], prepared.geometry)).toBe(false);
  }, 30000);
  it('rejects tampered metadata, incomplete districts and missing checksums', async () => {
    const damaged = structuredClone(prepared); damaged.properties.dataset.provider = 'Altered source';
    await expect(readDefaultGameArea(damaged)).rejects.toThrow('Kontrolní součet');
    await expect(readDefaultGameArea({ ...prepared, properties: { ...prepared.properties, codes: prepared.properties.codes.slice(1) } })).rejects.toThrow();
    await expect(readDefaultGameArea({ ...prepared, properties: { ...prepared.properties, geometryChecksum: '0'.repeat(64) } })).rejects.toThrow('Kontrolní součet');
  });
  it('preserves MultiPolygon parts and holes in a controlled synthetic district union', async () => {
    const first = { type: 'Polygon' as const, coordinates: [[[14, 50], [14.1, 50], [14.1, 50.1], [14, 50.1], [14, 50]], [[14.02, 50.02], [14.02, 50.04], [14.04, 50.04], [14.04, 50.02], [14.02, 50.02]]] };
    const second = { type: 'Polygon' as const, coordinates: [[[14.2, 50], [14.3, 50], [14.3, 50.1], [14.2, 50.1], [14.2, 50]]] };
    const features = Array.from({ length: 57 }, (_, i) => ({ ...newFeature(i === 56 ? second : first, `Synthetic district ${i}`), id: `praha-municipal:${i}`, attributes: { code: String(i) } }));
    const synthetic: GeoLayer = { ...municipal, features, dataset: { ...municipal.dataset!, provider: 'Synthetic test only', sourceUrl: 'https://example.test/districts', checksum: await administrativeChecksum(features) } };
    const result = await readDefaultGameArea(await prepareDefaultGameArea(synthetic));
    expect(result.geometry.type).toBe('MultiPolygon');
    if (result.geometry.type !== 'MultiPolygon') throw Error('Expected separated parts');
    expect(result.geometry.coordinates).toHaveLength(2); expect(result.geometry.coordinates.some(part => part.length === 2)).toBe(true);
    expect(pointInArea([14.03, 50.03], result.geometry)).toBe(false); expect(pointInArea([14.15, 50.05], result.geometry)).toBe(false); expect(pointInArea([14.25, 50.05], result.geometry)).toBe(true);
  });
  it('keeps newWorld unchanged and exports a unique, editable boundary with source hashes', () => {
    expect(newWorld().layers[0].features).toEqual([]);
    const a = defaultGameAreaFeature(prepared), b = defaultGameAreaFeature(prepared); expect(a.id).not.toBe(b.id);
    const world = validateWorld({ ...setGameArea(newWorld(), a), gameAreaInitialization: { version: 1, state: 'initialized' } });
    for (const format of ['json', 'geojson'] as const) expect(importWorld(exportWorld(world, format))).toEqual(world);
    expect(a.attributes.datasetChecksum).toBe(municipal.dataset!.checksum); expect(a.attributes.defaultAreaChecksum).toBe(prepared.properties.checksum);
  });
});
