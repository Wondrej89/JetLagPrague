import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { storedWorld } from './draft-helper';
import { addLibrary, buildGameDataRelease, canonicalJson, readGameReleaseIndex, releaseEntry, verifyLibraryDecision } from '../packages/geo-core/src/index';
import { releaseTestAirports, releaseTestDate, releaseTestInput } from '../packages/geo-core/src/game-release-test-fixtures';

const base = 'http://127.0.0.1:4175/JetLagPrague/';
async function ready(page: Page) {
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy', 'false');
  await expect.poll(async () => (await storedWorld(page)).poi?.unlocatedLibraries?.length).toBe(45);
}
test.beforeEach(async ({ page }) => { await page.route('https://api.mapy.com/**', route => route.abort()); });

test('nový editor obsahuje 45 neověřených knihoven bez náhradních bodů, hledání adresy a trvalá individuální rozhodnutí', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await expect(page.getByTestId('poi-count-library')).toHaveText('0 schválených · 0 vyřazených · 45 neověřených');
  await expect(page.locator('.library-marker')).toHaveCount(0); await expect(page.getByTestId('library-unlocated-notice')).toContainText('45 poboček');
  await expect(page.locator('.hospital-marker')).toHaveCount(10); await expect(page.locator('.zoo-marker')).toHaveCount(10); await expect(page.locator('.airport-marker')).toHaveCount(3);
  await page.getByLabel('Hledat POI').fill('Bobkova 534/47'); await expect(page.locator('.poi-row')).toHaveCount(1); await page.locator('.poi-row button').click();
  await expect(page.getByRole('heading', { name: 'Černý Most', exact: true })).toBeVisible();
  await expect(page.getByText('K revizi – poloha není ověřena', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Schválit knihovnu', exact: true })).toHaveCount(0);
  await page.getByLabel('Poznámka k neověřené knihovně').fill('Moje kontrola pobočky'); await page.getByRole('button', { name: 'Uložit neověřenou knihovnu', exact: true }).click();
  await page.getByRole('button', { name: 'Vyřadit neověřenou knihovnu', exact: true }).click();
  await expect(page.getByTestId('poi-count-library')).toHaveText('0 schválených · 1 vyřazených · 44 neověřených');
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions.find(row => row.id.includes('cerny-most'))?.status).toBe('excluded');
  await page.getByLabel('Knihovny', { exact: true }).uncheck(); await expect.poll(async () => (await storedWorld(page)).poi?.visibility.libraries).toBe(false);
  await page.reload(); await expect(page.getByLabel('Knihovny', { exact: true })).not.toBeChecked();
  await page.getByLabel('Hledat POI').fill('Bobkova'); await page.locator('.poi-row button').click(); await expect(page.getByLabel('Poznámka k neověřené knihovně')).toHaveValue('Moje kontrola pobočky');
  await page.getByRole('button', { name: 'Vrátit neověřenou knihovnu k revizi', exact: true }).click();
  await expect(page.getByTestId('poi-count-library')).toHaveText('0 schválených · 0 vyřazených · 45 neověřených');
  expect((await storedWorld(page)).poi!.unlocatedLibraries!.every(row => row.point === null && row.geometry === null)).toBe(true);
});

