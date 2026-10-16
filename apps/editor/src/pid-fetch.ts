import { adaptPidSources, PID_URLS, readPidSnapshot, sha256, type PidSnapshot } from '@jetlag/geo-core';

export async function decodePidData(data: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(data);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}
export async function loadPublishedPid(base: string, known?: PidSnapshot | null): Promise<PidSnapshot> {
  const response = await fetch(`${base}pid/index.json`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error('Publikovaný katalog PID není dostupný.');
  const index = await response.json() as { format?: string; schemaVersion?: number; file?: string; checksum?: string };
  if (index.format !== 'jetlag-praha-pid-catalog' || index.schemaVersion !== 1 || !/^snapshot-[a-f0-9]{16}\.json\.gz$/.test(index.file ?? '') || !/^[a-f0-9]{64}$/.test(index.checksum ?? '')) throw new Error('Neplatný katalog PID.');
  if (known && known.checksum === index.checksum) return known;
  const data = await fetch(`${base}pid/${index.file}`, { signal: AbortSignal.timeout(30000) });
  if (!data.ok) throw new Error('Publikovaný snapshot PID není dostupný.');
  const snapshot = await readPidSnapshot(await decodePidData(await data.arrayBuffer()));
  if (snapshot.checksum !== index.checksum) throw new Error('Snapshot PID neodpovídá katalogu.');
  return snapshot;
}
export async function loadLivePid(): Promise<PidSnapshot> {
  const downloadedAt = new Date().toISOString();
  const results = await Promise.allSettled(Object.entries(PID_URLS).map(async ([key, url]) => {
    let response: Response;
    try { response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(25000) }); }
    catch (error) { throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)} (síť, CORS nebo časový limit).`); }
    if (!response.ok) throw new Error(`PID ${key}: HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 100 * 1024 * 1024) throw new Error('Zdroj PID překračuje limit 100 MiB.');
    return [key, { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), sha256: await sha256(new Uint8Array(bytes)), version: response.headers.get('etag') ?? response.headers.get('last-modified') }] as const;
  }));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length) throw new Error(failures.map(result => String(result.reason)).join(' '));
  return adaptPidSources({ ...Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])), downloadedAt } as Parameters<typeof adaptPidSources>[0]);
}
