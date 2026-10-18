import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { applyParkUpdate, defaultGameStopConfiguration, defaultPoiConfiguration, importParkGeoJson, newFeature, newWorld } from '../packages/geo-core/src/index';
import { storedWorld } from './draft-helper';

const source = { id: 'hierarchy-e2e', provider: 'Syntetická data', url: null, license: { name: 'Test', url: null }, dataDate: null, retrievedAt: '2026-10-18T08:00:00Z', verification: 'user_supplied' as const, note: 'Syntetická fixture' };
async function data(ids = [1, 2, 3, 4, 5, 6]) {
  return importParkGeoJson(JSON.stringify({ type: 'FeatureCollection', features: ids.map(id => ({ type: 'Feature', properties: { ID: id, NAZEV: id === 6 ? '' : `Testovací park ${id}`, HIERARCHIE: [1, '1', 2, 3, null, 1, 1][id - 1] }, geometry: { type: 'Polygon', coordinates: [[[14.4 + id / 100, 50.07], [14.405 + id / 100, 50.07], [14.405 + id / 100, 50.075], [14.4 + id / 100, 50.075], [14.4 + id / 100, 50.07]]] } })) }), { source, idField: 'ID', nameField: 'NAZEV' });
}
async function waitSaved(page: Page) { await expect(page.locator('.storage-note')).toContainText('Uloženo'); }
async function bulk(page: Page, status: 'approved' | 'excluded', expected: number, accept = true) {
  const confirmation = page.waitForEvent('dialog');
  const clicked = page.getByRole('button', { name: status === 'approved' ? 'Schválit všechny parky vybraných hierarchií' : 'Vyloučit všechny parky vybraných hierarchií', exact: true }).click();
  const dialog = await confirmation; expect(dialog.message()).toContain(`(${expected})`);
  if (accept) await dialog.accept(); else await dialog.dismiss();
  await clicked; if (accept) { await expect(page.getByText('Zpracovávám parky v dávkách…', { exact: true })).toHaveCount(0); await waitSaved(page); }
}

test.beforeEach(async ({ context, page }) => {
  await context.route('https://api.mapy.com/**', route => route.abort()); await context.route('**/administrative/**', route => route.abort()); await context.route('**/pid/index.json', route => route.fulfill({ status: 503 }));
  const world = newWorld(); world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.4, 50.07] }, 'Moje vrstva')]; world.gameStops = defaultGameStopConfiguration();
  world.poi = applyParkUpdate(defaultPoiConfiguration(), await data());
  await page.addInitScript(serialized => { if (!localStorage.getItem('jetlag-praha:world:v1')) localStorage.setItem('jetlag-praha:world:v1', serialized); }, JSON.stringify(world));
  await page.goto('/'); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false'); await waitSaved(page);
});

