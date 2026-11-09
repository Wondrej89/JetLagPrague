import {expect,test,type Page} from '@playwright/test';
import type {SavedSimulation} from '../apps/simulator/src/storage';
const base='http://127.0.0.1:4175/JetLagPrague/simulator/';
const phone=(page:Page,role='hunter')=>page.getByTestId('phone-'+role);
async function stored(page:Page):Promise<SavedSimulation>{return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('jetlag-praha:simulator:v1',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('games').objectStore('games').get('current');q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=()=>reject(q.error);};}));}
async function create(page:Page,on=true){await page.goto(base);await expect(page.getByRole('button',{name:'Založit simulaci',exact:true})).toBeVisible({timeout:30000});await page.getByRole('combobox',{name:'Varianta nové hry',exact:true}).selectOption('medium');await page.getByRole('combobox',{name:'Automatické zakreslování',exact:true}).selectOption(on?'on':'off');await page.getByLabel('Souhlas hledačů s tímto nastavením',{exact:true}).check();await page.getByLabel('Souhlas schovaného s tímto nastavením',{exact:true}).check();await page.getByRole('button',{name:'Založit simulaci',exact:true}).click();await expect(phone(page)).toBeVisible();for(const role of ['hunter','hider'])await phone(page,role).getByRole('button',{name:on?'Ano, souhlasím':'Ne, hrát bez zakreslování',exact:true}).click();for(const role of ['hunter','hider'])await phone(page,role).getByRole('button',{name:'Jsem připraven',exact:true}).click();await page.getByRole('button',{name:'Pozastavit simulaci',exact:true}).click();await expect.poll(async()=>(await stored(page)).paused).toBe(true);}
async function scenario(page:Page,id:string){await page.getByRole('combobox',{name:'Testovací scénář',exact:true}).selectOption(id);await page.getByRole('button',{name:'Načíst testovací scénář',exact:true}).click();await expect.poll(async()=>(await stored(page)).scenario).toBe(id);}
async function tab(page:Page,role:string,label:string){await phone(page,role).locator('.phone-nav button').filter({hasText:label}).click();}
const map=(page:Page)=>phone(page).getByTestId('game-map-tools');
const adminMap=(page:Page)=>page.locator('.sim-map').getByTestId('game-map-tools');
test.beforeEach(async({page})=>{await page.route('https://api.mapy.com/**',r=>r.abort());});

