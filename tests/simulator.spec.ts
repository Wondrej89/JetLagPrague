import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {SavedSimulation} from '../apps/simulator/src/storage';
import {atlasTiles} from '../apps/simulator/src/basemap';
// Exercise the actual minified Pages app, not a separate development-only entry.
const base='http://127.0.0.1:4175/JetLagPrague/simulator/';
async function stored(page:Page):Promise<SavedSimulation>{return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('jetlag-praha:simulator:v1',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction('games','readonly'),get=tx.objectStore('games').get('current');get.onsuccess=()=>{db.close();resolve(get.result);};tx.onerror=()=>reject(tx.error);};r.onerror=()=>reject(r.error);}));}
async function ready(page:Page){await expect(page.getByTestId('phone-hunter')).toBeVisible({timeout:30000});await expect.poll(async()=>(await stored(page))?.state?.version).toBe(1);}
async function scenario(page:Page,id:string){await page.getByRole('combobox',{name:'Testovací scénář',exact:true}).selectOption(id);await page.getByRole('button',{name:'Načíst testovací scénář',exact:true}).click();await expect.poll(async()=>(await stored(page)).scenario).toBe(id);await expect.poll(async()=>(await stored(page)).state.phase).toBe(id==='blank'||id==='overlap'||id==='missing-gps'?'hiding':'seeking');}
const hunter=(page:Page)=>page.getByTestId('phone-hunter'),hider=(page:Page)=>page.getByTestId('phone-hider');
async function tab(page:Page,role:'hunter'|'hider',label:string){await page.getByTestId('phone-'+role).locator('.phone-nav button').filter({hasText:label}).click();}
test.beforeEach(async({page})=>{await page.route('https://api.mapy.com/**',r=>r.abort());});

test('skutečné mobilní telefony: výběr stanoviště → otázka → odpověď → uložená nabídka 3 → 1 → reload',async({page})=>{
 await page.goto(base);await ready(page);
 await page.evaluate(()=>localStorage.setItem('jetlag-praha:world:v1','EDITOR_UNCHANGED'));
 await hider(page).locator('.station-list button').first().click();await hider(page).getByRole('button',{name:'Potvrdit a uzamknout stanoviště'}).click();await expect(hunter(page).getByRole('button',{name:/Položit otázku/})).toBeEnabled();
 await hunter(page).getByRole('button',{name:/Položit otázku/}).click();await hunter(page).getByRole('button',{name:/Matching/}).click();await hunter(page).locator('.question-choice').filter({has:page.getByRole('heading',{name:'Zoo',exact:true})}).getByRole('button',{name:'Položit otázku',exact:true}).click();
 await tab(page,'hider','Otázka');await expect(hider(page).getByRole('heading',{name:'Zoo',exact:true})).toBeVisible();await hider(page).getByRole('button',{name:'Odpovědět nyní'}).click();await expect(hunter(page).getByTestId('last-answer')).toContainText('ANO');
 await tab(page,'hider','Karty');await hider(page).getByRole('button',{name:'Otevřít karetní odměnu'}).click();await expect(hider(page).locator('.offered-card')).toHaveCount(3);
 await expect.poll(async()=>(await stored(page)).state.rewards[0].state).toBe('offered');const offer=(await stored(page)).state.rewards[0].offer;
 await page.reload();await ready(page);await tab(page,'hider','Karty');await expect(hider(page).locator('.offered-card')).toHaveCount(3);expect((await stored(page)).state.rewards[0].offer).toEqual(offer);await hider(page).locator('.offered-card').first().click();
 await expect.poll(async()=>(await stored(page)).state.hand.length).toBe(1);expect((await stored(page)).state.discardPile).toEqual(offer.slice(1));expect(await page.evaluate(()=>localStorage.getItem('jetlag-praha:world:v1'))).toBe('EDITOR_UNCHANGED');
 await page.screenshot({path:'test-results/simulator-desktop.png',fullPage:true});
});

