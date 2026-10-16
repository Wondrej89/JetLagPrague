import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { buildGameStops, readPidSnapshot, type PidSnapshot } from '../packages/geo-core/src/index';

/** Opt-in audit of the actual 16 Oct 2026 download, never a network request in CI.
 * Build it first with pid:gtfs; see data/source-metadata/pid-gtfs-source-audit.md. */
describe.skipIf(!process.env.GTFS_REAL_SNAPSHOT)('Audited actual PID GTFS, 16 October 2026', () => {
  it('validates the full output and confirms named Prague rail/funicular service for the evidenced day', async () => {
    const snapshot: PidSnapshot = await readPidSnapshot(await readFile(process.env.GTFS_REAL_SNAPSHOT!, 'utf8'));
    expect(snapshot.serviceDate).toBe('2026-10-16');
    expect(snapshot.sources.find(s => s.id === 'gtfs')?.sha256).toBe('a406896561136e584df87ec3af93a320b52793a2fdaac107415eec645f09b249');
    expect(snapshot.gtfs?.counts).toMatchObject({ stops: 20141, routes: 891, trips: 97181, activeTrips: 52663, stopTimes: 1961835, shapePoints: 3718882 });
    expect(snapshot.routes).toHaveLength(870); expect(new Set(snapshot.routes.map(r => r.mode)).size).toBe(7);
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T08:00:00Z'));
    try {
      const stops = buildGameStops(snapshot);
      expect(stops.find(s => s.name === 'Praha-Zličín')).toMatchObject({ activity: 'active', dominantMode: 'train', eligibility: 'allowed' });
      for (const name of ['Praha-Stodůlky', 'Praha-Cibulka']) expect(stops.find(s => s.name === name)).toMatchObject({ activity: 'inactive', eligibility: 'review', point: null });
      for (const node of ['1997', '1998', '1999']) {
        const groupIds = new Set(snapshot.groups.filter(g => g.codes?.node === node).map(g => g.id));
        expect(snapshot.platforms.some(p => groupIds.has(p.groupId) && p.serviceStatus === 'active' && p.services.some(s => s.mode === 'funicular'))).toBe(true);
      }
      expect(stops.find(s => s.name === 'Anděl')?.point).toEqual([14.403769, 50.06995]);
    } finally { vi.useRealTimers(); }
  }, 60000);
});
