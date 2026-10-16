import { expect, test } from '@playwright/test';
import { gzipSync } from 'node:zlib';
import { newFeature, newWorld, pragueDate, PID_GTFS_URL, PID_GROUPS_URL } from '../packages/geo-core/src/index';
import { testPlatform, testSnapshot } from '../packages/geo-core/src/pid-test-fixtures';
import { defaultPidFilters, PID_PREFERENCES_KEY } from '../apps/editor/src/pid-preferences';
import { storedWorld } from './draft-helper';

function draft() {
  const world = newWorld(); world.layers[0].features = [newFeature({ type: 'Polygon', coordinates: [[[14.3, 50], [14.5, 50], [14.5, 50.2], [14.3, 50.2], [14.3, 50]]] }, 'Testovací oblast obnovy')];
  world.layers[1].features = [newFeature({ type: 'Point', coordinates: [14.45, 50.1] }, 'Zachovaný vlastní bod')]; return world;
}

test('platný starší snapshot přežije nedostupnou publikaci a reload bez živých požadavků; filtry a geometrie zůstávají použitelné', async ({ page, context }) => {
  test.setTimeout(90000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await context.route('https://api.mapy.com/**', route => route.abort()); await context.route('**/administrative/**', route => route.abort());
  let attempts = 0;
  await context.route('https://data.pid.cz/**', route => { attempts++; return route.abort(); });
  const snapshot = await testSnapshot([
    testPlatform('metro', 'metro', 'metro', [14.4, 50.07], 'both'), testPlatform('night', 'bus', 'bus', [14.41, 50.08], 'night'), testPlatform('outside', 'outside', 'tram', [15, 51]),
  ], { date: '2026-08-20', groups: [{ id: 'metro', name: 'Historická testovací zastávka metro' }, { id: 'bus', name: 'Historická testovací zastávka bus' }, { id: 'outside', name: 'Historická testovací zastávka mimo' }] });
  let publicationOffline = false;
  const file = `snapshot-${snapshot.checksum.slice(0, 16)}.json.gz`;
  await context.route('**/pid/index.json', route => publicationOffline ? route.abort() : route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'jetlag-praha-pid-catalog', schemaVersion: 1, file, checksum: snapshot.checksum }) }));
  await context.route(`**/pid/${file}`, route => publicationOffline ? route.abort() : route.fulfill({ contentType: 'application/gzip', body: gzipSync(JSON.stringify(snapshot)) }));
  await page.addInitScript(serialized => { if (!localStorage.getItem('jetlag-praha:world:v1')) localStorage.setItem('jetlag-praha:world:v1', serialized); }, JSON.stringify(draft()));
  {
    await page.goto('/'); await expect(page.getByTestId('pid-count')).toContainText('3 / 3');
    await expect(page.getByTestId('pid-history-notice')).toContainText('Historická referenční data – neověřeno');
    await expect(page.getByTestId('pid-update-error')).not.toBeVisible();
    await page.getByLabel('Pouze PID v herní oblasti', { exact: true }).check(); await expect(page.getByTestId('pid-count')).toContainText('2 / 2');
    await page.getByLabel('Hledat zastávku PID').fill('Historická'); await page.getByText('Druhy dopravy a provoz', { exact: true }).click();
    await page.getByLabel('Provoz PID', { exact: true }).selectOption('night'); await page.getByLabel('Dominantní doprava PID', { exact: true }).selectOption('metro');
    await page.getByLabel('Lanovka', { exact: true }).uncheck();
    await page.getByText('Trasy linek · sedmidenní podoba', { exact: true }).click(); await page.getByLabel('Vybrat linku PID').selectOption('test-route'); await page.getByLabel('Skrýt ostatní linky').check();
    await expect(page.getByTestId('map')).toHaveAttribute('data-pid-route-count', '1');
    await page.getByLabel('Zobrazit všechny úkrytové zóny', { exact: true }).check();
    await expect(page.getByTestId('map')).not.toHaveAttribute('data-pid-coverage-type', 'none');
    await page.locator('.pid-stop-list').getByRole('button', { name: /Historická testovací zastávka metro/ }).click();
    await page.getByRole('button', { name: 'Zobrazit úkrytovou zónu 400 m', exact: true }).click();
    await expect(page.getByTestId('map')).toHaveAttribute('data-pid-zone-type', 'Polygon');
    const before = await storedWorld(page);
    publicationOffline = true;
    await page.reload();
    // Cached display survives missing publication; no upstream download is attempted.
    await expect(page.getByTestId('pid-count')).toContainText('1 / 2'); await expect(page.getByTestId('map')).toHaveAttribute('data-pid-stop-count', '1');
    await expect(page.getByLabel('Provoz PID')).toHaveValue('night'); await expect(page.getByLabel('Dominantní doprava PID')).toHaveValue('metro'); await expect(page.getByLabel('Hledat zastávku PID')).toHaveValue('Historická');
    expect(attempts).toBe(0);
    await expect(page.getByTestId('pid-update-error')).toBeVisible();
    await expect(page.getByTestId('pid-snapshot-summary')).toContainText('2026-08-20: 3 herních zastávek · 1 linek');
    await expect(page.getByTestId('map')).toHaveAttribute('data-pid-route-count', '1'); await expect(page.getByTestId('map')).not.toHaveAttribute('data-pid-coverage-type', 'none');
    await page.getByRole('button', { name: 'Doprava PID', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Zdroje a aktualizace PID' });
    await expect(dialog.getByRole('alert')).toContainText('zachovaný');
    await dialog.getByText('Oficiální URL', { exact: true }).click();
    for (const url of [PID_GTFS_URL, PID_GROUPS_URL]) await expect(dialog.getByRole('link', { name: url, exact: true })).toHaveAttribute('href', url);
    await dialog.getByRole('button', { name: 'Zavřít správu PID', exact: true }).click();
    const failedAttempts = attempts; await page.reload();
    await expect(page.getByTestId('map')).toHaveAttribute('data-pid-stop-count', '1'); expect(attempts).toBe(failedAttempts);
    expect((await storedWorld(page)).layers).toEqual(before.layers);
    // Deliberate visibility/filter choices also survive, including false values
    // that must not be overwritten by the Prague preset's initial defaults.
    await page.getByLabel('Zobrazit zastávky PID', { exact: true }).uncheck(); await page.getByLabel('Pouze PID v herní oblasti', { exact: true }).uncheck();
    await page.reload(); await expect(page.getByTestId('pid-count')).toContainText('1 / 3');
    await expect(page.getByLabel('Zobrazit zastávky PID', { exact: true })).not.toBeChecked(); await expect(page.getByLabel('Pouze PID v herní oblasti', { exact: true })).not.toBeChecked();
    await expect(page.getByTestId('map')).toHaveAttribute('data-pid-stop-count', '0'); expect(errors).toEqual([]);
  }
});

