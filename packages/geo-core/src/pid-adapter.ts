import { z } from 'zod';
import { createPidSnapshot, sha256, type PidSnapshot, type TransportMode } from './pid-snapshot';
import { wgs84PointSchema } from './pid-model';
import { canonicalJson } from './administrative';

export const PID_URLS = {
  active: 'https://data.pid.cz/geodata/Zastavky_WGS84.json',
  groups: 'https://data.pid.cz/stops/json/stops.json',
  routes: 'https://data.pid.cz/geodata/Linky_7d_WGS84.json',
};
export const PID_ADAPTER_VERSION = 'pid-geodata-v1-stops-v3';
const scalar = z.union([z.string().min(1), z.number().int()]).transform(String);
const point = wgs84PointSchema;
const groupSchema = z.object({
  name: z.string().min(1), fullName: z.string().min(1), node: scalar, cis: scalar, idosCategory: scalar,
  municipality: z.string(), avgLon: z.number().finite(), avgLat: z.number().finite(), isTrain: z.boolean().optional(),
  stops: z.array(z.object({ id: z.string().min(1), lon: z.number().finite(), lat: z.number().finite(),
    gtfsIds: z.array(z.string()), mainTrafficType: z.string(),
    lines: z.array(z.object({ id: scalar, name: z.string(), type: z.string(), isNight: z.boolean().optional(), exitOnly: z.boolean().optional() })),
  })).min(1),
});
const groupsSchema = z.object({ generatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T/), dataFormatVersion: z.literal('3'), stopGroups: z.array(groupSchema).min(1) });
const activeSchema = z.object({ type: z.literal('FeatureCollection'), features: z.array(z.object({
  type: z.literal('Feature'), geometry: z.object({ type: z.literal('Point'), coordinates: point }),
  properties: z.object({ stop_id: z.string().min(1), stop_name: z.string(), asw_node_id: scalar, asw_stop_id: scalar,
    route_type: z.string(), routes_id: z.string().min(1), is_night: z.string(), validity: z.string() }),
})).min(1) });
const lineGeometry = z.discriminatedUnion('type', [
  z.object({ type: z.literal('LineString'), coordinates: z.array(point).min(2) }),
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(point).min(2)).min(1) }),
]);
const routesSchema = z.object({ type: z.literal('FeatureCollection'), features: z.array(z.object({
  type: z.literal('Feature'), geometry: lineGeometry,
  properties: z.object({ route_id: z.string().min(1), route_short_name: z.string().min(1), route_type: z.string(), route_color: z.string().regex(/^[a-fA-F0-9]{6}$/), is_night: z.enum(['0', '1']), validity: z.string().min(1) }),
})).min(1) });
const modes: Record<string, TransportMode> = { '0': 'tram', '1': 'metro', '2': 'train', '3': 'bus', '4': 'ferry', '7': 'funicular', '11': 'trolleybus' };
function mode(code: string): TransportMode {
  const result = modes[code]; if (!result) throw new Error(`Neznámý route_type ${code}; snapshot nebyl přijat.`); return result;
}
function dates(value: string): string[] {
  return [...new Set(value.split(',').map(value => {
    if (!/^\d{8}$/.test(value)) throw new Error(`Neplatná platnost PID: ${value}.`);
    return z.iso.date().parse(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
  }))].sort();
}
export interface PidRawInput { text: string; sha256?: string; version?: string | null }
export interface PidRawBundle { active: PidRawInput; groups: PidRawInput; routes: PidRawInput; downloadedAt: string | null }
function parse(text: string): unknown { return JSON.parse(text.replace(/^\uFEFF/, '')); }
/** Audited joins: exact GTFS id, or exact ASW node/stop components against the
 * unique physical id. Never join by name, distance, group averages, or stripping P. */
export async function adaptPidSources(input: PidRawBundle): Promise<PidSnapshot> {
  const rawActive = parse(input.active.text); const routeData = parse(input.routes.text);
  for (const data of [rawActive, routeData]) if (data && typeof data === 'object' && 'crs' in data) throw new Error('PID GeoJSON musí být WGS84 / RFC 7946 bez neověřené deklarace CRS.');
  const active = activeSchema.parse(rawActive);
  const grouping = groupsSchema.parse(parse(input.groups.text));
  const rawRoutes = routesSchema.parse(routeData);
  const activeDates = [...new Set(active.features.flatMap(feature => dates(feature.properties.validity)))];
  if (activeDates.length !== 1) throw new Error('Aktivní zastávky nemají společný jediný den platnosti.');
  const serviceDate = activeDates[0];
  const issues: string[] = [];
  if (grouping.generatedAt.slice(0, 10) !== serviceDate) issues.push(`Zastávky platí pro ${serviceDate}, skupiny byly generované ${grouping.generatedAt}; nelze potvrdit společnou aktuální platnost.`);
  const referencesByRoute = new Map<string, { mode: TransportMode; night: boolean; dates: string[] }[]>();
  const routesById = new Map<string, PidSnapshot['routes'][number]>();
  rawRoutes.features.forEach((entry, index) => {
    const props = entry.properties; const kind = mode(props.route_type); const valid = dates(props.validity);
    const variants = referencesByRoute.get(props.route_id) ?? []; variants.push({ mode: kind, night: props.is_night === '1', dates: valid }); referencesByRoute.set(props.route_id, variants);
    const parts = entry.geometry.type === 'LineString' ? [entry.geometry.coordinates] : entry.geometry.coordinates;
    const existing = routesById.get(props.route_id);
    if (existing && (existing.mode !== kind || existing.number !== props.route_short_name || existing.color !== `#${props.route_color}`)) throw new Error(`Neslučitelné varianty linky ${props.route_id}.`);
    const route = existing ?? { id: props.route_id, number: props.route_short_name, mode: kind, color: `#${props.route_color}`, validity: [],
      geometry: { type: 'MultiLineString' as const, coordinates: [] }, partBounds: [], evidence: { source: 'routes' as const, pointer: `/features/${index}` } };
    // All original vertices and disjoint parts survive aggregation. No invented joins.
    if (route.geometry.type !== 'MultiLineString') throw new Error('Neočekávaná geometrie agregované trasy.');
    for (const part of parts) {
      route.geometry.coordinates.push(part);
      const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of part) { bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]); bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]); }
      route.partBounds!.push(bounds);
    }
    route.validity = [...new Set([...route.validity!, ...valid])].sort(); routesById.set(props.route_id, route);
  });
  const groups: PidSnapshot['groups'] = [];
  const groupNames = new Map<string, string>();
  type Physical = { groupId: string; stop: z.infer<typeof groupSchema>['stops'][number]; pointer: string; node: string };
  const physical = new Map<string, Physical>(); const aliases = new Map<string, Physical[]>();
  grouping.stopGroups.forEach((group, index) => {
    const anchor = group.stops.map(stop => stop.id).sort()[0];
    const id = `asw:${group.node}:cis:${group.cis}:cat:${group.idosCategory}:p:${anchor}`;
    groups.push({ id, name: group.fullName, municipality: group.municipality,
      codes: { node: group.node, cis: group.cis, category: group.idosCategory, anchorPlatform: anchor }, evidence: { source: 'stop-groups', pointer: `/stopGroups/${index}` } });
    groupNames.set(id, group.fullName);
    group.stops.forEach((stop, stopIndex) => {
      point.parse([stop.lon, stop.lat]);
      if (physical.has(stop.id)) throw new Error(`Duplicitní fyzické ID stanoviště ${stop.id}.`);
      const value: Physical = { groupId: id, stop, pointer: `/stopGroups/${index}/stops/${stopIndex}`, node: group.node };
      physical.set(stop.id, value);
      for (const gtfsId of stop.gtfsIds) { const list = aliases.get(gtfsId) ?? []; list.push(value); aliases.set(gtfsId, list); }
    });
  });
  const platforms = new Map<string, PidSnapshot['platforms'][number]>();
  const unmapped: string[] = []; const activeIds = new Set<string>();
  active.features.forEach((entry, index) => {
    const props = entry.properties;
    if (activeIds.has(props.stop_id)) throw new Error(`Duplicitní aktivní stop_id ${props.stop_id}.`); activeIds.add(props.stop_id);
    const exact = aliases.get(props.stop_id) ?? [];
    const asw = physical.get(`${props.asw_node_id}/${props.asw_stop_id}`);
    if (exact.length > 1 || (exact.length === 1 && asw && exact[0] !== asw)) { unmapped.push(props.stop_id); return; }
    const matched = exact[0] ?? asw;
    if (!matched || matched.node !== props.asw_node_id) { unmapped.push(props.stop_id); return; }
    const referenced = props.routes_id.split(',').flatMap(id => {
      const variants = referencesByRoute.get(id); if (!variants) throw new Error(`Chybí doložená linka ${id} pro ${props.stop_id}.`);
      return variants.filter(variant => variant.dates.includes(serviceDate));
    });
    const expected = props.route_type.split(',').map(mode).sort();
    if (canonicalJson([...new Set(referenced.map(reference => reference.mode))].sort()) !== canonicalJson(expected)) throw new Error(`Doprava stanoviště ${props.stop_id} neodpovídá platným linkám.`);
    const periods = [...new Set(referenced.map(reference => reference.night ? '1' : '0'))].sort();
    if (canonicalJson(periods) !== canonicalJson(props.is_night.split(',').sort())) throw new Error(`Denní/noční obsluha ${props.stop_id} neodpovídá linkám.`);
    const services = [...new Set(expected)].map(kind => {
      const matching = referenced.filter(reference => reference.mode === kind);
      const day = matching.some(reference => !reference.night); const night = matching.some(reference => reference.night);
      return { mode: kind, period: day && night ? 'both' as const : night ? 'night' as const : 'day' as const, evidence: { source: 'active-stops' as const, pointer: `/features/${index}` } };
    });
    const previous = platforms.get(matched.stop.id);
    if (previous) throw new Error(`Více aktivních záznamů pro fyzické stanoviště ${matched.stop.id}; nutná revize adaptéru.`);
    platforms.set(matched.stop.id, { id: matched.stop.id, groupId: matched.groupId, name: props.stop_name, point: [matched.stop.lon, matched.stop.lat],
      activePoint: entry.geometry.coordinates, gtfsIds: matched.stop.gtfsIds, routeIds: props.routes_id.split(','), joinMethod: exact.length ? 'gtfs-id' : 'asw-ids',
      services, publicStop: services.length > 0, evidence: { source: 'stop-groups', pointer: matched.pointer } });
  });
  if (unmapped.length) issues.push(`${unmapped.length} aktivních bodů nemá jednoznačnou vazbu na fyzické stanoviště; nebyly odhadnuty ani sloučeny.`);
  for (const [id, source] of physical) if (!platforms.has(id)) platforms.set(id, {
    id, groupId: source.groupId, name: groupNames.get(source.groupId)!,
    point: [source.stop.lon, source.stop.lat], gtfsIds: source.stop.gtfsIds, active: false, publicStop: false, services: [],
    evidence: { source: 'stop-groups', pointer: source.pointer },
  });
  const source = async (id: 'active-stops' | 'stop-groups' | 'routes', key: keyof typeof PID_URLS, declaredValidity: string) => ({
    id, url: PID_URLS[key], sha256: input[key].sha256 ?? await sha256(input[key].text),
    version: input[key].version ?? (key === 'groups' ? `3:${grouping.generatedAt}` : declaredValidity), declaredValidity, license: null,
  });
  const routeDates = [...new Set(rawRoutes.features.flatMap(entry => dates(entry.properties.validity)))].sort();
  return createPidSnapshot({ format: 'jetlag-praha-pid', schemaVersion: 1, serviceDate, downloadedAt: input.downloadedAt, preparedAt: new Date().toISOString(),
    adapterVersion: PID_ADAPTER_VERSION,
    sources: await Promise.all([source('active-stops', 'active', serviceDate), source('stop-groups', 'groups', grouping.generatedAt), source('routes', 'routes', `${routeDates[0]} / ${routeDates.at(-1)}`)]),
    groups, platforms: [...platforms.values()], stationReferences: [], routes: [...routesById.values()], routePeriod: 'seven-days',
    quality: { status: issues.length ? 'review' : 'verified', issues, unmappedActiveIds: unmapped, groupsGeneratedAt: grouping.generatedAt },
  });
}
