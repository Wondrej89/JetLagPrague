import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readPidSnapshot, type PidSnapshot } from '../packages/geo-core/src/index';

export async function readPublication(directory: string): Promise<PidSnapshot> {
  const index = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')) as { file: string; checksum: string };
  if (!/^snapshot-[a-f0-9]{16}\.json\.gz$/.test(index.file)) throw new Error('Neplatný název publikovaného souboru PID.');
  const snapshot = await readPidSnapshot(gunzipSync(await readFile(join(directory, index.file))).toString('utf8'));
  if (snapshot.checksum !== index.checksum) throw new Error('Publikovaný PID neodpovídá katalogu.');
  return snapshot;
}
export async function writePublication(snapshot: PidSnapshot, output: string): Promise<void> {
  await mkdir(output, { recursive: true });
  const file = `snapshot-${snapshot.checksum.slice(0, 16)}.json.gz`;
  const compressed = gzipSync(JSON.stringify(snapshot));
  await writeFile(join(output, `${file}.tmp`), compressed);
  await rename(join(output, `${file}.tmp`), join(output, file));
  const catalog = { format: 'jetlag-praha-pid-catalog', schemaVersion: 1, file, checksum: snapshot.checksum, serviceDate: snapshot.serviceDate, downloadedAt: snapshot.downloadedAt, quality: snapshot.quality };
  await writeFile(join(output, 'index.json.tmp'), `${JSON.stringify(catalog, null, 2)}\n`);
  await rename(join(output, 'index.json.tmp'), join(output, 'index.json'));
  console.log(`PID ${snapshot.serviceDate}: ${snapshot.groups.length} skupin, ${snapshot.platforms.filter(platform => platform.services.length).length} aktivních / ${snapshot.platforms.length} všech stanovišť, ${snapshot.routes.length} linek, ${compressed.length} B GZIP; konzistence ${snapshot.quality?.status ?? 'verified'}.`);
}