test('Measuring rail uses published train markers, private diagnostics, frozen snapshots, 3 → 1 and real deductions after reload',async({page})=>{
 test.setTimeout(90000);
 const {gameFixture}=await import('../packages/game-core/src/test-fixtures'),fixture=await gameFixture();
 const {publishedRailCatalog}=await import('../packages/geo-resolver/src/rail'),stations=publishedRailCatalog(fixture.release).stations;
 await create(page);await scenario(page,'deck-100');
 await page.getByLabel('Longitude hunter',{exact:true}).fill(String(stations[0].point[0]+.001));await page.getByLabel('Latitude hunter',{exact:true}).fill(String(stations[0].point[1]));await page.getByRole('button',{name:'Nastavit GPS hledačů',exact:true}).click();
 await tab(page,'hunter','Otázky');
 await phone(page).getByRole('button',{name:/Measuring/}).click();
 const choice=phone(page).locator('.question-choice').filter({has:page.getByRole('heading',{name:'Železniční stanice',exact:true})});
 await expect(choice).toContainText('Jsi blíž, nebo dál od nejbližší železniční stanice než já?');
 await choice.getByRole('button',{name:'Položit otázku',exact:true}).click();
 await expect.poll(async()=>(await stored(page)).state.questions.length).toBe(1);
 const q=(await stored(page)).state.questions[0],expected=fixture.env.resolve(q);expect(expected).toMatchObject({state:'known',answer:'DÁL'});expect(q.deadline!-q.askedAt).toBe(300000);
 await page.getByRole('combobox',{name:'Otázka pro diagnostiku',exact:true}).selectOption(q.id);
 const diagnostics=JSON.parse((await page.getByTestId('question-diagnostics').textContent())!);
 expect(diagnostics.expected).toEqual(expected);expect(diagnostics.expected.details.hunterStationName).toBeTruthy();expect(diagnostics.expected.details.targetStationName).toBeTruthy();
 for(const role of ['hunter','hider']){
  const point=stations[role==='hunter'?0:1].point;
  await page.getByLabel(`Longitude ${role}`,{exact:true}).fill(String(point[0]));await page.getByLabel(`Latitude ${role}`,{exact:true}).fill(String(point[1]));
  await page.getByRole('button',{name:role==='hunter'?'Nastavit GPS hledačů':'Nastavit GPS schovaného',exact:true}).click();
 }
 await page.getByRole('button',{name:'+5 minut',exact:true}).click();
 await expect.poll(async()=>(await stored(page)).state.questions[0].state).toBe('answered');
 const answered=(await stored(page)).state;
 expect(answered.questions[0]).toMatchObject({answer:expected.answer,hunterFix:q.hunterFix,targetPoint:q.targetPoint});expect(answered.rewards[0].policy).toEqual({draw:3,keep:1});expect(answered.deductions).toHaveLength(1);
 await tab(page,'hunter','Otázky');await expect(phone(page).getByTestId('last-answer')).toContainText(expected.answer!);await expect(phone(page)).not.toContainText('targetStationName');
 await phone(page).getByRole('button',{name:'Zobrazit mapu a vrstvy'}).click();
 await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(map(page)).toHaveAttribute('data-deduction-count','1');
 await map(page).getByRole('button',{name:'Vrstvy',exact:true}).click();const panel=map(page).getByRole('region',{name:'Vrstvy mapy'});
 await panel.getByRole('checkbox',{name:/Železniční stanice/}).check();
 await expect(map(page).locator('[data-public-layer="rail"]')).toHaveCount(stations.length);await expect(map(page).locator('[data-public-layer="rail"]').first()).toContainText('🚆');
 await panel.getByLabel('Hledat objekt v publikovaném katalogu').fill(stations[0].id);await panel.locator('.map-search-result').filter({hasText:'Železniční stanice'}).click();
 await map(page).locator(`[data-public-layer="rail"][data-public-feature="${stations[0].id}"]`).click();await expect(map(page).locator('.leaflet-popup')).toContainText(stations[0].name);await expect(map(page).locator('.leaflet-popup')).toContainText(`GPS: ${stations[0].point[1]}, ${stations[0].point[0]}`);
 await tab(page,'hider','Karty');await phone(page,'hider').getByRole('button',{name:'Otevřít karetní odměnu'}).click();await expect(phone(page,'hider').locator('.offered-card')).toHaveCount(3);await phone(page,'hider').locator('.offered-card').first().click();await expect.poll(async()=>(await stored(page)).state.rewards[0].state).toBe('claimed');
 const beforeReload=(await stored(page)).state;
 await page.reload();await expect(phone(page)).toBeVisible({timeout:30000});await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});
 expect((await stored(page)).state.questions).toEqual(beforeReload.questions);expect((await stored(page)).state.deductions).toEqual(beforeReload.deductions);expect((await stored(page)).state.hand).toEqual(beforeReload.hand);expect(beforeReload.hand).toHaveLength(1);await expect(map(page).locator('[data-public-layer="rail"]')).toHaveCount(stations.length);
});