test('doplnění skutečného bodu kandidáta, schválení, přesun a nové ověření přetrvají reload i zálohu', async ({ page }) => {
  await page.goto('/'); await ready(page); const before = await storedWorld(page);
  await page.getByLabel('Hledat POI').fill('Barrandov'); await page.locator('.poi-row button').click();
  await page.getByLabel('URL oficiálního detailu knihovny', { exact: true }).fill('https://www.mlp.cz/cz/pobocky/synthetic-e2e-barrandov/');
  await page.getByLabel('Zeměpisná šířka nové polohy knihovny').fill('50.08'); await page.getByLabel('Zeměpisná délka nové polohy knihovny').fill('14.42');
  await page.getByRole('button', { name: 'Uložit polohu knihovny k revizi', exact: true }).click();
  await expect(page.locator('.library-marker')).toHaveCount(1); await expect(page.getByRole('button', { name: 'Schválit knihovnu', exact: true })).toBeDisabled();
  await page.getByLabel('Ověřil(a) jsem přesnou polohu pobočky podle oficiálního detailu').check(); await page.getByRole('button', { name: 'Schválit knihovnu', exact: true }).click();
  await expect(page.getByTestId('poi-count-library')).toHaveText('1 schválených · 0 vyřazených · 44 neověřených');
  await page.getByLabel('Název knihovny', { exact: true }).fill('Moje ověřená knihovna'); await page.getByLabel('Poznámka ke knihovně').fill('Moje soukromá poznámka');
  await page.getByRole('button', { name: 'Uložit knihovnu', exact: true }).click();
  await page.getByRole('button', { name: 'Přesunout bod knihovny v mapě', exact: true }).click();
  const box = (await page.locator('.library-marker.selected').boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 15); await page.mouse.down(); await page.mouse.move(box.x + 65, box.y + 40, { steps: 8 }); await page.mouse.up();
  await expect(page.getByTestId('poi-count-library')).toHaveText('0 schválených · 0 vyřazených · 45 neověřených');
  await expect(page.getByRole('button', { name: 'Schválit knihovnu', exact: true })).toBeDisabled();
  await page.getByLabel('Ověřil(a) jsem přesnou polohu pobočky podle oficiálního detailu').check(); await page.getByRole('button', { name: 'Schválit knihovnu', exact: true }).click();
  const id = 'library:mkp:synthetic-e2e-barrandov';
  await expect.poll(async () => (await storedWorld(page)).poi?.decisions.find(row => row.id === id)?.status).toBe('approved');
  const saved = await storedWorld(page), moved = saved.poi!.decisions.find(row => row.id === id)!.point!;
  expect(moved).not.toEqual([14.42, 50.08]); expect(saved.layers).toEqual(before.layers); expect(saved.gameStops).toEqual(before.gameStops);
  await page.reload(); await page.getByLabel('Hledat POI').fill('Moje ověřená knihovna'); await expect(page.locator('.poi-row')).toHaveCount(1); await page.locator('.poi-row button').click();
  await expect(page.getByLabel('Zeměpisná délka knihovny')).toHaveValue(String(moved[0])); await expect(page.getByLabel('Poznámka ke knihovně')).toHaveValue('Moje soukromá poznámka');
  await expect(page.getByRole('link', { name: 'Oficiální detail pobočky MKP' })).toHaveAttribute('href', 'https://www.mlp.cz/cz/pobocky/synthetic-e2e-barrandov/');
  await page.getByRole('button', { name: 'Vyřadit knihovnu ze hry', exact: true }).click(); await expect(page.getByTestId('poi-count-library')).toHaveText('0 schválených · 1 vyřazených · 44 neověřených');
  await page.getByRole('button', { name: 'Vrátit knihovnu do hry', exact: true }).click();
  await page.getByLabel('Knihovny', { exact: true }).uncheck(); await expect(page.locator('.library-marker')).toHaveCount(0); await page.getByLabel('Knihovny', { exact: true }).check(); await expect(page.locator('.library-marker')).toHaveCount(1);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Stáhnout zálohu', exact: true }).click(); const download = await downloadPromise;
  const backup = JSON.parse(await readFile((await download.path())!, 'utf8')); expect(backup.world.poi.manual.find((row: { id: string }) => row.id === id).library.selectionKey).toBe('barrandov');
  await page.screenshot({ path: 'test-results/library-editor.png', fullPage: true });
});

