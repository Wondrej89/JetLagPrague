import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activeGtfsServices, gtfsDate, gtfsTimeSeconds } from './pid-gtfs';
import { gtfsFixture, testGtfsSnapshot } from './gtfs-test-fixtures';
import { readPidSnapshot, snapshotReference } from './pid-snapshot';
import { buildGameStops, defaultGameStopConfiguration } from './game-stops';
import { exportWorld, importWorld, newWorld } from './index';

describe('GTFS operating-day adapter, controlled feed', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-16T08:00:00Z')); });
  afterEach(() => vi.useRealTimers());
  it('selects weekday/weekend services and preserves actual curved shapes and checksums', async () => {
    const weekday = await testGtfsSnapshot(), weekend = await testGtfsSnapshot('2026-10-17');
    expect(weekday.gtfs?.serviceIds).toEqual(['work']); expect(weekend.gtfs?.serviceIds).toEqual(['weekend']);
    expect(weekday.routes.map(route => route.id)).toEqual(['R']); expect(weekend.routes.map(route => route.id)).toEqual(['F', 'R']);
    expect(weekday.routes[0].geometry.coordinates).toEqual([[[14.4, 50.07], [14.401, 50.071], [14.402, 50.07]]]);
    expect(await readPidSnapshot(JSON.stringify(weekday))).toEqual(weekday); expect(snapshotReference(weekday).adapterVersion).toBe('pid-gtfs-v1');
  });
  it('applies added and cancelled calendar services, including an exceptions-only calendar', async () => {
    const f = gtfsFixture(); f.tables.calendarDates = [{ service_id: 'work', date: '20261016', exception_type: '2' }, { service_id: 'weekend', date: '20261016', exception_type: '1' }];
    expect((await testGtfsSnapshot(undefined, f)).gtfs?.serviceIds).toEqual(['weekend']);
    expect(activeGtfsServices([], [{ service_id: 'added', date: '20261018', exception_type: '1' }], '2026-10-18')).toEqual(new Set(['added']));
    expect(() => activeGtfsServices(f.tables.calendar, [...f.tables.calendarDates, f.tables.calendarDates[0]], '2026-10-16')).toThrow('výjimka');
  });
  it('keeps exit-only terminals, distinguishes inactive/unknown and never grants them hiding permission', async () => {
    const snapshot = await testGtfsSnapshot();
    expect(snapshot.platforms.find(p => p.id === '2/1')).toMatchObject({ serviceStatus: 'active', publicStop: true });
    expect(snapshot.platforms.find(p => p.id === '3/1')?.serviceStatus).toBe('inactive');
    expect(snapshot.platforms.find(p => p.id === '4/1')?.serviceStatus).toBe('unknown');
    const stops = buildGameStops(snapshot); expect(stops.find(s => s.name === 'Test 1')?.eligibility).toBe('allowed');
    expect(stops.filter(s => s.activity !== 'active').every(s => s.eligibility === 'review' && s.point === null)).toBe(true);
    const f = gtfsFixture(); f.stopTimes[1].drop_off_type = '1';
    expect((await testGtfsSnapshot(undefined, f)).platforms.find(p => p.id === '2/1')?.serviceStatus).toBe('inactive');
  });
  it('keeps 25:10 on the preceding operating day and rejects wrapped or invalid times', async () => {
    const snapshot = await testGtfsSnapshot(); expect(snapshot.gtfs?.maxServiceSeconds).toBe(90600); expect(snapshot.gtfs?.counts.afterMidnightCalls).toBe(1);
    expect(gtfsTimeSeconds('47:59:59')).toBe(172799); expect(() => gtfsTimeSeconds('24:60:00')).toThrow(); expect(() => gtfsDate('20260230')).toThrow();
    const f = gtfsFixture(); f.stopTimes[1].arrival_time = f.stopTimes[1].departure_time = '01:10:00';
    await expect(testGtfsSnapshot(undefined, f)).rejects.toThrow('pořadí');
  });
  it('deduplicates physical P variants by exact official IDs, without guessing names or poisoning other nodes', async () => {
    const f = gtfsFixture(); f.stopTimes[0].stop_id = 'S1P';
    const snapshot = await testGtfsSnapshot(undefined, f); expect(snapshot.platforms.filter(p => p.id === '1/1')).toHaveLength(1);
    expect(snapshot.platforms.find(p => p.id === '1/1')?.gtfsIds).toEqual(['S1', 'S1P']); expect(snapshot.quality?.status).toBe('verified');
    f.tables.stops[0].asw_node_id = '999'; f.groups.stopGroups[0].stops[0].gtfsIds = []; f.stopTimes[0].stop_id = 'S1';
    const ambiguous = await testGtfsSnapshot(undefined, f);
    expect(ambiguous.quality?.reviewGroupIds).toContain('gtfs-stop:S1');
    expect(buildGameStops(ambiguous).find(s => s.name === 'Test 2')?.eligibility).toBe('allowed');
    expect(buildGameStops(ambiguous).find(s => s.id === 'pid-group:gtfs-stop:S1')?.eligibility).toBe('review');
  });
  it('detects funicular resumption by service date and retains all seven audited transport types', async () => {
    const f = gtfsFixture();
    for (const [index, code] of ['0', '1', '2', '3', '4', '7', '11'].entries()) {
      const id = `R${index}`, trip = `T${index}`; f.tables.routes.push({ route_id: id, route_short_name: id, route_type: code });
      f.tables.trips.push({ route_id: id, trip_id: trip, service_id: 'work', shape_id: 'SH' }); f.stopTimes.push(...f.stopTimes.slice(0, 2).map(row => ({ ...row, trip_id: trip })));
    }
    const allModes = await testGtfsSnapshot(undefined, f);
    expect(new Set(allModes.routes.map(r => r.mode)).size).toBe(7);
    expect(allModes.platforms.find(p => p.id === '1/1')?.services.find(s => s.mode === 'trolleybus')?.evidence.pointer).toBe('/stop_times.txt/trip/T6/stop/S1');
    expect((await testGtfsSnapshot()).platforms.find(p => p.id === '3/1')?.serviceStatus).toBe('inactive');
    expect((await testGtfsSnapshot('2026-10-17')).platforms.find(p => p.id === '3/1')?.services[0].mode).toBe('funicular');
  });
  it('rejects incomplete, duplicate, unreferenced and out-of-validity input before publication', async () => {
    const missing = gtfsFixture(); missing.shapes = []; await expect(testGtfsSnapshot(undefined, missing)).rejects.toThrow();
    const partial = gtfsFixture(); partial.stopTimes.shift(); await expect(testGtfsSnapshot(undefined, partial)).rejects.toThrow('úplné');
    const duplicate = gtfsFixture(); duplicate.tables.stops.push(duplicate.tables.stops[0]); await expect(testGtfsSnapshot(undefined, duplicate)).rejects.toThrow('duplicitní');
    const orphan = gtfsFixture(); orphan.tables.trips[0].route_id = 'missing'; await expect(testGtfsSnapshot(undefined, orphan)).rejects.toThrow('vazby');
    const shape = gtfsFixture(); shape.tables.trips[0].shape_id = 'missing'; await expect(testGtfsSnapshot(undefined, shape)).rejects.toThrow('tvar');
    await expect(testGtfsSnapshot('2026-11-01')).rejects.toThrow('platí');
  });
  it('preserves manual nodes, approved points and world exports across next-day refresh', async () => {
    const f = gtfsFixture(), before = await testGtfsSnapshot();
    const stop = buildGameStops(before).find(s => s.name === 'Test 1')!;
    const config = { ...defaultGameStopConfiguration(), overrides: [{ stopId: stop.id, decision: 'allowed' as const, point: [14.4002, 50.0702] as [number, number], sourceSignature: stop.sourceSignature, justification: 'Test approved point', approvedAt: '2026-10-16T08:00:00.000Z' }] };
    f.tables.calendarDates.push({ service_id: 'work', date: '20261017', exception_type: '1' }, { service_id: 'weekend', date: '20261017', exception_type: '2' });
    const world = { ...newWorld(), gameStops: config }, exported = exportWorld(world);
    vi.setSystemTime(new Date('2026-10-17T08:00:00Z'));
    const next = await testGtfsSnapshot('2026-10-17', f); expect(buildGameStops(next, config).find(s => s.id === stop.id)).toMatchObject({ point: [14.4002, 50.0702], pointMethod: 'manual', eligibility: 'allowed' });
    expect(importWorld(exported).gameStops).toEqual(config); expect(importWorld(exportWorld(world)).layers).toEqual(world.layers);
  });
});
