import { expect, test } from '@playwright/test';
import { createAdministrativeSnapshot, newFeature, newWorld, type SourceDataset } from '../packages/geo-core/src/index';
import type { Polygon } from 'geojson';

// Syntetické fixture testují integraci; neověřují pražské správní hranice.
const square: Polygon = { type: 'Polygon', coordinates: [[[14.4, 50.05], [14.5, 50.05], [14.5, 50.1], [14.4, 50.1], [14.4, 50.05]]] };
const source: Omit<SourceDataset, 'checksum' | 'featureCount' | 'id'> = {
  provider: 'Syntetický testovací zdroj', sourceUrl: 'https://example.invalid/source', license: { name: 'Test', url: 'https://example.invalid/license' },
  dataDate: '2026-01-01', retrievedAt: '2026-01-02T00:00:00.000Z', version: 'test-1', codeField: 'code', processing: 'Syntetické fixture, nikoli reálné hranice.',
};
const key = 'jetlag-praha:world:v1';
test('zdroje se přidají ke starému draftu, testovací bod se přesouvá a aktualizace zachová vlastní data', async ({ page }) => {
  const municipal = await createAdministrativeSnapshot({ type: 'FeatureCollection', features: Array.from({ length: 57 }, (_, index) => {
    const x = 14 + index / 1000;
    return { type: 'Feature', properties: { code: String(index + 1), name: `Testovací městská část ${index + 1}` }, geometry: index === 0 ? square : { type: 'Polygon', coordinates: [[[x, 49.9], [x + .0005, 49.9], [x + .0005, 49.901], [x, 49.901], [x, 49.9]]] } };
  }) }, { ...source, id: 'praha-municipal' }, { code: 'code', name: 'name' });
  const cadastralInput = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { code: '100', name: 'Testovací katastr' }, geometry: square }] };
  const cadastral = await createAdministrativeSnapshot(cadastralInput, { ...source, id: 'praha-cadastral' }, { code: 'code', name: 'name' });
  await page.route('https://api.mapy.com/**', route => route.abort());
  await page.route('**/administrative/index.json', route => route.fulfill({ json: { schemaVersion: 1, datasets: [{ id: municipal.dataset.id, file: 'municipal.json' }, { id: cadastral.dataset.id, file: 'cadastral.json' }] } }));
  await page.route('**/administrative/municipal.json', route => route.fulfill({ body: JSON.stringify(municipal), contentType: 'application/json' }));
  await page.route('**/administrative/cadastral.json', route => route.fulfill({ body: JSON.stringify(cadastral), contentType: 'application/json' }));
  const original = newWorld(); original.layers[0].features = [newFeature(square, 'Vlastní herní hranice')];
  original.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.45, 50.08] }, 'Vlastní zachovaný bod')];
  const legacy = JSON.stringify({ ...original, schemaVersion: 1 });
  await page.addInitScript(({ key, legacy }) => localStorage.setItem(key, legacy), { key, legacy });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Městské části Prahy', exact: true })).toBeVisible();
  await page.getByLabel('Zobrazit Městské části Prahy', { exact: true }).check();
  await page.getByRole('button', { name: 'Městské části Prahy', exact: true }).click();
  await page.getByRole('button', { name: 'Testovací městská část 1 Polygon', exact: true }).click();
  await expect(page.getByText('Oficiální kód:', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upravit vrcholy v mapě' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ověřit polohu', exact: true }).click();
  const box = (await page.getByTestId('map').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId('position-municipal')).toContainText('Testovací městská část 1');
  await expect(page.getByTestId('position-cadastral')).toContainText('Testovací katastr');
  await expect(page.getByTestId('position-game')).toContainText('Ano');
  const before = await page.locator('.position-coordinates code').textContent();
  const pin = (await page.locator('.test-position-pin').boundingBox())!;
  await page.mouse.move(pin.x + 14, pin.y + 14); await page.mouse.down();
  await page.mouse.move(pin.x + 24, pin.y + 34, { steps: 5 }); await page.mouse.up();
  await expect(page.locator('.position-coordinates code')).not.toHaveText(before!);
  const snapshot = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(snapshot.layers.slice(0, 2)).toEqual(original.layers);
  await page.getByRole('button', { name: 'Správa zdrojů', exact: true }).click();
  cadastralInput.features[0].properties.name = 'Aktualizovaný testovací katastr';
  const updated = await createAdministrativeSnapshot(cadastralInput, { ...source, id: 'praha-cadastral', version: 'test-2' }, { code: 'code', name: 'name' });
  await page.getByLabel('Aktualizace administrativních dat').setInputFiles({ name: 'test-update.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(updated)) });
  await expect(page.getByText('Změněné: 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Použít tuto verzi zdroje' }).click();
  await page.getByRole('button', { name: 'Zavřít správu zdrojů' }).click();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers.find((l: { id: string }) => l.id === 'praha-cadastral').dataset.version, key)).toBe('test-2');
  const after = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(after.layers.slice(0, 2)).toEqual(original.layers);
  expect(after.layers[2].visible).toBe(true);
  // addInitScript znovu vloží starý v1 draft. Novější IndexedDB musí mít přednost.
  await page.reload();
  await expect.poll(async () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).layers.find((l: { id: string }) => l.id === 'praha-cadastral')?.dataset.version, key)).toBe('test-2');
});