test('hierarchie filtrují mapu i seznam; dávka ignoruje hledání a výřez, přeskočí chybu, zachová data a přetrvá reload', async ({ page }) => {
  const before = await storedWorld(page);
  await expect(page.getByLabel('Hierarchie 1 – metropolitní')).toBeChecked(); await expect(page.getByLabel('Hierarchie 2 – čtvrťové')).not.toBeChecked();
  await expect(page.getByRole('region', { name: 'Výběr parků podle hierarchie' })).toContainText('Hierarchie 1 – metropolitní (3)');
  await expect(page.locator('.poi-polygon.review')).toHaveCount(3); await expect(page.getByTestId('park-total')).toHaveText('6');
  await page.getByLabel('Hledat POI', { exact: true }).fill('žádný výsledek');
  await page.getByLabel('Hierarchie 2 – čtvrťové').check(); await waitSaved(page);
  // One draft write for the entire batch, not one write per park.
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as unknown as { parkWrites: number }).parkWrites = 0; IDBObjectStore.prototype.put = function(value, key) { if (this.name === 'drafts') (window as unknown as { parkWrites: number }).parkWrites++; return key === undefined ? original.call(this, value) : original.call(this, value, key); }; });
  await bulk(page, 'approved', 4);
  await expect(page.getByTestId('park-approved')).toHaveText('3'); await expect(page.locator('.park-bulk-notice')).toContainText('Přeskočeno: 1'); await expect(page.locator('.park-bulk-notice')).toContainText('název');
  await expect(page.locator('.poi-polygon.approved')).toHaveCount(3);
  expect(await page.evaluate(() => (window as unknown as { parkWrites: number }).parkWrites)).toBe(1);
  const saved = await storedWorld(page); expect(saved.layers).toEqual(before.layers); expect(saved.gameStops).toEqual(before.gameStops); expect(saved.poi?.sources).toEqual(before.poi?.sources);
  await page.reload(); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('park-approved')).toHaveText('3'); await expect(page.getByLabel('Hierarchie 2 – čtvrťové')).toBeChecked();
  await page.getByLabel('Hledat POI', { exact: true }).fill('Testovací park 3');
  await page.locator('.poi-list').getByRole('button', { name: /Testovací park 3/ }).click();
  await page.getByRole('button', { name: 'Vyřadit ze hry', exact: true }).click(); await expect(page.getByTestId('park-excluded')).toHaveText('1');
  await page.getByRole('button', { name: 'Vrátit do hry', exact: true }).click(); await expect(page.getByTestId('park-approved')).toHaveText('3');
});

test('náhled hry ukáže i schválenou výjimku mimo hierarchie; vyřazení zmizí z mapy a vrácení ji okamžitě obnoví', async ({ page }) => {
  await bulk(page, 'approved', 3);
  await page.getByLabel('Zobrazit také parky mimo vybrané hierarchie', { exact: true }).check();
  await page.locator('.poi-list').getByRole('button', { name: /Testovací park 4/ }).click(); await page.getByRole('button', { name: 'Schválit park', exact: true }).click();
  await page.getByLabel('Zobrazit také parky mimo vybrané hierarchie', { exact: true }).uncheck();
  await page.getByLabel('Zobrazit jen parky ve hře', { exact: true }).check();
  await expect(page.locator('.poi-polygon.approved')).toHaveCount(3); await expect(page.locator('.poi-polygon.review, .poi-polygon.excluded')).toHaveCount(0);
  await page.locator('.poi-polygon.approved').first().dispatchEvent('click');
  await expect(page.locator('.poi-properties .poi-status')).toHaveText('Schváleno');
  await page.getByRole('button', { name: 'Vyřadit ze hry', exact: true }).click();
  await expect(page.locator('.poi-polygon.approved')).toHaveCount(2); await expect(page.getByTestId('park-excluded')).toHaveText('1');
  await page.getByRole('button', { name: 'Vrátit do hry', exact: true }).click(); await expect(page.locator('.poi-polygon.approved')).toHaveCount(3);
  await page.getByLabel('Zobrazit také parky mimo vybrané hierarchie', { exact: true }).check();
  await page.getByRole('group', { name: 'Filtr stavu parků' }).getByRole('button', { name: 'Schválené', exact: true }).click();
  await expect(page.locator('.poi-row[data-poi-id^="park:"]')).toHaveCount(3);
  await waitSaved(page); await page.reload(); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByLabel('Zobrazit jen parky ve hře', { exact: true })).toBeChecked(); await expect(page.locator('.poi-polygon.approved')).toHaveCount(3);
  await page.getByLabel('Zobrazit jen parky ve hře', { exact: true }).uncheck();
  await page.getByRole('group', { name: 'Filtr stavu parků' }).getByRole('button', { name: 'Vše', exact: true }).click();
  await expect(page.locator('.poi-polygon')).toHaveCount(6);
});

