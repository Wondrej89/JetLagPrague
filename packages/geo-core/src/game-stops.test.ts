import { describe, it, expect } from 'vitest';
import { destination } from '@turf/turf';
import { buildGameStops, compareGameStops, defaultGameStopConfiguration, filterGameStops, hidingZoneGeometry, inspectHidingPosition, orphanedOverrides, validateGameStopConfiguration, type GameStop, type GameStopConfiguration } from './game-stops';
import { testPlatform, testSnapshot } from './pid-test-fixtures';
import { exportWorld, importWorld, newWorld, pointInArea, type AreaGeometry } from './index';

const area: AreaGeometry = { type: 'Polygon', coordinates: [[[14.3, 50], [14.5, 50], [14.5, 50.2], [14.3, 50.2], [14.3, 50]]] };
function manual(stop: GameStop, patch: Partial<GameStopConfiguration['overrides'][number]> = {}): GameStopConfiguration {
  return { ...defaultGameStopConfiguration(), overrides: [{ stopId: stop.id, decision: 'automatic', sourceSignature: stop.sourceSignature, approvedAt: '2026-10-15T08:00:00.000Z', justification: 'Syntetický test ručního schválení', ...patch }] };
}

describe('Game stop rules (synthetic fixtures, not assertions about real PID nodes)', () => {
  it('applies the Anděl scenario: metro beats tram and bus, only metro platforms define the arithmetic mean', async () => {
    const snapshot = await testSnapshot([
      testPlatform('metro1', 'g', 'metro', [14.40, 50.07]), testPlatform('metro2', 'g', 'metro', [14.402, 50.072]),
      testPlatform('metro3', 'g', 'metro', [14.409, 50.075]), testPlatform('tram', 'g', 'tram', [14.44, 50.09]), testPlatform('bus', 'g', 'bus', [14.45, 50.1]),
    ], { groups: [{ id: 'g', name: 'Syntetický uzel – scénář Anděl' }] });
    const [stop] = buildGameStops(snapshot);
    expect(stop.dominantMode).toBe('metro'); expect(stop.relevantPlatformIds).toHaveLength(3);
    expect(stop.point![0]).toBeCloseTo((14.40 + 14.402 + 14.409) / 3, 12);
    expect(stop.point![1]).toBeCloseTo((50.07 + 50.072 + 50.075) / 3, 12);
    expect(stop.pointMethod).toBe('platform-mean'); expect(stop.eligibility).toBe('allowed');
  });
  it('uses tram over bus and averages bus/trolleybus together at equal priority', async () => {
    const [tram] = buildGameStops(await testSnapshot([testPlatform('t', 'g', 'tram'), testPlatform('b', 'g', 'bus')]));
    expect(tram.dominantMode).toBe('tram'); expect(tram.relevantPlatformIds).toEqual(['t']);
    const [road] = buildGameStops(await testSnapshot([testPlatform('b', 'g', 'bus', [14.4, 50.07]), testPlatform('tb', 'g', 'trolleybus', [14.402, 50.072])]));
    expect(road.referenceModes).toEqual(['bus', 'trolleybus']); expect(road.point).toEqual([14.401, 50.071]);
  });
  it('never merges equal names or nearby groups; an explicit manual link enables train priority', async () => {
    const snapshot = await testSnapshot([testPlatform('train', 'rail-group', 'train'), testPlatform('metro', 'metro-group', 'metro')], { groups: [{ id: 'rail-group', name: 'Stejný název' }, { id: 'metro-group', name: 'Stejný název' }] });
    expect(buildGameStops(snapshot)).toHaveLength(2);
    const configuration = { ...defaultGameStopConfiguration(), nodes: [{ id: 'manual:test-hub', name: 'Ručně propojený test', groupIds: ['rail-group', 'metro-group'], justification: 'Výslovný syntetický test propojení; nejde o skutečný uzel PID.' }] };
    const [linked] = buildGameStops(snapshot, configuration);
    expect(linked.dominantMode).toBe('train'); expect(linked.relevantPlatformIds).toEqual(['train']);
    expect(buildGameStops(snapshot, defaultGameStopConfiguration())).toHaveLength(2);
  });
  it('creates one center and one circle for two opposed platforms; terminals are retained', async () => {
    const [stop] = buildGameStops(await testSnapshot([testPlatform('end-inbound', 'terminus', 'tram', [14.399, 50.07]), testPlatform('end-outbound', 'terminus', 'tram', [14.401, 50.07])]));
    expect(stop.point![0]).toBeCloseTo(14.4, 12); expect(stop.eligibility).toBe('allowed');
    const zone = hidingZoneGeometry(stop, area)!;
    expect(zone.type).toBe('Polygon'); expect(zone.coordinates).toHaveLength(1);
    expect(inspectHidingPosition(stop.point!, stop, area).status).toBe('allowed');
  });
  it('excludes only evidenced nonpublic operational points, not terminal arrival-only stops', async () => {
    const snapshot = await testSnapshot([{ ...testPlatform('operating', 'g', 'train'), publicStop: false }, testPlatform('arrival', 'g2', 'bus')]);
    const stops = filterGameStops(buildGameStops(snapshot), {});
    expect(stops.map(stop => stop.id)).toEqual(['pid-group:g2']);
  });
  it('prefers a documented mode-specific station point and permits a justified manual point', async () => {
    const snapshot = await testSnapshot([testPlatform('rail', 'g', 'train')], { references: [{ groupIds: ['g'], mode: 'train', point: [14.405, 50.075], evidence: { source: 'stop-groups', pointer: '/synthetic/stationReference' } }] });
    const [automatic] = buildGameStops(snapshot);
    expect(automatic.pointMethod).toBe('official'); expect(automatic.point).toEqual([14.405, 50.075]);
    const [edited] = buildGameStops(snapshot, manual(automatic, { point: [14.406, 50.076] }));
    expect(edited.pointMethod).toBe('manual'); expect(edited.point).toEqual([14.406, 50.076]);
    expect(buildGameStops(snapshot)[0].point).toEqual(automatic.point);
    expect(snapshot.platforms[0].point).toEqual([14.4, 50.07]);
  });
  it('filters day/night separately and does not invent a period for unknown service', async () => {
    const snapshot = await testSnapshot([testPlatform('d', 'day', 'bus'), testPlatform('n', 'night', 'tram', [14.4, 50.07], 'night'), testPlatform('u', 'unknown', 'metro', [14.4, 50.07], 'unknown'), testPlatform('b', 'both', 'trolleybus', [14.4, 50.07], 'both')]);
    const stops = buildGameStops(snapshot);
    expect(filterGameStops(stops, { period: 'night' }).map(stop => stop.id)).toEqual(['pid-group:night', 'pid-group:both']);
    expect(filterGameStops(stops, { period: 'day' })).toHaveLength(2);
    expect(filterGameStops(stops, { modes: ['metro'], period: 'all' })).toHaveLength(1);
    expect(filterGameStops(stops, { modes: [] })).toHaveLength(0);
    const mixed = buildGameStops(await testSnapshot([testPlatform('night', 'g', 'tram', [14.4, 50.07], 'night'), testPlatform('unspecified', 'g', 'bus', [14.4, 50.07], 'unknown')]));
    expect(filterGameStops(mixed, { period: 'night' })).toHaveLength(1);
    expect(mixed[0].serviceHasUnknown).toBe(true);
    expect(filterGameStops(mixed, { period: 'day' })).toHaveLength(0);
  });
  it('recomputes priority after a metro closure and marks an existing manual approval for review', async () => {
    const previous = await testSnapshot([testPlatform('m', 'g', 'metro'), testPlatform('t', 'g', 'tram')]);
    const [stop] = buildGameStops(previous);
    const configuration = manual(stop, { point: [14.42, 50.08] });
    const next = await testSnapshot([testPlatform('t', 'g', 'tram')]);
    const [automatic] = buildGameStops(next); expect(automatic.dominantMode).toBe('tram');
    const [review] = buildGameStops(next, configuration); expect(review.eligibility).toBe('review');
    expect(review.pointMethod).toBe('platform-mean'); expect(configuration.overrides[0].point).toEqual([14.42, 50.08]);
  });
  it('requires explicit approval and mode choice for ferries/funiculars and mixed nodes', async () => {
    const snapshot = await testSnapshot([testPlatform('ferry', 'g', 'ferry'), testPlatform('bus', 'g', 'bus')]);
    const [stop] = buildGameStops(snapshot); expect(stop.eligibility).toBe('review'); expect(stop.point).toBeNull();
    const [approved] = buildGameStops(snapshot, manual(stop, { mode: 'ferry', decision: 'allowed' }));
    expect(approved.eligibility).toBe('allowed'); expect(approved.relevantPlatformIds).toEqual(['ferry']);
    const [unapproved] = buildGameStops(snapshot, manual(stop, { mode: 'ferry' })); expect(unapproved.eligibility).toBe('review');
  });
  it('uses exact geodetic distance at 399, 400 and 401 m, including between circle vertices', async () => {
    const [stop] = buildGameStops(await testSnapshot());
    for (const bearing of [0, 1.4, 33, 118, 270]) {
      for (const meters of [399, 400, 401]) {
        const point = destination(stop.point!, meters, bearing, { units: 'meters' }).geometry.coordinates;
        const result = inspectHidingPosition(point, stop, area);
        expect(result.distanceMeters).toBeCloseTo(meters, 6);
        expect(result.status).toBe(meters <= 400 ? 'allowed' : 'forbidden');
      }
    }
    const changed = destination(stop.point!, 449, 33, { units: 'meters' }).geometry.coordinates;
    expect(inspectHidingPosition(changed, stop, area, 450).status).toBe('allowed');
  });
  it('clips true polygon geometry to game boundaries and respects holes and separated parts', async () => {
    const [stop] = buildGameStops(await testSnapshot());
    const clippedArea: AreaGeometry = { type: 'MultiPolygon', coordinates: [
      [[[14.4, 50.06], [14.41, 50.06], [14.41, 50.08], [14.4, 50.08], [14.4, 50.06]], [[14.4002, 50.0698], [14.4002, 50.0702], [14.4006, 50.0702], [14.4006, 50.0698], [14.4002, 50.0698]]],
      [[[14.39, 50.06], [14.395, 50.06], [14.395, 50.08], [14.39, 50.08], [14.39, 50.06]]],
    ] };
    const zone = hidingZoneGeometry(stop, clippedArea)!;
    expect(zone.type).toBe('MultiPolygon');
    for (const point of [[14.4004, 50.07], [14.399, 50.07], [14.3949, 50.07], [14.4008, 50.07]]) {
      const expected = inspectHidingPosition(point, stop, clippedArea).status === 'allowed';
      expect(pointInArea(point, zone)).toBe(expected);
    }
    expect(inspectHidingPosition([14.4, 50.07], stop, clippedArea).status).toBe('allowed');
  });
  it('returns unknown for missing area, missing point or review, and refuses excluded stops', async () => {
    const snapshot = await testSnapshot(); const [stop] = buildGameStops(snapshot);
    expect(inspectHidingPosition(stop.point!, stop, null).status).toBe('unknown');
    expect(hidingZoneGeometry(stop, null)).toBeNull();
    expect(inspectHidingPosition([14.4, 50.07], null, area).status).toBe('unknown');
    expect(inspectHidingPosition([NaN, 50], stop, area).status).toBe('unknown');
    const [excluded] = buildGameStops(snapshot, manual(stop, { decision: 'excluded' }));
    expect(inspectHidingPosition(stop.point!, excluded, area).status).toBe('forbidden');
    expect(hidingZoneGeometry(excluded, area)).toBeNull();
  });
  it('keeps source data and overrides separate, compares changes, and preserves draft/export content', async () => {
    const previous = await testSnapshot([testPlatform('old', 'g', 'train'), testPlatform('removed', 'removed', 'bus')]);
    const [stop] = buildGameStops(previous);
    const configuration = manual(stop, { point: [14.402, 50.072] });
    configuration.overrides.push({ ...configuration.overrides[0], stopId: 'pid-group:removed' });
    const world = { ...newWorld(), gameStops: configuration };
    const before = JSON.stringify(world);
    const next = await testSnapshot([testPlatform('replacement', 'g', 'train'), testPlatform('new', 'added', 'tram')]);
    const stops = buildGameStops(next, configuration);
    const diff = compareGameStops(buildGameStops(previous, configuration), stops);
    expect(diff.changed).toContain('pid-group:g'); expect(diff.removed).toContain('pid-group:removed'); expect(diff.added).toContain('pid-group:added');
    expect(orphanedOverrides(stops, configuration).map(value => value.stopId)).toEqual(['pid-group:removed']);
    expect(JSON.stringify(world)).toBe(before);
    for (const format of ['json', 'geojson'] as const) expect(importWorld(exportWorld(world, format))).toEqual(world);
    expect(stops.find(stop => stop.id === 'pid-group:g')!.eligibility).toBe('review');
  });
  it('rejects duplicate group membership and unjustified manual changes', () => {
    const node = { id: 'manual:a', name: 'Test', groupIds: ['g'], justification: 'Test' };
    expect(() => validateGameStopConfiguration({ ...defaultGameStopConfiguration(), nodes: [node, { ...node, id: 'manual:b' }] })).toThrow('více herních');
    expect(() => validateGameStopConfiguration({ ...defaultGameStopConfiguration(), nodes: [{ ...node, justification: ' ' }] })).toThrow();
  });
});
