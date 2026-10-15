import { expect, test } from '@playwright/test';
import { storedWorld } from './draft-helper';
import { newWorld, newFeature, defaultGameStopConfiguration } from '../packages/geo-core/src/index';

test('PID snapshot storage atomically refreshes, retains pinned versions, and cannot alter the geographic draft', async ({ page }) => {
  await page.route('https://api.mapy.com/**', route => route.abort());
  const draft = newWorld();
  draft.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [[[14.3, 50], [14.5, 50], [14.5, 50.2], [14.3, 50.2], [14.3, 50]]] }, 'Vlastní herní oblast')];
  draft.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50.07] }, 'Vlastní objekt')];
  draft.gameStops = { ...defaultGameStopConfiguration(), radiusMeters: 450, overrides: [{ stopId: 'pid-group:g1', point: [14.402, 50.072], decision: 'allowed', justification: 'Syntetické schválení pro kontrolu zachování draftu', approvedAt: '2026-10-14T08:00:00.000Z', sourceSignature: 'test-only-stored-approval' }] };
  await page.addInitScript(serialized => {
    if (!localStorage.getItem('jetlag-praha:world:v1')) localStorage.setItem('jetlag-praha:world:v1', serialized);
  }, JSON.stringify(draft));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Městské části Prahy', exact: true })).toBeVisible({ timeout: 15000 });
  await expect.poll(async () => (await storedWorld(page)).layers.filter(layer => layer.dataset).length).toBe(2);
  const before = await storedWorld(page);
  expect(before.layers.filter(layer => !layer.dataset).flatMap(layer => layer.features)).toHaveLength(2);
  expect(before.gameStops).toEqual(draft.gameStops);
  const result = await page.evaluate(async root => {
    const core = await import(/* @vite-ignore */ `/@fs/${root}/packages/geo-core/src/index.ts`);
    const fixtures = await import(/* @vite-ignore */ `/@fs/${root}/packages/geo-core/src/pid-test-fixtures.ts`);
    const storeModule = '/src/pid-store.ts';
    const store = await import(/* @vite-ignore */ storeModule);
    const first = await fixtures.testSnapshot(undefined, { date: '2026-10-14' });
    await store.indexedPidStorage.write(first);
    const pinned = core.snapshotReference(first);
    const second = await fixtures.testSnapshot();
    const refreshed = await core.refreshPidSnapshot(store.indexedPidStorage, async () => second, { now: new Date('2026-10-15T08:00:00Z') });
    const previousVersion = await store.readPinnedPidSnapshot(pinned);
    const failed = await core.refreshPidSnapshot(store.indexedPidStorage, async () => { throw new Error('HTTP 503'); }, { force: true, now: new Date('2026-10-16T08:00:00Z') });
    let corruptionRejected = false;
    try { await store.indexedPidStorage.write({ ...second, checksum: '0'.repeat(64) }); } catch { corruptionRejected = true; }
    const current = await store.indexedPidStorage.read();
    return { refreshed: refreshed.refreshed, previousDate: previousVersion?.serviceDate, failedDate: failed.snapshot?.serviceDate, stale: failed.stale, currentDate: current.serviceDate, corruptionRejected };
  }, process.cwd());
  expect(result).toEqual({ refreshed: true, previousDate: '2026-10-14', failedDate: '2026-10-15', stale: true, currentDate: '2026-10-15', corruptionRejected: true });
  expect(await storedWorld(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Městské části Prahy', exact: true })).toBeVisible({ timeout: 15000 });
  const dates = await page.evaluate(async () => {
    const storeModule = '/src/pid-store.ts';
    const store = await import(/* @vite-ignore */ storeModule);
    const snapshot = await store.indexedPidStorage.read();
    return snapshot.serviceDate;
  });
  expect(dates).toBe('2026-10-15');
  expect((await storedWorld(page)).layers).toEqual(before.layers);
});
