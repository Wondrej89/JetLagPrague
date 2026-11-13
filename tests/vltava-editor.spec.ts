import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {storedWorld} from './draft-helper';
import type {VltavaSource,VltavaAssembly} from '../packages/geo-core/src/vltava-assembly';
const base='http://127.0.0.1:4175/JetLagPrague/editor/';
const sourcePromise=readFile('apps/editor/public/vltava/streams.json','utf8').then(s=>JSON.parse(s) as VltavaSource);
const panel=(page:Page)=>page.getByRole('region',{name:'Vltava – sestavení řeky',exact:true});
async function open(page:Page){
 await page.goto(base);await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false',{timeout:30000});
 await page.getByRole('button',{name:'Otevřít nástroj Vltava',exact:true}).click();
 await expect(page.getByTestId('map')).toHaveAttribute('data-vltava-count','62',{timeout:30000});
 await expect.poll(async()=>!!(await storedWorld(page)).vltavaAssembly).toBe(true);
}
async function focus(page:Page,id:string){await panel(page).getByLabel('Hledat tok podle GLOBALID').fill(id);await panel(page).locator('.vltava-id-list button').click();await expect(page.getByRole('region',{name:'Vybraný úsek Vltavy'})).toContainText(id);}
/** Actual pointer hit on a rendered source path, not a dispatched DOM event or
 * a call into app internals. The path is focused/raised before the hit. */
async function clickPolygon(page:Page,id:string){
 const path=page.getByTestId('map').locator(`path[data-vltava-id="${id}"]`).first();await expect(path).toBeVisible();
 const point=await path.evaluate(element=>{const p=element as SVGPathElement,m=p.getScreenCTM()!,bounds=p.closest('[data-testid="map"]')!.getBoundingClientRect();for(let i=1;i<100;i++){const v=p.getPointAtLength(p.getTotalLength()*i/100),q=new DOMPoint(v.x,v.y).matrixTransform(m);if(q.x>bounds.left+15&&q.x<bounds.right-15&&q.y>bounds.top+15&&q.y<bounds.bottom-15)return {x:q.x,y:q.y};}throw new Error('Zdrojový polygon nemá viditelnou část v mapě.');});
 await page.mouse.click(point.x,point.y);
}
test.beforeEach(async({page})=>{await page.route('https://api.mapy.com/**',route=>route.abort());});

