import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { storedWorld } from './draft-helper';
import input from '../data/raw/cinemas-curated.json' with { type: 'json' };
import { readGameReleaseArtifact, readGameReleaseIndex } from '../packages/geo-core/src/index';
import { releaseTestInput } from '../packages/geo-core/src/game-release-test-fixtures';

async function ready(page:Page){
  await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false');
  await expect.poll(async()=>(await storedWorld(page)).poi?.pointCatalog?.filter(poi=>poi.category==='cinema').length).toBe(26);
  await expect.poll(async()=>(await storedWorld(page)).layers.some(layer=>layer.kind==='cadastral')).toBe(true);
}
test.beforeEach(async({page})=>{await page.route('https://api.mapy.com/**',route=>route.abort());});

test('nový prohlížeč zobrazí 26 kin, přesné body, samostatnou viditelnost a Hostivař k revizi',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');await ready(page);
  await expect(page.getByTestId('poi-count-cinema')).toHaveText('25 schválených · 0 vyřazených · 1 neověřených');
  await expect(page.locator('.cinema-marker')).toHaveCount(26);await expect(page.getByTestId('map')).toHaveAttribute('data-poi-cinema-count','26');
  for(const row of input) await expect(page.locator(`.cinema-marker[title="${row.name}"]`)).toHaveCount(1);
  await expect(page.locator('.library-marker')).toHaveCount(45);await expect(page.locator('.hospital-marker')).toHaveCount(10);await expect(page.locator('.zoo-marker')).toHaveCount(10);await expect(page.locator('.airport-marker')).toHaveCount(3);
  await page.getByLabel('Kina',{exact:true}).uncheck();await expect(page.locator('.cinema-marker')).toHaveCount(0);await expect(page.locator('.library-marker')).toHaveCount(45);
  await expect.poll(async()=>(await storedWorld(page)).poi?.visibility.cinemas).toBe(false);
  await page.reload();await ready(page);await expect(page.getByLabel('Kina',{exact:true})).not.toBeChecked();await page.getByLabel('Kina',{exact:true}).check();
  await page.getByLabel('Hledat POI').fill('bio-oko');await expect(page.locator('.poi-row')).toHaveCount(1);await page.locator('.poi-row button').click();
  await expect(page.getByLabel('Zeměpisná šířka kina')).toHaveValue('50.1000567');await expect(page.getByLabel('Zeměpisná délka kina')).toHaveValue('14.4301697');
  await expect(page.getByLabel('Adresa kina',{exact:true})).toHaveValue('Františka Křížka 460/15, Praha 7 – Holešovice');
  await page.locator('.cinema-marker[title="Bio Oko"]').click();await expect(page.getByRole('heading',{name:'Bio Oko',exact:true})).toBeVisible();
  await expect(page.getByText('Ruční výběr na Mapy.com',{exact:true})).toBeVisible();
  await page.getByLabel('Hledat POI').fill('priemere-citenas-hostivar');await page.locator('.poi-row button').click();
  await expect(page.getByRole('heading',{name:'Priemere Citenas Praha Hostivař',exact:true})).toBeVisible();
  await expect(page.getByLabel('Poznámka ke kinu')).toHaveValue(/Nutno potvrdit skutečný název a existenci kina/);
  await expect(page.locator('.cinema-properties .poi-status')).toHaveText('K revizi');
  await expect(page.getByLabel('Zeměpisná délka kina')).toHaveValue('14.5172589');expect(errors).toEqual([]);
  await page.screenshot({path:'test-results/cinema-editor.png',fullPage:true});
});

