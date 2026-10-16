import { expect, test, type Page } from '@playwright/test';
import { shapeZip, fixtureArea } from '../packages/geo-core/src/test-fixtures/park-zip';
import { storedWorld } from './draft-helper';
import { readFile } from 'node:fs/promises';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import a aktualizace parků' });
async function upload(page: Page, bytes: Uint8Array) {
  await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
  await dialog(page).getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'MPP_CUR_MPP_100_PARKY_P.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await expect(dialog(page).getByText(/S-JTSK/)).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: 'Kontrola rozdílů', exact: true })).toBeVisible();
}
test.beforeEach(async ({ context, page }) => {
  await context.route('https://api.mapy.com/**', route => route.abort());
  await context.route('**/administrative/**', route => route.abort());
  await context.route('**/pid/index.json', route => route.fulfill({ status: 503 }));
  await page.goto('/'); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
});
test('původní Shapefile ZIP: automatické rozpoznání, český název, uložení a opakovaná aktualizace zachovají revizi a vlastní svět', async ({ page }) => {
  const before = await storedWorld(page); await upload(page, shapeZip());
  await expect(dialog(page)).toContainText('1 kandidátů · 1 nových · 0 změněných · 0 chybějících');
  await dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click(); await expect(dialog(page)).toHaveCount(0);
  await page.locator('.poi-list').getByRole('button', { name: /Ďáblický háj/ }).click(); await page.getByRole('button', { name: 'Schválit park', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions[0].status).toBe('approved');
  await upload(page, shapeZip()); await expect(dialog(page)).toContainText('1 kandidátů · 0 nových · 0 změněných · 0 chybějících');
  await dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click();
  await page.reload(); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
  const saved = await storedWorld(page); expect(saved.layers).toEqual(before.layers); expect(saved.poi?.decisions[0].status).toBe('approved');
  expect(saved.poi?.sources[0].importRecord).toMatchObject({ format: 'shapefile-zip', layerName: 'MPP_100_Parky_p', encoding: 'utf-8' });
});
test('shodné ID se automaticky sloučí, zachovají názvy i původní data a náhled nic nezapíše', async ({ page }) => {
  const original = await storedWorld(page);
  await upload(page, shapeZip([{ id: 2773, name: 'Park u OC Letňany', geometry: fixtureArea }, { id: 2773, name: 'Park u OC Letňany II.', geometry: fixtureArea }]));
  await expect(dialog(page).getByRole('heading', { name: 'Automatické sloučení shodných ID', exact: true })).toBeVisible();
  await expect(dialog(page)).toContainText('ID 2773 · 2 záznamů → 1 park');
  await expect(dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true })).toBeEnabled();
  await expect(dialog(page).getByLabel('Stabilní klíč objektu 1')).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Zobrazit sloučený park 2773 v mapě' }).click();
  await expect(page.getByTestId('map')).toHaveAttribute('data-park-import-preview', 'shown');
  expect((await storedWorld(page)).layers).toEqual(original.layers); expect((await storedWorld(page)).poi).toEqual(original.poi);
  await page.getByRole('button', { name: 'Zpět k náhledu importu', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.sources[0].records.length).toBe(1);
  const park = (await storedWorld(page)).poi!.sources[0].records[0];
  expect(park.sourceId).toBe('2773'); expect(park.id).toBe('park:ipr-mpp-100-parky:2773');
  expect(park.importAudit?.sourceNames).toEqual(['Park u OC Letňany', 'Park u OC Letňany II.']);
  await page.locator('.poi-list').getByRole('button', { name: /Park u OC Letňany/ }).click();
  await expect(page.locator('.poi-properties')).toContainText('Automatické zpracování geometrie a ID');
});
test('ZIP se samodotykem se opraví ve workeru automaticky a audit přežije uložení i reload', async ({ page }) => {
  const geometry = { type: 'Polygon' as const, coordinates: [[...fixtureArea.coordinates[0], [14.4, 50.06], [14.39, 50.06], [14.39, 50.07], [14.4, 50.07]]] };
  await upload(page, shapeZip([{ id: 3121, name: 'Syntetický park se samodotykem', geometry }]));
  await expect(dialog(page)).toContainText('Opraveno a ověřeno');
  const auditDownload = page.waitForEvent('download'); await dialog(page).getByRole('button', { name: 'Stáhnout diagnostiku a audit' }).click();
  const audit = JSON.parse(await readFile((await (await auditDownload).path())!, 'utf8'));
  expect(audit.repairs[0]).toMatchObject({ sourceId: '3121', accepted: true }); expect(audit.originalFeatures).toHaveLength(1);
  await dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(async () => (await storedWorld(page)).poi?.sources[0].records[0].geometry.type).toBe('MultiPolygon');
  await page.reload(); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
  const saved = await storedWorld(page);
  expect(saved.poi?.sources[0].records[0].importAudit?.repairedRows).toEqual([1]);
  expect(saved.poi?.sources[0].importRecord).toMatchObject({ repairs: [{ sourceId: '3121', accepted: true }], originalFeatures: audit.originalFeatures });
});
test('originální IPR ZIP automaticky nabídne 952 parků a zachová je po reloadu', async ({ page }) => {
  test.skip(!process.env.PARKS_ZIP, 'Originální ZIP je pro audit potřeba dodat přes PARKS_ZIP.');
  test.setTimeout(120000);
  await upload(page, new Uint8Array(await readFile(process.env.PARKS_ZIP!)));
  await expect(dialog(page)).toContainText('952 kandidátů');
  await expect(dialog(page).getByText(/Opraveno a ověřeno/)).toHaveCount(3);
  await expect(dialog(page)).toContainText('ID 2773 · 2 záznamů → 1 park');
  await dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click();
  await expect(dialog(page)).toHaveCount(0, { timeout: 60000 });
  await expect.poll(async () => (await storedWorld(page)).poi?.sources[0].records.length, { timeout: 30000 }).toBe(952);
  await page.reload(); await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false', { timeout: 30000 });
  const saved = await storedWorld(page); expect(saved.poi!.sources[0].records).toHaveLength(952);
  expect(saved.poi!.sources[0].records.filter(park => park.importAudit?.repairedRows.length)).toHaveLength(3);
  expect(saved.poi!.sources[0].records.filter(park => park.sourceId === '2773')).toHaveLength(1);
});
test('více chybných geometrií má původní ID, jméno i mapový náhled; zavření importu ponechá databázi beze změny', async ({ page }) => {
  const before = await storedWorld(page); const geometry = { type: 'Polygon', coordinates: [[[14.4, 50.07], [14.42, 50.09], [14.42, 50.07], [14.4, 50.09], [14.4, 50.07]]] };
  await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
  await dialog(page).getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'bad.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify({ type: 'FeatureCollection', features: [1, 2].map(ID => ({ type: 'Feature', properties: { ID, NAZEV: `Chybný park ${ID}` }, geometry })) })) });
  await expect(dialog(page).getByLabel('Pole stabilního ID')).toHaveValue('ID');
  await dialog(page).getByRole('button', { name: 'Zkontrolovat import', exact: true }).click();
  await expect(dialog(page)).toContainText('Objekt 1 · ID 1 · Chybný park 1'); await expect(dialog(page)).toContainText('Objekt 2 · ID 2 · Chybný park 2');
  await expect(dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true })).toHaveCount(0);
  await dialog(page).getByRole('button', { name: 'Zobrazit objekt 2 v mapě', exact: true }).click();
  await expect(page.getByTestId('map')).toHaveAttribute('data-park-import-preview', 'shown');
  await page.getByRole('button', { name: 'Zrušit celý import', exact: true }).click();
  await expect(page.getByTestId('map')).toHaveAttribute('data-park-import-preview', 'none');
  expect(await storedWorld(page)).toEqual(before);
});

test('zrušení načítaného workeru ponechá editor ovladatelný a nic nezapíše', async ({ page }) => {
  const before = await storedWorld(page); let release = () => {}; let blocked = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/park-import.worker.ts*', async route => { blocked = true; await gate; await route.continue().catch(() => {}); });
  try {
    await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
    await dialog(page).getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'MPP_CUR_MPP_100_PARKY_P.zip', mimeType: 'application/zip', buffer: Buffer.from(shapeZip()) });
    await expect.poll(() => blocked).toBe(true);
    await dialog(page).getByRole('button', { name: 'Zrušit zpracování a zavřít', exact: true }).click();
    await expect(dialog(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Nastavení mapy', exact: true }).click();
    await expect(page.getByLabel('Klientský API klíč Mapy.com', { exact: true })).toBeVisible();
    expect(await storedWorld(page)).toEqual(before);
  } finally { release(); }
});
