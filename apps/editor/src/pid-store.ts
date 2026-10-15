import { readPidSnapshot, type PidSnapshot, type PidSnapshotStorage, type SnapshotReference } from '@jetlag/geo-core';

// Separate database: PID updates cannot touch drafts, manual overrides or boundary layers.
const DATABASE = 'jetlag-praha-pid';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('snapshots');
      request.result.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Úložiště PID blokuje jiná karta.'));
  });
}
async function readSnapshot(reference?: SnapshotReference): Promise<unknown | null> {
  const database = await openDatabase();
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const transaction = database.transaction(['snapshots', 'state']);
      let snapshot: unknown = null;
      const load = (checksum: unknown) => {
        if (typeof checksum !== 'string') return;
        const request = transaction.objectStore('snapshots').get(checksum);
        request.onsuccess = () => { snapshot = request.result ?? null; };
      };
      if (reference) load(reference.checksum);
      else {
        const current = transaction.objectStore('state').get('current');
        current.onsuccess = () => load(current.result);
      }
      transaction.oncomplete = () => resolve(snapshot);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
export async function readPinnedPidSnapshot(reference: SnapshotReference): Promise<PidSnapshot | null> {
  const value = await readSnapshot(reference);
  if (value === null) return null;
  const snapshot = await readPidSnapshot(value);
  if (snapshot.id !== reference.id || snapshot.serviceDate !== reference.serviceDate || snapshot.adapterVersion !== reference.adapterVersion) throw new Error('Uzamčená verze PID nesouhlasí s uloženým snapshotem.');
  return snapshot;
}
export const indexedPidStorage: PidSnapshotStorage = {
  read: () => readSnapshot(),
  async write(value) {
    // Full validation happens before the write transaction starts. Every accepted
    // snapshot remains addressable by checksum after a subsequent daily refresh.
    const snapshot = await readPidSnapshot(value);
    const database = await openDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(['snapshots', 'state'], 'readwrite');
        transaction.objectStore('snapshots').put(snapshot, snapshot.checksum);
        transaction.objectStore('state').put(snapshot.checksum, 'current');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    } finally { database.close(); }
  },
};

export interface PidAttempt { date: string; error: string | null }
export async function readPidAttempt(): Promise<PidAttempt | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction('state').objectStore('state').get('last-attempt');
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
}
export async function writePidAttempt(attempt: PidAttempt): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite');
      transaction.objectStore('state').put(attempt, 'last-attempt');
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
    });
  } finally { database.close(); }
}
