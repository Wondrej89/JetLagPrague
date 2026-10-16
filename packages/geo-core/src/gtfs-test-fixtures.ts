import { createGtfsDayBuilder, type GtfsRecord, type GtfsStaticTables } from './pid-gtfs';

/** Deliberately synthetic GTFS: never assertions about actual PID station IDs. */
export function gtfsFixture() {
  const calendar = (service_id: string, weekend: boolean) => ({ service_id, start_date: '20261001', end_date: '20261031', ...Object.fromEntries(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day, index) => [day, Number((index >= 5) === weekend).toString()])) });
  const tables: GtfsStaticTables = {
    agency: [{ agency_id: '99', agency_timezone: 'Europe/Prague' }], feedInfo: [{ feed_publisher_name: 'Synthetic test only', feed_start_date: '20261001', feed_end_date: '20261031' }],
    calendar: [calendar('work', false), calendar('weekend', true)], calendarDates: [],
    stops: ['S1', 'S2', 'S3', 'S1P'].map((stop_id, i) => ({ stop_id, stop_name: `Test ${stop_id}`, stop_lat: '50.07', stop_lon: (14.4 + (i === 3 ? 0 : i) * .001).toFixed(6), location_type: '0', zone_region_type: '1', asw_node_id: String(i === 3 ? 1 : i + 1), asw_stop_id: '1' })),
    routes: [{ route_id: 'R', route_short_name: 'X', route_type: '3', is_night: '0', route_color: '123456' }, { route_id: 'F', route_short_name: 'F', route_type: '7', is_night: '0' }],
    trips: [{ route_id: 'R', service_id: 'work', trip_id: 'TW', shape_id: 'SH' }, { route_id: 'R', service_id: 'weekend', trip_id: 'TE', shape_id: 'SH' }, { route_id: 'F', service_id: 'weekend', trip_id: 'TF', shape_id: 'SF' }],
  };
  const call = (trip_id: string, stop_id: string, stop_sequence: number, time: string): GtfsRecord => ({ trip_id, stop_id, stop_sequence: String(stop_sequence), arrival_time: time, departure_time: time, pickup_type: '0', drop_off_type: '0' });
  const stopTimes = [call('TW', 'S1', 1, '23:50:00'), { ...call('TW', 'S2', 2, '25:10:00'), pickup_type: '1' }, call('TE', 'S1', 1, '10:00:00'), call('TE', 'S2', 2, '10:10:00'), call('TF', 'S3', 1, '11:00:00'), call('TF', 'S2', 2, '11:10:00')];
  const shapes = ['SH', 'SF'].flatMap(shape_id => [0, 1, 2].map(i => ({ shape_id, shape_pt_lat: String(50.07 + (i === 1 ? .001 : 0)), shape_pt_lon: (14.4 + i * .001).toFixed(6), shape_pt_sequence: String(i + 1) })));
  const groups = { generatedAt: '2026-10-16T03:00:00', dataFormatVersion: '3', stopGroups: [1, 2, 3, 4].map(node => ({ name: `Test ${node}`, fullName: `Test ${node}`, node, cis: node, idosCategory: 1, municipality: 'Praha', avgLon: 14.4, avgLat: 50.07, stops: [{ id: `${node}/1`, lon: 14.4 + (node - 1) * .001, lat: 50.07, gtfsIds: node === 1 ? ['S1', 'S1P'] : node < 4 ? [`S${node}`] : [], mainTrafficType: 'bus', lines: [] }] })) };
  return { tables, stopTimes, shapes, groups };
}
export type GtfsFixture = ReturnType<typeof gtfsFixture>;
export async function testGtfsSnapshot(date = '2026-10-16', fixture = gtfsFixture(), withGroups = true) {
  const tableChecksums = Object.fromEntries(['agency', 'feed_info', 'calendar', 'calendar_dates', 'stops', 'routes', 'trips', 'stop_times', 'shapes'].map(name => [`${name}.txt`, 'a'.repeat(64)]));
  const builder = createGtfsDayBuilder(fixture.tables, date, { archiveChecksum: 'a'.repeat(64), tableChecksums, downloadedAt: '2026-10-16T06:00:00.000Z', ...(withGroups ? { groups: { data: fixture.groups, checksum: 'b'.repeat(64) } } : {}) });
  fixture.stopTimes.forEach(builder.addStopTime); fixture.shapes.forEach(builder.addShapePoint); return builder.finish();
}
