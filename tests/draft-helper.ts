import type { Page } from '@playwright/test';
import type { WorldDraft } from '../packages/geo-core/src/index';

// Plný draft s pražskými hranicemi žije v IndexedDB; localStorage má menší kvótu.
export async function storedWorld(page: Page): Promise<WorldDraft> {
  const serialized = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const open = indexedDB.open('jetlag-praha-editor', 1);
    open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('drafts')) open.result.createObjectStore('drafts'); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('drafts').objectStore('drafts').get('world');
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = () => { db.close(); resolve(JSON.stringify(read.result ?? JSON.parse(localStorage.getItem('jetlag-praha:world:v1')!))); };
    };
  }));
  return JSON.parse(serialized) as WorldDraft;
}
