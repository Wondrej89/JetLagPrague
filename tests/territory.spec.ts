import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { createPidSnapshot, newFeature, newWorld, pragueDate } from '../packages/geo-core/src/index';
import { testPlatform, testSnapshot } from '../packages/geo-core/src/pid-test-fixtures';
import { storedWorld } from './draft-helper';
import { useHistoricalPidFixture } from './pid-legacy-fixture';

test('skutečná Praha: předvolba, filtrace, všechny 400m zóny, historie a obnova vlastních dat', async ({ page, context }) => {
  test.setTimeout(120000);
  await useHistoricalPidFixture(context);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://api.mapy.com/**', route => route.abort()); await context.route('https://data.pid.cz/**', route => route.abort());
  const draft = newWorld(); draft.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.42, 50.08] }, 'Zachovaný vlastní bod')];
  await page.addInitScript(serialized => { if (!localStorage.getItem('jetlag-praha:world:v1')) localStorage.setItem('jetlag-praha:world:v1', serialized); }, JSON.stringify(draft));
  await page.goto('/'); await expect(page.getByTestId('pid-count')).toContainText('8066', { timeout: 30000 });
  const preset = page.getByRole('button', { name: 'Obnovit výchozí území Prahy', exact: true }); await expect(preset).toBeEnabled({ timeout: 20000 });
  await preset.click();
  await expect(page.getByTestId('territory-status')).toContainText('1431 zastávek a 404 linek', { timeout: 30000 });
  await expect(page.getByLabel('Pouze PID v herní oblasti', { exact: true })).toBeChecked();
  await expect(page.getByTestId('pid-count')).toContainText('1431 / 1431');
  await page.getByLabel('Zobrazit zastávky PID', { exact: true }).check(); await expect(page.getByTestId('map')).toHaveAttribute('data-pid-stop-count', '1431');
  await page.getByLabel('Zobrazit všechny úkrytové zóny', { exact: true }).check();
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-coverage-type', 'MultiPolygon', { timeout: 40000 });
  await expect(page.getByTestId('coverage-status')).toContainText('k revizi: 1431');
  await expect(page.getByTestId('coverage-status')).toContainText('314,25 km²');
  await page.getByLabel('Hledat zastávku PID').fill('Anděl');
  await expect(page.getByTestId('pid-count')).toContainText('1 / 1431');
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-coverage-type', 'MultiPolygon');
  await page.getByText('Trasy linek · sedmidenní podoba', { exact: true }).click();
  await expect(page.getByLabel('Vybrat linku PID').locator('option')).toHaveCount(405);
  await page.getByLabel('Pouze PID v herní oblasti', { exact: true }).uncheck();
  await expect(page.getByLabel('Vybrat linku PID').locator('option')).toHaveCount(854);
  await page.getByLabel('Pouze PID v herní oblasti', { exact: true }).check();
  await page.getByRole('button', { name: 'Zpět', exact: true }).click();
  await expect(page.getByTestId('territory-status')).toContainText('není definovaná');
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-coverage-type', 'none');
  await page.getByRole('button', { name: 'Znovu', exact: true }).click();
  await expect(page.getByTestId('territory-status')).toContainText('1431 zastávek', { timeout: 20000 });
  await expect.poll(async () => (await storedWorld(page)).layers[0].features[0]?.attributes.preset).toBe('praha-municipal-union');
  const saved = await storedWorld(page); expect(saved.layers[1].features).toEqual(draft.layers[1].features);
  await page.getByLabel('Zobrazit všechny úkrytové zóny', { exact: true }).uncheck();
  await page.reload();
  await expect(page.getByTestId('territory-status')).toContainText('1431 zastávek a 404 linek', { timeout: 30000 });
  expect((await storedWorld(page)).layers).toEqual(saved.layers); expect(errors).toEqual([]);
});

test('prostorový filtr tras: průjezd bez vnitřního vrcholu, hranice, otvor a přepočet souhrnné zóny', async ({ page, context }) => {
  test.setTimeout(60000);
  await context.route('https://api.mapy.com/**', route => route.abort()); await context.route('https://data.pid.cz/**', route => route.abort());
  const source = await testSnapshot([testPlatform('inside', 'inside', 'bus', [14.401, 50.071]), testPlatform('outside', 'outside', 'bus', [14.3999, 50.071]), testPlatform('hole', 'hole', 'bus', [14.41, 50.08])], { date: pragueDate() });
  const snapshot = await createPidSnapshot({ ...source, routes: [
    { ...source.routes[0], id: 'crossing', number: 'Průjezd', geometry: { type: 'LineString', coordinates: [[14.39, 50.071], [14.43, 50.071]] } },
    { ...source.routes[0], id: 'outside', number: 'Mimo', geometry: { type: 'LineString', coordinates: [[14.407, 50.077], [14.413, 50.083]] } },
    { ...source.routes[0], id: 'boundary', number: 'Hranice', geometry: { type: 'LineString', coordinates: [[14.4, 50.069], [14.4, 50.091]] } },
  ] });
  const file = `snapshot-${snapshot.checksum.slice(0, 16)}.json.gz`;
  await context.route('**/pid/index.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'jetlag-praha-pid-catalog', schemaVersion: 1, file, checksum: snapshot.checksum }) }));
  await context.route(`**/pid/${file}`, route => route.fulfill({ contentType: 'application/gzip', body: gzipSync(JSON.stringify(snapshot)) }));
  const draft = newWorld(); draft.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [
    [[14.4, 50.07], [14.42, 50.07], [14.42, 50.09], [14.4, 50.09], [14.4, 50.07]],
    [[14.405, 50.075], [14.405, 50.085], [14.415, 50.085], [14.415, 50.075], [14.405, 50.075]],
  ] }, 'Testovací oblast s otvorem')];
  await page.addInitScript(serialized => localStorage.setItem('jetlag-praha:world:v1', serialized), JSON.stringify(draft));
  await page.goto('/'); await expect(page.getByTestId('pid-count')).toContainText('3 / 3', { timeout: 20000 });
  await page.getByLabel('Pouze PID v herní oblasti', { exact: true }).check();
  await expect(page.getByTestId('territory-status')).toContainText('1 zastávek a 2 linek');
  await page.getByText('Trasy linek · sedmidenní podoba', { exact: true }).click();
  const routes = page.getByLabel('Vybrat linku PID'); await expect(routes.locator('option')).toHaveCount(3);
  await expect(routes.locator('option[value=outside]')).toHaveCount(0);
  await routes.selectOption('crossing'); await page.getByLabel('Skrýt ostatní linky').check();
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-route-count', '1');
  await page.getByLabel('Zobrazit všechny úkrytové zóny', { exact: true }).check();
  await expect(page.getByTestId('map')).toHaveAttribute('data-pid-coverage-type', 'Polygon');
  const before = await page.getByTestId('coverage-status').innerText();
  await page.getByText('Pravidla úkrytu', { exact: true }).click(); await page.getByLabel('Poloměr úkrytové zóny (m)', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Uložit poloměr', exact: true }).click();
  await expect(page.getByTestId('coverage-status')).toContainText('Společná úkrytová plocha zobrazena.');
  await expect(page.getByTestId('coverage-status')).not.toHaveText(before);
  await expect(page.getByTestId('coverage-status')).toContainText('Povoleno: 1');
});
