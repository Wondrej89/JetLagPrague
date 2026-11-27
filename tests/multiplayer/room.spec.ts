import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const origin = 'http://127.0.0.1:4181/';
const station = { longitude:14.414069175,latitude:50.08076645,accuracy:5 };
const near = { longitude:14.4144,latitude:50.0807,accuracy:5 };
const hunter = (page:Page) => page.getByTestId('phone-hunter');
const hider = (page:Page) => page.getByTestId('phone-hider');
const tab = (phone:ReturnType<typeof hunter>, name:string) => phone.locator('.phone-nav button').filter({hasText:name}).click();

async function device(browser:Browser, options:Parameters<Browser['newContext']>[0]={}) {
  const context = await browser.newContext({viewport:{width:390,height:844}, ...options});
  await context.route('https://api.mapy.com/**', route=>route.abort());
  await context.route('https://fonts.googleapis.com/**', route=>route.abort());
  return context;
}

async function create(context:BrowserContext) {
  const page = await context.newPage();
  await page.goto(origin);
  await page.getByRole('button',{name:'Vytvořit místnost'}).click();
  await expect(page.getByText('Čekám na protihráče.')).toBeVisible({timeout:30_000});
  const code = await page.getByTestId('room-code').innerText();
  const invitation = await page.getByLabel('Odkaz k připojení').inputValue();
  expect(code).toMatch(/^[A-Z]{4}$/);
  expect(invitation).toBe(origin+'?join='+code);
  return {page, code, invitation};
}

test('founder sees actionable GPS failures for a denied, inaccurate or out-of-area position',async({browser})=>{
  const noPermission = await device(browser);
  const checks = await device(browser,{ permissions:['geolocation'], geolocation:{...station,accuracy:150} });
  try {
    const denied = await noPermission.newPage();
    await denied.goto(origin);
    await denied.getByRole('button',{name:'Vytvořit místnost'}).click();
    await expect(denied.getByRole('alert')).toContainText('přístup k poloze');
    const page = await checks.newPage();
    await page.goto(origin);
    await page.getByRole('button',{name:'Vytvořit místnost'}).click();
    await expect(page.getByRole('alert')).toContainText('GPS je nepřesná',{timeout:30_000});
    await checks.setGeolocation({longitude:16,latitude:49,accuracy:5});
    await page.getByRole('button',{name:'Vytvořit místnost'}).click();
    await expect(page.getByRole('alert')).toContainText('uvnitř herního území Prahy',{timeout:30_000});
    await expect(page.getByTestId('room-code')).toHaveCount(0);
  } finally { await Promise.all([noPermission.close(),checks.close()]); }
});

