# Game MVP: mobilní klient a prohlížečový simulátor

Tato etapa přidává skutečný sdílený stav hry a dvě mobilní role. Nezavádí multiplayer ani produkční autentizaci. Geografický editor, zdroje, existující publikace a zabezpečený publisher se nemění.

## Spuštění a reset

```sh
npm ci
npm run dev:simulator
```

Otevřete **https://wondrej89.github.io/JetLagPrague/simulator/**; instalace ani přihlášení nejsou potřeba. Pro lokální vývoj použijte příkazy výše a **http://127.0.0.1:4177/**. Obě prostředí sestavují stejný `main.tsx` a stejné komponenty. Server pro vývoj naslouchá pouze na loopbacku. Pro podklad použijte stávající klientský `VITE_MAPY_API_KEY` v `.env.local`, s povoleným lokálním refererem; Pages používají dosavadní Actions secret. Bez klíče fungují geografické výpočty a špendlíky s upozorněním. Nevkládejte do aplikace serverové klíče.

1. Výchozí nová hra je pozastavená. V pravém telefonu vyberte zastávku ze seznamu nebo mapy. Je nutná platná GPS v jejím 400m okruhu a uvnitř herní oblasti. Potvrďte **Potvrdit a uzamknout stanoviště**.
2. V levém telefonu zvolte **Otázky → Matching / Measuring / Radar**, konkrétní otázku a **Položit otázku**. Pravý telefon dostane stejnou otázku.
3. Vpravo otevřete **Otázka → Odpovědět nyní**, nebo v ovládání posuňte čas o pět minut. Ruční a fotografické otázky potřebují skutečný vstup schovaného.
4. Otevřete **Karty → Otevřít karetní odměnu**, vyberte jednu ze skutečně vylosovaných karet. Ostatní se odhodí. Po reloadu zůstává stejná nabídka i balíček.
5. Horní špendlíky nebo formuláře mění skutečně simulované GPS. Nepřichytávají se k ulicím ani zastávkám. Značka uzamčeného stanoviště je třetí, samostatný objekt.
6. Vyberte některý z přednastavených scénářů a stiskněte **Načíst testovací scénář**. Změna výběru sama nerozbije rozehraný stav. **Reset hry** vyžaduje potvrzení. **Nová hra** začne znovu výběrem stanoviště. Stejný seed a scénář vytvoří stejné rozložení karet a stejné přechody.

**Uložit scénář** stáhne soukromý JSON včetně obrázků. **Načíst soukromý scénář** obnoví data pouze po kontrole verze, katalogu, stavu a příloh. Nepublikujte tento JSON do GitHubu: obsahuje polohy a soukromé informace obou rolí.

## URL, izolace a síť

- Veřejná hra zůstává na `/JetLagPrague/`, editor na `/JetLagPrague/editor/` a plný testovací simulátor na **`/JetLagPrague/simulator/`**.
- Simulátor nese označení **„Testovací simulace – nejde o skutečnou multiplayerovou hru“**. Má pouze místní stav návštěvníka a simulované souřadnice. Nečte skutečnou GPS, produkční partie, administrátorskou relaci ani pracovní drafty editoru. Proto nevyžaduje OAuth. Oprávnění GitHub App a Workeru zůstávají beze změny.
- `/JetLagPrague/?role=hunter` a `?role=hider` používají stejný renderer telefonů, ale bez autorizované partie zobrazují stav bez připojení. Jejich dosavadní dobrovolné zobrazení vlastní GPS je oddělené od simulátoru; nečtou jeho databázi.
- Katalog se načítá z veřejného `../releases/` na Pages, z `/releases/` při lokálním vývoji. Povolené jsou pouze GET konkrétního indexu a neměnných souborů publikací, bez cookies, autorizačních hlaviček, těl požadavků nebo přesměrování. SHA-256, schémata i uzamčená verze se nadále ověřují.
- Mapy.com podklad je **pevný atlas Prahy v zoomu 13**, z rozsahu `[49.94,14.22]` až `[50.19,14.72]` (latitude/longitude). Jedna konečná sada dlaždic se načte při otevření nezávisle na scénáři, pak se vykresluje pouze z místních blob URL. Tři mapy sdílejí stejnou sadu v paměti. Zoom, posun a fit kamery ani změna simulovaných poloh neodesílají další geografické požadavky. Větší přiblížení podklad zvětší; mimo pevný rozsah zůstávají geometrie bez podkladu. Výpadek neblokuje simulaci. Dlaždice nejsou trvale uložené ani součástí distribuovaného katalogu. Poskytovatel vidí běžná připojovací metadata, veřejný klientský klíč a veřejný origin, nikoli stav simulace.
- Fotografie, soukromé polohy, karty a diagnostika se neodesílají. Export vyvolaný tlačítkem stáhne soubor na zařízení; aplikace jej nikam nenahrává. O jeho dalším sdílení rozhoduje návštěvník.
- Produkční build má CSP zakazující externí skripty, formulářové odesílání, rámce a objekty; síť dovoluje pouze vlastní statické soubory a Mapy.com. Kontrola modulů odmítne import editoru, publisheru a editorových GIS závislostí. Do simulátoru je z prostředí zpřístupněn pouze veřejný klientský mapový klíč. Samostatný build veřejné hry dál odmítá import aplikace simulátoru.