test('vlastní knihovna se přidá v mapě a aktivuje bez duplicit oficiálního ID', async ({ page }) => {
  await page.goto('/'); await ready(page);
  async function place() {
    await page.getByRole('button', { name: '+ Přidat knihovnu', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Přidat knihovnu', exact: true });
    await dialog.getByLabel('Název nové knihovny').fill('Syntetická znovu otevřená pobočka'); await dialog.getByLabel('Adresa nové knihovny').fill('Testovací adresa, Praha');
    await dialog.getByLabel('URL oficiálního detailu nové knihovny').fill('https://www.mlp.cz/cz/pobocky/synthetic-reopened/'); await dialog.getByRole('button', { name: 'Vložit bod nové knihovny v mapě', exact: true }).click();
    const map = (await page.getByTestId('map').boundingBox())!; await page.mouse.click(map.x + map.width * .5, map.y + map.height * .45);
  }
  await place(); await expect(page.getByRole('heading', { name: 'Syntetická znovu otevřená pobočka', exact: true })).toBeVisible();
  await page.getByLabel('Ověřil(a) jsem přesnou polohu pobočky podle oficiálního detailu').check(); await page.getByRole('button', { name: 'Schválit knihovnu', exact: true }).click();
  await page.getByRole('button', { name: 'Vyřadit knihovnu ze hry', exact: true }).click(); await page.getByRole('button', { name: 'Vrátit knihovnu do hry', exact: true }).click();
  await expect(page.getByTestId('poi-count-library')).toHaveText('1 schválených · 0 vyřazených · 45 neověřených');
  await place(); await expect(page.getByText(/Pobočka library:mkp:synthetic-reopened již existuje/)).toBeVisible();
  await page.getByRole('button', { name: 'Zrušit vložení knihovny', exact: true }).click();
  await expect.poll(async () => (await storedWorld(page)).poi?.manual.filter(poi => poi.category === 'library').length).toBe(1);
  await page.getByLabel('Hledat POI').fill('synthetic-reopened'); await page.locator('.poi-row button').click();
  page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Odstranit vlastní knihovnu', exact: true }).click();
  await expect(page.getByTestId('poi-count-library')).toHaveText('0 schválených · 0 vyřazených · 45 neověřených');
});

test('veřejný klient načte ověřené knihovny schématu 4 i historickou publikaci bez knihoven', async ({ page }) => {
  const { world, snapshot } = await releaseTestInput();
  const added = addLibrary(world.poi!, [14.42, 50.08], { name: 'Syntetická publikovaná knihovna', address: 'Testovací adresa, Praha', officialUrl: 'https://www.mlp.cz/cz/pobocky/synthetic-public/' });
  world.poi = verifyLibraryDecision(added.configuration, added.poi, { status: 'approved' }, true);
  const release = await buildGameDataRelease(world, releaseTestAirports, snapshot, releaseTestDate), entry = await releaseEntry(release);
  await page.route('**/releases/current.json', route => route.fulfill({ json: { format: 'jetlag-prague-game-catalog', schemaVersion: 1, current: entry, versions: [entry] } }));
  await page.route('**/releases/' + entry.file, route => route.fulfill({ contentType: 'application/json', body: canonicalJson(release) }));
  await page.goto(base); await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();
  await expect(page.locator('.data-counts > div').filter({ has: page.getByText('Knihovny', { exact: true }) }).locator('dd')).toHaveText('1');
  const history = readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json', 'utf8')));
  const legacy = history.versions.find(entry => entry.releaseId === 'release:2a63e4db546a77e616eb0a46d5fb0a15a5defd6f6f28a80e51c185280fe553c5')!;
  await page.route('**/releases/current.json', route => route.fulfill({ json: { ...history, current: legacy } })); await page.reload(); await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();
  await expect(page.locator('.data-counts > div').filter({ has: page.getByText('Knihovny', { exact: true }) }).locator('dd')).toHaveText('0');
  await expect(page.getByText(/Katalog zatím neobsahuje ověřené knihovny/)).toBeVisible();
});
