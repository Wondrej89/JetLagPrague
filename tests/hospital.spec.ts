import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { storedWorld } from './draft-helper';
import { readGameReleaseArtifact, readGameReleaseIndex } from '../packages/geo-core/src/index';

async function ready(page: Page) {
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByTestId('poi-count-hospital')).toHaveText('10 schválených · 0 neschválených');
  await expect.poll(async () => (await storedWorld(page)).poi?.pointCatalog?.filter(poi => poi.category === 'hospital').length).toBe(10);
}
test.beforeEach(async ({ page }) => { await page.route('https://api.mapy.com/**', route => route.abort()); });

test('nový prohlížeč má deset nemocnic, nezávislou viditelnost, hledání, výběr a přesné body s nedodanou adresou', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await ready(page);
  await expect(page.locator('.hospital-marker')).toHaveCount(10); await expect(page.getByTestId('map')).toHaveAttribute('data-poi-hospital-count', '10');
  await expect(page.locator('.zoo-marker')).toHaveCount(10); await expect(page.locator('.airport-marker')).toHaveCount(3);
  await page.getByLabel('Nemocnice', { exact: true }).uncheck(); await expect(page.locator('.hospital-marker')).toHaveCount(0);
  await expect(page.locator('.zoo-marker')).toHaveCount(10);
  await expect.poll(async () => (await storedWorld(page)).poi?.visibility.hospitals).toBe(false);
  await page.reload(); await expect(page.getByLabel('Nemocnice', { exact: true })).not.toBeChecked();
  await page.getByLabel('Nemocnice', { exact: true }).check();
  await page.getByLabel('Hledat POI').fill('hospital-bulovka'); await expect(page.locator('.poi-row')).toHaveCount(1);
  await page.locator('[data-poi-id="hospital-bulovka"] button').click();
  await expect(page.getByLabel('Zeměpisná šířka nemocnice')).toHaveValue('50.1155525'); await expect(page.getByLabel('Zeměpisná délka nemocnice')).toHaveValue('14.4643531');
  await expect(page.getByLabel('Adresa nemocnice (volitelná)')).toHaveValue('Budínova 67/2, Praha 8 – Libeň');
  await expect(page.getByText('Ruční výběr na Mapy.com', { exact: true })).toBeVisible();
  await page.locator('.hospital-marker[title="Fakultní nemocnice Bulovka"]').click(); await expect(page.getByRole('heading', { name: 'Fakultní nemocnice Bulovka', exact: true })).toBeVisible();
  await page.getByLabel('Hledat POI').fill('Alžběty'); await expect(page.locator('.poi-row')).toHaveCount(1);
  await page.locator('[data-poi-id="hospital-sv-alzbety"] button').click();
  await expect(page.getByLabel('Adresa nemocnice (volitelná)')).toHaveValue('');
  await page.getByRole('button', { name: 'Vyřadit ze hry', exact: true }).click(); await page.getByRole('button', { name: 'Vrátit do hry', exact: true }).click();
  await expect(page.getByTestId('poi-count-hospital')).toHaveText('10 schválených · 0 neschválených');
  await page.screenshot({ path: 'test-results/hospital-editor.png', fullPage: true }); expect(errors).toEqual([]);
});

