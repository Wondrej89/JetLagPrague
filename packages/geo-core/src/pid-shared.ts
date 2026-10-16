import { readPidSnapshot, snapshotReference, isHistoricalPid, pragueDate, type PidSnapshot, type SnapshotReference } from './pid-snapshot';
import { z } from 'zod';

/** A backend implementation MUST supply a distributed lock/lease and atomic
 * publication. A process-local promise alone is not a distributed lock. */
export interface SharedPidStorage {
  readDay(date: string): Promise<unknown | null>;
  readPinned(reference: SnapshotReference): Promise<unknown | null>;
  publishDay(snapshot: PidSnapshot): Promise<void>;
  withExclusiveDay<T>(date: string, work: () => Promise<T>): Promise<T>;
}
export function createSharedPidCache(storage: SharedPidStorage, build: (date: string) => Promise<unknown>) {
  const pending = new Map<string, Promise<PidSnapshot>>();
  async function validatedDay(date: string): Promise<PidSnapshot | null> {
    const raw = await storage.readDay(date); if (raw === null) return null;
    try { const value = await readPidSnapshot(raw); return !isHistoricalPid(value, date) ? value : null; } catch { return null; }
  }
  async function resolve(date = pragueDate()): Promise<PidSnapshot> {
    z.iso.date().parse(date);
    const known = pending.get(date); if (known) return known;
    const work = (async () => {
      const cached = await validatedDay(date); if (cached) return cached;
      return storage.withExclusiveDay(date, async () => {
        const shared = await validatedDay(date); if (shared) return shared;
        const snapshot = await readPidSnapshot(await build(date));
        if (isHistoricalPid(snapshot, date)) throw new Error('Pro novou hru chybí ověřený snapshot požadovaného dne.');
        await storage.publishDay(snapshot); return snapshot;
      });
    })();
    pending.set(date, work);
    try { return await work; } finally { if (pending.get(date) === work) pending.delete(date); }
  }
  async function pinned(reference: SnapshotReference): Promise<PidSnapshot> {
    const raw = await storage.readPinned(reference); if (!raw) throw new Error('Uzamčený snapshot není dostupný.');
    const snapshot = await readPidSnapshot(raw);
    const actual = snapshotReference(snapshot);
    if (Object.keys(actual).some(key => actual[key as keyof SnapshotReference] !== reference[key as keyof SnapshotReference])) throw new Error('Uzamčený snapshot nesouhlasí. Aktuální verze jej nesmí nahradit.');
    return snapshot;
  }
  return { resolve, pinned };
}
