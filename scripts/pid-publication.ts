import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { readPidCatalog, readPidSnapshot, publicationEntry, type PidSnapshot, type PidPublicationEntry } from '../packages/geo-core/src/index';

async function readVersion(directory: string, entry: Pick<PidPublicationEntry, 'file' | 'checksum'> & Partial<PidPublicationEntry>): Promise<PidSnapshot> {
  const snapshot = await readPidSnapshot(gunzipSync(await readFile(join(directory, entry.file))).toString('utf8'));
  if (snapshot.checksum !== entry.checksum || entry.id && (snapshot.id !== entry.id || snapshot.serviceDate !== entry.serviceDate || snapshot.adapterVersion !== entry.adapterVersion || (snapshot.quality?.status ?? 'verified') !== entry.quality)) throw new Error('Publikovaný PID neodpovídá katalogu.'); return snapshot;
}
export async function readPublication(directory: string): Promise<PidSnapshot> {
  const index = readPidCatalog(JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')));
  return readVersion(directory, index.versions?.find(entry => entry.checksum === index.checksum) ?? index);
}
export async function readPublicationForDate(directory: string, date: string): Promise<PidSnapshot | null> {
  let input: unknown;
  try { input = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  const catalog = readPidCatalog(input);
  const entry = catalog.versions?.find(entry => entry.serviceDate === date && entry.quality === 'verified');
  const snapshot = entry ? await readVersion(directory, entry) : catalog.schemaVersion === 1 ? await readVersion(directory, catalog) : null;
  return snapshot?.serviceDate === date && snapshot.quality?.status !== 'review' ? snapshot : null;
}
export async function writePublication(input: PidSnapshot, output: string): Promise<void> {
  const snapshot = await readPidSnapshot(input);
  let versions: PidPublicationEntry[] = [];
  let previousText: string | null = null;
  try { previousText = await readFile(join(output, 'index.json'), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (previousText !== null) {
    const previous = readPidCatalog(JSON.parse(previousText));
    // A missing/corrupt body is an error, never an empty catalog. Do not discard
    // historical references when a publication is damaged or incomplete.
    const previousBody = await readVersion(output, previous.versions?.find(entry => entry.checksum === previous.checksum) ?? previous);
    versions = previous.versions ?? [publicationEntry(previousBody, previous.file)];
  }
  await mkdir(output, { recursive: true });
  let entry = versions.find(entry => entry.checksum === snapshot.checksum);
  if (!entry) {
    entry = publicationEntry(snapshot);
    const file = join(output, entry.file);
    try { const existing = await readVersion(output, entry); if (existing.checksum !== snapshot.checksum) throw new Error('Kolize neměnné verze PID.'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await writeFile(`${file}.tmp`, gzipSync(JSON.stringify(snapshot))); await rename(`${file}.tmp`, file);
    }
    versions.push(entry);
  }
  versions.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || (b.preparedAt ?? b.downloadedAt ?? '').localeCompare(a.preparedAt ?? a.downloadedAt ?? ''));
  const current = versions[0];
  const selected = current.checksum === snapshot.checksum ? snapshot : await readVersion(output, current);
  const catalog = { format: 'jetlag-praha-pid-catalog', schemaVersion: 2, file: current.file, checksum: current.checksum, serviceDate: current.serviceDate, downloadedAt: selected.downloadedAt, quality: selected.quality, versions };
  readPidCatalog(catalog);
  // Immutable bodies first; the catalog pointer is the only atomic replacement.
  await writeFile(join(output, 'index.json.tmp'), `${JSON.stringify(catalog, null, 2)}\n`); await rename(join(output, 'index.json.tmp'), join(output, 'index.json'));
  console.log(`PID ${selected.serviceDate}: ${selected.groups.length} skupin, ${selected.platforms.filter(platform => platform.services.length).length} aktivních / ${selected.platforms.length} všech stanovišť, ${selected.routes.length} linek; konzistence ${selected.quality?.status ?? 'verified'}, ${versions.length} neměnných verzí.`);
}
