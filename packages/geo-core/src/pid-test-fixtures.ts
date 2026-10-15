import { createPidSnapshot, type PidSnapshot, type PidPlatform, type TransportMode } from './pid-snapshot';

/** Explicitly synthetic records: no claim about real PID keys, stations or joins. */
export function testPlatform(id: string, groupId: string, mode: TransportMode, point: [number, number] = [14.4, 50.07], period: 'day' | 'night' | 'both' | 'unknown' = 'day'): PidPlatform {
  return { id, groupId, name: `Test ${id}`, point, publicStop: true,
    evidence: { source: 'stop-groups', pointer: `/synthetic/${id}` },
    services: [{ mode, period, evidence: { source: 'active-stops', pointer: `/synthetic/${id}` } }] };
}
export async function testSnapshot(platforms: PidPlatform[] = [testPlatform('p1', 'g1', 'tram')], options: { date?: string; groups?: { id: string; name: string }[]; references?: PidSnapshot['stationReferences'] } = {}): Promise<PidSnapshot> {
  return createPidSnapshot({ format: 'jetlag-praha-pid', schemaVersion: 1,
    serviceDate: options.date ?? '2026-10-15', downloadedAt: `${options.date ?? '2026-10-15'}T06:00:00.000Z`,
    adapterVersion: 'synthetic-test-only',
    sources: [
      { id: 'active-stops', url: 'https://example.test/active', sha256: 'a'.repeat(64), version: null, declaredValidity: null, license: null },
      { id: 'stop-groups', url: 'https://example.test/groups', sha256: 'b'.repeat(64), version: null, declaredValidity: null, license: null },
      { id: 'routes', url: 'https://example.test/routes', sha256: 'c'.repeat(64), version: null, declaredValidity: null, license: null },
    ],
    groups: (options.groups ?? [...new Set(platforms.map(platform => platform.groupId))].map(id => ({ id, name: `Test ${id}` }))).map(group => ({ ...group, evidence: { source: 'stop-groups', pointer: `/synthetic/${group.id}` } })),
    platforms, stationReferences: options.references ?? [], routePeriod: 'seven-days',
    routes: [{ id: 'test-route', number: 'X', mode: 'tram', geometry: { type: 'MultiLineString', coordinates: [[[14.4, 50.07], [14.41, 50.08]], [[14.42, 50.09], [14.43, 50.10]]] }, evidence: { source: 'routes', pointer: '/synthetic/route' } }],
  });
}
