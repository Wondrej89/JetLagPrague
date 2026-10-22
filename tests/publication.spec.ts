import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { releaseTestInput } from '../packages/geo-core/src/game-release-test-fixtures';
import { storedWorld } from './draft-helper';
const base='http://127.0.0.1:4175/JetLagPrague/';
test.beforeEach(async({page})=>{
 await page.route('https://api.mapy.com/**',route=>route.abort());
 // CI tests the exact deployable artifact, which can include a configured
 // publisher URL. Never contact that real service or obtain an admin session.
 await page.route('**/status',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{configured:false,releaseSchemaVersions:[6]}}));
});

test('veřejná produkční stránka načte a ověří release bez editoru a bez přístupu do jeho databáze',async({page})=>{
 await page.addInitScript(()=>{indexedDB.open=()=>{throw new Error('Veřejná hra nesmí otevřít editor DB');};});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.goto(base);await expect(page.getByRole('heading',{level:1})).toContainText('Celá Praha.');await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();await expect(page.getByRole('button',{name:/Vytvořit hru/})).toBeDisabled();await expect(page.getByRole('button',{name:/Připojit se/})).toBeDisabled();await expect(page.getByRole('heading',{name:'Geografický editor'})).toHaveCount(0);await expect(page.getByRole('link',{name:/Geografický editor/})).toHaveAttribute('href','./editor/');expect(requests.some(url=>/pid\.worker|park-import|geoman|geos|editor\/assets/.test(url))).toBe(false);expect(errors).toEqual([]);
 await page.screenshot({path:'test-results/public-game-desktop.png',fullPage:true});
 await expect(page.locator('.data-counts > div').filter({has:page.getByText('Knihovny',{exact:true})}).locator('dd')).toHaveText('45');
 await page.setViewportSize({width:390,height:844});await expect(page.getByRole('heading',{level:1})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.screenshot({path:'test-results/public-game-mobile.png',fullPage:true});
});

test('kořen veřejné hry nepřepíše původní svět; editor na nové cestě zachová oblast, parky i PID a umožní zálohu',async({page})=>{
 const {world}=await releaseTestInput();world.title='Původní soukromý svět';
 await page.goto(base);await page.evaluate(async serialized=>{const world=JSON.parse(serialized);await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('jetlag-praha-editor',1);open.onupgradeneeded=()=>open.result.createObjectStore('drafts');open.onerror=()=>reject(open.error);open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(world,'world');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});},JSON.stringify(world));
 await page.reload();await expect(page.getByText('Kontrolní součty ověřeny')).toBeVisible();expect(await storedWorld(page)).toEqual(world);
 await page.getByRole('link',{name:/Geografický editor/}).click();await expect(page).toHaveURL(base+'editor/');await expect(page.getByRole('heading',{name:'Geografický editor'})).toBeVisible();await expect.poll(async()=>(await storedWorld(page)).id).toBe(world.id);
 await expect.poll(async()=>(await storedWorld(page)).poi?.pointCatalog?.length).toBe(91);
 const saved=await storedWorld(page);expect(saved.layers.find(layer=>layer.kind==='game_area')!.features).toEqual(world.layers[0].features);expect(saved.poi).toMatchObject(world.poi!);expect(saved.poi?.pointCatalog).toHaveLength(91);expect(saved.gameStops).toEqual(world.gameStops);
 const backup=page.waitForEvent('download');await page.getByRole('button',{name:'Stáhnout zálohu',exact:true}).click();const download=await backup;const exported=JSON.parse(await readFile((await download.path())!,'utf8'));expect(exported.world.poi).toMatchObject(world.poi!);expect(exported.world.poi.pointCatalog).toHaveLength(91);
 await page.getByRole('button',{name:'Publikace herních podkladů',exact:true}).click();const panel=page.getByRole('dialog',{name:'Publikace herních podkladů'});await expect(panel.getByText('Publikace není nakonfigurována',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Publikovat změny',exact:true})).toBeDisabled();await expect(panel.getByRole('button',{name:'Přihlásit přes GitHub'})).toBeDisabled();
 await expect(panel.getByRole('button',{name:'Zkontrolovat data k publikaci'})).toBeEnabled({timeout:30000});await panel.getByRole('button',{name:'Zkontrolovat data k publikaci'}).click();await expect(panel.getByRole('heading',{name:/Návrh publikace|Žádné nepublikované/})).toBeVisible({timeout:30000});await expect(panel.getByRole('button',{name:'Publikovat změny',exact:true})).toBeDisabled();
 await page.reload();await expect(page.getByRole('heading',{name:'Geografický editor'})).toBeVisible();expect((await storedWorld(page)).poi).toMatchObject(world.poi!);
});

test('veřejný klient odmítne chybějící nebo poškozený artefakt bez pádu editorového úložiště',async({page})=>{
 await page.route('**/releases/release-*.json',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));await page.goto(base);await expect(page.getByRole('alert')).toContainText('poškozený');await expect(page.getByText('Kontrolní součty ověřeny')).toHaveCount(0);
 await page.route('**/releases/current.json',route=>route.fulfill({status:404,body:''}));await page.reload();await expect(page.getByRole('alert')).toContainText('nejsou dostupné');
});
