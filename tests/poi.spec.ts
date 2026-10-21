import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { newFeature, newWorld, type AreaGeometry } from '../packages/geo-core/src/index';
import { storedWorld } from './draft-helper';

const irregular: AreaGeometry = { type: 'Polygon', coordinates: [[[14.4, 50.07], [14.42, 50.07], [14.42, 50.074], [14.404, 50.074], [14.404, 50.09], [14.4, 50.09], [14.4, 50.07]]] };
const separate: AreaGeometry = { type: 'MultiPolygon', coordinates: [[[[14.43, 50.08], [14.44, 50.08], [14.44, 50.09], [14.43, 50.09], [14.43, 50.08]]], [[[14.45, 50.08], [14.46, 50.08], [14.46, 50.09], [14.45, 50.09], [14.45, 50.08]]]] };
function fixture(name = 'Testovací park A') { return { type: 'FeatureCollection', features: [ { type: 'Feature', properties: { stable: 'A', title: name, HIERARCHIE: 1 }, geometry: irregular }, { type: 'Feature', properties: { stable: 'B', title: 'Testovací park B', HIERARCHIE: 1 }, geometry: separate } ] }; }
async function ready(page: Page) { await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false'); }
async function importParks(page: Page, name?: string) {
  await page.getByRole('button', { name: 'Načíst / aktualizovat parky', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a aktualizace parků' });
  await dialog.getByLabel('GeoJSON parků / Shapefile ZIP', { exact: true }).setInputFiles({ name: 'synthetic-parks.geojson', mimeType: 'application/geo+json', buffer: Buffer.from(JSON.stringify(fixture(name))) });
  await dialog.getByLabel('Stálé ID zdroje').fill('synthetic-e2e');
  await dialog.getByLabel('Poskytovatel', { exact: true }).fill('Syntetická testovací data, nikoliv IPR');
  await dialog.getByLabel('URL zdroje / metadat').fill('https://example.test/parks');
  await dialog.getByLabel('Pole stabilního ID').fill('stable');
  await dialog.getByLabel('Pole názvu').fill('title');
  await dialog.getByLabel('Licence', { exact: true }).fill('Pouze testovací data');
  await dialog.getByRole('button', { name: 'Zkontrolovat import' }).click();
  await expect(dialog.getByText(/2 kandidátů/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Použít parkový zdroj' }).click();
  await expect(dialog).not.toBeVisible();
}
test.beforeEach(async ({ context }) => {
  await context.route('https://api.mapy.com/**', route => route.abort());
  await context.route('**/administrative/**', route => route.abort());
  await context.route('**/pid/index.json', route => route.fulfill({ status: 503, body: 'PID intentionally unavailable in POI UI test' }));
});

test('letiště jsou součástí nové aplikace, mají přesné souřadnice a přepínače přetrvají reload', async ({ page }) => {
  const failures: string[] = []; page.on('pageerror', e => failures.push(e.message));
  await page.goto('/'); await ready(page);
  await expect(page.getByTestId('poi-count-airport')).toHaveText('3 schválených · 0 neschválených');
  await expect(page.locator('.airport-marker')).toHaveCount(3);
  await page.getByRole('region', { name: 'Body zájmu' }).getByRole('button', { name: /Letiště Praha-Kbely/ }).click();
  await expect(page.getByTestId('poi-reference')).toHaveText('50.121367, 14.543639');
  await expect(page.locator('.poi-properties')).toContainText('LKKB');
  await page.getByLabel('Hledat POI', { exact: true }).fill('LKTC');
  await expect(page.locator('.poi-row')).toHaveCount(1);
  await page.locator('.poi-row button').click();
  await expect(page.getByTestId('poi-reference')).toHaveText('49.985278, 14.425556');
  await page.getByLabel('Letiště', { exact: true }).uncheck();
  await expect(page.locator('.airport-marker')).toHaveCount(0);
  await expect.poll(async () => (await storedWorld(page)).poi?.visibility.airports).toBe(false);
  await page.reload(); await ready(page);
  await expect(page.getByLabel('Letiště', { exact: true })).not.toBeChecked();
  await expect(page.locator('.airport-marker')).toHaveCount(0);
  await page.getByLabel('Letiště', { exact: true }).check(); await expect(page.locator('.airport-marker')).toHaveCount(3);
  expect(failures).toEqual([]);
});

test('park import: revize, ruční bod, aktualizace, vyloučení, skutečné sloučení a GeoJSON záloha zachovají svět', async ({ page }) => {
  test.setTimeout(60000);
  const own = newWorld(); own.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [[[14.38, 50.06], [14.48, 50.06], [14.48, 50.1], [14.38, 50.1], [14.38, 50.06]]] }, 'Moje herní oblast')];
  own.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.41, 50.08] }, 'Můj vlastní objekt')];
  await page.addInitScript(serialized => { if (!localStorage.getItem('jetlag-praha:world:v1')) localStorage.setItem('jetlag-praha:world:v1', serialized); }, JSON.stringify(own));
  await page.goto('/'); await ready(page); await importParks(page);
  await expect(page.getByTestId('poi-count-park')).toContainText('0 schválených · 2 neschválených');
  await page.locator('.poi-list').getByRole('button', { name: /Testovací park A/ }).click();
  await page.getByLabel('Název parku', { exact: true }).fill('Moje ruční jméno');
  await page.getByRole('button', { name: 'Uložit park', exact: true }).click();
  await page.getByLabel('Délka referenčního bodu').fill('14.401'); await page.getByLabel('Šířka referenčního bodu').fill('50.08');
  await page.getByRole('button', { name: 'Uložit referenční bod', exact: true }).click();
  await page.getByRole('button', { name: 'Schválit park', exact: true }).click();
  await expect(page.getByTestId('poi-count-park')).toContainText('1 schválených · 1 neschválených');
  await page.getByLabel('Délka referenčního bodu').fill('14.41'); // notch outside concave polygon
  await page.getByRole('button', { name: 'Uložit referenční bod', exact: true }).click();
  await expect(page.locator('.message.error')).toContainText('uvnitř parku');
  await page.getByRole('button', { name: 'Zavřít chybu', exact: true }).click();
  await page.locator('.poi-list').getByRole('button', { name: /Testovací park B/ }).click();
  await page.getByRole('button', { name: 'Vyloučit park', exact: true }).click();
  await importParks(page, 'Změněný název ve zdroji');
  await page.reload(); await ready(page);
  await expect.poll(async () => (await storedWorld(page)).poi?.sources[0].records[0].name).toBe('Změněný název ve zdroji');
  await page.locator('.poi-list').getByRole('button', { name: /Moje ruční jméno/ }).click();
  await expect(page.getByTestId('poi-reference')).toHaveText('50.080000, 14.401000');
  await expect(page.locator('.poi-status')).toHaveText('Schváleno');
  const beforeMerge = await storedWorld(page);
  expect(beforeMerge.layers).toEqual(own.layers); expect(beforeMerge.poi?.decisions.find(d => d.id.endsWith(':B'))?.status).toBe('excluded');
  await page.getByLabel('Sloučit Moje ruční jméno', { exact: true }).check();
  await page.getByLabel('Sloučit Testovací park B', { exact: true }).check();
  await page.getByLabel('Společný název parku').fill('Sloučený park');
  await page.getByRole('button', { name: 'Sloučit 2 částí parku', exact: true }).click();
  await expect(page.locator('.poi-properties')).toContainText('MultiPolygon');
  await page.getByRole('button', { name: 'Schválit park', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.manual.length).toBe(1);
  const saved = await storedWorld(page);
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportovat GeoJSON', exact: true }).click();
  const path = (await (await download).path())!; const exported = JSON.parse(await readFile(path, 'utf8'));
  expect(exported.world.poi).toEqual(saved.poi);
  await page.getByRole('button', { name: /Import$/, exact: true }).click(); await page.getByLabel('Co importovat').selectOption('world');
  await page.getByLabel('Soubor', { exact: true }).setInputFiles(path);
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Importovat', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await storedWorld(page)).poi).toEqual(saved.poi);
  expect((await storedWorld(page)).layers).toEqual(own.layers);
});

