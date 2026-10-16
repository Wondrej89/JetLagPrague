import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultGameStopConfiguration, exportWorld, importWorld, newFeature, newWorld, readDefaultGameArea, type DefaultGameArea } from '@jetlag/geo-core';
import { DefaultAreaLoadError, initializeEditorWorld, recordGameAreaChoice, withDefaultGameArea } from './world-initialization';

let prepared: DefaultGameArea;
beforeAll(async () => { prepared = await readDefaultGameArea(await readFile('apps/editor/public/defaults/prague-game-area.geojson', 'utf8')); });
function options() { return { placeholder: newWorld(), readIndexed: vi.fn(async () => null as ReturnType<typeof newWorld> | null), readLegacy: vi.fn(() => null as ReturnType<typeof newWorld> | null), loadDefault: vi.fn(async () => prepared) }; }
describe('Storage-first world initialization', () => {
  it('waits for IndexedDB before legacy storage and default loading', async () => {
    const o = options(), order: string[] = [];
    const result = await initializeEditorWorld({ ...o, readIndexed: async () => { order.push('indexed'); return null; }, readLegacy: () => { order.push('legacy'); return null; }, loadDefault: async () => { order.push('default'); return prepared; } });
    expect(order).toEqual(['indexed', 'legacy', 'default']); expect(result.layers[0].features).toHaveLength(1);
    expect(result.gameAreaInitialization?.state).toBe('initialized'); expect(result.layers[0].features[0].geometry).toEqual(prepared.geometry);
  });
  it('gives a valid IndexedDB custom area priority over corrupt/outdated localStorage and never loads defaults', async () => {
    const o = options(), saved = newWorld(); saved.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [[[14, 50], [14.1, 50], [14.1, 50.1], [14, 50.1], [14, 50]]] }, 'Custom boundary')];
    o.readIndexed.mockResolvedValue(saved); o.readLegacy.mockImplementation(() => { throw Error('corrupt legacy'); });
    expect(await initializeEditorWorld(o)).toEqual(saved); expect(o.readLegacy).not.toHaveBeenCalled(); expect(o.loadDefault).not.toHaveBeenCalled();
  });
  it('preserves a legacy empty draft and all own data when its deletion history cannot be established', async () => {
    const o = options(), saved = newWorld(); saved.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50.07] }, 'Retained object')]; saved.gameStops = { ...defaultGameStopConfiguration(), radiusMeters: 450 };
    o.readLegacy.mockReturnValue(saved);
    const migrated = await initializeEditorWorld(o); expect(migrated.layers).toEqual(saved.layers); expect(migrated.gameStops).toEqual(saved.gameStops);
    expect(migrated.gameAreaInitialization?.state).toBe('legacy-empty'); expect(o.loadDefault).not.toHaveBeenCalled();
    const restored = withDefaultGameArea(migrated, prepared); expect(restored.layers[1]).toEqual(saved.layers[1]); expect(restored.gameStops).toEqual(saved.gameStops);
    o.readIndexed.mockResolvedValue(restored); expect(await initializeEditorWorld(o)).toEqual(restored);
  });
  it('persists intentional deletion through reload and JSON/GeoJSON, without resurrecting the area', async () => {
    const original = withDefaultGameArea(newWorld(), prepared);
    const removed = recordGameAreaChoice(original, { ...original, layers: original.layers.map(layer => layer.kind === 'game_area' ? { ...layer, features: [] } : layer) });
    expect(removed.gameAreaInitialization?.state).toBe('intentionally-empty');
    for (const format of ['json', 'geojson'] as const) {
      const o = options(); o.readIndexed.mockResolvedValue(importWorld(exportWorld(removed, format)));
      expect((await initializeEditorWorld(o)).layers[0].features).toEqual([]); expect(o.loadDefault).not.toHaveBeenCalled();
    }
  });
  it('does not replace invalid storage or accept a failed default load as initialized', async () => {
    const o = options(); o.readIndexed.mockRejectedValue(Error('corrupt IDB'));
    await expect(initializeEditorWorld(o)).rejects.toThrow('corrupt IDB'); expect(o.readLegacy).not.toHaveBeenCalled(); expect(o.loadDefault).not.toHaveBeenCalled();
    const fresh = options(); fresh.loadDefault.mockRejectedValue(Error('HTTP 503'));
    await expect(initializeEditorWorld(fresh)).rejects.toBeInstanceOf(DefaultAreaLoadError);
  });
});
