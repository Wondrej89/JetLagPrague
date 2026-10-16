import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
import type { GtfsRecord } from '../packages/geo-core/src/pid-gtfs';
import { gtfsFixture, testGtfsSnapshot } from '../packages/geo-core/src/gtfs-test-fixtures';
import { buildGtfsArchive, gtfsColumns, gtfsCsv, readGtfsZip } from './gtfs-input';
import { refreshGtfsPublication } from './gtfs-publication';
import { readPublication, readPublicationForDate, writePublication } from './pid-publication';
import { stagePidPublication } from './stage-pid-publication';
import { pinnedPublicationEntry, readPidCatalog, snapshotReference } from '../packages/geo-core/src/index';

const directories: string[] = [];
async function temporary() { const directory = await mkdtemp(join(tmpdir(), 'jetlag-gtfs-test-')); directories.push(directory); return directory; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
function archive(f = gtfsFixture()) {
  const tables: Record<string, GtfsRecord[]> = { agency: f.tables.agency, feed_info: f.tables.feedInfo, calendar: f.tables.calendar, calendar_dates: f.tables.calendarDates, stops: f.tables.stops, routes: f.tables.routes, trips: f.tables.trips, stop_times: f.stopTimes, shapes: f.shapes };
  return zipSync(Object.fromEntries(Object.entries(tables).map(([name, rows]) => {
    const headers = [...new Set([...gtfsColumns[`${name}.txt`], ...rows.flatMap(row => Object.keys(row))])];
    const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
    return [`${name}.txt`, strToU8(`\uFEFF${headers.join(',')}\r\n${rows.map(row => headers.map(key => quote(row[key] ?? '')).join(',')).join('\r\n')}\r\n`)];
  })));
}
async function collect<T>(values: AsyncIterable<T>) { const result: T[] = []; for await (const value of values) result.push(value); return result; }
describe('GTFS ZIP/CSV and atomic publication', () => {
  it('parses BOM, quoted commas/newlines and requires a complete ZIP/valid CSV schema', async () => {
    const f = gtfsFixture(); f.tables.stops[0].stop_name = 'Test, "quoted"\nnext line';
    const snapshot = await buildGtfsArchive(archive(f), '2026-10-16', { downloadedAt: '2026-10-16T08:00:00.000Z' });
    expect(snapshot.groups.find(g => g.id === 'gtfs-stop:S1')?.name).toBe('Test, "quoted"\nnext line');
    expect(() => readGtfsZip(zipSync({ 'stops.txt': strToU8('stop_id\nx') }))).toThrow('chybí');
    await expect(collect(gtfsCsv(strToU8('stop_id,stop_id\nx,y'), 'stops.txt'))).rejects.toThrow('hlavičky');
    await expect(collect(gtfsCsv(strToU8('stop_id\nx'), 'stops.txt'))).rejects.toThrow('sloupec');
  });
  it('downloads only on demand, reuses a verified day without any request, and stages immutable history', async () => {
    const root = await temporary(), output = join(root, 'publication'), reportFile = join(root, 'report.json');
    const f = gtfsFixture(), zip = archive(f);
    const download = vi.fn(async (url: string, target: string) => { await writeFile(target, url.endsWith('.zip') ? zip : JSON.stringify(f.groups)); return { status: 200, version: 'test-version' }; });
    const first = await refreshGtfsPublication({ date: '2026-10-16', output, reportFile }, download); expect(download).toHaveBeenCalledTimes(2);
    const reused = await refreshGtfsPublication({ date: '2026-10-16', output, reportFile }, download); expect(reused.checksum).toBe(first.checksum); expect(download).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(reportFile, 'utf8')).outcome).toBe('reused_verified_snapshot');
    const next = await testGtfsSnapshot('2026-10-17'); await writePublication(next, output);
    await writePublication(first, output); expect((await readPublication(output)).checksum).toBe(next.checksum);
    const catalog = readPidCatalog(JSON.parse(await readFile(join(output, 'index.json'), 'utf8'))); expect(catalog.versions).toHaveLength(2);
    expect(pinnedPublicationEntry(catalog, snapshotReference(first)).checksum).toBe(first.checksum);
    expect(() => pinnedPublicationEntry(catalog, { ...snapshotReference(first), checksum: 'f'.repeat(64) })).toThrow();
    const web = join(root, 'web'); await stagePidPublication(output, web); expect((await readPublication(web)).checksum).toBe(next.checksum);
    expect((await readPublicationForDate(web, first.serviceDate))?.checksum).toBe(first.checksum);
  });
  it('preserves the last publication on total source failure, partial feed, wrong date and checksum tampering', async () => {
    const root = await temporary(), output = join(root, 'publication'), reportFile = join(root, 'report.json');
    const previous = await testGtfsSnapshot(); await writePublication(previous, output);
    const before = await readFile(join(output, 'index.json'), 'utf8');
    const failed = vi.fn(async () => { throw new Error('HTTP 503'); });
    await expect(refreshGtfsPublication({ date: '2026-10-17', output, reportFile }, failed)).rejects.toThrow('503'); expect(failed).toHaveBeenCalledTimes(2);
    expect(JSON.parse(await readFile(reportFile, 'utf8')).sources.every((s: { error?: string }) => s.error)).toBe(true);
    const invalid = gtfsFixture(); invalid.stopTimes = invalid.stopTimes.filter(row => row.trip_id !== 'TE');
    const badZip = archive(invalid), download = vi.fn(async (url: string, file: string) => { await writeFile(file, url.endsWith('.zip') ? badZip : JSON.stringify(invalid.groups)); return { status: 200, version: null }; });
    await expect(refreshGtfsPublication({ date: '2026-10-17', output, reportFile }, download)).rejects.toThrow('úplné');
    const wrong = archive(); const zipPath = join(root, 'valid.zip'), groups = join(root, 'stops.json'); await writeFile(zipPath, wrong); await writeFile(groups, JSON.stringify(gtfsFixture().groups));
    await expect(refreshGtfsPublication({ date: '2026-11-01', output, archiveFile: zipPath, groupsFile: groups, reportFile }, failed)).rejects.toThrow('platí');
    await expect(writePublication({ ...previous, checksum: 'f'.repeat(64) }, output)).rejects.toThrow('Kontrolní');
    expect(await readFile(join(output, 'index.json'), 'utf8')).toBe(before); expect((await readPublication(output)).checksum).toBe(previous.checksum);
  });
  it('can publish GTFS when optional grouping fails, marking affected stops for individual review', async () => {
    const root = await temporary(), zip = archive();
    const download = async (url: string, file: string) => { if (!url.endsWith('.zip')) throw new Error('optional groups offline'); await writeFile(file, zip); return { status: 200, version: null }; };
    const result = await refreshGtfsPublication({ date: '2026-10-16', output: join(root, 'pub'), reportFile: join(root, 'report.json') }, download);
    expect(result.quality?.status).toBe('verified'); expect(result.sources.map(source => source.id)).toEqual(['gtfs']); expect(result.quality?.reviewGroupIds?.length).toBeGreaterThan(0);
  });
  it('does not erase catalog history when an existing immutable body is missing', async () => {
    const root = await temporary(), previous = await testGtfsSnapshot(); await writePublication(previous, root);
    const before = await readFile(join(root, 'index.json'), 'utf8');
    await rm(join(root, `snapshot-${previous.checksum}.json.gz`));
    await expect(writePublication(await testGtfsSnapshot('2026-10-17'), root)).rejects.toThrow();
    expect(await readFile(join(root, 'index.json'), 'utf8')).toBe(before);
  });
});