test('časovač, snapshot GPS, Veto a Randomize mění společný stav a nikdy nevytvářejí dvojí odměnu',async({page})=>{
 await page.goto(base);await ready(page);await scenario(page,'timeout');const before=await stored(page);await page.getByLabel('Longitude hunter',{exact:true}).fill('14.55');await page.getByRole('button',{name:'Nastavit GPS hledačů',exact:true}).click();
 await page.getByRole('button',{name:'+5 minut',exact:true}).click();await expect.poll(async()=>(await stored(page)).state.questions[0].state).toBe('answered');const after=await stored(page);expect(after.state.questions[0].answer).toBe('ANO');expect(after.state.questions[0].hunterFix).toEqual(before.state.questions[0].hunterFix);expect(after.state.rewards).toHaveLength(1);
 await scenario(page,'veto');await tab(page,'hider','Karty');await hider(page).locator('.hand-card').filter({has:page.getByRole('heading',{name:'Veto',exact:true})}).getByRole('button',{name:'Zahrát kartu'}).click();await expect.poll(async()=>(await stored(page)).state.questions[0].state).toBe('vetoed');expect((await stored(page)).state.rewards).toEqual([]);
 await scenario(page,'randomize');const old=(await stored(page)).state.questions[0];await tab(page,'hider','Karty');await hider(page).locator('.hand-card').filter({has:page.getByRole('heading',{name:'Randomize',exact:true})}).getByRole('button',{name:'Zahrát kartu'}).click();await expect.poll(async()=>(await stored(page)).state.questions[0].definition.id).not.toBe(old.definition.id);const randomized=(await stored(page)).state.questions[0];expect(randomized.deadline).toBe(old.deadline);expect(randomized.hunterFix).toEqual(old.hunterFix);
});

test('limit ruky, aktivní prokletí a upozornění na přiblížení přetrvají obnovu a zůstávají oddělené mezi rolemi',async({page})=>{
 await page.goto(base);await ready(page);await scenario(page,'overflow');await expect(hider(page).getByRole('alert')).toContainText('Překročen limit');await page.reload();await ready(page);await expect(hider(page).getByRole('alert')).toContainText('Překročen limit');await tab(page,'hider','Karty');await hider(page).locator('.hand-card').first().getByRole('button',{name:'Odhodit kartu'}).click();await expect.poll(async()=>(await stored(page)).state.hand.length).toBe(6);
 await scenario(page,'curse');await tab(page,'hunter','Prokletí');await hunter(page).getByRole('button',{name:'Potvrdit splnění prokletí'}).click();await expect.poll(async()=>(await stored(page)).state.curses[0].state).toBe('fulfilled');
 await scenario(page,'transit-in');const station=(await stored(page)).state.station!;await page.getByLabel('Longitude hunter',{exact:true}).fill(String(station.point[0]));await page.getByLabel('Latitude hunter',{exact:true}).fill(String(station.point[1]));await page.getByRole('button',{name:'Nastavit GPS hledačů',exact:true}).click();expect((await stored(page)).state.events.filter(e=>e.type==='proximity')).toHaveLength(0);
 await page.getByLabel('Hledači jsou pěšky',{exact:true}).check();await expect(hider(page).locator('.proximity')).toBeVisible();await expect(hunter(page)).not.toContainText('Hledači jsou poblíž');await page.reload();await ready(page);await expect(hider(page).locator('.proximity')).toBeVisible();expect((await stored(page)).state.events.filter(e=>e.type==='proximity')).toHaveLength(1);
});