test('výpočet prostorového filtru má stav načítání; chyba nabídne vypnutí a zachová datum a počty zdroje', async ({ page, context }) => {
  await context.route('https://api.mapy.com/**', route => route.abort()); await context.route('https://data.pid.cz/**', route => route.abort()); await context.route('**/administrative/**', route => route.abort());
  const snapshot = await testSnapshot([testPlatform('in', 'in', 'tram'), testPlatform('out', 'out', 'tram', [15, 51])], { date: pragueDate() });
  const file = `snapshot-${snapshot.checksum.slice(0, 16)}.json.gz`;
  await context.route('**/pid/index.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ format: 'jetlag-praha-pid-catalog', schemaVersion: 1, file, checksum: snapshot.checksum }) }));
  await context.route(`**/pid/${file}`, route => route.fulfill({ contentType: 'application/gzip', body: gzipSync(JSON.stringify(snapshot)) }));
  await page.addInitScript(({ serialized, key, preferences }) => {
    localStorage.setItem('jetlag-praha:world:v1', serialized); localStorage.setItem(key, preferences);
    const target = window as Window & { failMembership?: boolean }; const ActualWorker = Worker;
    window.Worker = class extends ActualWorker {
      postMessage(message: unknown, transfer?: Transferable[] | StructuredSerializeOptions) {
        const command = message as { action?: string; requestId?: number };
        if (command.action !== 'membership') { super.postMessage(message, transfer as Transferable[]); return; }
        setTimeout(() => {
          if (target.failMembership) this.dispatchEvent(new MessageEvent('message', { data: { requestId: command.requestId, error: 'Testované selhání geografického výpočtu.' } }));
          else try { super.postMessage(message, transfer as Transferable[]); } catch { /* StrictMode may have terminated the first worker. */ }
        }, 2000);
      }
    };
  }, { serialized: JSON.stringify(draft()), key: PID_PREFERENCES_KEY, preferences: JSON.stringify({ schemaVersion: 1, filters: { ...defaultPidFilters(), territoryOnly: true }, showCoverage: false, showPlatforms: false, showZone: false }) });
  await page.goto('/'); await expect(page.getByTestId('pid-count')).toContainText('Ověřuji polohu');
  await expect(page.getByTestId('pid-count')).not.toContainText('0 /'); await expect(page.getByTestId('pid-snapshot-summary')).toContainText('2 herních zastávek');
  await expect(page.getByTestId('pid-filter-map-status')).toContainText('Ověřuji polohu'); await expect(page.getByTestId('pid-count')).toContainText('1 / 1');
  await page.evaluate(() => { (window as Window & { failMembership?: boolean }).failMembership = true; });
  await page.getByText('Pravidla úkrytu', { exact: true }).click(); await page.getByLabel('Poloměr úkrytové zóny (m)', { exact: true }).fill('450'); await page.getByRole('button', { name: 'Uložit poloměr', exact: true }).click();
  await expect(page.getByTestId('territory-status')).toContainText('Testované selhání'); await expect(page.getByTestId('pid-count')).toContainText('nelze určit');
  await expect(page.getByTestId('pid-snapshot-summary')).toContainText('2 herních zastávek');
  await page.getByRole('button', { name: 'Vypnout filtr a zobrazit dostupná PID data', exact: true }).click();
  await expect(page.getByTestId('pid-count')).toContainText('2 / 2'); await expect(page.getByTestId('map')).toHaveAttribute('data-pid-stop-count', '2');
});
