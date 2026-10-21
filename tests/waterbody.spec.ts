import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {storedWorld} from './draft-helper';
import {exportWorld,importWorld,matchingPois,nearestApprovedPoi,type ParkDataset} from '../packages/geo-core/src/index';
const catalog=readFile('apps/editor/src/data/waterbody-catalog.json','utf8').then(text=>JSON.parse(text) as ParkDataset);
async function ready(page:Page){
 await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false');
 await expect(page.getByTestId('water-counts')).toHaveText('307 schválených · 384 k revizi · 72 vyřazených');
 await expect.poll(async()=>(await storedWorld(page)).poi?.waterSources?.[0].records.length).toBe(763);
 await expect.poll(async()=>(await storedWorld(page)).layers.some(l=>l.kind==='cadastral')).toBe(true);
}
test.beforeEach(async({page})=>{await page.route('https://api.mapy.com/**',route=>route.abort());});

test('nové zařízení dostane skutečné polygony, 5 ponechaných biotopů/koupališť a trvalý filtr stavů pro mapu i seznam',async({page})=>{
 await page.goto('/');await ready(page);
 await expect(page.getByTestId('map')).toHaveAttribute('data-waterbody-count','763');await expect(page.locator('.waterbody-polygon').first()).toBeVisible();
 await page.getByLabel('Stav vodních ploch').selectOption('approved');await expect(page.getByTestId('map')).toHaveAttribute('data-waterbody-count','307');await expect(page.locator('.waterbody-polygon.excluded,.waterbody-polygon.review')).toHaveCount(0);
 await page.getByLabel('Hledat vodní plochu').fill('Biotop Lhotka');await expect(page.locator('.water-row')).toHaveCount(3);
 const source=await catalog,p=source.records.find(p=>p.name==='Biotop Lhotka')!;
 await page.locator(`[data-water-id="${p.id}"] button`).click();await expect(page.getByRole('heading',{name:'Biotop Lhotka',exact:true})).toBeVisible();
 await page.getByLabel('Hledat vodní plochu').fill('');await page.getByLabel('Stav vodních ploch').selectOption('excluded');await expect(page.getByTestId('map')).toHaveAttribute('data-waterbody-count','72');await expect(page.locator('.water-row')).toHaveCount(72);
 await page.getByLabel('Hledat vodní plochu').fill('Zoo Praha');await expect(page.locator('.water-row')).toHaveCount(22);
 await expect.poll(async()=>(await storedWorld(page)).poi?.waterStatusFilter).toBe('excluded');await page.reload();await ready(page);
 await expect(page.getByLabel('Stav vodních ploch')).toHaveValue('excluded');await expect(page.getByTestId('map')).toHaveAttribute('data-waterbody-count','72');
 await page.getByLabel('Stav vodních ploch').selectOption('review');await expect(page.getByTestId('map')).toHaveAttribute('data-waterbody-count','384');
 await page.getByRole('checkbox',{name:'Vodní plochy',exact:true}).uncheck();await expect(page.locator('.waterbody-polygon')).toHaveCount(0);await expect(page.locator('.library-marker')).toHaveCount(45);await expect(page.locator('.cinema-marker')).toHaveCount(26);
 await page.screenshot({path:'test-results/waterbody-editor.png',fullPage:true});
});