test('fotografie se uloží soukromě, přežije reload a ukáže se hledačům až po odeslání; export obsahuje obnovitelný scénář',async({page})=>{
 await page.goto(base);await ready(page);await scenario(page,'same-zoo');await tab(page,'hider','Otázka');await hider(page).getByRole('button',{name:'Odpovědět nyní'}).click();
 await hunter(page).getByRole('button',{name:/Položit otázku/}).click();await hunter(page).getByRole('button',{name:/Fotky/}).click();await hunter(page).locator('.question-choice').getByRole('button',{name:'Položit otázku',exact:true}).click();await tab(page,'hider','Otázka');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d')!.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];});await hider(page).getByLabel('Připojit fotografii').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(hider(page).getByAltText('Fotografie od schovaného')).toBeVisible();await expect(hunter(page).getByAltText('Fotografie od schovaného')).toHaveCount(0);
 await expect.poll(async()=>(await stored(page)).state.questions[1].draftPhotoId).toBeTruthy();await page.reload();await ready(page);await tab(page,'hider','Otázka');await expect(hider(page).getByAltText('Fotografie od schovaného')).toBeVisible();await hider(page).getByRole('button',{name:'Odeslat fotografii'}).click();await expect(hunter(page).getByAltText('Fotografie od schovaného')).toBeVisible();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Uložit scénář',exact:true}).click();const file=await download,raw=JSON.parse(await readFile((await file.path())!,'utf8'));expect(raw.format).toBe('jetlag-private-simulation');expect(Object.values(raw.photos).every(value=>String(value).startsWith('data:image/jpeg;base64,'))).toBe(true);expect(Object.keys(raw.photos)).toHaveLength(1);
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Reset hry',exact:true}).click();expect((await stored(page)).state.questions).toHaveLength(2);
 await page.getByRole('button',{name:'Nová hra',exact:true}).click();await expect.poll(async()=>(await stored(page)).state.questions.length).toBe(0);
 await page.getByLabel('Načíst soukromý scénář').setInputFiles((await file.path())!);await expect.poll(async()=>(await stored(page)).state.questions.length).toBe(2);await expect(hunter(page).getByAltText('Fotografie od schovaného')).toBeVisible();
 await page.getByLabel('Načíst soukromý scénář').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'jetlag-private-simulation',state:{releaseId:'release:'+'a'.repeat(64)}}))});await expect(page.locator('.sim-error')).toContainText('Uzamčená herní verze není dostupná');expect((await stored(page)).state.questions).toHaveLength(2);
});

test('mobilní klienti bez partie nečtou simulátor ani cizí polohy a nemají vodorovné přetečení',async({page,request})=>{
 const publicBase='http://127.0.0.1:4175/JetLagPrague/';expect((await request.get(publicBase+'simulator/src/Simulator.tsx')).status()).toBe(404);
 for(const role of ['hunter','hider']){await page.setViewportSize({width:375,height:812});await page.goto(publicBase+'?role='+role);await expect(page.getByTestId('phone-'+role)).toBeVisible();await expect(page.getByText('Mobilní klient · bez připojené partie')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.evaluate(async()=>await indexedDB.databases())).toEqual([]);await page.screenshot({path:`test-results/mobile-${role}.png`,fullPage:true});}
});

test('vývojový příkaz zachovává stejný simulátor a čtení publikovaného katalogu',async({page})=>{
 await page.goto('http://127.0.0.1:4177/');await ready(page);await expect(page.getByText('Testovací simulace – nejde o skutečnou multiplayerovou hru',{exact:true})).toBeVisible();await scenario(page,'reward');await tab(page,'hider','Karty');await expect(hider(page).locator('.offered-card')).toHaveCount(3);
});

test('Pages sandbox je oddělený mezi prohlížeči a nedotkne se editorového úložiště ani při resetu',async({page,browser})=>{
 await page.goto(base);await ready(page);await page.evaluate(async()=>{localStorage.setItem('jetlag-praha:world:v1','EDITOR_UNCHANGED');await new Promise<void>((resolve,reject)=>{const open=indexedDB.open('jetlag-praha-editor',1);open.onupgradeneeded=()=>open.result.createObjectStore('drafts');open.onsuccess=()=>{const db=open.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put({sentinel:'EDITOR_UNCHANGED'},'world');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});});
 await scenario(page,'overflow');const saved=await stored(page);
 const other=await browser.newContext();try{const second=await other.newPage();await second.route('https://api.mapy.com/**',r=>r.abort());await second.goto(base);await ready(second);expect((await stored(second)).state.hand).toEqual([]);expect((await stored(second)).scenario).toBe('blank');expect((await stored(second)).state.questions).toEqual([]);expect(await second.evaluate(()=>localStorage.getItem('jetlag-praha:world:v1'))).toBeNull();await scenario(second,'curse');expect((await stored(page)).state).toEqual(saved.state);}finally{await other.close();}
 await page.reload();await ready(page);expect((await stored(page)).state.hand).toEqual(saved.state.hand);page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Reset hry',exact:true}).click();await ready(page);
 expect(await page.evaluate(()=>localStorage.getItem('jetlag-praha:world:v1'))).toBe('EDITOR_UNCHANGED');expect(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('jetlag-praha-editor',1);r.onsuccess=()=>{const db=r.result,get=db.transaction('drafts').objectStore('drafts').get('world');get.onsuccess=()=>{db.close();resolve(get.result);};};}))).toEqual({sentinel:'EDITOR_UNCHANGED'});
});