test('two independent phones finish a round, reconnect and securely transfer a team',async({browser})=>{
  const a = await device(browser,{permissions:['geolocation'],geolocation:near});
  const b = await device(browser,{permissions:['geolocation'],geolocation:{longitude:16,latitude:49,accuracy:5}});
  const third = await device(browser);
  const other = await device(browser,{permissions:['geolocation'],geolocation:station});
  let reopened:BrowserContext|undefined;
  try {
    const [{page: first, invitation, code},secondRoom] = await Promise.all([create(a), create(other)]);
    expect(secondRoom.code).not.toBe(code);
    const second = await b.newPage();
    await second.goto(invitation);
    await expect(second.getByLabel('Čtyřpísmenný kód')).toHaveValue(code);
    await second.getByRole('button',{name:'Připojit se',exact:true}).click();
    await expect(hider(second)).toBeVisible({timeout:30_000});
    await expect(hunter(first)).toBeVisible();
    const rejected = await third.newPage();
    await rejected.goto(invitation);
    await rejected.getByRole('button',{name:'Připojit se',exact:true}).click();
    await expect(rejected.getByRole('alert')).toContainText('Obě týmová místa jsou obsazená');
    await expect(secondRoom.page.getByText('Čekám na protihráče.')).toBeVisible();

    await second.getByText('Záloha týmové relace',{exact:true}).click();
    const backup = await second.getByLabel('Vlastní obnovovací kód').inputValue();
    expect(backup).toMatch(new RegExp('^'+code+'\\.'));
    await second.getByText('Záloha týmové relace',{exact:true}).click();
    await b.setGeolocation(station);
    const players = [[hunter(first),'Pražské lišky'],[hider(second),'Vltavští běžci']] as const;
    for(const [phone,name] of players) {
      await phone.getByLabel('Jméno týmu',{exact:true}).fill(name);
      await phone.getByRole('button',{name:'Uložit jméno týmu'}).click();
      await phone.getByRole('button',{name:'Ano, souhlasím',exact:true}).click();
    }
    await hunter(first).getByRole('button',{name:'Jsem připraven',exact:true}).click();
    await expect(hunter(first).getByTestId('station-instructions')).toHaveCount(0);
    await hider(second).getByRole('button',{name:'Jsem připraven',exact:true}).click();
    await expect(hider(second)).toHaveAttribute('data-station-phase','hiding');
    const search = hider(second).getByTestId('station-search');
    await search.locator('summary').click();
    await search.getByLabel('Hledat stanoviště').fill('Národní divadlo');
    await search.getByRole('button',{name:/Národní divadlo/}).click();
    await hider(second).getByRole('button',{name:'Potvrdit stanoviště',exact:true}).click();
    await expect(hider(second).getByRole('heading',{name:'Národní divadlo',exact:true})).toBeVisible({timeout:24_000});
    await expect(hunter(first).getByRole('button',{name:'Našli jsme tě',exact:true})).toBeVisible({timeout:25_000});
    await expect(hunter(first)).not.toContainText('Národní divadlo');
    await expect(hunter(first).locator('[data-map-marker="station"]')).toHaveCount(0);

    await tab(hunter(first),'Otázky');
    await hunter(first).getByRole('button',{name:/Radar/}).click();
    const radar = hunter(first).locator('.question-choice').filter({has:first.getByRole('heading',{name:'Radar 800 m',exact:true})});
    await radar.getByRole('button',{name:'Položit otázku',exact:true}).click();
    await tab(hider(second),'Otázka');
    await expect(hider(second).getByRole('heading',{name:'Radar 800 m',exact:true})).toBeVisible();
    await hider(second).getByRole('button',{name:'Odpovědět nyní',exact:true}).click();
    await expect(hunter(first).getByTestId('last-answer')).toContainText('ANO');
    await tab(hider(second),'Karty');
    await hider(second).getByRole('button',{name:'Otevřít karetní odměnu'}).click();
    await expect(hider(second).locator('.offered-card')).toHaveCount(2);

    await Promise.all([first.reload(),second.reload()]);
    await tab(hunter(first),'Otázky');
    await expect(hunter(first).getByTestId('last-answer')).toContainText('ANO',{timeout:30_000});
    await tab(hider(second),'Karty');
    await expect(hider(second).locator('.offered-card')).toHaveCount(2);
    await hider(second).locator('.offered-card').first().click();
    await expect(hider(second).locator('.hand-card')).toHaveCount(1);

    const savedDevice = await b.storageState();
    await b.close();
    await expect(first.getByRole('list',{name:'Stav obou týmů'})).toContainText('Vltavští běžci · odpojen');
    reopened = await device(browser,{storageState:savedDevice,permissions:['geolocation'],geolocation:station});
    const resumed = await reopened.newPage();
    await resumed.goto(origin);
    await expect(hider(resumed)).toBeVisible({timeout:30_000});
    await expect(first.getByRole('list',{name:'Stav obou týmů'})).toContainText('Vltavští běžci · připojen');
    await tab(hider(resumed),'Karty');
    await expect(hider(resumed).locator('.hand-card')).toHaveCount(1);

    await rejected.getByText('Obnovit tým na tomto telefonu',{exact:true}).click();
    await rejected.getByLabel('Obnovovací kód týmu').fill(backup);
    await rejected.getByRole('button',{name:'Obnovit relaci',exact:true}).click();
    await expect(hider(rejected)).toBeVisible({timeout:30_000});
    await expect(resumed.getByText('Týmová relace už neplatí.')).toBeVisible({timeout:15_000});
    await expect(hider(resumed)).toHaveCount(0);

    await tab(hunter(first),'Mapa');
    await hunter(first).getByRole('button',{name:'Našli jsme tě',exact:true}).click();
    await hider(rejected).getByRole('button',{name:'Ano, našli jste nás',exact:true}).click();
    await hider(rejected).getByRole('checkbox',{name:/Společně jsme ověřili/}).check();
    await hider(rejected).getByRole('button',{name:'Potvrdit a zobrazit konečný čas',exact:true}).click();
    await first.getByRole('button',{name:'Prohodit role a pokračovat',exact:true}).click();
    await rejected.getByRole('button',{name:'Prohodit role a pokračovat',exact:true}).click();
    await expect(hider(first)).toBeVisible();
    await expect(hunter(rejected)).toBeVisible();
    await expect(first.getByText('Historie prvního kola',{exact:true})).toBeVisible();
    await expect(secondRoom.page.getByText('Čekám na protihráče.')).toBeVisible();
    await expect(secondRoom.page.locator('.game-phone')).toHaveCount(0);
  } finally {
    await Promise.allSettled([a.close(),b.close(),third.close(),other.close(),reopened?.close()]);
  }
});