test('přejmenování, adresa, poznámka, GPS, vyřazení a tažení bodu přetrvají reload bez změny původního katalogu',async({page})=>{
  // Three full geographic-draft reloads share this scenario's budget. Keep
  // individual locator/persistence deadlines unchanged on slower CI runners.
  test.setTimeout(60000);
  await page.goto('/');await ready(page);const before=await storedWorld(page);
  await page.getByLabel('Hledat POI').fill('bio-oko');await page.locator('.poi-row button').click();
  await page.getByLabel('Název kina',{exact:true}).fill('Moje upravené kino');await page.getByLabel('Adresa kina',{exact:true}).fill('Moje testovací adresa');await page.getByLabel('Poznámka ke kinu').fill('Moje soukromá poznámka');
  await page.getByLabel('Zeměpisná šířka kina').fill('50.1');await page.getByLabel('Zeměpisná délka kina').fill('14.43');await page.getByRole('button',{name:'Uložit kino',exact:true}).click();
  await page.getByRole('button',{name:'Vyřadit kino ze hry',exact:true}).click();await expect(page.getByTestId('poi-count-cinema')).toHaveText('24 schválených · 1 vyřazených · 1 neověřených');
  await expect.poll(async()=>(await storedWorld(page)).poi?.decisions.find(poi=>poi.id==='bio-oko')?.status).toBe('excluded');
  await page.reload();await ready(page);await page.getByLabel('Hledat POI').fill('Moje upravené kino');await page.locator('.poi-row button').click();
  await expect(page.getByLabel('Adresa kina',{exact:true})).toHaveValue('Moje testovací adresa');await expect(page.getByLabel('Poznámka ke kinu')).toHaveValue('Moje soukromá poznámka');
  await page.getByRole('button',{name:'Vrátit kino do hry',exact:true}).click();
  await page.getByRole('button',{name:'Přesunout bod kina v mapě',exact:true}).click();const box=(await page.locator('.cinema-marker.selected').boundingBox())!;
  await page.mouse.move(box.x+15,box.y+15);await page.mouse.down();await page.mouse.move(box.x+65,box.y+40,{steps:8});await page.mouse.up();
  await expect.poll(async()=>(await storedWorld(page)).poi?.decisions.find(poi=>poi.id==='bio-oko')?.point).not.toEqual([14.43,50.1]);
  const after=await storedWorld(page),moved=after.poi!.decisions.find(poi=>poi.id==='bio-oko')!.point!;
  expect(after.layers).toEqual(before.layers);expect(after.gameStops).toEqual(before.gameStops);expect(after.poi!.pointCatalog).toEqual(before.poi!.pointCatalog);expect(after.poi!.sources).toEqual(before.poi!.sources);
  await page.reload();await ready(page);await page.getByLabel('Hledat POI').fill('bio-oko');await page.locator('.poi-row button').click();
  await expect(page.getByLabel('Název kina',{exact:true})).toHaveValue('Moje upravené kino');await expect(page.getByLabel('Zeměpisná délka kina')).toHaveValue(String(moved[0]));await expect(page.getByLabel('Zeměpisná šířka kina')).toHaveValue(String(moved[1]));
  await page.getByRole('button',{name:'Vrátit kino k revizi',exact:true}).click();await expect(page.getByTestId('poi-count-cinema')).toHaveText('24 schválených · 0 vyřazených · 2 neověřených');
  await page.getByRole('button',{name:'Schválit kino',exact:true}).click();await expect(page.getByTestId('poi-count-cinema')).toHaveText('25 schválených · 0 vyřazených · 1 neověřených');
});