test('ručně kreslený park vytvoří platnou geometrii oddělenou od vlastních vrstev a projde undo/redo', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.getByRole('button', { name: '+ Nakreslit park', exact: true }).click();
  const box = (await page.getByTestId('map').boundingBox())!;
  for (const [x, y] of [[140, 220], [300, 220], [300, 380], [140, 380], [140, 220]]) await page.mouse.click(box.x + x, box.y + y);
  await expect(page.getByRole('heading', { name: 'Park bez doloženého názvu' })).toBeVisible();
  await expect.poll(async () => (await storedWorld(page)).poi?.manual.length).toBe(1);
  expect((await storedWorld(page)).layers[1].features).toEqual([]);
  await page.getByRole('button', { name: 'Schválit park', exact: true }).click(); await expect(page.locator('.message.error')).toContainText('název');
  await page.getByLabel('Název parku', { exact: true }).fill('Ručně vymezený park'); await page.getByRole('button', { name: 'Uložit park', exact: true }).click();
  await page.getByRole('button', { name: 'Schválit park', exact: true }).click();
  await expect(page.getByTestId('poi-count-park')).toContainText('1 schválených');
  await page.getByRole('button', { name: 'Zpět', exact: true }).click();
  await expect(page.getByTestId('poi-count-park')).toContainText('0 schválených');
  await page.getByRole('button', { name: 'Znovu', exact: true }).click();
  await expect(page.getByTestId('poi-count-park')).toContainText('1 schválených');
  await page.getByLabel('Zobrazit také parky mimo vybrané hierarchie', { exact: true }).check();
  await page.locator('.poi-list').getByRole('button', { name: /Ručně vymezený park/ }).click();
  const beforePoint = (await storedWorld(page)).poi!.manual[0].point;
  await page.getByRole('button', { name: 'Přesunout bod parku v mapě', exact: true }).click();
  const marker = (await page.locator('.park-marker.selected').boundingBox())!;
  const x = marker.x + marker.width / 2, y = marker.y + marker.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 20, y + 10, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions[0]?.point).not.toEqual(beforePoint);
  const movedPoint = (await storedWorld(page)).poi!.decisions[0].point;
  await page.reload(); await ready(page); await expect(page.getByTestId('poi-count-park')).toContainText('1 schválených');
  expect((await storedWorld(page)).poi!.decisions[0].point).toEqual(movedPoint);
});