test('new game requires explicit decisions of both roles; deduction defaults off and cannot be changed in the running game',async({page})=>{
 await create(page,false);expect((await stored(page)).state.lobby?.choices).toEqual({hunter:false,hider:false});
 await scenario(page,'radar-in');await tab(page,'hider','Otázka');await phone(page,'hider').getByRole('button',{name:'Odpovědět nyní'}).click();expect((await stored(page)).state.deductions).toEqual([]);expect((await stored(page)).state.questions[0].answer).toBe('ANO');await map(page).getByRole('button',{name:'Dedukce',exact:true}).click();await expect(map(page).getByRole('region',{name:'Dedukční mapa'})).toContainText('vypnuté');expect((await stored(page)).state.rules.automaticDeductionMap).toBe(false);
});
test('published POI layers, precise reference points, search, popup metadata and missing categories work independently of a pending question',async({page})=>{
 await create(page,false);await scenario(page,'different-hospital');const before=(await stored(page)).state.questions[0];await map(page).getByRole('button',{name:'Vrstvy',exact:true}).click();const panel=map(page).getByRole('region',{name:'Vrstvy mapy'});
 await expect(panel.getByRole('checkbox',{name:/Golfová hřiště/})).toBeDisabled();await expect(panel.getByRole('checkbox',{name:/Vltava/})).toBeDisabled();await panel.getByRole('checkbox',{name:/Nemocnice/}).check();await map(page).getByRole('button',{name:'Zavřít mapový panel'}).click();await expect(map(page).locator('[data-public-layer="hospital"]')).toHaveCount(10);
 await map(page).getByRole('button',{name:'Vrstvy',exact:true}).click();await panel.getByLabel('Hledat objekt v publikovaném katalogu').fill('hospital-motol');await panel.getByRole('button',{name:/Fakultní nemocnice v Motole/}).click();await map(page).locator('[data-public-layer="hospital"][data-public-feature="hospital-motol"]').click();await expect(map(page).locator('.leaflet-popup')).toContainText('V Úvalu 84/1');await expect(map(page).locator('.leaflet-popup')).toContainText('50.0740153');expect((await stored(page)).state.questions[0]).toEqual(before);
 await page.reload();await expect(phone(page)).toBeVisible({timeout:30000});await expect(map(page).locator('[data-public-layer="hospital"]')).toHaveCount(10);expect((await stored(page)).state.questions[0]).toEqual(before);
});
test('real worker renders red/green deductions and reload preserves immutable snapshots and layer preferences',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await create(page);await scenario(page,'map-radar-no');await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(map(page).locator('[data-public-layer="excluded"]')).not.toHaveCount(0);const before=(await stored(page)).state;
 await map(page).getByRole('button',{name:'Dedukce',exact:true}).click();const panel=map(page).getByRole('region',{name:'Dedukční mapa'});await expect(panel).toContainText('NE');await panel.getByRole('checkbox',{name:'Vyloučené území (červená)',exact:true}).uncheck();await expect(map(page).locator('[data-public-layer="excluded"]')).toHaveCount(0);expect((await stored(page)).state.deductions).toEqual(before.deductions);
 await page.reload();await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});expect((await stored(page)).state.questions).toEqual(before.questions);expect((await stored(page)).state.deductions).toEqual(before.deductions);await expect(map(page).locator('[data-public-layer="excluded"]')).toHaveCount(0);expect(errors).toEqual([]);
});
for(const id of ['map-radar-overlap','map-measuring-polygons','map-thermo-warmer','map-combined'])test(`production geometric scenario ${id} remains interactive and uses the actual published release`,async({page})=>{
 await create(page);await scenario(page,id);await expect(adminMap(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});const state=(await stored(page)).state;expect(state.deductions!.every(d=>d.releaseId===state.releaseId)).toBeTruthy();await map(page).getByRole('button',{name:'Vrstvy',exact:true}).click();await expect(map(page).getByRole('region',{name:'Vrstvy mapy'})).toBeVisible();
});

