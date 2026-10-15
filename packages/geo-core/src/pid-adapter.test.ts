import { beforeAll, describe, expect, it } from 'vitest';
import { destination } from '@turf/turf';
import { adaptPidSources, type PidRawBundle } from './pid-adapter';
import { buildGameStops, defaultGameStopConfiguration, inspectHidingPosition } from './game-stops';
import { readPidSnapshot, type PidSnapshot } from './pid-snapshot';
import { readPidInput, type PidInput } from '../../../scripts/pid-input';

let snapshot: PidSnapshot;
let raw: Record<'active' | 'groups' | 'routes', PidInput>;
type RawGroup = { name: string; node: number; fullName: string; stops: { id: string; lon: number; lat: number; lines: { exitOnly?: boolean }[] }[] };
type RawFeature = { properties: { stop_name: string; routes_id: string; route_type: string; validity: string; asw_node_id: string }; geometry: unknown };
type RawRoute = { properties: { route_id: string; route_type: string }; geometry: unknown };
beforeAll(async () => {
  const [active, groups, routes] = await Promise.all([readPidInput('data/raw/pid', 'Zastavky_WGS84.json'), readPidInput('data/raw/pid', 'stops.json'), readPidInput('data/raw/pid', 'Linky_7d_WGS84.json')]);
  raw = { active, groups, routes };
  snapshot = await adaptPidSources({ active: { text: JSON.stringify(active.json), sha256: active.sha256 }, groups: { text: JSON.stringify(groups.json), sha256: groups.sha256 }, routes: { text: JSON.stringify(routes.json), sha256: routes.sha256 }, downloadedAt: null });
}, 30000);
function smallSource(): { active: { type: string; features: RawFeature[] }; groups: { generatedAt: string; dataFormatVersion: string; stopGroups: RawGroup[] }; routes: { type: string; features: RawRoute[] } } {
  const active = raw.active.json as { type: string; features: RawFeature[] };
  const groups = raw.groups.json as { generatedAt: string; dataFormatVersion: string; stopGroups: RawGroup[] };
  const routes = raw.routes.json as { type: string; features: RawRoute[] };
  const selected = active.features.filter(feature => feature.properties.stop_name === 'Anděl');
  const referenced = new Set(selected.flatMap(feature => feature.properties.routes_id.split(',')));
  return structuredClone({ active: { ...active, features: selected }, groups: { ...groups, stopGroups: groups.stopGroups.filter(group => group.name === 'Anděl') }, routes: { ...routes, features: routes.features.filter(route => referenced.has(route.properties.route_id)) } });
}
function bundle(input: ReturnType<typeof smallSource>): PidRawBundle {
  return { active: { text: JSON.stringify(input.active) }, groups: { text: JSON.stringify(input.groups) }, routes: { text: JSON.stringify(input.routes) }, downloadedAt: null };
}
describe('Audited adapter over the actual supplied PID files', () => {
  it('preserves all physical platforms and keeps unserved points out of game centers', () => {
    expect(snapshot.groups).toHaveLength(8526); expect(snapshot.platforms).toHaveLength(17229);
    expect(snapshot.platforms.filter(platform => platform.services.length)).toHaveLength(15910);
    expect(snapshot.platforms.find(platform => platform.id === '1040/13')?.active).toBe(false);
    expect(snapshot.platforms.find(platform => platform.id === '1040/13')?.point).toEqual([14.4044228, 50.0703926]);
  });
  it('uses only metro platforms for Anděl and does not merge Na Knížecí despite the shared ASW node', () => {
    const stops = buildGameStops(snapshot);
    const andel = stops.find(stop => stop.name === 'Anděl')!;
    const knizeci = stops.find(stop => stop.name === 'Na Knížecí')!;
    expect(andel.id).not.toBe(knizeci.id); expect(andel.groupIds).toHaveLength(1);
    expect(andel.dominantMode).toBe('metro'); expect(andel.relevantPlatformIds).toEqual(['1040/101', '1040/102']);
    expect(andel.point![0]).toBeCloseTo((14.4034872 + 14.4040508) / 2, 12);
    expect(andel.point![1]).toBeCloseTo((50.0695 + 50.0704) / 2, 12);
    expect(snapshot.platforms.find(platform => platform.id === '1040/101')?.joinMethod).toBe('asw-ids');
  });
  it('requires an explicit manual link before train priority can span Prague main station groups', () => {
    const stops = buildGameStops(snapshot);
    const metro = stops.find(stop => stop.name === 'Hlavní nádraží')!;
    const train = stops.find(stop => stop.name === 'Praha hlavní nádraží')!;
    expect(metro.id).not.toBe(train.id); expect(metro.dominantMode).toBe('metro'); expect(train.dominantMode).toBe('train');
    const linked = buildGameStops(snapshot, { ...defaultGameStopConfiguration(), nodes: [{ id: 'manual:explicit-test', name: 'Explicitní test ručního propojení skutečných skupin', groupIds: [...metro.groupIds, ...train.groupIds], justification: 'Test výslovného rozhodnutí správce; netvrdí automatickou společnou identitu PID.' }] }).find(stop => stop.id === 'manual:explicit-test')!;
    expect(linked.dominantMode).toBe('train'); expect(linked.relevantPlatformIds).toContain('142/301');
  });
  it('retains an arrival-only terminus and identifies its night service from referenced route metadata', () => {
    const grouping = raw.groups.json as { stopGroups: RawGroup[] };
    const terminus = grouping.stopGroups.find(group => group.name === 'Anděl')!.stops.find(stop => stop.id === '1040/11')!;
    expect(terminus.lines.some(line => line.exitOnly)).toBe(true);
    const platform = snapshot.platforms.find(platform => platform.id === terminus.id)!;
    expect(platform.publicStop).toBe(true); expect(platform.services).toEqual([expect.objectContaining({ mode: 'bus', period: 'night' })]);
  });
  it('never declares the inconsistent August/October data to be a verified current snapshot', () => {
    expect(snapshot.serviceDate).toBe('2026-08-20'); expect(snapshot.downloadedAt).toBeNull(); expect(snapshot.preparedAt).toBeTruthy();
    expect(snapshot.quality?.status).toBe('review'); expect(snapshot.quality?.unmappedActiveIds).toHaveLength(208);
    const stop = buildGameStops(snapshot).find(stop => stop.name === 'Anděl')!;
    const point = destination(stop.point!, 399, 33, { units: 'meters' }).geometry.coordinates;
    const result = inspectHidingPosition(point, stop, { type: 'Polygon', coordinates: [[[14.3, 50], [14.5, 50], [14.5, 50.2], [14.3, 50.2], [14.3, 50]]] });
    expect(result.status).toBe('unknown'); expect(result.withinRadius).toBe(true); expect(result.insideGameArea).toBe(true);
  });
  it('aggregates 1297 route variants into 853 official IDs without losing any original vertices', () => {
    expect(snapshot.routes).toHaveLength(853);
    const vertices = snapshot.routes.reduce((sum, route) => sum + (route.geometry.type === 'LineString' ? route.geometry.coordinates.length : route.geometry.coordinates.reduce((total, part) => total + part.length, 0)), 0);
    expect(vertices).toBe(1101102);
    expect(snapshot.routes.find(route => route.id === 'L1')?.color).toBe('#7A0603');
    expect(snapshot.routes.every(route => route.geometry.type === 'MultiLineString' && route.partBounds?.length === route.geometry.coordinates.length)).toBe(true);
  });
  it('records exact raw checksums and produces a readable immutable snapshot', async () => {
    expect(snapshot.sources.map(source => source.sha256)).toEqual([raw.active.sha256, raw.groups.sha256, raw.routes.sha256]);
    expect(await readPidSnapshot(snapshot)).toEqual(snapshot);
  }, 15000);
  it('can validate a synchronized test date without fabricating any stop-group membership', async () => {
    const input = smallSource(); input.groups.generatedAt = '2026-08-20T03:52:54';
    const synchronized = await adaptPidSources(bundle(input));
    expect(synchronized.quality?.status).toBe('verified'); expect(buildGameStops(synchronized)[0].eligibility).toBe('allowed');
  }, 15000);
  it('rejects missing route references, unknown modes, duplicate platform IDs and unsupported group formats', async () => {
    const input = smallSource();
    const missing = structuredClone(input); missing.active.features[0].properties.routes_id = 'UNPROVEN';
    await expect(adaptPidSources(bundle(missing))).rejects.toThrow('Chybí doložená linka');
    const unknown = structuredClone(input); unknown.routes.features[0].properties.route_type = '999';
    await expect(adaptPidSources(bundle(unknown))).rejects.toThrow('Neznámý route_type');
    const duplicate = structuredClone(input); duplicate.groups.stopGroups[0].stops.push(duplicate.groups.stopGroups[0].stops[0]);
    await expect(adaptPidSources(bundle(duplicate))).rejects.toThrow('Duplicitní fyzické ID');
    const wrong = structuredClone(input); wrong.groups.dataFormatVersion = '999';
    await expect(adaptPidSources(bundle(wrong))).rejects.toThrow();
    const unknownCrs = { ...input.active, crs: { type: 'name', properties: { name: 'EPSG:3857' } } };
    await expect(adaptPidSources(bundle({ ...input, active: unknownCrs }))).rejects.toThrow('CRS');
  }, 15000);
});
