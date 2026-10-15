import { mkdtemp, writeFile, readFile, rename, rm, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

const execute = promisify(execFile);
const target = resolve(process.argv[2] ?? 'data/raw/pid');
const files = [
  { name: 'Zastavky_WGS84.json', url: 'https://data.pid.cz/geodata/Zastavky_WGS84.json' },
  { name: 'stops.json', url: 'https://data.pid.cz/stops/json/stops.json' },
  { name: 'Linky_7d_WGS84.json', url: 'https://data.pid.cz/geodata/Linky_7d_WGS84.json' },
];
await mkdir(target, { recursive: true });
const staging = await mkdtemp(join(target, '.download-'));
try {
  const sources = [];
  for (const file of files) {
    const destination = join(staging, file.name);
    // curl uses the environment's supported HTTPS proxy and normal TLS trust.
    await execute('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '120', '--dump-header', `${destination}.headers`, '--output', destination, file.url]);
    const bytes = await readFile(destination);
    const content: unknown = JSON.parse(bytes.toString('utf8'));
    if (!content || typeof content !== 'object') throw new Error(`${file.name}: očekáván JSON objekt nebo pole.`);
    const headers = await readFile(`${destination}.headers`, 'utf8');
    const header = (key: string) => headers.match(new RegExp(`^${key}:\\s*(.+)$`, 'im'))?.[1].trim() ?? null;
    sources.push({ ...file, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, etag: header('etag'), lastModified: header('last-modified'), accessControlAllowOrigin: header('access-control-allow-origin') });
    await rm(`${destination}.headers`);
  }
  await writeFile(join(staging, 'download-metadata.json'), `${JSON.stringify({ downloadedAt: new Date().toISOString(), note: 'Čas stažení není datum platnosti dat. Schéma a význam atributů ještě musí ověřit adaptér.', sources }, null, 2)}\n`);
  // Publish one immutable raw batch only when every download passed basic JSON checks.
  // Existing files are never overwritten or mixed with a failed partial batch.
  await mkdir(target, { recursive: true });
  const batch = join(target, `download-${new Date().toISOString().replace(/[:.]/g, '-')}`);
  await access(target);
  await rename(staging, batch);
  console.log(`Staženy všechny tři soubory: ${batch}\nKontrola struktury: npm run pid:inspect -- ${batch}`);
} catch (error) {
  console.error(`PID nebylo staženo: ${error instanceof Error ? error.message : String(error)}\nDosavadní zdrojové soubory i draft zůstaly zachované.`);
  process.exitCode = 1;
} finally { await rm(staging, { recursive: true, force: true }); }
