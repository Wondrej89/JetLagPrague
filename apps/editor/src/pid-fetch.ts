import { readPidCatalog, readPidSnapshot, pragueDate, type PidSnapshot } from '@jetlag/geo-core';

export async function decodePidData(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(data);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
/** Only static publications on this application's hosting are fetched here.
 * GTFS/stops.json are processed by an authorized workflow, never by the browser. */
export async function loadPublishedPid(base: string, known?: PidSnapshot | null): Promise<PidSnapshot> {
  const response = await fetch(`${base}pid/index.json`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Publikovaný katalog PID není dostupný.');
  const catalog = readPidCatalog(await response.json()), today = pragueDate();
  const entries = [...(catalog.versions ?? [])].sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || (b.preparedAt ?? '').localeCompare(a.preparedAt ?? ''));
  const entry = entries.find(entry => entry.serviceDate === today && entry.quality === 'verified') ?? entries.find(entry => entry.serviceDate <= today) ?? entries[0];
  const selected = entry ?? catalog;
  if (known && known.checksum === selected.checksum) return known;
  const data = await fetch(`${base}pid/${selected.file}`, { signal: AbortSignal.timeout(30000) });
  if (!data.ok) throw new Error('Publikovaný snapshot PID není dostupný.');
  const snapshot = await readPidSnapshot(await decodePidData(await data.arrayBuffer()));
  if (snapshot.checksum !== selected.checksum || entry && (snapshot.id !== entry.id || snapshot.serviceDate !== entry.serviceDate || snapshot.adapterVersion !== entry.adapterVersion || (snapshot.quality?.status ?? 'verified') !== entry.quality)) throw new Error('Snapshot PID neodpovídá katalogu.');
  return snapshot;
}