IndexedDB je oddělená názvem a datovým modelem, nikoli novým originem: důvěryhodné aplikace Pages sdílejí origin a běžná pravidla prohlížeče. Jiný prohlížeč nebo profil má jiné úložiště; dvě karty téhož profilu sdílejí uloženou simulaci. Souběžné řízení jedné simulace více kartami se nepodporuje. Smazání dat webu odstraní místní scénář a fotografie; pro přenos či zálohu slouží explicitní export. Dostupnost katalogu je nutná při otevření stránky, nejedná se o offline PWA.

## Architektura

| Část | Úloha |
| --- | --- |
| `packages/game-core` | Deterministický stavový automat, pravidla a registr, role, GPS snapshoty, stanoviště, časovače, karty, odměny, prokletí, historie a validace uloženého stavu. Bez Reactu, mapy, úložiště, síťových volání, vlastního času nebo náhodného generátoru mimo uložený seed. |
| `packages/geo-resolver` | Adaptér **ověřeného publikovaného `GameDataRelease`** na existující `geo-core`. Matching/Measuring používají dosavadní geografické funkce, administrativní oblasti dosavadní pravidlo hranic, vodní plochy vzdálenost k přesnému polygonu. |
| `packages/game-ui` | Jedna sada mobilních komponent obou rolí, read-only Leaflet mapa s Mapy.com, kontrakt rolového transportu a location provideru. `GamePhone` se používá v simulátoru; `PhoneScreen` také ve veřejných mobilních pohledech bez partie. |
| `apps/simulator` | Prohlížečový sandbox na Pages i lokálně: dva telefony, tři mapové objekty, scénáře, virtuální čas, oddělená IndexedDB, fotografie, soukromý import/export a diagnostika mimo telefony. Žádný herní server ani publikační klient. |

Události mají stabilní ID, čas a publikum. Čas a seed předává volající. Opakovaný příkaz se stejným ID nemá další účinek. Při změně katalogu se rozehraný scénář načítá s původním ID; chybějící historická verze se nenahrazuje novou. Žádný výpočet nesahá do editorového draftu ani nepoužívá Mapy.com jako zdroj objektové databáze.

## Pravidla implementovaná podle zadání

