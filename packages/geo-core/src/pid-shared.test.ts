import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSharedPidCache, type SharedPidStorage } from './pid-shared';
import { confirmHideSelection, hideCandidates, hideSelectionForViewer } from './hide-selection';
import { snapshotReference, type PidSnapshot } from './pid-snapshot';
import { testGtfsSnapshot } from './gtfs-test-fixtures';
import { defaultGameStopConfiguration } from './game-stops';
import type { AreaGeometry } from './index';

function sharedStorage() {
  const days = new Map<string, PidSnapshot>(), versions = new Map<string, PidSnapshot>();
  let lock = Promise.resolve();
  const storage: SharedPidStorage = {
    readDay: async date => days.get(date) ?? null, readPinned: async ref => versions.get(ref.checksum) ?? null,
    publishDay: async value => { days.set(value.serviceDate, value); versions.set(value.checksum, value); },
    withExclusiveDay: async (_date, work) => {
      const previous = lock; let release = () => {}; lock = new Promise<void>(resolve => { release = resolve; });
      await previous; try { return await work(); } finally { release(); }
    },
  };
  return storage;
}
describe('Future shared cache and private hiding contracts', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T08:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('uses one shared build across independent cache instances and never replaces pinned versions', async () => {
    const storage = sharedStorage(), snapshot = await testGtfsSnapshot(), build = vi.fn(async () => snapshot);
    const a = createSharedPidCache(storage, build), b = createSharedPidCache(storage, build);
    const results = await Promise.all([a.resolve(), a.resolve(), b.resolve(), b.resolve()]); expect(build).toHaveBeenCalledOnce();
    expect(new Set(results.map(s => s.checksum))).toEqual(new Set([snapshot.checksum]));
    await b.resolve(); expect(build).toHaveBeenCalledOnce();
    const next = await testGtfsSnapshot('2026-10-17'); await storage.publishDay(next);
    expect((await a.pinned(snapshotReference(snapshot))).checksum).toBe(snapshot.checksum);
    await expect(a.pinned({ ...snapshotReference(snapshot), id: 'not-the-pinned-id' })).rejects.toThrow('nesouhlasí');
  });
  it('does not publish failed/historical builds and preserves an earlier pinned day', async () => {
    const storage = sharedStorage(), previous = await testGtfsSnapshot(); await storage.publishDay(previous);
    const fail = createSharedPidCache(storage, async () => { throw new Error('network offline'); });
    await expect(fail.resolve('2026-10-17')).rejects.toThrow('offline'); expect(await storage.readDay('2026-10-17')).toBeNull();
    const stale = createSharedPidCache(storage, async () => previous); await expect(stale.resolve('2026-10-17')).rejects.toThrow('požadovaného dne');
    expect((await fail.pinned(snapshotReference(previous))).checksum).toBe(previous.checksum);
  });
  it('filters active allowed candidates by true area and distance, revalidates the pinned stop, and hides its ID from hunters', async () => {
    const snapshot = await testGtfsSnapshot(), configuration = defaultGameStopConfiguration();
    const area: AreaGeometry = { type: 'Polygon', coordinates: [[[14.39, 50.06], [14.41, 50.06], [14.41, 50.08], [14.39, 50.08], [14.39, 50.06]]] };
    const candidates = await hideCandidates(snapshot, configuration, { area, near: [14.4, 50.07], maxDistanceMeters: 1 }); expect(candidates).toHaveLength(1);
    const trusted = { hiderId: 'hider-1', snapshot: snapshotReference(snapshot), configuration, area };
    const selection = await confirmHideSelection({ stopId: candidates[0].id }, trusted, async () => snapshot);
    expect(selection.radiusMeters).toBe(400); expect(hideSelectionForViewer(selection, { playerId: 'hider-1', role: 'hider' })).toEqual(selection);
    expect(hideSelectionForViewer(selection, { playerId: 'hider-1', role: 'hunter' })).toBeNull(); expect(hideSelectionForViewer(selection, { playerId: 'other', role: 'hider' })).toBeNull();
    await expect(confirmHideSelection({ stopId: 'pid-group:asw:3:cis:3:cat:1:p:3/1' }, trusted, async () => snapshot)).rejects.toThrow('aktivní');
    const next = await testGtfsSnapshot('2026-10-17'); await expect(confirmHideSelection({ stopId: candidates[0].id }, trusted, async () => next)).rejects.toThrow('uzamčené');
    const outside: AreaGeometry = { type: 'Polygon', coordinates: [[[15, 51], [16, 51], [16, 52], [15, 52], [15, 51]]] };
    expect(await hideCandidates(snapshot, configuration, { area: outside })).toEqual([]);
    vi.setSystemTime(new Date('2026-10-17T08:00:00Z')); await expect(hideCandidates(snapshot, configuration, { area })).rejects.toThrow('Historická');
  });
});
