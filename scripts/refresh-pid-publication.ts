import { appendFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { adaptPidSources, PID_URLS, pragueDate, readPidSnapshot, type PidSnapshot } from '../packages/geo-core/src/index';
import { readPublication, writePublication } from './pid-publication';

const execute = promisify(execFile);
const output = resolve('apps/editor/public/pid');
const strict = process.argv.includes('--strict') || process.env.GITHUB_EVENT_NAME === 'schedule';
const staging = await mkdtemp(join(tmpdir(), 'jetlag-pid-publication-'));
const download = async (url: string, file: string) => {
  const result = await execute('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '60', '--max-filesize', '104857600', '--dump-header', `${file}.headers`, '--write-out', '%{http_code}', '--output', file, url]);
  const headers = Object.fromEntries((await readFile(`${file}.headers`, 'utf8')).split(/\r?\n/).flatMap(line => {
    const colon = line.indexOf(':'); const key = line.slice(0, colon).toLowerCase();
    return ['last-modified', 'etag', 'access-control-allow-origin'].includes(key) ? [[key, line.slice(colon + 1).trim()]] : [];
  }));
  return { httpStatus: Number(result.stdout), headers };
};
interface SourceReport { key: string; url: string; httpStatus?: number; headers?: Record<string, string>; declaredValidity?: string | null; checksum?: string; error?: string }
const report = { checkedAt: new Date().toISOString(), referenceDate: pragueDate(), event: process.env.GITHUB_EVENT_NAME ?? 'local', strict, sources: [] as SourceReport[], failures: [] as string[], outcome: 'not_published', selectedSnapshot: null as null | { id: string; serviceDate: string; checksum: string; quality: string } };
let best = await readPublication(output);
const warnings: string[] = [];
try {
  // A code deploy must not replace the previously published good snapshot with
  // an older repository bootstrap when the upstream source is unavailable.
  const previousBase = process.env.PID_PUBLISHED_BASE_URL;
  if (previousBase) try {
    const base = new URL(previousBase); if (base.protocol !== 'https:') throw new Error('Publikovaný zdroj musí používat HTTPS.');
    const indexFile = join(staging, 'previous-index.json'); await download(new URL('pid/index.json', base).href, indexFile);
    const index = JSON.parse(await readFile(indexFile, 'utf8')) as { file: string; checksum: string };
    if (!/^snapshot-[a-f0-9]{16}\.json\.gz$/.test(index.file)) throw new Error('Neplatný katalog předchozího nasazení.');
    const file = join(staging, 'previous.json.gz'); await download(new URL(`pid/${index.file}`, base).href, file);
    const previous = await readPidSnapshot(gunzipSync(await readFile(file)).toString('utf8'));
    if (previous.checksum !== index.checksum) throw new Error('Předchozí publikace má nesouhlasící checksum.');
    const previousVerified = previous.quality?.status !== 'review', bestVerified = best.quality?.status !== 'review';
    if (previousVerified && !bestVerified || previousVerified === bestVerified && previous.serviceDate >= best.serviceDate) best = previous;
  } catch (error) { warnings.push(`Předchozí publikace: ${error instanceof Error ? error.message : error}`); }
  let current: PidSnapshot | null = null;
  try {
    const results = await Promise.allSettled(Object.entries(PID_URLS).map(async ([key, url]) => {
      const entry: SourceReport = { key, url }; report.sources.push(entry);
      try {
        const file = join(staging, `${key}.json`); Object.assign(entry, await download(url, file));
        return [key, { text: await readFile(file, 'utf8') }] as const;
      } catch (error) { entry.error = String(error); throw new Error(`${key} (${url}): ${entry.error}`); }
    }));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new Error(failures.map(result => String(result.reason)).join(' '));
    const parts = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const snapshot = await adaptPidSources({ ...Object.fromEntries(parts), downloadedAt: new Date().toISOString() } as Parameters<typeof adaptPidSources>[0]);
    for (const entry of report.sources) {
      const id = entry.key === 'active' ? 'active-stops' : entry.key === 'groups' ? 'stop-groups' : 'routes';
      const source = snapshot.sources.find(source => source.id === id)!; entry.declaredValidity = source.declaredValidity; entry.checksum = source.sha256;
    }
    if (snapshot.serviceDate !== pragueDate() || snapshot.quality?.status === 'review') throw new Error(`Datum ${snapshot.serviceDate}; ${snapshot.quality?.issues.join(' ') ?? 'neodpovídá dnešnímu datu'}`);
    current = snapshot;
  } catch (error) { warnings.push(`Živé PID: ${error instanceof Error ? error.message : error}`); }
  for (const warning of warnings) console.warn(warning);
  report.failures = warnings;
  const selected = current ?? best;
  report.selectedSnapshot = { id: selected.id, serviceDate: selected.serviceDate, checksum: selected.checksum, quality: selected.quality?.status ?? 'verified' };
  if (!current && strict) throw new Error('Denní aktualizace selhala. Nasazení se neprovede; poslední publikovaný web a snapshot zůstávají zachované.');
  await writePublication(selected, output); report.outcome = current ? 'published_current' : 'published_previous_reference';
} finally {
  try {
    const reportFile = resolve(process.env.PID_REFRESH_REPORT ?? 'data/reports/pid-refresh.json');
    await mkdir(dirname(reportFile), { recursive: true }); await writeFile(reportFile, JSON.stringify(report, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const escape = (text: string) => text.replace(/[<>|\r\n]/g, ' ');
      const rows = report.sources.map(source => `| ${source.key} | ${source.httpStatus ?? 'selhání'} | ${escape(source.declaredValidity ?? 'neurčeno')} | ${escape(source.error ?? source.headers?.['last-modified'] ?? '')} |`).join('\n');
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## PID refresh ${report.checkedAt}\n\nVýsledek: **${report.outcome}**. Požadovaný den: ${report.referenceDate}.\n\n| Zdroj | HTTP | Platnost | Detail / Last-Modified |\n| --- | --- | --- | --- |\n${rows}\n\n${report.failures.map(failure => escape(failure)).join('\n\n')}\n`);
    }
  } finally { await rm(staging, { recursive: true, force: true }); }
}