- Úvodní limit je 45 minut, okruh stanoviště 400 m. Po uzamčení jej nelze měnit.
- Při vypršení limitu se použije platná poloha a uchová seznam způsobilých zastávek. Předběžně zvolená způsobilá zastávka nebo jediný kandidát se uzamkne. Při překryvu je nutná volba. Chybějící GPS, nepřesné měření nebo žádný kandidát znamenají stav vyžadující řešení; žádná náhradní zastávka se neodhadne.
- Testovací konfigurovatelná kvalita GPS: nejvýše 50 m nepřesnosti, stáří nejvýše 120 sekund, žádný budoucí timestamp. Jde o nastavení této implementace, nikoliv tvrzení o originálním pravidle. Případné rychlostní údaje nejsou automatickým důkazem dopravního režimu.
- Matching a Measuring implicitně používají uzamčenou zastávku. Radar má explicitní volbu cíle (stanoviště / skutečná GPS) pro **novou hru**. Změna konfigurace nepřepíše rozpracovanou otázku. Hledači dostávají vlastní snapshot při položení otázky; cíl se také uzamkne a diagnostika jej ukazuje pouze v místní testovací laboratoři.
- Matching/Measuring/Radar mají pětiminutové reakční okno. Automatická odpověď může přijít dříve potvrzením schovaného, jinak při vypršení. Při selhání resolveru zůstane chyba bez odpovědi a bez odměny. Ruční otázka ani fotografie nikdy nevrací automaticky odhad.
- Odměny: Matching a Measuring 3 → 1, Radar 2 → 1. Nabídka se uloží při otevření; znovuotevření/reload ji nezmění. Karty lze hrát před otevřením odměny.
- Limit ruky je šest, uložený efekt jej může zvýšit. Při překročení je nutné zahrát či odhodit přebytek; reload nepomůže limit obejít. Časové bonusy se nehrají jako akční karta, započítávají se z karet zbylých v ruce na konci kola.
- Přepínač „Jsem pěšky“ rozhoduje o upozornění schovaného při vstupu do vzdálenosti ≤400 m. V dopravě se nespouští. Upozornění nemění fázi ani dostupnost otázek/karet a není součástí hledačského DTO/historie. Uložený přechod se při reloadu nespustí znovu.
- Prokletí mají skutečný stav a mohou blokovat příkazy jádra, nejen tlačítko UI. Časované efekty končí časem, ruční úkoly mají potvrzení splnění.

## Dostupnost a vědomě nedokončené části

Registr obsahuje všech šest požadovaných typů a uvedené podkategorie. Stav `ready/manual/missing_data/unsupported`, požadavky, cíl, resolver, reakční okno a odměna pocházejí z konfigurace, ne ze seznamu natvrdo v komponentě.

- Automaticky fungují dostupné letištní/zoo/nemocniční/knihovní/kinové POI otázky, přesné městské části a katastry, vodní Measuring a Radar 400/800/1500/3000/6000 m.
- „Přírodní park“ není automaticky zaměněn za městské parky z jiného katalogu. Chybějící ulice, pevniny, golf, aquaparky, železniční stanice, Vltava a výška zůstávají nedostupné. Výškový text porovnává výšku, nikoli vzdálenost.
- Linka MHD a délka názvu zastávky mají explicitní ruční odpověď ANO/NE.
- **Thermometer a Tentacles jsou Work in progress**, dle upřesnění správce. Mají samostatné obrazovky a konfiguraci; neodesílají se bez ověřených parametrů a odměn. Připravený Thermometer adaptér vyžaduje dvě uložené polohy a minimální přesun; není náhradou za schválení originální varianty.
- Fotografie okolí je výslovně testovací ruční zadání bez karetní odměny. Finální fotografické karty a jejich odměny čekají na konkrétní pravidla.
- Referenční odkaz správce: https://jetlag.denull.ru/en/rules/. Dne 22. 10. 2026 jej síť tohoto prostředí vrátila s **HTTP 403**. To není důkaz, že pravidla na webu chybí. Konkrétní neuvedené účinky a složení balíčku nejsou vydávané za ověřené originální pravidlo.

**Testovací karetní konfigurace `prague-mvp-test-v1`:** osm sad sedmi definic (56 karet): dva časové bonusy, kapacita +2, Veto, Randomize a dvě demonstrační prokletí. Veto zruší otázku bez odměny. Randomize zvolí jinou dostupnou automatickou otázku stejného typu se stejným režimem cíle; ponechá GPS snapshoty a termín. Tyto účinky jsou popsány na kartách a nejsou povolením pro ostrou hru. Balíček není tvrzením o přesném originálním rozložení. Finální parametry patří do nové verze pravidel po ověření.

## Data, ukládání a fotografie

Simulátor používá stejný statický katalog jako veřejná hra a kontroluje SHA-256 i historické schéma. Starší nebo referenční PID je výrazně označený a zůstává použitelný pouze pro simulaci; neposouvá se mu datum a nevydává se za platný zdroj pro ostrou partii.