test('Pages editor: all T modes, real map selection, undo/redo, union, holes, save/reload and continuing work preserve original water data',async({page})=>{
 test.setTimeout(120000);await open(page);const source=await sourcePromise,before=await storedWorld(page),controls=panel(page);
 await controls.getByRole('button',{name:'Zpět ve výběru',exact:true}).click();await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly).toBeUndefined();
 await controls.getByRole('button',{name:'Znovu ve výběru',exact:true}).click();await expect.poll(async()=>!!(await storedWorld(page)).vltavaAssembly).toBe(true);
 await controls.getByLabel('Zobrazení toků').selectOption('related');await expect(page.getByTestId('map')).toHaveAttribute('data-vltava-count','173');
 await controls.getByLabel('Zobrazení toků').selectOption('all');await expect(page.getByTestId('map')).toHaveAttribute('data-vltava-count','2755');
 await controls.getByLabel('Zobrazení toků').selectOption('selected');await expect(page.getByTestId('map')).toHaveAttribute('data-vltava-count','0');
 await controls.getByLabel('Zobrazení toků').selectOption('candidates');await controls.getByRole('button',{name:'Načíst 62 kandidátů z auditu',exact:true}).click();
 await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(62);
 const more=source.records.find(r=>r.related&&!r.candidate&&r.neighbors.some(id=>source.records.find(s=>s.globalId===id)?.candidate))!,remove=source.records.find(r=>r.candidate&&r.globalId!==more.globalId)!;
 await focus(page,more.globalId);await controls.getByRole('checkbox',{name:'Zobrazit sousední nevybrané polygony',exact:true}).check();await expect(page.locator('.vltava-stream.neighbor')).not.toHaveCount(0);
 await clickPolygon(page,more.globalId);await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(63);await expect(page.locator(`[data-vltava-id="${more.globalId}"]`).first()).toHaveClass(/included/);
 await focus(page,remove.globalId);await clickPolygon(page,remove.globalId);await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(62);
 await controls.getByRole('button',{name:'Zpět ve výběru',exact:true}).click();await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(63);
 await controls.getByRole('button',{name:'Znovu ve výběru',exact:true}).click();await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(62);
 await page.getByLabel('Poznámky správce',{exact:true}).fill('Rozpracované doplnění ramen; zatím neschváleno.');
 await controls.getByRole('button',{name:'Vytvořit náhled sjednocené řeky',exact:true}).click();await expect(page.getByTestId('vltava-preview')).toContainText('62 zdrojových polygonů',{timeout:30000});await expect(page.locator('.vltava-result')).not.toHaveCount(0);
 await page.getByRole('button',{name:'Předat náhled k revizi',exact:true}).click();await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.status).toBe('review');
 await expect(page.getByRole('button',{name:'Schválit výslednou Vltavu',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Export schválené Vltavy GeoJSON',exact:true})).toBeDisabled();
 await controls.getByRole('button',{name:'Uložit draft Vltavy',exact:true}).click();await expect(controls).toContainText('Draft Vltavy je uložený');
 const saved=(await storedWorld(page)).vltavaAssembly!;expect(saved.selectedIds).toContain(more.globalId);expect(saved.excludedCandidateIds).toContain(remove.globalId);
 const download=page.waitForEvent('download');await controls.getByRole('button',{name:'Export výběru Vltavy JSON',exact:true}).click();const path=await (await download).path(),exported=JSON.parse(await readFile(path!,'utf8')) as VltavaAssembly;expect(exported).toEqual(saved);expect(JSON.stringify(exported)).not.toContain('coordinates');
 await open(page);await expect(page.getByLabel('Poznámky správce',{exact:true})).toHaveValue(saved.note);expect((await storedWorld(page)).vltavaAssembly).toEqual(saved);
 await expect(page.getByTestId('vltava-preview')).toBeVisible({timeout:30000});await panel(page).getByLabel('Zobrazení toků').selectOption('result');await expect(page.locator('.vltava-result')).not.toHaveCount(0);
 await panel(page).getByLabel('Zobrazení toků').selectOption('related');await focus(page,more.globalId);await clickPolygon(page,more.globalId);await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.status).toBe('draft');
 await panel(page).getByLabel('Import výběru Vltavy JSON').setInputFiles({name:'vltava-vyber.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds).toEqual(saved.selectedIds);
 const after=await storedWorld(page);expect(after.poi!.waterSources).toEqual(before.poi!.waterSources);expect(after.layers).toEqual(before.layers);expect(after.gameStops).toEqual(before.gameStops);
 await page.screenshot({path:'test-results/vltava-editor.png',fullPage:true});
});

test('source mismatch import is refused and unresolved checks cannot approve or export the candidate geometry',async({page})=>{
 test.setTimeout(90000);await open(page);const controls=panel(page);await controls.getByRole('button',{name:'Načíst 62 kandidátů z auditu',exact:true}).click();
 await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(62);const draft=(await storedWorld(page)).vltavaAssembly!;
 await controls.getByLabel('Import výběru Vltavy JSON').setInputFiles({name:'spatny-zdroj.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...draft,source:{...draft.source,rawChecksum:'f'.repeat(64)}}))});await expect(controls.getByRole('alert')).toContainText('checksum');expect((await storedWorld(page)).vltavaAssembly).toEqual(draft);
 await controls.getByRole('button',{name:'Vytvořit náhled sjednocené řeky',exact:true}).click();await expect(page.getByTestId('vltava-preview')).toContainText('10 otvorů',{timeout:30000});await expect(page.locator('.vltava-hole')).toHaveCount(10);
 await page.getByRole('button',{name:'Předat náhled k revizi',exact:true}).click();
 await page.getByLabel('Revize: Ostrov Žofín',{exact:true}).selectOption('unresolved');await page.getByLabel('Poznámka: Ostrov Žofín',{exact:true}).fill('Nelze potvrdit vodu pod lávkou.');
 await expect(page.getByRole('button',{name:'Schválit výslednou Vltavu',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Export schválené Vltavy GeoJSON',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Publikace herních podkladů',exact:true}).click();await expect(page.getByRole('dialog',{name:'Publikace herních podkladů'})).toContainText('Výběr Vltavy není součástí tohoto GameDataRelease');
});
