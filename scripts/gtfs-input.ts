import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import { unzipSync } from 'fflate';
import { createGtfsDayBuilder, type GtfsRecord, type GtfsBuildSource, type GtfsStaticTables } from '../packages/geo-core/src/index';

export const gtfsColumns: Record<string, string[]> = {
  'agency.txt': ['agency_id', 'agency_timezone'], 'feed_info.txt': ['feed_publisher_name', 'feed_start_date', 'feed_end_date'],
  'calendar.txt': ['service_id', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'start_date', 'end_date'],
  'calendar_dates.txt': ['service_id', 'date', 'exception_type'],
  'stops.txt': ['stop_id', 'stop_name', 'stop_lat', 'stop_lon'], 'routes.txt': ['route_id', 'route_short_name', 'route_type'],
  'trips.txt': ['route_id', 'service_id', 'trip_id', 'shape_id'],
  'stop_times.txt': ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence'],
  'shapes.txt': ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
};
export function readGtfsZip(bytes: Uint8Array): Record<string, Uint8Array> {
  if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error('GTFS ZIP je prázdný nebo překračuje 100 MiB.');
  let count = 0, total = 0; const seen = new Set<string>();
  const files = unzipSync(bytes, { filter: file => {
    if (++count > 100) throw new Error('GTFS ZIP má příliš mnoho souborů.');
    if (!Object.hasOwn(gtfsColumns, file.name)) return false;
    if (seen.has(file.name) || file.originalSize > 256 * 1024 * 1024) throw new Error('Duplicitní nebo příliš velký soubor GTFS.'); seen.add(file.name);
    total += file.originalSize; if (total > 512 * 1024 * 1024) throw new Error('Rozbalený GTFS překračuje 512 MiB.'); return true;
  } });
  for (const name of Object.keys(gtfsColumns)) if (!['calendar.txt', 'calendar_dates.txt'].includes(name) && !files[name]) throw new Error(`V GTFS ZIP chybí ${name}.`);
  if (!files['calendar.txt'] && !files['calendar_dates.txt']) throw new Error('V GTFS chybí kalendář i výjimky.');
  return files;
}
export async function* gtfsCsv(bytes: Uint8Array | undefined, file: string): AsyncGenerator<GtfsRecord> {
  if (!bytes) return;
  function* chunks() {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    for (let i = 0; i < bytes!.length; i += 65536) yield decoder.decode(bytes!.subarray(i, i + 65536), { stream: true });
    yield decoder.decode();
  }
  const parser = parse({ bom: true, skip_empty_lines: true, max_record_size: 1024 * 1024, columns: (columns: string[]) => {
    if (new Set(columns).size !== columns.length || columns.some(column => !/^[a-zA-Z0-9_]+$/.test(column))) throw new Error(`${file}: neplatné hlavičky CSV.`);
    for (const column of gtfsColumns[file] ?? []) if (!columns.includes(column)) throw new Error(`${file}: chybí sloupec ${column}.`); return columns;
  } });
  Readable.from(chunks()).on('error', error => parser.destroy(error)).pipe(parser);
  for await (const record of parser) yield record as GtfsRecord;
}
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function buildGtfsArchive(archive: Uint8Array, serviceDate: string, options: { groups?: Uint8Array; downloadedAt: string; archiveVersion?: string; groupsVersion?: string; warnings?: string[] }) {
  const files = readGtfsZip(archive), tableChecksums = Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, digest(bytes)]));
  const small: Record<string, GtfsRecord[]> = {};
  for (const file of ['agency', 'feed_info', 'calendar', 'calendar_dates', 'stops', 'routes', 'trips']) { const records: GtfsRecord[] = []; for await (const record of gtfsCsv(files[`${file}.txt`], `${file}.txt`)) records.push(record); small[file] = records; }
  const tables: GtfsStaticTables = { agency: small.agency, feedInfo: small.feed_info, calendar: small.calendar, calendarDates: small.calendar_dates, stops: small.stops, routes: small.routes, trips: small.trips };
  const source: GtfsBuildSource = { archiveChecksum: digest(archive), tableChecksums, downloadedAt: options.downloadedAt, archiveVersion: options.archiveVersion, warnings: options.warnings,
    ...(options.groups ? { groups: { data: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(options.groups)), checksum: digest(options.groups), version: options.groupsVersion } } : {}) };
  const builder = createGtfsDayBuilder(tables, serviceDate, source);
  for await (const row of gtfsCsv(files['stop_times.txt'], 'stop_times.txt')) builder.addStopTime(row);
  for await (const row of gtfsCsv(files['shapes.txt'], 'shapes.txt')) builder.addShapePoint(row);
  return builder.finish();
}
export async function buildGtfsFiles(archiveFile: string, serviceDate: string, groupsFile?: string) {
  const archive = await readFile(archiveFile), groups = groupsFile ? await readFile(groupsFile) : undefined;
  return buildGtfsArchive(archive, serviceDate, { groups, downloadedAt: new Date().toISOString() });
}
