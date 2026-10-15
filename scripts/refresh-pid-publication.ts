import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { adaptPidSources, PID_URLS, pragueDate, readPidSnapshot, type PidSnapshot } from '../packages/geo-core/src/index';
import { readPublication, writePublication } from './pid-publication';

const execute = promisify(execFile);
const output = resolve('apps/editor/public/pid');
const strict = process.argv.includes('--strict') || process.env.GITHUB_EVENT_NAME === 'schedule';
const staging = await mkdtemp(join(tmpdir(), 'jetlag-pid-publication-'));
const download = async (url: string, file: string) => execute('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '60', '--max-filesize', '104857600', '--output', file, url]);
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
    if (previous.quality?.status !== 'review' && (best.quality?.status === 'review' || previous.serviceDate >= best.serviceDate)) best = previous;
  } catch (error) { warnings.push(`Předchozí publikace: ${error instanceof Error ? error.message : error}`); }
  let current: PidSnapshot | null = null;
  try {
    const results = await Promise.allSettled(Object.entries(PID_URLS).map(async ([key, url]) => {
      const file = join(staging, `${key}.json`); await download(url, file);
      return [key, { text: await readFile(file, 'utf8') }] as const;
    }));
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) throw new Error(failures.map(result => String(result.reason)).join(' '));
    const parts = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
    const snapshot = await adaptPidSources({ ...Object.fromEntries(parts), downloadedAt: new Date().toISOString() } as Parameters<typeof adaptPidSources>[0]);
    if (snapshot.serviceDate !== pragueDate() || snapshot.quality?.status === 'review') throw new Error(`Datum ${snapshot.serviceDate}; ${snapshot.quality?.issues.join(' ') ?? 'neodpovídá dnešnímu datu'}`);
    current = snapshot;
  } catch (error) { warnings.push(`Živé PID: ${error instanceof Error ? error.message : error}`); }
  for (const warning of warnings) console.warn(warning);
  if (!current && strict) throw new Error('Denní aktualizace selhala. Nasazení se neprovede; poslední publikovaný web a snapshot zůstávají zachované.');
  await writePublication(current ?? best, output);
} finally { await rm(staging, { recursive: true, force: true }); }