test('produkční sandbox nikam neodesílá GPS, fotografie, ruku ani diagnostiku; mapa žádá pouze pevný veřejný atlas',async({page})=>{
 const network:{url:string;method:string;body:string|null;headers:Record<string,string>}[]=[],sockets:string[]=[],errors:string[]=[];
 page.on('request',r=>{if(/^https?:/.test(r.url()))network.push({url:r.url(),method:r.method(),body:r.postData(),headers:r.headers()});});page.on('websocket',socket=>sockets.push(socket.url()));page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  // The sandbox must never discover the visitor's real position or open a
  // production/editor database, even on the shared Pages origin.
  navigator.geolocation.getCurrentPosition=()=>{throw new Error('Real GPS forbidden in sandbox');};navigator.geolocation.watchPosition=()=>{throw new Error('Real GPS forbidden in sandbox');};
  const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args:Parameters<IDBFactory['open']>)=>{if(args[0]!=='jetlag-praha:simulator:v1')throw new Error('Foreign database');return open(...args);};
 });
 const png=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d')!.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];}),'base64');
 await page.route('https://api.mapy.com/**',r=>r.fulfill({contentType:r.request().url().includes('logo.svg')?'image/svg+xml':'image/png',body:r.request().url().includes('logo.svg')?'<svg xmlns="http://www.w3.org/2000/svg"/>':png}));
 await page.goto(base);await ready(page);await expect(page.getByTestId('basemap-status')).not.toContainText('Načítám',{timeout:30000});
 const tileRequests=()=>network.filter(item=>new URL(item.url).pathname.startsWith('/v1/maptiles/')).map(item=>new URL(item.url).pathname);
 const initialTiles=tileRequests();if(initialTiles.length)expect([...initialTiles].sort()).toEqual(atlasTiles().map(id=>'/v1/maptiles/basic/256/'+id).sort());
 await expect(page.getByText('Testovací simulace – nejde o skutečnou multiplayerovou hru',{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:/Přihlásit|Publikovat/})).toHaveCount(0);
 await scenario(page,'reward');await tab(page,'hider','Karty');await hider(page).locator('.offered-card').first().click();
 await page.getByLabel('Longitude hunter',{exact:true}).fill('14.555123456');await page.getByLabel('Latitude hunter',{exact:true}).fill('50.12223456');await page.getByRole('button',{name:'Nastavit GPS hledačů',exact:true}).click();
 await page.locator('.sim-map').getByRole('button',{name:'Zobrazit polohy'}).click();await page.locator('.sim-map .leaflet-control-zoom-in').click();await page.getByRole('button',{name:'Zobrazit interní herní stav'}).click();await expect(page.getByTestId('internal-state')).toContainText('14.555123456');
 await hunter(page).getByRole('button',{name:/Položit otázku/}).click();await hunter(page).getByRole('button',{name:/Fotky/}).click();await hunter(page).locator('.question-choice').getByRole('button',{name:'Položit otázku',exact:true}).click();await tab(page,'hider','Otázka');
 const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=4;c.height=4;c.getContext('2d')!.fillRect(0,0,4,4);return c.toDataURL('image/png').split(',')[1];});
 await hider(page).getByLabel('Připojit fotografii').setInputFiles({name:'PRIVATE_PHOTO_CANARY.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});await expect(hider(page).getByAltText('Fotografie od schovaného')).toBeVisible();await hider(page).getByRole('button',{name:'Odeslat fotografii'}).click();await expect(hunter(page).getByAltText('Fotografie od schovaného')).toBeVisible();
 const before=await stored(page),download=page.waitForEvent('download');await page.getByRole('button',{name:'Uložit scénář',exact:true}).click();const exported=JSON.parse(await readFile((await (await download).path())!,'utf8'));expect(exported.state.hand).toEqual(before.state.hand);expect(Object.keys(exported.photos)).toHaveLength(1);
 expect(tileRequests()).toEqual(initialTiles); // No viewport-dependent fetches.
 await page.reload();await ready(page);await expect.poll(async()=>(await stored(page)).state.questions.at(-1)?.photoId).toBe(before.state.questions.at(-1)?.photoId);expect((await stored(page)).state.hand).toEqual(before.state.hand);
 const allowedTiles=new Set(atlasTiles().map(id=>'/v1/maptiles/basic/256/'+id));
 for(const item of network){expect(item.method).toBe('GET');expect(item.body).toBeNull();const url=new URL(item.url);
  if(url.origin==='https://api.mapy.com'){expect(url.pathname==='/img/api/logo.svg'||allowedTiles.has(url.pathname)).toBe(true);expect([...url.searchParams.keys()].every(k=>k==='apikey')).toBe(true);}
  else{expect(url.origin).toBe(new URL(base).origin);expect(/^\/JetLagPrague\/(?:simulator\/(?:$|assets\/[\w.-]+)|releases\/(?:current\.json|release-[a-f0-9]{64}\.json))$/.test(url.pathname)).toBe(true);expect(url.search).toBe('');}
 }
 expect(JSON.stringify(network)).not.toMatch(/14\.555123456|50\.12223456|PRIVATE_PHOTO_CANARY|photo:|data:image|Authorization/);expect(sockets).toEqual([]);expect(errors).toEqual([]);
});

