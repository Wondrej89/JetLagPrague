import { saveDraft, validateWorld, verifyAdministrativeSources, type WorldDraft } from '@jetlag/geo-core';

const DATABASE = 'jetlag-praha-editor';
const STORE = 'drafts';
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Databázi blokuje jiná otevřená karta editoru.'));
  });
}
export async function readIndexedDraft(): Promise<WorldDraft | null> {
  let db: IDBDatabase;
  try { db = await openDatabase(); }
  catch { return null; } // Starší nebo omezený prohlížeč: nadále se použije původní localStorage.
  try {
    const value: unknown = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE).objectStore(STORE).get('world');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (value === undefined) return null;
    const world = validateWorld(value);
    await verifyAdministrativeSources(world);
    return world;
  } finally { db.close(); }
}
let pending: Promise<unknown> = Promise.resolve();
export function persistWorld(world: WorldDraft): Promise<string> {
  // Serializované zápisy zabraňují přepsání novějšího draftu pomalejším starším zápisem.
  const write = async () => {
    let db: IDBDatabase;
    try { db = await openDatabase(); }
    catch { saveDraft(localStorage, world); return 'Uloženo v localStorage (IndexedDB není dostupná)'; }
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(world, 'world');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    // Kompatibilní malá záloha původního formátu. Plná autoritativní kopie je v IndexedDB.
    try { saveDraft(localStorage, world); } catch { /* Hranice mohou překročit kvótu localStorage. */ }
    return 'Uloženo v IndexedDB v tomto prohlížeči';
  };
  const next = pending.then(write, write);
  pending = next.catch(() => undefined);
  return next;
}
