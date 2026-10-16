import { mkdtemp, readFile, writeFile, rm, mkdir, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { z } from 'zod';
import { PID_GTFS_URL, PID_GROUPS_URL, PID_GTFS_ADAPTER_VERSION, readPidSnapshot, type PidSnapshot } from '../packages/geo-core/src/index';
import { buildGtfsArchive } from './gtfs-input';
import { readPublicationForDate, writePublication } from './pid-publication';

const execute = promisify(execFile);
export interface GtfsDownload { status: number; version: string | null }
export async function downloadGtfsSource(url: string, target: string): Promise<GtfsDownload> {
  const { stdout } = await execute('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '120', '--max-filesize', '104857600', '--dump-header', `${target}.headers`, '--write-out', '%{http_code}', '--output', target, url]);
  const headers = await readFile(`${target}.headers`, 'utf8');
  return { status: Number(stdout), version: [...headers.matchAll(/^(?:etag|last-modified):\s*(.+)$/gim)].at(-1)?.[1].trim() ?? null };
}
export async function refreshGtfsPublication(options: { date: string; output: string; archiveFile?: string; groupsFile?: string; force?: boolean; reportFile?: string }, download = downloadGtfsSource): Promise<PidSnapshot> {
  const report = { checkedAt: new Date().toISOString(), requestedDate: options.date, outcome: 'not_published', sources: [] as { url: string; status?: number; error?: string }[], error: '', snapshot: null as null | { id: string; checksum: string; date: string; activePlatforms: number; routes: number } };
  let staging: string | undefined;
  try {
    z.iso.date().parse(options.date);
    const cached = !options.force ? await readPublicationForDate(options.output, options.date) : null;
    if (cached?.schemaVersion === 2 && cached.adapterVersion === PID_GTFS_ADAPTER_VERSION) { report.outcome = 'reused_verified_snapshot'; report.snapshot = { id: cached.id, checksum: cached.checksum, date: cached.serviceDate, activePlatforms: cached.platforms.filter(platform => platform.services.length).length, routes: cached.routes.length }; return cached; }
    staging = await mkdtemp(join(tmpdir(), 'jetlag-pid-gtfs-'));
    const archiveFile = options.archiveFile ?? join(staging, 'PID_GTFS.zip'), groupsFile = options.groupsFile ?? join(staging, 'stops.json');
    const warnings: string[] = [];
    let groupsVersion: string | undefined;
    let haveGroups = !!options.groupsFile;
    const fetchOne = async (url: string, file: string) => {
      const entry: { url: string; status?: number; error?: string } = { url }; report.sources.push(entry);
      try { const result = await download(url, file); entry.status = result.status; return result.version ?? undefined; }
      catch (error) { entry.error = String(error); throw new Error(`${url}: ${entry.error}`); }
    };
    const downloads = await Promise.allSettled([
      options.archiveFile ? Promise.resolve(undefined) : fetchOne(PID_GTFS_URL, archiveFile),
      options.groupsFile ? Promise.resolve(undefined) : fetchOne(PID_GROUPS_URL, groupsFile),
    ]);
    if (downloads[0].status === 'rejected') throw downloads[0].reason;
    const archiveVersion = downloads[0].value;
    if (downloads[1].status === 'fulfilled') { groupsVersion = downloads[1].value; haveGroups = true; }
    else warnings.push(`Doplňkové skupiny nejsou dostupné; nespojené GTFS uzly vyžadují revizi: ${String(downloads[1].reason)}`);
    const snapshot = await buildGtfsArchive(await readFile(archiveFile), options.date, { groups: haveGroups ? await readFile(groupsFile) : undefined, downloadedAt: report.checkedAt, archiveVersion, groupsVersion, warnings });
    const verified = await readPidSnapshot(snapshot);
    if (verified.serviceDate !== options.date || verified.quality?.status !== 'verified') throw new Error('GTFS nedoložil požadovaný provozní den.');
    await writePublication(verified, options.output);
    report.outcome = 'published'; report.snapshot = { id: verified.id, checksum: verified.checksum, date: verified.serviceDate, activePlatforms: verified.platforms.filter(platform => platform.services.length).length, routes: verified.routes.length };
    return verified;
  } catch (error) { report.error = error instanceof Error ? error.message : String(error); throw error; }
  finally {
    try {
      const reportFile = resolve(options.reportFile ?? 'data/reports/pid-gtfs-refresh.json'); await mkdir(dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2));
      if (process.env.GITHUB_STEP_SUMMARY) {
        const clean = (value: string) => value.replace(/[<>|\r\n]/g, ' ');
        await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Ruční aktualizace PID GTFS\n\nPožadovaný provozní den: ${clean(options.date)} · **${report.outcome}**\n\n${report.snapshot ? `Verze: ${report.snapshot.checksum}\n\nAktivní stanoviště: ${report.snapshot.activePlatforms} · linky: ${report.snapshot.routes}` : clean(report.error)}\n\n${report.sources.map(source => `${source.url}: ${source.status ?? clean(source.error ?? 'chyba')}`).join('\n\n')}\n`);
      }
    } finally { if (staging) await rm(staging, { recursive: true, force: true }); }
  }
}
