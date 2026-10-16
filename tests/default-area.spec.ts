import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { defaultGameStopConfiguration, newFeature, newWorld, pragueDate, type WorldDraft } from '../packages/geo-core/src/index';
import { testPlatform, testSnapshot } from '../packages/geo-core/src/pid-test-fixtures';
import { storedWorld } from './draft-helper';

const key = 'jetlag-praha:world:v1';
const boundaryFile = 'apps/editor/public/defaults/prague-game-area.geojson';
async function mockPid(context: BrowserContext) {
  const snapshot = await testSnapshot([testPlatform('in', 'in', 'tram', [14.4, 50.07]), testPlatform('out', 'out', 'bus', [15, 51])], { date: pragueDate(), groups: [{ id: 'in', name: 'Testovací zastávka uvnitř Prahy' }, { id: 'out', name: 'Testovací zastávka mimo Prahu' }] });
  const file = `snapshot-${snapshot.checksum.slice(0, 16)}.json.gz`;
  await context.route('https://api.mapy.com/**', route => route.abort());
  await context.route('https://data.pid.cz/**', route => route.abort());
  await context.route('**/pid/index.json', route => route.fulfill({ json: { format: 'jetlag-praha-pid-catalog', schemaVersion: 1, file, checksum: snapshot.checksum } }));
  await context.route(`**/pid/${file}`, route => route.fulfill({ contentType: 'application/gzip', body: gzipSync(JSON.stringify(snapshot)) }));
}
test.beforeEach(async ({ context }) => { await mockPid(context); });
async function ready(page: Page) { await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false'); }
async function rawStoredWorld(page: Page) {
  const serialized = await page.evaluate(() => new Promise<string | null>((resolve, reject) => {
    const request = indexedDB.open('jetlag-praha-editor', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('drafts'); request.onerror = () => reject(request.error);
    request.onsuccess = () => { const db = request.result, read = db.transaction('drafts').objectStore('drafts').get('world'); read.onerror = () => { db.close(); reject(read.error); }; read.onsuccess = () => { db.close(); resolve(read.result ? JSON.stringify(read.result) : null); }; };
  }));
  return serialized === null ? null : JSON.parse(serialized) as WorldDraft;
}
function customWorld() {
  const world = newWorld(); world.title = 'Můj uložený svět';
  world.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [[[14.39, 50.06], [14.44, 50.06], [14.44, 50.1], [14.39, 50.1], [14.39, 50.06]]] }, 'Moje vlastní hranice')];
  world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.405, 50.075] }, 'Zachovaný vlastní bod')];
  world.gameStops = { ...defaultGameStopConfiguration(), radiusMeters: 450 }; return world;
}

test('nové zařízení: statická Praha před prvním uložením, reload i vymazání cache; PID a zóny bez ručního generování', async ({ page, context }) => {
  let release = () => {}, requests = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const contents = await readFile(boundaryFile, 'utf8'), expected = JSON.parse(contents);
  // Default territory must work even without the separate administrative layer download.
  await context.route('**/administrative/**', route => route.abort());
  await context.route('**/defaults/prague-game-area.geojson', async route => { requests++; await gate; await route.fulfill({ contentType: 'application/geo+json', body: contents }); });
  try {
    await page.goto('/'); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'true');
    expect(await rawStoredWorld(page)).toBeNull(); expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  } finally { release(); }
  await ready(page); await expect.poll(async () => (await storedWorld(page)).layers[0].features.length).toBe(1);
  const saved = await storedWorld(page); expect(saved.layers[0].features[0].geometry).toEqual(expected.geometry); expect(saved.layers[0].features[0].attributes.codes).toHaveLength(57);
  await expect(page.getByTestId('pid-count')).toContainText('1 / 1');
  await expect(page.getByLabel('Pouze PID v herní oblasti', { exact: true })).toBeChecked();
  await page.getByLabel('Zobrazit všechny úkrytové zóny', { exact: true }).check();
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-coverage-type', 'Polygon');
  await page.locator('.pid-stop-list').getByRole('button', { name: /^Testovací zastávka uvnitř Prahy/ }).click();
  await page.getByRole('button', { name: 'Zobrazit úkrytovou zónu 400 m', exact: true }).click();
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-zone-type', 'Polygon');
  await page.getByRole('button', { name: 'Ověřit polohu', exact: true }).click();
  const box = (await page.getByTestId('map').boundingBox())!; await page.mouse.click(box.x + box.width / 2 + 70, box.y + box.height / 2);
  await expect(page.getByTestId('position-game')).toContainText('Ano · v herní oblasti');
  await page.reload(); await ready(page); expect((await storedWorld(page)).layers).toEqual(saved.layers); expect(requests).toBe(1);
  await page.evaluate(() => new Promise<void>((resolve, reject) => { localStorage.clear(); const request = indexedDB.deleteDatabase('jetlag-praha-editor'); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); }));
  await page.reload(); await ready(page); await expect.poll(async () => (await storedWorld(page)).layers[0].features.length).toBe(1);
  expect((await storedWorld(page)).layers[0].features[0].geometry).toEqual(expected.geometry); expect(requests).toBe(2);
});

