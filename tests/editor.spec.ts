import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { newWorld, newFeature, type WorldDraft } from '../packages/geo-core/src/index';

const key = 'jetlag-praha:world:v1';
const world = (page: Page) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!) as WorldDraft, key);
async function clickMap(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('map').boundingBox())!;
  await page.mouse.click(box.x + x, box.y + y);
}
async function drawPolygon(page: Page, positions: number[][]) {
  for (const [x, y] of [...positions, positions[0]]) await clickMap(page, x, y);
}
test.beforeEach(async ({ page }) => {
  // Živé mapové dlaždice bez klíče nejsou předmětem těchto testů.
  await page.route('https://api.mapy.com/**', route => route.request().url().includes('/maptiles/')
    ? route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Invalid API key (test fixture)"}' })
    : route.abort());
});

test('nakreslí herní polygon s otvorem, bod a linii, upraví vrcholy, uloží a obnoví export', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', e => failures.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Chybí API klíč Mapy.com')).toBeVisible();
  await page.getByRole('button', { name: 'Herní oblast', exact: true }).click();
  await page.getByRole('button', { name: /Polygon/, exact: true }).click();
  await drawPolygon(page, [[130, 200], [400, 200], [400, 450], [130, 450]]);
  await expect.poll(async () => (await world(page)).layers[0].features.length).toBe(1);
  await page.getByRole('button', { name: /Otvor/, exact: true }).click();
  await drawPolygon(page, [[200, 280], [300, 280], [300, 370], [200, 370]]);
  await expect.poll(async () => (await world(page)).layers[0].features[0].geometry.coordinates.length).toBe(2);
  const original = (await world(page)).layers[0].features[0].geometry;
  await page.getByRole('button', { name: 'Upravit vrcholy v mapě' }).click();
  const handles = page.locator('.leaflet-marker-icon.marker-icon:not(.marker-icon-middle)');
  await expect(handles.first()).toBeVisible();
  const handle = (await handles.first().boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down(); await page.mouse.move(handle.x - 20, handle.y - 20, { steps: 8 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Uložit geometrii', exact: true }).click();
  await expect.poll(async () => JSON.stringify((await world(page)).layers[0].features[0].geometry)).not.toBe(JSON.stringify(original));
  await page.getByRole('button', { name: 'Vlastní objekty', exact: true }).click();
  await page.getByRole('button', { name: /Bod/, exact: true }).click();
  await clickMap(page, 500, 250);
  await expect.poll(async () => (await world(page)).layers[1].features.length).toBe(1);
  await page.getByLabel('Jméno', { exact: true }).fill('Můj vlastní bod');
  await page.getByLabel('Poznámka', { exact: true }).fill('Ruční poznámka');
  await page.getByRole('button', { name: 'Uložit vlastnosti' }).click();
  await page.getByRole('button', { name: /Linie/, exact: true }).click();
  await clickMap(page, 500, 300); await clickMap(page, 570, 410); await clickMap(page, 570, 410);
  await expect.poll(async () => (await world(page)).layers[1].features.length).toBe(2);
  const saved = await world(page);
  await page.reload();
  expect(await world(page)).toEqual(saved);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export zálohy/ }).click();
  const file = await downloadPromise;
  const path = (await file.path())!;
  const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.world).toEqual(saved);
  await page.getByRole('button', { name: /Přidat vrstvu/ }).click();
  await page.getByRole('button', { name: /Import/, exact: true }).click();
  await page.getByLabel('Co importovat').selectOption('world');
  await page.getByLabel('Soubor', { exact: true }).setInputFiles(path);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Importovat', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const restored = await world(page);
  expect(restored.layers).toEqual(saved.layers);
  expect(restored.id).toBe(saved.id);
  expect(failures).toEqual([]);
});

test('vytvoří metrický kruh nezávislý na zoomu, měří a zvládne opakované undo/redo', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Kruh/, exact: true }).click();
  await page.getByLabel('Poloměr nového kruhu (m)').fill('250');
  await clickMap(page, 300, 250);
  await expect.poll(async () => (await world(page)).layers[1].features.length).toBe(1);
  const geometry = (await world(page)).layers[1].features[0].geometry;
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect((await world(page)).layers[1].features[0].geometry).toEqual(geometry);
  await page.getByLabel('Poloměr (m)', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'Přepočítat kruh' }).click();
  expect((await world(page)).layers[1].features[0].circle!.radiusMeters).toBe(500);
  await page.getByRole('button', { name: 'Zpět', exact: true }).click();
  expect((await world(page)).layers[1].features[0].circle!.radiusMeters).toBe(250);
  await page.getByRole('button', { name: 'Zpět', exact: true }).click();
  expect((await world(page)).layers[1].features.length).toBe(0);
  await page.getByRole('button', { name: 'Znovu', exact: true }).click();
  await page.getByRole('button', { name: 'Znovu', exact: true }).click();
  expect((await world(page)).layers[1].features[0].circle!.radiusMeters).toBe(500);
  await page.getByRole('button', { name: /Měření/, exact: true }).click();
  await clickMap(page, 300, 250); await clickMap(page, 400, 300);
  await expect(page.getByText(/km\. Další kliknutí/)).toBeVisible();
});

test('zachová importovaný MultiPolygon a jeho otvory i po editaci vrcholů', async ({ page }) => {
  const draft = newWorld();
  draft.layers[0].features.push(newFeature({ type: 'MultiPolygon', coordinates: [
    [[[14.40, 50.05], [14.43, 50.05], [14.43, 50.08], [14.40, 50.08], [14.40, 50.05]], [[14.41, 50.06], [14.42, 50.06], [14.42, 50.07], [14.41, 50.07], [14.41, 50.06]]],
    [[[14.46, 50.05], [14.49, 50.05], [14.49, 50.08], [14.46, 50.08], [14.46, 50.05]]],
  ] }));
  await page.addInitScript(({ key, serialized }) => localStorage.setItem(key, serialized), { key, serialized: JSON.stringify(draft) });
  await page.goto('/');
  await page.getByRole('button', { name: 'Herní oblast', exact: true }).click();
  await page.getByRole('button', { name: /Nový objekt/ }).click();
  await page.getByRole('button', { name: 'Upravit vrcholy v mapě' }).click();
  await expect(page.locator('.marker-icon:not(.marker-icon-middle)')).toHaveCount(12);
  await page.getByRole('button', { name: 'Uložit geometrii', exact: true }).click();
  expect((await world(page)).layers[0].features[0].geometry).toEqual(draft.layers[0].features[0].geometry);
});

test('vadný import je atomický, poškozený draft se nepřepíše a neplatný klíč má hlášení', async ({ page }) => {
  await page.addInitScript(key => localStorage.setItem(key, '{bad'), key);
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Uložený draft nelze načíst');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{bad');
  await page.getByRole('button', { name: /Import/, exact: true }).click();
  await page.getByLabel('Popis zdroje / licence').fill('Syntetický test');
  await page.getByLabel('Soubor', { exact: true }).setInputFiles({ name: 'invalid.geojson', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ type: 'Point', coordinates: [181, 50] })) });
  await page.getByRole('button', { name: 'Importovat', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('WGS84');
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe('{bad');
  await page.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await page.getByRole('button', { name: 'Nastavení mapy' }).click();
  await page.getByLabel('Klientský API klíč Mapy.com').fill('invalid-test-key');
  await page.getByRole('button', { name: 'Použít klíč' }).click();
  await expect(page.getByText('Mapový podklad se nepodařilo načíst')).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export zálohy/ }).click();
  expect(await readFile((await (await downloaded).path())!, 'utf8')).not.toContain('invalid-test-key');
});