test('mapa mění GPS bez přichycení; překryv po 45 minutách vyžaduje volbu a zrychlený čas lze pozastavit',async({page})=>{
 await page.goto(base);await ready(page);await scenario(page,'overlap');await page.getByRole('button',{name:'Konec 45 minut',exact:true}).click();await expect.poll(async()=>(await stored(page)).state.phase).toBe('needs_station');expect((await stored(page)).state.deadlineCandidates!.length).toBeGreaterThan(1);await hider(page).locator('.station-list button').first().click();await expect.poll(async()=>(await stored(page)).state.phase).toBe('seeking');
 const selected=(await stored(page)).state.station!;await page.getByLabel('Longitude hunter',{exact:true}).fill(String(selected.point[0]+.004));await page.getByLabel('Latitude hunter',{exact:true}).fill(String(selected.point[1]));await page.getByRole('button',{name:'Nastavit GPS hledačů',exact:true}).click();
 const before=(await stored(page)).state.fixes.hunter!.point,box=(await page.locator('.sim-map .play-pin.hunter').boundingBox())!;await page.mouse.move(box.x+16,box.y+16);await page.mouse.down();await page.mouse.move(box.x+55,box.y+35,{steps:7});await page.mouse.up();await expect.poll(async()=>(await stored(page)).state.fixes.hunter!.point).not.toEqual(before);expect((await stored(page)).state.station!.point).toEqual(selected.point);
 const start=(await stored(page)).state.now;await page.getByRole('combobox',{name:'Rychlost',exact:true}).selectOption('60');await page.getByRole('button',{name:'Spustit čas',exact:true}).click();await expect.poll(async()=>(await stored(page)).state.now).toBeGreaterThan(start+20000);await page.getByRole('button',{name:'Pozastavit simulaci',exact:true}).click();await expect.poll(async()=>(await stored(page)).paused).toBe(true);
});
