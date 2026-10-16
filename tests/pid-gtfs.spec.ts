import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { gtfsFixture, testGtfsSnapshot } from '../packages/geo-core/src/gtfs-test-fixtures';
import { newFeature, newWorld, pragueDate, publicationEntry, type PidSnapshot } from '../packages/geo-core/src/index';
import { storedWorld } from './draft-helper';

test('GTFS publikace: ruční načtení a porovnání tras, neaktivní uzel, zachování draftu a nulové živé požadavky', async ({ page, context }) => {
  let liveRequests = 0;
  await context.route('https://api.mapy.com/**', route => route.abort());
  await context.route('https://data.pid.cz/**', route => { liveRequests++; return route.abort(); });
  await context.route('**/administrative/**', route => route.abort());
  const date = pragueDate(), f = gtfsFixture(), compact = date.replaceAll('-', '');
  f.tables.feedInfo[0].feed_start_date = f.tables.feedInfo[0].feed_end_date = compact;
  for (const row of f.tables.calendar) { row.start_date = row.end_date = compact; for (const day of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) row[day] = row.service_id === 'work' ? '1' : '0'; }
  const first = await testGtfsSnapshot(date, f); let published = first, offline = false;
  const versions = new Map<string, PidSnapshot>([[first.checksum, first]]);
  await context.route('**/pid/index.json', route => offline ? route.abort() : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'jetlag-praha-pid-catalog', schemaVersion: 2, file: publicationEntry(published).file, checksum: published.checksum, versions: [...versions.values()].map(s => publicationEntry(s)) }) }));
  await context.route('**/pid/snapshot-*.json.gz', route => {
    const entry = [...versions.values()].find(s => route.request().url().endsWith(publicationEntry(s).file));
    return entry ? route.fulfill({ contentType: 'application/gzip', body: gzipSync(JSON.stringify(entry)) }) : route.abort();
  });
  const world = newWorld(); world.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [[[14.39, 50.06], [14.41, 50.06], [14.41, 50.08], [14.39, 50.08], [14.39, 50.06]]] }, 'GTFS test area')];
  world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.405, 50.075] }, 'Zachovaný vlastní objekt')];
  await page.addInitScript(value => { if (!localStorage.getItem('jetlag-praha:world:v1')) localStorage.setItem('jetlag-praha:world:v1', value); }, JSON.stringify(world));
  await page.goto('/'); await expect(page.getByTestId('pid-count')).toContainText('2 / 2');
  await expect(page.getByText('Trasy linek · provozní den GTFS', { exact: true })).toBeVisible();
  const before = await storedWorld(page);
  await page.getByRole('button', { name: 'Doprava PID', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Zdroje a aktualizace PID' });
  await expect(dialog.getByRole('link', { name: 'Aktualizovat data PID ↗' })).toHaveAttribute('href', 'https://github.com/Wondrej89/JetLagPrague/actions/workflows/pid-data.yml');
  await dialog.getByText('Neaktivní a neurčitelné uzly (2)', { exact: true }).click();
  await dialog.getByLabel('Vyhledat neaktivní nebo neurčitelný uzel').fill('Test 3');
  await dialog.getByRole('button', { name: 'Test 3', exact: true }).click();
  await expect(page.getByLabel('Vlastnosti zastávky PID')).toContainText('Neaktivní · bez plánované obsluhy');
  f.shapes[1].shape_pt_lat = '50.072'; published = await testGtfsSnapshot(date, f); versions.set(published.checksum, published);
  // A same-day publication is selected by preparation time, including ties.
  await page.getByRole('button', { name: 'Doprava PID', exact: true }).click();
  await dialog.getByRole('button', { name: 'Načíst publikovaný výsledek', exact: true }).click();
  await expect(dialog.locator('.diff-counts')).toContainText('Beze změny: 4');
  await expect(dialog.locator('.route-diff-counts')).toContainText('Změněné: 1');
  await dialog.getByRole('button', { name: /^Použít porovnaný snapshot/ }).click(); await expect(dialog.locator('.source-comparison')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Zavřít správu PID', exact: true }).click();
  expect((await storedWorld(page)).layers).toEqual(before.layers);
  offline = true; await page.reload(); await expect(page.getByTestId('pid-count')).toContainText('2 / 2');
  await expect(page.getByTestId('pid-update-error')).toBeVisible(); expect(liveRequests).toBe(0);
});