DB **`jetlag-praha:simulator:v1`**, stores `games` a `photos`, je oddělená od editoru. Neukládá nic do editorového localStorage ani jeho IndexedDB. Pauza, rychlost, seed, rozehraná otázka, GPS snapshot, nabídka karet, prokletí a přechod přiblížení přežijí reload. Virtuální čas při zavřené stránce neběží. Simulované location providery v běžící simulaci hlásí explicitně nastavené polohy; vypnutá GPS zůstává chybějící.

JPEG/PNG/WebP do 10 MB se validují a překódují do JPEG (nejdelší strana 1920 px), čímž se odstraní původní EXIF včetně případných souřadnic. Náhled využívá dočasný object URL a odvolá jej po použití. Soukromá příloha zůstává Blob v místní DB; v exportu scénáře je obnovitelná JPEG data URL. Hledač dostane ID fotografie teprve po jejím odeslání.

Pro skutečný multiplayer je potřeba autorizované soukromé objektové úložiště: přiřazení souboru ke konkrétní partii a otázce, ověření role, kontrola obsahu a velikosti na serveru, odstranění EXIF, přístup jen účastníkům, časově omezené odkazy a pravidla mazání. Nikdy neukládat fotografie do veřejného release katalogu, GitHub Pages nebo veřejného bucketu.

## Budoucí autoritativní server

`GameTransport`, `LocationProvider`, role DTO, perzistence a čisté přechody jsou oddělené. Produkční server musí ověřovat hráče a roli, přijmout pouze povolený příkaz, dodat vlastní čas a důvěryhodný uzamčený katalog a kontrolovat GPS. `GameState` je privátní serverový objekt; hledači smějí dostat pouze výsledek `viewForRole(...,'hunter',...)`, nikdy stav pro lokální společný simulátor. Síťové klientské hodiny, lokální hand/deck ani seed nejsou autoritou. Současný lokální transport neposkytuje zabezpečený multiplayer.

## Ověření

Kontroly zahrnují deterministické přechody, pětiminutové okno, manuální a fotografické otázky bez náhodných odpovědí, snapshoty a změnu cíle Radaru, uzamčení a překryvy zastávek, 3 → 1 i 2 → 1, discard, opakované otevření odměny, kapacitu a overflow, bonusy, Veto/Randomize, prokletí, přiblížení a rolové DTO. Geografické integrační testy používají skutečné ověřené publikované podklady.

E2E operují skutečnými komponentami telefonů a formuláři přímo v minifikovaném Pages artefaktu pod `/JetLagPrague/simulator/`. Zahrnují celý tok otázka → odpověď → nabídka → ponechání → reload, virtuální čas, karty, fotografie, soukromý export/import, oddělení dvou prohlížečových kontextů a nezměněné editorové úložiště na stejném originu. Síťový audit při změnách GPS, fotografiích, kartách, diagnostice, exportu a reloadu dovoluje pouze veřejné GET bez těla: statické soubory, katalog a předem určený atlas. Odmítá jakýkoli jiný cíl, změnové metody nebo WebSocket; test navíc zakáže skutečnou geolokaci a otevření cizí databáze. Mapový server je v testech nahrazen deterministickou obrazovou odpovědí; dostupnost živé služby se tím netvrdí. Samostatný smoke test ověřuje i `npm run dev:simulator`.

Workflow `.github/workflows/pages.yml` instaluje Chromium a spouští celou E2E sadu po produkčním buildu s `PLAYWRIGHT_SKIP_BUILD=1`, tedy nad přesně tím artefaktem, který se později nahraje na Pages. Testy neprovádějí autentizaci ani publikaci; případný nakonfigurovaný publisher je nahrazen testovací odpovědí bez relace. Selhání blokuje deploy a uloží diagnostiku. Jednotkové testy navíc kontrolují omezené veřejné čtení a deterministický atlas. Herní pravidla, POI katalogy a historické publikace tato změna neupravuje.

Závěrečné lokální ověření: lint, typecheck, produkční build, **249 jednotkových a 66 E2E testů** prošly (celá E2E sada s nastavením CI, 8,9 minuty). Dva jednotkové a dva E2E audity původních GTFS/parkových archivů jsou výslovně přeskočené. Kontroly administrativních dat, PID a všech sedmi neměnných publikací prošly bez úpravy dat.
