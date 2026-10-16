import { expect, test, type Page } from '@playwright/test';
import { shapeZip, fixtureArea } from '../packages/geo-core/src/test-fixtures/park-zip';
import { storedWorld } from './draft-helper';
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import a aktualizace parků' });
async function upload(page: Page, bytes: Uint8Array) {
  await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
  await dialog(page).getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'MPP_CUR_MPP_100_PARKY_P.zip', mimeType: 'application/zip', buffer: Buffer.from(bytes) });
  await expect(dialog(page).getByText(/S-JTSK/)).toBeVisible();
  await expect(dialog(page).getByLabel('Stálé ID zdroje')).toHaveValue('ipr-mpp-100-parky');
  await expect(dialog(page).getByLabel('Pole stabilního ID')).toHaveValue('ID');
  await expect(dialog(page).getByLabel('Pole názvu')).toHaveValue('NAZEV');
  await dialog(page).getByRole('button', { name: 'Zkontrolovat import', exact: true }).click();
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
test('duplicitní ID vyžadují potvrzení, návrhy nejsou pořadová čísla a diagnostický náhled nemění data', async ({ page }) => {
  const original = await storedWorld(page);
  await upload(page, shapeZip([{ id: 0, name: 'Díl A', geometry: fixtureArea }, { id: 0, name: 'Díl B', geometry: fixtureArea }]));
  await expect(dialog(page).getByRole('heading', { name: 'Kontrola duplicitních ID', exact: true })).toBeVisible();
  await expect(dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true })).toHaveCount(0);
  await expect(dialog(page).getByLabel('Stabilní klíč objektu 1')).toHaveAttribute('placeholder', /^0~[a-f0-9]{16}$/);
  await dialog(page).getByRole('button', { name: 'Zobrazit duplicitu 1 v mapě' }).click();
  await expect(page.getByTestId('map')).toHaveAttribute('data-park-import-preview', 'shown');
  expect((await storedWorld(page)).layers).toEqual(original.layers); expect((await storedWorld(page)).poi).toEqual(original.poi);
  await page.getByRole('button', { name: 'Zpět k náhledu importu', exact: true }).click();
  await dialog(page).getByLabel('Potvrzuji propojení duplicitních objektů podle stabilních klíčů').check();
  await dialog(page).getByRole('button', { name: 'Znovu ověřit identity', exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Použít parkový zdroj', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.sources[0].records.length).toBe(2);
  const records = (await storedWorld(page)).poi!.sources[0].records;
  expect(records.every(record => record.sourceId === '0')).toBe(true); expect(new Set(records.map(record => record.id)).size).toBe(2);
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