test('vyřazený polygon lze obnovit se stejným GLOBALID a geometrií; rozhodnutí přetrvá reload a obě zálohy',async({page})=>{
 await page.goto('/');await ready(page);const before=await storedWorld(page),source=await catalog,p=source.records.find(p=>p.name==='Vista resort & club')!;
 await page.getByLabel('Stav vodních ploch').selectOption('excluded');await page.getByLabel('Hledat vodní plochu').fill(p.sourceId);await page.locator('.water-row button').click();
 await expect(page.locator('.water-properties')).toContainText(p.sourceId);await page.getByRole('button',{name:'Obnovit vodní plochu do hry',exact:true}).click();
 await expect(page.getByTestId('water-counts')).toHaveText('308 schválených · 384 k revizi · 71 vyřazených');
 await expect.poll(async()=>(await storedWorld(page)).poi?.decisions.find(d=>d.id===p.id)?.status).toBe('approved');
 await page.reload();await page.getByLabel('Stav vodních ploch').selectOption('approved');await page.getByLabel('Hledat vodní plochu').fill(p.sourceId);await page.locator('.water-row button').click();
 await expect(page.getByRole('heading',{name:p.name,exact:true})).toBeVisible();
 const saved=await storedWorld(page);expect(saved.poi!.waterSources![0].records.find(row=>row.id===p.id)).toEqual(p);expect(saved.layers).toEqual(before.layers);expect(saved.gameStops).toEqual(before.gameStops);expect(saved.poi!.pointCatalog).toEqual(before.poi!.pointCatalog);
 for(const format of ['json','geojson'] as const)expect(importWorld(exportWorld(saved,format))).toEqual(saved);
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Stáhnout zálohu',exact:true}).click();const downloaded=await downloadPromise;
 const backup=JSON.parse(await readFile((await downloaded.path())!,'utf8'));expect(backup.world.poi.waterSources[0].records.find((row:{id:string})=>row.id===p.id).geometry).toEqual(p.geometry);
 await page.getByRole('button',{name:'Vyřadit vodní plochu',exact:true}).click();await expect(page.getByTestId('water-counts')).toHaveText('307 schválených · 384 k revizi · 72 vyřazených');
});

test('opakovaný import originálního ZIPu zachová ruční rozhodnutí; poškozený import nepřepíše funkční zdroj',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/');await ready(page);const p=(await catalog).records.find(p=>p.name==='Biotop Braník')!;
 await page.getByLabel('Hledat vodní plochu').fill(p.sourceId);await page.locator('.water-row button').click();await page.getByRole('button',{name:'Vyřadit vodní plochu',exact:true}).click();
 await expect.poll(async()=>(await storedWorld(page)).poi?.decisions.find(d=>d.id===p.id)?.status).toBe('excluded');const before=await storedWorld(page);
 await page.getByLabel('Import / aktualizace vodních ploch (GIS ZIP)').setInputFiles('data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip');
 await expect(page.getByRole('button',{name:'Potvrdit import vodních ploch',exact:true})).toBeVisible({timeout:60000});
 expect((await storedWorld(page)).poi!.waterSources).toEqual(before.poi!.waterSources);
 await page.getByRole('button',{name:'Potvrdit import vodních ploch',exact:true}).click();await expect(page.getByTestId('water-counts')).toHaveText('306 schválených · 384 k revizi · 73 vyřazených');
 await expect.poll(async()=>(await storedWorld(page)).poi?.waterSources?.[0].source.retrievedAt).not.toBe(before.poi!.waterSources![0].source.retrievedAt);
 const updated=await storedWorld(page);expect(updated.poi!.decisions).toEqual(before.poi!.decisions);expect(updated.layers).toEqual(before.layers);expect(updated.gameStops).toEqual(before.gameStops);
 await page.getByLabel('Import / aktualizace vodních ploch (GIS ZIP)').setInputFiles({name:'broken.zip',mimeType:'application/zip',buffer:Buffer.from('not a ZIP')});
 await expect(page.locator('.water-controls [role="alert"]')).toBeVisible();expect((await storedWorld(page)).poi!.waterSources).toEqual(updated.poi!.waterSources);
});

test('veřejný katalog obsahuje jen schválené vodní polygony a používá jejich plochy v geografických operacích',async({page,request})=>{
 const base='http://127.0.0.1:4175/JetLagPrague/';const index=(await request.get(base+'releases/current.json'));expect(index.status()).toBe(200);
 const pointer=await index.json(),reply=await request.get(base+'releases/'+pointer.current.file);const release=await reply.json();
 const approved=(await catalog).records.filter(p=>p.status==='approved');expect(release.schemaVersion).toBe(6);expect(release.data.pois.filter((p:{category:string})=>p.category==='waterbody')).toHaveLength(307);
 expect(release.data.pois.some((p:{category:string})=>p.category==='vltava')).toBe(false);
 const p=approved.find(p=>p.name==='Biotop Radotín')!;expect(nearestApprovedPoi(p.point,'waterbody',release.data.pois)).toMatchObject({state:'known',distanceMeters:0,poi:{id:p.id}});
 expect(matchingPois(p.point,p.point,'waterbody',release.data.pois)).toMatchObject({state:'known',matches:true});
 await page.goto(base);await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();await expect(page.locator('.data-counts > div').filter({has:page.getByText('Vodní plochy',{exact:true})}).locator('dd')).toHaveText('307');
});