test('úpravy nemocnice, vyřazení, obnovení a tažení bodu přežijí reload bez změny ostatních dat', async ({ page }) => {
  await page.goto('/'); await ready(page); const before = await storedWorld(page);
  await page.locator('[data-poi-id="hospital-motol"] button').click();
  await page.getByLabel('Název nemocnice', { exact: true }).fill('Moje upravená nemocnice');
  await page.getByLabel('Adresa nemocnice (volitelná)').fill('Upravená adresa'); await page.getByLabel('Poznámka k nemocnici').fill('Moje soukromá poznámka');
  await page.getByLabel('Zeměpisná šířka nemocnice').fill('50.074'); await page.getByLabel('Zeměpisná délka nemocnice').fill('14.341');
  await page.getByRole('button', { name: 'Uložit nemocnici', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions.find(poi => poi.id === 'hospital-motol')?.point).toEqual([14.341, 50.074]);
  await page.getByRole('button', { name: 'Vyřadit ze hry', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions.find(poi => poi.id === 'hospital-motol')?.status).toBe('excluded');
  await page.reload(); await page.locator('[data-poi-id="hospital-motol"] button').click();
  await expect(page.getByLabel('Název nemocnice', { exact: true })).toHaveValue('Moje upravená nemocnice'); await expect(page.getByLabel('Adresa nemocnice (volitelná)')).toHaveValue('Upravená adresa');
  await expect(page.getByLabel('Poznámka k nemocnici')).toHaveValue('Moje soukromá poznámka'); await expect(page.getByLabel('Zeměpisná šířka nemocnice')).toHaveValue('50.074');
  await page.getByRole('button', { name: 'Vrátit do hry', exact: true }).click(); await expect(page.getByTestId('poi-count-hospital')).toHaveText('10 schválených · 0 neschválených');
  await page.getByRole('button', { name: 'Přesunout bod nemocnice v mapě', exact: true }).click();
  const box = (await page.locator('.hospital-marker.selected').boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x + 65, box.y + 40, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions.find(poi => poi.id === 'hospital-motol')?.point).not.toEqual([14.341, 50.074]);
  const moved = (await storedWorld(page)).poi!.decisions.find(poi => poi.id === 'hospital-motol')!.point!;
  await page.reload(); await page.locator('[data-poi-id="hospital-motol"] button').click();
  await expect(page.getByLabel('Zeměpisná délka nemocnice')).toHaveValue(String(moved[0])); await expect(page.getByLabel('Zeměpisná šířka nemocnice')).toHaveValue(String(moved[1]));
  const after = await storedWorld(page); expect(after.layers).toEqual(before.layers); expect(after.gameStops).toEqual(before.gameStops);
  expect(after.poi!.pointCatalog).toEqual(before.poi!.pointCatalog); expect(after.poi!.sources).toEqual(before.poi!.sources);
});

test('vlastní nemocnice se schválí i bez adresy a zůstane v záloze; odstranit lze pouze vlastní bod', async ({ page }) => {
  await page.goto('/'); await ready(page); await page.getByRole('button', { name: '+ Přidat nemocnici', exact: true }).click();
  const map = (await page.getByTestId('map').boundingBox())!; await page.mouse.click(map.x + map.width * .5, map.y + map.height * .45);
  await expect(page.getByRole('heading', { name: 'Nová nemocnice', exact: true })).toBeVisible();
  await page.getByLabel('Název nemocnice', { exact: true }).fill('Moje testovací nemocnice'); await page.getByRole('button', { name: 'Uložit nemocnici', exact: true }).click();
  await page.getByRole('button', { name: 'Schválit nemocnici', exact: true }).click();
  await expect(page.getByTestId('poi-count-hospital')).toHaveText('11 schválených · 0 neschválených');
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions.find(poi => poi.name === 'Moje testovací nemocnice')?.status).toBe('approved');
  const manual = (await storedWorld(page)).poi!.manual.find(poi => poi.category === 'hospital')!;
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Stáhnout zálohu', exact: true }).click();
  const download = await downloadPromise, backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(backup.world.poi.manual.find((poi: { id: string }) => poi.id === manual.id)).toEqual(manual);
  await page.reload(); await page.locator(`[data-poi-id="${manual.id}"] button`).click();
  await expect(page.getByLabel('Adresa nemocnice (volitelná)')).toHaveValue('');
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Odstranit ručně vytvořenou nemocnici', exact: true }).click();
  await expect(page.getByTestId('poi-count-hospital')).toHaveText('10 schválených · 0 neschválených');
  await expect.poll(async () => (await storedWorld(page)).poi?.manual.filter(poi => poi.category === 'hospital').length).toBe(0);
  await page.locator('[data-poi-id="hospital-bulovka"] button').click(); await expect(page.getByRole('button', { name: 'Odstranit ručně vytvořenou nemocnici', exact: true })).toHaveCount(0);
});

test('veřejná produkční hra načte schválené nemocnice i starší publikaci bez nich s platnými kontrolními součty', async ({ page, request }) => {
  const base = 'http://127.0.0.1:4175/JetLagPrague/';
  const index = readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json', 'utf8')));
  const entry = index.versions.find(entry => entry.releaseId === 'release:2a63e4db546a77e616eb0a46d5fb0a15a5defd6f6f28a80e51c185280fe553c5')!;
  const artifact = await request.get(base + 'releases/' + entry.file); expect(artifact.status()).toBe(200);
  const release = await readGameReleaseArtifact(await artifact.text(), entry);
  expect(release.data.pois.filter(poi => poi.category === 'hospital')).toHaveLength(10);
  expect(release.data.pois.find(poi => poi.id === 'hospital-sv-alzbety')).toMatchObject({ address: '', point: [14.4203839, 50.0692439] });
  await page.route('**/releases/current.json', route => route.fulfill({ json: { ...index, current: entry } })); await page.goto(base);
  await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();
  await expect(page.locator('.data-counts > div').filter({ has: page.getByText('Nemocnice', { exact: true }) }).locator('dd')).toHaveText('10');
  const old = index.versions.find(entry => entry.releaseId === 'release:3b0174b470beb21667464ae5434c30ebd48c199e4aeeb67ffd8055e65fc3af17')!;
  await page.route('**/releases/current.json', route => route.fulfill({ json: { ...index, current: old } })); await page.reload();
  await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();
  await expect(page.locator('.data-counts > div').filter({ has: page.getByText('Nemocnice', { exact: true }) }).locator('dd')).toHaveText('0');
  await expect(page.locator('.data-counts > div').filter({ has: page.getByText('Zoo a místa se zvířaty', { exact: true }) }).locator('dd')).toHaveText('10');
});
