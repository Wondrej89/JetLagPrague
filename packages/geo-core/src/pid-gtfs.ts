import { z } from 'zod';
import { createPidSnapshot, type PidSnapshot, type TransportMode, wgs84PointSchema } from './pid-snapshot';
import { pidStopGroupsSchema } from './pid-adapter';

export const PID_GTFS_URL = 'https://data.pid.cz/PID_GTFS.zip';
export const PID_GROUPS_URL = 'https://data.pid.cz/stops/json/stops.json';
export const PID_GTFS_ADAPTER_VERSION = 'pid-gtfs-v1';
export type GtfsRecord = Record<string, string>;
export interface GtfsStaticTables { agency: GtfsRecord[]; feedInfo: GtfsRecord[]; calendar: GtfsRecord[]; calendarDates: GtfsRecord[]; stops: GtfsRecord[]; routes: GtfsRecord[]; trips: GtfsRecord[] }
export interface GtfsBuildSource { archiveChecksum: string; tableChecksums: Record<string, string>; downloadedAt: string; archiveVersion?: string; groups?: { data: unknown; checksum: string; version?: string }; warnings?: string[] }
const modeCodes: Record<string, TransportMode> = { '0': 'tram', '1': 'metro', '2': 'train', '3': 'bus', '4': 'ferry', '7': 'funicular', '11': 'trolleybus' };
const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const field = (row: GtfsRecord, key: string, file: string) => { const value = row[key]; if (!value?.trim()) throw new Error(`${file}: chybí ${key}.`); return value; };
const integer = (value: string, label: string, min = 0) => { if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min) throw new Error(`Neplatné ${label}: ${value}.`); return Number(value); };
export function gtfsDate(value: string): string {
  if (!/^\d{8}$/.test(value)) throw new Error(`Neplatné datum GTFS ${value}.`);
  return z.iso.date().parse(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`);
}
export function gtfsTimeSeconds(value: string): number {
  if (!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value)) throw new Error(`Neplatný čas GTFS ${value}.`);
  const [hours, minutes, seconds] = value.split(':').map(Number); return hours * 3600 + minutes * 60 + seconds;
}
export function activeGtfsServices(calendar: GtfsRecord[], exceptions: GtfsRecord[], serviceDate: string): Set<string> {
  z.iso.date().parse(serviceDate); const weekday = weekdays[new Date(`${serviceDate}T12:00:00Z`).getUTCDay()];
  const ids = new Set<string>(), seen = new Set<string>();
  for (const row of calendar) {
    const id = field(row, 'service_id', 'calendar.txt'); if (seen.has(id)) throw new Error(`Duplicitní service_id ${id}.`); seen.add(id);
    const start = gtfsDate(row.start_date), end = gtfsDate(row.end_date); if (start > end) throw new Error('Obrácená platnost kalendáře.');
    for (const day of weekdays) if (!['0', '1'].includes(row[day])) throw new Error(`Neplatný kalendář ${id}/${day}.`);
    if (start <= serviceDate && serviceDate <= end && row[weekday] === '1') ids.add(id);
  }
  const changed = new Set<string>();
  for (const row of exceptions) {
    const id = field(row, 'service_id', 'calendar_dates.txt'), date = gtfsDate(row.date), key = `${id}:${date}`;
    if (changed.has(key) || !['1', '2'].includes(row.exception_type)) throw new Error(`Nejednoznačná výjimka kalendáře ${key}.`); changed.add(key);
    if (date === serviceDate) { if (row.exception_type === '1') ids.add(id); else ids.delete(id); }
  }
  return ids;
}
function uniqueRows(rows: GtfsRecord[], key: string, file: string) {
  const result = new Map<string, GtfsRecord>();
  for (const row of rows) { const id = field(row, key, file); if (result.has(id)) throw new Error(`${file}: duplicitní ${key} ${id}.`); result.set(id, row); }
  return result;
}

/** Pure streaming accumulator. ZIP/CSV, network and storage live in server scripts.
 * serviceDate is the GTFS operating day in Europe/Prague; 25:00 remains in that
 * service day, as explicitly documented by PID. No modulo-24 truncation. */
export function createGtfsDayBuilder(tables: GtfsStaticTables, serviceDate: string, source: GtfsBuildSource) {
  z.iso.date().parse(serviceDate);
  if (!tables.agency.length || tables.agency.some(row => row.agency_timezone !== 'Europe/Prague')) throw new Error('GTFS nemá doložené časové pásmo Europe/Prague.');
  if (tables.feedInfo.length !== 1) throw new Error('Chybí jednoznačné feed_info.txt.');
  const info = tables.feedInfo[0], feedStart = gtfsDate(info.feed_start_date), feedEnd = gtfsDate(info.feed_end_date);
  if (serviceDate < feedStart || serviceDate > feedEnd) throw new Error(`GTFS platí ${feedStart} až ${feedEnd}, nikoli ${serviceDate}.`);
  if (!tables.calendar.length && !tables.calendarDates.length) throw new Error('Chybí kalendář GTFS.');
  const services = activeGtfsServices(tables.calendar, tables.calendarDates, serviceDate);
  const definedServices = new Set([...tables.calendar, ...tables.calendarDates].map(row => row.service_id));
  const stops = uniqueRows(tables.stops, 'stop_id', 'stops.txt'), routes = uniqueRows(tables.routes, 'route_id', 'routes.txt'), trips = uniqueRows(tables.trips, 'trip_id', 'trips.txt');
  if (!stops.size || !routes.size || !trips.size) throw new Error('GTFS má prázdné základní tabulky.');
  const publicStops = new Set<string>();
  for (const [id, stop] of stops) {
    if (stop.location_type !== '3') field(stop, 'stop_name', 'stops.txt');
    if (stop.stop_lon === '' || stop.stop_lat === '') throw new Error(`Chybí souřadnice GTFS ${id}.`);
    wgs84PointSchema.parse([Number(stop.stop_lon), Number(stop.stop_lat)]);
    if (!['', '0', '1', '2', '3', '4'].includes(stop.location_type ?? '')) throw new Error(`Neznámý location_type ${id}.`);
    if (stop.parent_station && !stops.has(stop.parent_station)) throw new Error(`Chybí parent_station ${stop.parent_station}.`);
    // PID explicitly identifies operational helper points with region type 0.
    if (['', '0'].includes(stop.location_type ?? '') && stop.zone_region_type !== '0' && stop.zone_region_type !== '') publicStops.add(id);
  }
  for (const [id, route] of routes) {
    if (!modeCodes[route.route_type]) throw new Error(`Neznámý GTFS route_type ${route.route_type} (${id}).`);
    field(route, 'route_short_name', 'routes.txt');
    if (!['0', '1', ''].includes(route.is_night ?? '')) throw new Error(`Neplatné is_night ${id}.`);
    if (route.route_color && !/^[a-fA-F0-9]{6}$/.test(route.route_color)) throw new Error(`Neplatná barva linky ${id}.`);
  }
  const activeTrips = new Set<string>(), requiredShapes = new Set<string>();
  for (const [id, trip] of trips) {
    if (!routes.has(trip.route_id) || !definedServices.has(trip.service_id)) throw new Error(`Neúplné vazby spoje ${id}.`);
    if (services.has(trip.service_id)) { activeTrips.add(id); requiredShapes.add(field(trip, 'shape_id', 'trips.txt')); }
  }
  type Visit = { modes: Map<TransportMode, Set<'day' | 'night' | 'unknown'>>; routeIds: Set<string>; proof: Map<TransportMode, string> };
  const visits = new Map<string, Visit>(), timings = new Map<string, [number, number, number][]>(), publicTrips = new Set<string>();
  const shapePoints = new Map<string, { sequence: number; point: [number, number] }[]>(), seenShapes = new Set<string>();
  let stopTimeCount = 0, shapePointCount = 0, over24Count = 0, minSeconds = Infinity, maxSeconds = -Infinity;
  function addStopTime(row: GtfsRecord) {
    stopTimeCount++;
    const trip = trips.get(row.trip_id), stop = stops.get(row.stop_id);
    if (!trip || !stop) throw new Error(`stop_times.txt: chybí spoj nebo zastávka ${row.trip_id}/${row.stop_id}.`);
    const sequence = integer(row.stop_sequence, 'stop_sequence');
    const arrival = gtfsTimeSeconds(row.arrival_time), departure = gtfsTimeSeconds(row.departure_time);
    if (departure < arrival) throw new Error(`Odjezd před příjezdem ${row.trip_id}/${sequence}.`);
    const pickup = row.pickup_type || '0', dropoff = row.drop_off_type || '0';
    if (![pickup, dropoff].every(value => ['0', '1', '2', '3'].includes(value))) throw new Error('Neznámé omezení nástupu/výstupu.');
    if (!activeTrips.has(row.trip_id)) return;
    const times = timings.get(row.trip_id) ?? []; times.push([sequence, arrival, departure]); timings.set(row.trip_id, times);
    minSeconds = Math.min(minSeconds, arrival); maxSeconds = Math.max(maxSeconds, departure); if (departure >= 86400) over24Count++;
    if (!publicStops.has(row.stop_id) || pickup === '1' && dropoff === '1') return;
    publicTrips.add(row.trip_id);
    const route = routes.get(trip.route_id)!;
    const visit = visits.get(row.stop_id) ?? { modes: new Map(), routeIds: new Set(), proof: new Map() };
    const mode = modeCodes[route.route_type], periods = visit.modes.get(mode) ?? new Set();
    periods.add(route.is_night === '1' ? 'night' : route.is_night === '0' ? 'day' : 'unknown');
    visit.modes.set(mode, periods); if (!visit.proof.has(mode)) visit.proof.set(mode, row.trip_id);
    visit.routeIds.add(trip.route_id); visits.set(row.stop_id, visit);
  }
  function addShapePoint(row: GtfsRecord) {
    shapePointCount++; const id = field(row, 'shape_id', 'shapes.txt'), sequence = integer(row.shape_pt_sequence, 'shape_pt_sequence');
    if (row.shape_pt_lon === '' || row.shape_pt_lat === '') throw new Error(`Chybí souřadnice tvaru ${id}.`);
    const point = wgs84PointSchema.parse([Number(row.shape_pt_lon), Number(row.shape_pt_lat)]);
    seenShapes.add(id);
    if (requiredShapes.has(id)) { const list = shapePoints.get(id) ?? []; list.push({ sequence, point }); shapePoints.set(id, list); }
  }
  async function finish(): Promise<PidSnapshot> {
    if (!stopTimeCount || !shapePointCount) throw new Error('GTFS má prázdné jízdní doby nebo tvary.');
    for (const id of activeTrips) {
      const times = timings.get(id); if (!times || times.length < 2) throw new Error(`Chybí úplné stop_times spoje ${id}.`);
      times.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < times.length; i++) if (times[i][0] === times[i - 1][0] || times[i][1] < times[i - 1][2]) throw new Error(`Neplatné pořadí nebo čas spoje ${id}.`);
    }
    for (const id of requiredShapes) if (!seenShapes.has(id)) throw new Error(`Chybí tvar aktivního spoje ${id}.`);
    const grouping = source.groups ? pidStopGroupsSchema.parse(source.groups.data) : null;
    const groups: PidSnapshot['groups'] = [], platforms = new Map<string, PidSnapshot['platforms'][number]>();
    const physical = new Map<string, { groupId: string; node: string }>(), aliases = new Map<string, string[]>();
    grouping?.stopGroups.forEach((group, index) => {
      const anchor = group.stops.map(stop => stop.id).sort()[0], groupId = `asw:${group.node}:cis:${group.cis}:cat:${group.idosCategory}:p:${anchor}`;
      groups.push({ id: groupId, name: group.fullName, municipality: group.municipality, codes: { node: group.node, cis: group.cis, category: group.idosCategory, anchorPlatform: anchor }, evidence: { source: 'stop-groups', pointer: `/stopGroups/${index}` } });
      group.stops.forEach((stop, stopIndex) => {
        if (physical.has(stop.id)) throw new Error(`Duplicitní fyzické ID ${stop.id}.`);
        physical.set(stop.id, { groupId, node: group.node });
        platforms.set(stop.id, { id: stop.id, groupId, name: group.fullName, point: wgs84PointSchema.parse([stop.lon, stop.lat]), active: false, publicStop: false, services: [], gtfsIds: [...stop.gtfsIds], serviceStatus: 'unknown', evidence: { source: 'stop-groups', pointer: `/stopGroups/${index}/stops/${stopIndex}` } });
        for (const id of stop.gtfsIds) { const list = aliases.get(id) ?? []; if (!list.includes(stop.id)) list.push(stop.id); aliases.set(id, list); }
      });
    });
    const reviewGroups = new Set<string>(), unmapped: string[] = [];
    const serviceSets = new Map<string, Map<TransportMode, Set<'day' | 'night' | 'unknown'>>>();
    const serviceProofs = new Map<string, Map<TransportMode, string>>();
    for (const [id, stop] of stops) {
      if (!['', '0'].includes(stop.location_type ?? '') || !publicStops.has(id)) continue;
      const exact = aliases.get(id) ?? [], aswId = stop.asw_node_id && stop.asw_stop_id ? `${stop.asw_node_id}/${stop.asw_stop_id}` : '', asw = physical.get(aswId);
      const physicalId = exact.length === 1 && (!asw || exact[0] === aswId) ? exact[0] : exact.length === 0 && asw ? aswId : null;
      const matched = physicalId && physical.get(physicalId);
      const safeId = matched && (!stop.asw_node_id || matched.node === stop.asw_node_id) ? physicalId : null;
      let platform = safeId ? platforms.get(safeId)! : null;
      if (!platform) {
        // An unpaired official GTFS stop remains visible and individually marked
        // for review. No name/proximity merge and no guessed physical identity.
        const groupId = `gtfs-stop:${id}`, platformId = `gtfs:${id}`;
        groups.push({ id: groupId, name: stop.stop_name, evidence: { source: 'gtfs', pointer: `/stops.txt/${id}` } });
        platform = { id: platformId, groupId, name: stop.stop_name, point: [Number(stop.stop_lon), Number(stop.stop_lat)], active: false, publicStop: false, services: [], gtfsIds: [], serviceStatus: 'inactive', reviewReasons: ['Chybí jednoznačná vazba GTFS na fyzické stanoviště; nutná revize.'], evidence: { source: 'gtfs', pointer: `/stops.txt/${id}` } };
        platforms.set(platformId, platform); reviewGroups.add(groupId); if (visits.has(id)) unmapped.push(id);
      } else platform.joinMethod = exact.length === 1 ? 'gtfs-id' : 'asw-ids';
      platform.gtfsIds = [...new Set([...(platform.gtfsIds ?? []), id])].sort();
      if (platform.serviceStatus === 'unknown') platform.serviceStatus = 'inactive';
      const visit = visits.get(id); if (!visit) continue;
      platform.serviceStatus = 'active'; platform.active = true; platform.publicStop = true;
      const point: [number, number] = [Number(stop.stop_lon), Number(stop.stop_lat)];
      if (platform.activePoint && (platform.activePoint[0] !== point[0] || platform.activePoint[1] !== point[1])) { reviewGroups.add(platform.groupId); platform.reviewReasons = ['Současně aktivní GTFS varianty mají odlišné souřadnice; bod k revizi.']; }
      else platform.activePoint = point;
      platform.routeIds = [...new Set([...(platform.routeIds ?? []), ...visit.routeIds])].sort();
      const modes = serviceSets.get(platform.id) ?? new Map();
      const proofs = serviceProofs.get(platform.id) ?? new Map();
      for (const [mode, periods] of visit.modes) {
        const combined = modes.get(mode) ?? new Set(); for (const period of periods) combined.add(period); modes.set(mode, combined);
        if (!proofs.has(mode)) proofs.set(mode, `/stop_times.txt/trip/${visit.proof.get(mode)!}/stop/${id}`);
      }
      serviceProofs.set(platform.id, proofs);
      serviceSets.set(platform.id, modes);
      platform.services = [...modes].sort(([a], [b]) => a.localeCompare(b)).map(([mode, periods]) => ({ mode, period: periods.has('unknown') ? 'unknown' : periods.size === 2 ? 'both' : periods.has('night') ? 'night' : 'day', evidence: { source: 'gtfs', pointer: proofs.get(mode)! } }));
    }
    for (const platform of platforms.values()) if (platform.serviceStatus === 'unknown') { platform.reviewReasons = ['Pro fyzické stanoviště není ve feedu doložená vazba GTFS.']; reviewGroups.add(platform.groupId); }
    const shapesByRoute = new Map<string, Set<string>>();
    for (const id of publicTrips) { const trip = trips.get(id)!, shapes = shapesByRoute.get(trip.route_id) ?? new Set(); shapes.add(trip.shape_id); shapesByRoute.set(trip.route_id, shapes); }
    const outputRoutes: PidSnapshot['routes'] = [];
    for (const [id, shapeIds] of [...shapesByRoute].sort(([a], [b]) => a.localeCompare(b))) {
      const row = routes.get(id)!, ids = [...shapeIds].sort();
      const coordinates = ids.map(id => {
        const points = shapePoints.get(id); if (!points || points.length < 2) throw new Error(`Neúplný tvar ${id}.`);
        points.sort((a, b) => a.sequence - b.sequence);
        for (let i = 1; i < points.length; i++) if (points[i].sequence === points[i - 1].sequence) throw new Error(`Duplicitní vrchol tvaru ${id}.`);
        return points.map(point => point.point);
      });
      outputRoutes.push({ id, number: row.route_short_name, mode: modeCodes[row.route_type], ...(row.route_color ? { color: `#${row.route_color}` } : {}), geometry: { type: 'MultiLineString', coordinates }, shapeIds: ids, validity: [serviceDate],
        partBounds: coordinates.map(part => { const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity]; for (const p of part) { bounds[0] = Math.min(bounds[0], p[0]); bounds[1] = Math.min(bounds[1], p[1]); bounds[2] = Math.max(bounds[2], p[0]); bounds[3] = Math.max(bounds[3], p[1]); } return bounds; }), evidence: { source: 'gtfs', pointer: `/trips.txt/route/${id}` } });
    }
    const issues = [...(source.warnings ?? [])];
    if (reviewGroups.size) issues.push(`${reviewGroups.size} skupin má místní nejednoznačnost; tyto uzly vyžadují revizi, ostatní zůstávají ověřené.`);
    const license = { name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' };
    return createPidSnapshot({ format: 'jetlag-praha-pid', schemaVersion: 2, serviceDate, downloadedAt: source.downloadedAt, preparedAt: new Date().toISOString(), adapterVersion: PID_GTFS_ADAPTER_VERSION,
      sources: [{ id: 'gtfs', url: PID_GTFS_URL, sha256: source.archiveChecksum, version: source.archiveVersion ?? null, declaredValidity: `${feedStart} / ${feedEnd}`, license }, ...(source.groups ? [{ id: 'stop-groups' as const, url: PID_GROUPS_URL, sha256: source.groups.checksum, version: source.groups.version ?? null, declaredValidity: grouping!.generatedAt, license }] : [])],
      groups, platforms: [...platforms.values()], stationReferences: [], routes: outputRoutes, routePeriod: 'service-day',
      quality: { status: 'verified', issues, unmappedActiveIds: unmapped, groupsGeneratedAt: grouping?.generatedAt ?? 'not supplied', reviewGroupIds: [...reviewGroups].sort() },
      gtfs: { feedStart, feedEnd, timezone: 'Europe/Prague', dateSemantics: 'gtfs-service-day', publisher: field(info, 'feed_publisher_name', 'feed_info.txt'), tableChecksums: source.tableChecksums, serviceIds: [...services].sort(),
        counts: { stops: stops.size, routes: routes.size, trips: trips.size, activeTrips: activeTrips.size, publicTrips: publicTrips.size, activeGtfsStops: visits.size, stopTimes: stopTimeCount, shapePoints: shapePointCount, afterMidnightCalls: over24Count }, minServiceSeconds: Number.isFinite(minSeconds) ? minSeconds : null, maxServiceSeconds: Number.isFinite(maxSeconds) ? maxSeconds : null },
    });
  }
  return { addStopTime, addShapePoint, finish };
}