test('potvrzení lze zrušit, vyloučení i schválení jsou vratné jednou akcí a pozdější individuální rozhodnutí zůstane', async ({ page }) => {
  await bulk(page, 'approved', 3, false); await expect(page.getByTestId('park-approved')).toHaveText('0');
  await bulk(page, 'approved', 3); await expect(page.getByTestId('park-approved')).toHaveText('2');
  await page.locator('.poi-list').getByRole('button', { name: /Testovací park 2/ }).click(); await page.getByRole('button', { name: 'Vyřadit ze hry', exact: true }).click();
  await page.getByRole('button', { name: 'Vrátit poslední hromadnou akci', exact: true }).click();
  await expect(page.getByTestId('park-approved')).toHaveText('0'); await expect(page.getByTestId('park-excluded')).toHaveText('1');
  await expect(page.locator('.park-bulk-notice')).toContainText('Zachováno pozdějších individuálních změn: 1');
  await bulk(page, 'excluded', 3); await expect(page.getByTestId('park-excluded')).toHaveText('3');
  await page.getByRole('button', { name: 'Vrátit poslední hromadnou akci', exact: true }).click();
  await expect(page.getByTestId('park-excluded')).toHaveText('1');
});

test('aktualizace zdroje zachová hromadná i ruční rozhodnutí; nový metropolitní park zůstane k revizi', async ({ page }) => {
  await bulk(page, 'approved', 3); const before = await storedWorld(page);
  const dataset = await data([1, 2, 3, 4, 5, 6, 7]);
  // Exercise the actual source update action by importing the new GeoJSON.
  await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a aktualizace parků' });
  const features = dataset.records.map(poi => ({ type: 'Feature', geometry: poi.geometry, properties: poi.attributes }));
  await dialog.getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'parks.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features })) });
  await expect(dialog.getByLabel('Pole stabilního ID')).toHaveValue('ID');
  await dialog.getByLabel('Stálé ID zdroje').fill(source.id); await dialog.getByRole('button', { name: 'Zkontrolovat import', exact: true }).click();
  await dialog.getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click(); await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await storedWorld(page)).poi?.sources[0].records.length).toBe(7);
  const updated = await storedWorld(page); expect(updated.poi?.decisions).toEqual(before.poi?.decisions);
  await expect(page.getByTestId('park-approved')).toHaveText('2'); await expect(page.getByTestId('park-review')).toHaveText('5');
});

test('originální ZIP: počty hierarchií a dávkové schválení všech 952 parků', async ({ page }) => {
  test.skip(!process.env.PARKS_ZIP, 'Vyžaduje originální IPR ZIP přes PARKS_ZIP.'); test.setTimeout(120000);
  await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a aktualizace parků' });
  await dialog.getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'MPP_CUR_MPP_100_PARKY_P.zip', mimeType: 'application/zip', buffer: await readFile(process.env.PARKS_ZIP!) });
  await expect(dialog).toContainText('952 kandidátů', { timeout: 30000 }); await dialog.getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click(); await expect(dialog).toHaveCount(0, { timeout: 60000 });
  // The six pre-existing synthetic parks are a different source and remain.
  await expect.poll(async () => (await storedWorld(page)).poi?.sources.find(s => s.source.id === 'ipr-mpp-100-parky')?.records.length, { timeout: 30000 }).toBe(952);
  const saved = await storedWorld(page); const records = saved.poi!.sources.find(s => s.source.id === 'ipr-mpp-100-parky')!.records;
  expect(records).toHaveLength(952);
  const count = records.filter(poi => Number(poi.attributes.HIERARCHIE) === 1).length + 3;
  await expect(page.getByRole('region', { name: 'Výběr parků podle hierarchie' })).toContainText(`Hierarchie 1 – metropolitní (${count})`);
  for (const title of ['Hierarchie 2 – čtvrťové', 'Hierarchie 3 – lokalitní', 'Hierarchie 4 – místní', 'Bez určené hierarchie']) await page.getByLabel(title).check();
  await bulk(page, 'approved', 958); await expect(page.getByTestId('park-approved')).toHaveText('957');
  await page.getByLabel('Zobrazit jen parky ve hře', { exact: true }).check(); await expect(page.locator('.poi-polygon.review, .poi-polygon.excluded')).toHaveCount(0);
});
