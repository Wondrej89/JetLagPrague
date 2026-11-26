import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {storedWorld} from './draft-helper';
import type {VltavaSource,VltavaAssembly} from '../packages/geo-core/src/vltava-assembly';
const base='http://127.0.0.1:4175/JetLagPrague/editor/';
const sourcePromise=readFile('apps/editor/public/vltava/streams.json','utf8').then(s=>JSON.parse(s) as VltavaSource);
const panel=(page:Page)=>page.getByRole('region',{name:'Řeky – sestavení vodní plochy',exact:true});
async function open(page:Page){
 await page.goto(base);await expect(page.locator('.app-shell')).toHaveAttribute('aria-busy','false',{timeout:30000});
 await page.getByRole('button',{name:'Otevřít editor řek',exact:true}).click();
 await expect(page.getByTestId('map')).toHaveAttribute('data-vltava-count','62',{timeout:30000});
 await expect.poll(async()=>!!(await storedWorld(page)).vltavaAssembly).toBe(true);
}
async function focus(page:Page,id:string){await panel(page).getByLabel('Hledat tok podle GLOBALID').fill(id);await panel(page).locator('.vltava-id-list button').click();await expect(page.getByRole('region',{name:'Vybraný úsek řeky'})).toContainText(id);}
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
 await expect(page.getByRole('button',{name:'Schválit společnou vodní plochu',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Export schválené vodní plochy GeoJSON',exact:true})).toBeDisabled();
 await controls.getByRole('button',{name:'Uložit draft řek',exact:true}).click();await expect(controls).toContainText('Draft řek je uložený');
 const saved=(await storedWorld(page)).vltavaAssembly!;expect(saved.selectedIds).toContain(more.globalId);expect(saved.excludedCandidateIds).toContain(remove.globalId);
 const download=page.waitForEvent('download');await controls.getByRole('button',{name:'Export výběru řek JSON',exact:true}).click();const path=await (await download).path(),exported=JSON.parse(await readFile(path!,'utf8')) as VltavaAssembly;expect(exported).toEqual(saved);expect(JSON.stringify(exported)).not.toContain('coordinates');
 await open(page);await expect(page.getByLabel('Poznámky správce',{exact:true})).toHaveValue(saved.note);expect((await storedWorld(page)).vltavaAssembly).toEqual(saved);
 await expect(page.getByTestId('vltava-preview')).toBeVisible({timeout:30000});await panel(page).getByLabel('Zobrazení toků').selectOption('result');await expect(page.locator('.vltava-result')).not.toHaveCount(0);
 await panel(page).getByLabel('Zobrazení toků').selectOption('related');await focus(page,more.globalId);await clickPolygon(page,more.globalId);await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.status).toBe('draft');
 await panel(page).getByLabel('Import výběru řek JSON').setInputFiles({name:'vltava-vyber.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds).toEqual(saved.selectedIds);
 const after=await storedWorld(page);expect(after.poi!.waterSources).toEqual(before.poi!.waterSources);expect(after.layers).toEqual(before.layers);expect(after.gameStops).toEqual(before.gameStops);
 await page.screenshot({path:'test-results/vltava-editor.png',fullPage:true});
});

test('source mismatch import is refused and unresolved checks cannot approve or export the candidate geometry',async({page})=>{
 test.setTimeout(90000);await open(page);const controls=panel(page);await controls.getByRole('button',{name:'Načíst 62 kandidátů z auditu',exact:true}).click();
 await expect.poll(async()=>(await storedWorld(page)).vltavaAssembly?.selectedIds.length).toBe(62);const draft=(await storedWorld(page)).vltavaAssembly!;
 await controls.getByLabel('Import výběru řek JSON').setInputFiles({name:'spatny-zdroj.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...draft,source:{...draft.source,rawChecksum:'f'.repeat(64)}}))});await expect(controls.getByRole('alert')).toContainText('checksum');expect((await storedWorld(page)).vltavaAssembly).toEqual(draft);
 await controls.getByRole('button',{name:'Vytvořit náhled sjednocené řeky',exact:true}).click();await expect(page.getByTestId('vltava-preview')).toContainText('10 otvorů',{timeout:30000});await expect(page.locator('.vltava-hole')).toHaveCount(10);
 await page.getByRole('button',{name:'Předat náhled k revizi',exact:true}).click();
 await page.getByLabel('Revize: Ostrov Žofín',{exact:true}).selectOption('unresolved');await page.getByLabel('Poznámka: Ostrov Žofín',{exact:true}).fill('Nelze potvrdit vodu pod lávkou.');
 await expect(page.getByRole('button',{name:'Schválit společnou vodní plochu',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Export schválené vodní plochy GeoJSON',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Publikace herních podkladů',exact:true}).click();
 const publication=page.getByRole('dialog',{name:'Publikace herních podkladů'});
 await expect(publication).toContainText('Publikace vyžaduje doloženou licenci a datum zdroje.');
 await expect(publication.getByLabel('Import připravených říčních podkladů JSON')).toBeEnabled();
 await expect(publication.getByRole('button',{name:'Publikovat změny',exact:true})).toBeDisabled();
});

test('editor řek rozšíří vodní plochu, vykreslí oddělení u Žofína a obnoví pojmenovaný ostrov',async({page})=>{
 test.setTimeout(180000);
 await open(page);
 const controls=panel(page),source=await sourcePromise;
 const save=()=>storedWorld(page).then(world=>world.vltavaAssembly!);
 const removed='{118ADE4B-2EB6-4EA7-BEDC-3043E9CA9B1E}',added='{F82851B4-D2CC-4C71-B327-7BEAD771B96A}';
 await controls.getByRole('button',{name:'Načíst 62 kandidátů z auditu',exact:true}).click();
 await expect.poll(async()=>(await save()).selectedIds.length).toBe(62);
 await controls.getByRole('button',{name:'Vybrat všechny navazující úseky řeky'}).click();
 await expect.poll(async()=>(await save()).selectedIds.length).toBe(173);
 await expect(controls).toContainText('Pracovní výběr: 173 polygonů (+111)');
 await focus(page,removed);await clickPolygon(page,removed);
 await expect.poll(async()=>(await save()).excludedIds).toContain(removed);
 await controls.getByRole('button',{name:'Vybrat všechny navazující úseky řeky'}).click();
 await expect.poll(async()=>(await save()).selectedIds.length).toBe(172);
 await focus(page,added);await clickPolygon(page,added);
 await expect.poll(async()=>(await save()).selectedIds).toContain(added);
 await controls.getByRole('button',{name:'Vytvořit náhled sjednocené řeky'}).click();
 await expect(page.getByTestId('vltava-preview')).toContainText('173 zdrojových polygonů',{timeout:30000});

 const showLand=()=>controls.getByRole('button',{name:'Zobrazit pevninu a ostrovy'}).click();
 const land=page.getByTestId('river-land-preview');
 await showLand();
 await expect(land).toContainText('23 oblastí',{timeout:30000});

 const site=source.sites.find(item=>item.name==='Ostrov Žofín')!;
 const siteMarker=page.locator(`[data-river-site="${site.id}"]`);
 const map=page.getByTestId('map');
 await page.getByRole('button',{name:/Zpět na Prahu/}).click();
 await expect(map).toHaveAttribute('data-map-zoom','12');
 await page.getByRole('button',{name:site.name,exact:true}).click();
 await expect(map).toHaveAttribute('data-map-zoom','15');
 // MapHandle focuses reference points at zoom 15. Raise the zoom through
 // Leaflet controls and project around the displayed reference marker.
 for(const zoom of [16,17]){
  await map.locator('.leaflet-control-zoom-in').click();
  await expect(map).toHaveAttribute('data-map-zoom',String(zoom));
 }
 await expect.poll(async()=>siteMarker.boundingBox().then(box=>!!box)).toBe(true);
 const pixel=async([x,y]:number[])=>{
  const box=(await siteMarker.boundingBox())!;
  const scale=256*2**17,mercator=(lat:number)=>Math.asinh(Math.tan(lat*Math.PI/180));
  return [box.x+box.width/2+(x-site.point[0])*scale/360,box.y+box.height/2+(mercator(site.point[1])-mercator(y))*scale/(2*Math.PI)] as const;
 };
 const start=await pixel([14.41345,50.07782]),middle=await pixel([14.41345,50.07735]),end=await pixel([14.41346,50.07655]);
 await controls.getByRole('button',{name:'Oddělit ostrov / pevninu'}).click();
 await page.mouse.click(...start);await page.mouse.click(...middle);await page.mouse.dblclick(...end);
 await expect.poll(async()=>(await save()).separations?.[0]?.geometry.coordinates.length).toBe(3);
 const created=(await save()).separations![0];
 expect(created.geometry.coordinates[0][0]).toBeCloseTo(14.41345,4);
 expect(created.geometry.coordinates[2][1]).toBeCloseTo(50.07655,4);
 await expect(map.locator('.river-separation')).toHaveAttribute('stroke-dasharray','8 5');

 const lines=page.getByRole('region',{name:'Oddělovací linie'});
 await lines.getByLabel('Název linie').fill('Mánes · zkušební oddělení');
 await lines.getByLabel('Důvod oddělení').fill('Zkušební průběh přes přerušené rameno.');
 await lines.getByLabel('Zdroj nebo doklad ověření').fill('E2E kontrola mapy, pracovní geometrie.');
 await lines.getByLabel('Autor linie').fill('E2E správce');
 await lines.getByRole('button',{name:'Upravit vrcholy linie'}).click();
 const vertex=map.locator('.marker-icon:not(.marker-icon-middle)').first();
 await expect(vertex).toBeVisible();
 const box=(await vertex.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
 await page.mouse.down();await page.mouse.move(box.x+box.width/2+6,box.y+box.height/2,{steps:4});await page.mouse.up();
 await lines.getByRole('button',{name:'Uložit vrcholy linie'}).click();
 await expect.poll(async()=>JSON.stringify((await save()).separations![0].geometry)).not.toBe(JSON.stringify(created.geometry));
 await lines.getByLabel('Stav linie').selectOption('approved');
 await showLand();
 await expect(land).toContainText('24 oblastí',{timeout:30000});
 await expect(land.getByRole('alert')).toHaveCount(0);
 await page.mouse.click(...await pixel(site.point));
 await expect(land.getByText('Použitá ruční oddělení')).toBeVisible();
 const areaId=await land.getByLabel('Vybrat pevninskou oblast').inputValue();
 await land.getByLabel('Název pevninské oblasti').fill('Žofín');
 await land.getByLabel('Správce pevniny').fill('E2E správce');
 await land.getByLabel('Doklad úplnosti pevniny a kontroly hranic').fill('Pracovní kontrola hranice kolem zkušebního oddělení.');
 await land.getByRole('button',{name:'Schválit pevninskou oblast'}).click();
 await expect.poll(async()=>(await save()).landReview?.areaIds).toContain(areaId);
 await controls.getByRole('button',{name:'Uložit draft řek'}).click();
 await expect(controls).toContainText('Draft řek je uložený');
 expect((await save()).landNames?.[areaId]).toBe('Žofín');

 const backup=page.waitForEvent('download');
 await controls.getByRole('button',{name:'Export výběru řek JSON'}).click();
 const savedPath=await (await backup).path();
 const saved=JSON.parse(await readFile(savedPath!,'utf8')) as VltavaAssembly;
 expect(saved.separations?.[0].status).toBe('approved');
 await open(page);
 await showLand();
 await expect(land).toContainText('24 oblastí',{timeout:30000});
 await expect(land.getByText(/Jednoznačně přiřazená způsobilá stanoviště/)).toBeVisible({timeout:30000});
 await expect(land.getByRole('option',{name:'Žofín · schváleno'})).toHaveAttribute('value',areaId);
 await lines.getByLabel('Vybrat linii').selectOption(created.id);
 await lines.getByRole('button',{name:'Odstranit linii'}).click();
 await expect.poll(async()=>(await save()).separations?.length).toBe(0);
 await showLand();
 await expect(land).toContainText('23 oblastí',{timeout:30000});
 await controls.getByLabel('Import výběru řek JSON').setInputFiles({
  name:'reky-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved)),
 });
 await expect.poll(save).toEqual(saved);
});