test('IndexedDB má přednost před vadným localStorage; vlastní oblast přežije reload a obnova vyžaduje potvrzení', async ({ page, context }) => {
  await context.route('**/administrative/**', route => route.abort());
  const own = customWorld();
  await page.goto('/'); await ready(page); await expect.poll(async () => (await storedWorld(page)).layers[0].features.length).toBe(1);
  await page.evaluate(({ serialized, key }) => new Promise<void>((resolve, reject) => {
    const own = JSON.parse(serialized);
    localStorage.setItem(key, '{corrupt legacy'); const open = indexedDB.open('jetlag-praha-editor', 1);
    open.onsuccess = () => { const db = open.result, tx = db.transaction('drafts', 'readwrite'); tx.objectStore('drafts').put(own, 'world'); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error); };
  }), { serialized: JSON.stringify(own), key });
  await page.reload(); await ready(page); expect((await storedWorld(page)).layers).toEqual(own.layers);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const restore = page.getByRole('button', { name: 'Obnovit výchozí území Prahy', exact: true });
  page.once('dialog', dialog => dialog.dismiss()); await restore.click(); expect((await storedWorld(page)).layers).toEqual(own.layers);
  page.once('dialog', dialog => dialog.accept()); await restore.click();
  await expect.poll(async () => (await storedWorld(page)).layers[0].features[0].attributes.preset).toBe('praha-municipal-union');
  expect((await storedWorld(page)).layers[1]).toEqual(own.layers[1]); expect((await storedWorld(page)).gameStops).toEqual(own.gameStops);
  await page.getByRole('button', { name: 'Zpět', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).layers[0].features[0].id).toBe(own.layers[0].features[0].id);
  await page.reload(); await ready(page); expect((await storedWorld(page)).layers).toEqual(own.layers);
});

test('starší prázdný draft zachová vlastní data a pravidla; ruční obnova doplní pouze herní hranici', async ({ page }) => {
  const own = customWorld(); own.layers[0].features = [];
  await page.addInitScript(({ key, serialized }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, serialized); }, { key, serialized: JSON.stringify(own) });
  await page.goto('/'); await ready(page); await expect(page.getByTestId('legacy-empty-area')).toBeVisible();
  expect((await storedWorld(page)).layers.slice(0, 2)).toEqual(own.layers); expect((await storedWorld(page)).gameStops).toEqual(own.gameStops);
  await page.getByRole('button', { name: 'Obnovit výchozí území Prahy', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).layers[0].features.length).toBe(1);
  expect((await storedWorld(page)).layers[1]).toEqual(own.layers[1]); expect((await storedWorld(page)).gameStops).toEqual(own.gameStops);
  await page.reload(); await ready(page); await expect(page.getByTestId('legacy-empty-area')).toHaveCount(0);
});

test('vědomě smazaná oblast se po reloadu neobnoví a její stav zůstává v GeoJSON exportu', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.getByRole('button', { name: 'Herní oblast', exact: true }).click();
  await page.getByRole('button', { name: 'Praha · všech 57 městských částí Polygon', exact: true }).click();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Smazat objekt', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).gameAreaInitialization?.state).toBe('intentionally-empty');
  await page.reload(); await ready(page); expect((await storedWorld(page)).layers[0].features).toEqual([]);
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportovat GeoJSON', exact: true }).click();
  const file = await promise, exported = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(exported.world.gameAreaInitialization.state).toBe('intentionally-empty');
  await page.getByRole('button', { name: /Import/, exact: true }).click(); await page.getByLabel('Co importovat').selectOption('world');
  await page.getByLabel('Soubor', { exact: true }).setInputFiles((await file.path())!);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Importovat', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0); await page.reload(); await ready(page);
  expect((await storedWorld(page)).layers[0].features).toEqual([]);
});

test('chyba výchozího souboru neuloží prázdný nový svět; opakovaná obnova dokončí inicializaci', async ({ page, context }) => {
  let offline = true; const contents = await readFile(boundaryFile, 'utf8');
  await context.route('**/defaults/prague-game-area.geojson', route => offline ? route.fulfill({ status: 503 }) : route.fulfill({ contentType: 'application/geo+json', body: contents }));
  await page.goto('/'); await ready(page); await expect(page.getByRole('alert')).toContainText('Automatické ukládání je pozastavené');
  expect(await rawStoredWorld(page)).toBeNull(); expect(await page.evaluate(key => localStorage.getItem(key), key)).toBeNull();
  offline = false; await page.getByRole('button', { name: 'Obnovit výchozí území Prahy', exact: true }).click();
  // UI commit precedes the asynchronous IndexedDB write; a missing first record is expected until it completes.
  await expect.poll(async () => (await rawStoredWorld(page))?.layers[0].features.length).toBe(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