test('different GPS snapshots remain separate from the station and from each other',async({page})=>{
 await create(page);await scenario(page,'map-targets');await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(map(page)).toHaveAttribute('data-deduction-count','1');const state=(await stored(page)).state;expect(state.deductions!.filter(d=>d.geometryTarget==='gps')).toHaveLength(2);
 await map(page).getByRole('button',{name:'Dedukce',exact:true}).click();await map(page).getByRole('combobox',{name:'Rozhodný cíl',exact:true}).selectOption('gps');await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(map(page)).toHaveAttribute('data-deduction-count','1');await expect(map(page).getByRole('combobox',{name:'Okamžik GPS',exact:true}).locator('option')).toHaveCount(2);
});
test('synthetic conflicting constraints are confined to administrator diagnostics',async({page})=>{
 await create(page);await scenario(page,'map-conflict');await expect(adminMap(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(adminMap(page)).toHaveAttribute('data-possible-empty','true');await expect(adminMap(page)).toHaveAttribute('data-deduction-count','2');await expect(map(page)).toHaveAttribute('data-deduction-count','1');expect((await stored(page)).state.questions).toHaveLength(1);expect((await stored(page)).state.deductions).toHaveLength(1);
});
test('Move reveals the origin, clears current deductions, persists its private destination and resumes after exactly 20 minutes',async({page})=>{
 const methods:string[]=[];page.on('request',r=>methods.push(r.method()));await create(page);await scenario(page,'move-reload');const before=(await stored(page)).state,move=before.cardState!.move!;
 await expect(phone(page).getByRole('dialog',{name:'Schovaný použil Move'})).toContainText(move.origin.name);await expect(map(page)).toHaveAttribute('data-deduction-count','0');expect(before.deductions!.every(d=>d.status==='archived')).toBe(true);expect(move.selectedStopId).toBeTruthy();expect(before.station!.id).toBe(move.origin.id);
 await page.reload();await expect(phone(page)).toBeVisible({timeout:30000});expect((await stored(page)).state.cardState!.move!.selectedStopId).toBe(move.selectedStopId);await expect(phone(page,'hider').locator('.phone-clock strong')).toHaveText('00:00:00');
 for(let i=0;i<4;i++)await page.getByRole('button',{name:'+5 minut',exact:true}).click();await expect.poll(async()=>(await stored(page)).state.cardState!.move!.stage).toBe('completed');const after=(await stored(page)).state;expect(after.station!.id).toBe(move.selectedStopId);expect(after.cardState!.move!.endedAt!-move.startedAt).toBe(20*60000);expect(after.questions).toEqual(before.questions);expect(after.hand).toEqual([]);await expect(phone(page,'hider').locator('.phone-clock strong')).toHaveText('00:01:00');expect(methods.every(m=>m==='GET')).toBe(true);
});
test('a new epoch only combines new answers and endgame prevents Move',async({page})=>{
 await create(page);await scenario(page,'move-epoch');await expect(map(page)).toHaveAttribute('data-deduction-state','ready',{timeout:30000});await expect(map(page)).toHaveAttribute('data-deduction-count','1');const state=(await stored(page)).state;expect(state.deductions!.filter(d=>d.status==='archived')).toHaveLength(1);expect(state.deductions!.filter(d=>d.status==='active')).toHaveLength(1);
 await scenario(page,'move-endgame');await tab(page,'hider','Karty');await expect(phone(page,'hider').locator('.hand-card').filter({has:page.getByRole('heading',{name:'Move',exact:true})}).getByRole('button',{name:'Zahrát kartu'})).toBeDisabled();expect((await stored(page)).state.endgame).toBe(true);
});
test('mobile hunter map remains usable for layers and a pending question',async({page})=>{
 await page.setViewportSize({width:390,height:844});await create(page,false);await scenario(page,'different-hospital');await phone(page).scrollIntoViewIfNeeded();await map(page).getByRole('button',{name:'Vrstvy',exact:true}).click();await map(page).getByRole('checkbox',{name:/Nemocnice/}).check();await expect(map(page).locator('[data-public-layer="hospital"]')).toHaveCount(10);await map(page).getByRole('button',{name:'Zavřít mapový panel'}).click();await tab(page,'hunter','Otázky');await phone(page).getByRole('button',{name:'Zobrazit mapu a vrstvy'}).click();await expect(map(page).locator('[data-public-layer="hospital"]')).toHaveCount(10);expect((await stored(page)).state.questions[0].state).toBe('pending');
});

test('inspecting a published polygon on the administrator map never teleports a player',async({page})=>{
 const {gameFixture}=await import('../packages/game-core/src/test-fixtures'),fixture=await gameFixture(),park=fixture.release.data.pois.find(p=>p.category==='park')!;
 await create(page,false);await scenario(page,'radar-in');const before=(await stored(page)).state.fixes;
 await adminMap(page).getByRole('button',{name:'Vrstvy',exact:true}).click();const panel=adminMap(page).getByRole('region',{name:'Vrstvy mapy'});await panel.getByLabel('Hledat objekt v publikovaném katalogu').fill(park.id);await panel.getByRole('button',{name:new RegExp(park.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();
 const path=adminMap(page).locator(`[data-public-layer="park"][data-public-feature="${park.id}"]`);await expect(path).toBeVisible();const position=await path.evaluate(el=>{const path=el as SVGGeometryElement,p=path.getPointAtLength(path.getTotalLength()*.35),screen=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM()!);return {x:screen.x,y:screen.y};});await page.mouse.click(position.x,position.y);await expect(adminMap(page).locator('.leaflet-popup')).toContainText(park.name);expect((await stored(page)).state.fixes).toEqual(before);
 await page.screenshot({path:'test-results/game-map-polygon.png',fullPage:true});
});