test('vlastní kino se vloží skutečným bodem, vyžaduje název a adresu, schválí se a přežije zálohu',async({page})=>{
  await page.goto('/');await ready(page);await page.getByRole('button',{name:'+ Přidat kino',exact:true}).click();
  const map=(await page.getByTestId('map').boundingBox())!;await page.mouse.click(map.x+map.width*.5,map.y+map.height*.45);
  await expect(page.getByRole('heading',{name:'Nové kino',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Schválit kino',exact:true}).click();await expect(page.getByText('Před schválením kina doplňte název a adresu.',{exact:true})).toBeVisible();
  await page.getByLabel('Název kina',{exact:true}).fill('Syntetické nové kino');await page.getByLabel('Adresa kina',{exact:true}).fill('Testovací adresa');await page.getByRole('button',{name:'Uložit kino',exact:true}).click();await page.getByRole('button',{name:'Schválit kino',exact:true}).click();
  await expect(page.getByTestId('poi-count-cinema')).toHaveText('26 schválených · 0 vyřazených · 1 neověřených');
  await expect.poll(async()=>(await storedWorld(page)).poi?.manual.filter(poi=>poi.category==='cinema').length).toBe(1);
  const manual=(await storedWorld(page)).poi!.manual.find(poi=>poi.category==='cinema')!;expect(manual.geometry.type).toBe('Point');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Stáhnout zálohu',exact:true}).click();const download=await downloadPromise;
  const backup=JSON.parse(await readFile((await download.path())!,'utf8'));expect(backup.world.poi.manual.find((poi:{id:string})=>poi.id===manual.id)).toEqual(manual);
  await page.reload();await ready(page);await page.getByLabel('Hledat POI').fill('Syntetické nové kino');await page.locator('.poi-row button').click();
  await expect(page.getByLabel('Adresa kina',{exact:true})).toHaveValue('Testovací adresa');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Odstranit ručně vytvořené kino',exact:true}).click();
  await expect(page.getByTestId('poi-count-cinema')).toHaveText('25 schválených · 0 vyřazených · 1 neověřených');
});

test('starší draft bez kin získá výchozí katalog před uložením a zachová vlastní oblast, POI a pravidla PID',async({page})=>{
  const {world}=await releaseTestInput();world.title='Původní svět před kiny';
  await page.addInitScript(serialized=>{if(!localStorage.getItem('cinema-seeded')){localStorage.setItem('jetlag-praha:world:v1',serialized);localStorage.setItem('cinema-seeded','true');}},JSON.stringify(world));
  await page.goto('/');await ready(page);const saved=await storedWorld(page);
  expect(saved.id).toBe(world.id);for(const layer of world.layers) expect(saved.layers.find(row=>row.id===layer.id)).toEqual(layer);
  expect(saved.poi!.manual).toEqual(world.poi!.manual);expect(saved.gameStops).toEqual(world.gameStops);
  await expect(page.getByTestId('poi-count-cinema')).toHaveText('25 schválených · 0 vyřazených · 1 neověřených');
  await page.reload();await ready(page);await expect(page.locator('.cinema-marker')).toHaveCount(26);
});

test('veřejná produkční hra načte 25 schválených kin schématu 5 a historickou publikaci 4 bez kin',async({page,request})=>{
  const base='http://127.0.0.1:4175/JetLagPrague/';
  const index=readGameReleaseIndex(JSON.parse(await readFile('data/releases/current.json','utf8')));
  const entry=index.versions.find(row=>row.releaseId==='release:1f5e3316c584ad01849e246761882b66e02504382bc12b6b18b504b019f988cd')!;
  const response=await request.get(base+'releases/'+entry.file);expect(response.status()).toBe(200);
  const release=await readGameReleaseArtifact(await response.text(),entry);expect(release.schemaVersion).toBe(5);expect(release.data.pois.filter(poi=>poi.category==='cinema')).toHaveLength(25);expect(release.data.pois.some(poi=>poi.id==='priemere-citenas-hostivar')).toBe(false);
  await page.goto(base);await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();
  await expect(page.locator('.data-counts > div').filter({has:page.getByText('Kina',{exact:true})}).locator('dd')).toHaveText('25');
  const legacy=index.versions.find(row=>row.releaseId==='release:1df560d4f22e6e38ec4df73df52bd34d58b831988ef73f0812753750ae7cff39')!;
  await page.route('**/releases/current.json',route=>route.fulfill({json:{...index,current:legacy}}));await page.reload();await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();
  await expect(page.locator('.data-counts > div').filter({has:page.getByText('Kina',{exact:true})}).locator('dd')).toHaveText('0');
  await expect(page.locator('.data-counts > div').filter({has:page.getByText('Knihovny',{exact:true})}).locator('dd')).toHaveText('45');
});
