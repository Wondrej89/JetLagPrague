import { z } from 'zod';
import type { PidSnapshot, SnapshotReference } from './pid-snapshot';

export const pidPublicationEntrySchema = z.object({ file: z.string().regex(/^snapshot-(?:[a-f0-9]{16}|[a-f0-9]{64})\.json\.gz$/), checksum: z.string().regex(/^[a-f0-9]{64}$/), id: z.string().min(1), serviceDate: z.iso.date(), adapterVersion: z.string().min(1), preparedAt: z.iso.datetime().nullable(), downloadedAt: z.iso.datetime().nullable(), quality: z.enum(['verified', 'review']) });
export type PidPublicationEntry = z.infer<typeof pidPublicationEntrySchema>;
const catalogSchema = z.object({ format: z.literal('jetlag-praha-pid-catalog'), schemaVersion: z.union([z.literal(1), z.literal(2)]), file: pidPublicationEntrySchema.shape.file, checksum: pidPublicationEntrySchema.shape.checksum, versions: z.array(pidPublicationEntrySchema).optional() });
export type PidCatalog = z.infer<typeof catalogSchema>;
export function readPidCatalog(input: unknown): PidCatalog {
  const value = catalogSchema.parse(input);
  const validFile = (file: string, checksum: string) => checksum.startsWith(file.slice(9, -8));
  if (!validFile(value.file, value.checksum)) throw new Error('Název snapshotu nesouhlasí s kontrolním součtem.');
  if (value.schemaVersion === 2 && (!value.versions?.length || new Set(value.versions.map(entry => entry.checksum)).size !== value.versions.length || !value.versions.some(entry => entry.file === value.file && entry.checksum === value.checksum))) throw new Error('Neplatný katalog verzí PID.');
  for (const entry of value.versions ?? []) if (!validFile(entry.file, entry.checksum) || entry.id !== `pid:${entry.serviceDate}:${entry.checksum}`) throw new Error('Neplatný identifikátor verze PID.');
  return value;
}
export function publicationEntry(snapshot: PidSnapshot, file = `snapshot-${snapshot.checksum}.json.gz`): PidPublicationEntry {
  return { file, id: snapshot.id, checksum: snapshot.checksum, serviceDate: snapshot.serviceDate, adapterVersion: snapshot.adapterVersion, preparedAt: snapshot.preparedAt ?? null, downloadedAt: snapshot.downloadedAt, quality: snapshot.quality?.status ?? 'verified' };
}
export function pinnedPublicationEntry(catalog: PidCatalog, reference: SnapshotReference): PidPublicationEntry {
  const entry = catalog.versions?.find(entry => entry.checksum === reference.checksum);
  if (!entry || entry.id !== reference.id || entry.serviceDate !== reference.serviceDate || entry.adapterVersion !== reference.adapterVersion) throw new Error('Uzamčená verze není v katalogu. Nesmí být nahrazena aktuální verzí.');
  return entry;
}
