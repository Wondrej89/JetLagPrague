# Game MVP: mobilní klient a prohlížečový simulátor

Tato etapa přidává skutečný sdílený stav hry a dvě mobilní role. Nezavádí multiplayer ani produkční autentizaci. Geografický editor, zdroje, existující publikace a zabezpečený publisher se nemění.

## Spuštění a reset

```sh
npm ci
npm run dev:simulator
```

Otevřete **https://wondrej89.github.io/JetLagPrague/simulator/**; instalace ani přihlášení nejsou potřeba. Pro lokální vývoj použijte příkazy výše a **http://127.0.0.1:4177/**. Obě prostředí sestavují stejný `main.tsx` a stejné komponenty. Server pro vývoj naslouchá pouze na loopbacku. Pro podklad použijte stávající klientský `VITE_MAPY_API_KEY` v `.env.local`, s povoleným lokálním refererem; Pages používají dosavadní Actions secret. Bez klíče fungují geografické výpočty a špendlíky s upozorněním. Nevkládejte do aplikace serverové klíče.

1. Založte novou hru a na každém telefonu samostatně rozhodněte o zakreslování odpovědí, potom potvrďte **Jsem připraven**. Celkový čas zahrnuje i prvních 45 minut schovávání; simulátor má samostatnou pauzu a časové kroky. V pravém telefonu vyberte zastávku ze seznamu nebo mapy. Je nutná platná GPS v jejím 400m okruhu a uvnitř herní oblasti. Potvrďte **Potvrdit a uzamknout stanoviště**.
2. V levém telefonu zvolte **Otázky → Matching / Measuring / Radar**, konkrétní otázku a **Položit otázku**. Pravý telefon dostane stejnou otázku.
3. Vpravo otevřete **Otázka → Odpovědět nyní**, nebo v ovládání posuňte čas o pět minut. Ruční a fotografické otázky potřebují skutečný vstup schovaného.
4. Otevřete **Karty → Otevřít karetní odměnu**, vyberte jednu ze skutečně vylosovaných karet. Ostatní se odhodí. Po reloadu zůstává stejná nabídka i balíček.
5. Horní špendlíky nebo formuláře mění skutečně simulované GPS. Nepřichytávají se k ulicím ani zastávkám. Značka uzamčeného stanoviště je třetí, samostatný objekt.
6. Vyberte některý z přednastavených scénářů a stiskněte **Načíst testovací scénář**. Změna výběru sama nerozbije rozehraný stav. **Reset hry** vyžaduje potvrzení. **Nová hra** vytvoří nové ID a začne znovu souhlasem a připraveností na obou telefonech. Stejný seed a scénář vytvoří stejné rozložení karet a stejné přechody.

**Uložit scénář** stáhne soukromý JSON včetně obrázků. **Načíst soukromý scénář** obnoví data pouze po kontrole verze, katalogu, stavu a příloh. Nepublikujte tento JSON do GitHubu: obsahuje polohy a soukromé informace obou rolí.

## URL, izolace a síť

- Veřejná hra zůstává na `/JetLagPrague/`, editor na `/JetLagPrague/editor/` a plný testovací simulátor na **`/JetLagPrague/simulator/`**.
- Simulátor nese označení **„Testovací simulace – nejde o skutečnou multiplayerovou hru“**. Má pouze místní stav návštěvníka a simulované souřadnice. Nečte skutečnou GPS, produkční partie, administrátorskou relaci ani pracovní drafty editoru. Proto nevyžaduje OAuth. Oprávnění GitHub App a Workeru zůstávají beze změny.
- `/JetLagPrague/?role=hunter` a `?role=hider` používají stejný renderer telefonů, ale bez autorizované partie zobrazují stav bez připojení. Jejich dosavadní dobrovolné zobrazení vlastní GPS je oddělené od simulátoru; nečtou jeho databázi.
- Katalog se načítá z veřejného `../releases/` na Pages, z `/releases/` při lokálním vývoji. Povolené jsou pouze GET konkrétního indexu a neměnných souborů publikací, bez cookies, autorizačních hlaviček, těl požadavků nebo přesměrování. SHA-256, schémata i uzamčená verze se nadále ověřují.
- Mapy.com podklad je dynamický, s odpovídajícími dlaždicemi ve výřezu a nativním zoomem 0–20; HiDPI používá `256@2x`. Statický atlas byl odstraněn. Poskytovatel vidí požadavky podle kamery, klientský klíč a origin; neposílají se mu herní JSON, fotografie ani karetní ruka. Chybějící podklad neblokuje přesné geometrie a GPS. [Mapy a rolové polohy](MAPS_AND_ROLE_GPS.md).
- Fotografie, soukromé polohy, karty a diagnostika se neodesílají. Export vyvolaný tlačítkem stáhne soubor na zařízení; aplikace jej nikam nenahrává. O jeho dalším sdílení rozhoduje návštěvník.
- Produkční build má CSP zakazující externí skripty, formulářové odesílání, rámce a objekty; síť dovoluje pouze vlastní statické soubory a Mapy.com. Kontrola modulů odmítne import editoru, publisheru a editorových GIS závislostí. Do simulátoru je z prostředí zpřístupněn pouze veřejný klientský mapový klíč. Samostatný build veřejné hry dál odmítá import aplikace simulátoru.

IndexedDB je oddělená názvem a datovým modelem, nikoli novým originem: důvěryhodné aplikace Pages sdílejí origin a běžná pravidla prohlížeče. Jiný prohlížeč nebo profil má jiné úložiště; dvě karty téhož profilu sdílejí uloženou simulaci. Souběžné řízení jedné simulace více kartami se nepodporuje. Smazání dat webu odstraní místní scénář a fotografie; pro přenos či zálohu slouží explicitní export. Dostupnost katalogu je nutná při otevření stránky, nejedná se o offline PWA.

## Architektura

| Část | Úloha |
| --- | --- |
| `packages/game-core` | Deterministický stavový automat, pravidla a registr, role, GPS snapshoty, stanoviště, časovače, karty, odměny, prokletí, historie a validace uloženého stavu. Bez Reactu, mapy, úložiště, síťových volání, vlastního času nebo náhodného generátoru mimo uložený seed. |
| `packages/geo-resolver` | Adaptér **ověřeného publikovaného `GameDataRelease`** na existující `geo-core`. Matching/Measuring používají dosavadní geografické funkce, administrativní oblasti dosavadní pravidlo hranic, vodní plochy vzdálenost k přesnému polygonu. |
| `packages/game-ui` | Jedna sada mobilních komponent obou rolí, read-only Leaflet mapa s Mapy.com, kontrakt rolového transportu a location provideru. `GamePhone` se používá v simulátoru; `PhoneScreen` také ve veřejných mobilních pohledech bez partie. |
| `apps/simulator` | Prohlížečový sandbox na Pages i lokálně: dva telefony, mapové polohy a referenční body včetně A/B, scénáře, virtuální čas, oddělená IndexedDB, fotografie, soukromý import/export a diagnostika mimo telefony. Žádný herní server ani publikační klient. |

Události mají stabilní ID, čas a publikum. Čas a seed předává volající. Opakovaný příkaz se stejným ID nemá další účinek. Při změně katalogu se rozehraný scénář načítá s původním ID; chybějící historická verze se nenahrazuje novou. Žádný výpočet nesahá do editorového draftu ani nepoužívá Mapy.com jako zdroj objektové databáze.

## Pravidla implementovaná podle zadání

- Úvodní limit je 45 minut, okruh stanoviště 400 m. Po uzamčení jej lze změnit pouze ověřovaným procesem karty Move.
- Při vypršení limitu se použije platná poloha a uchová seznam způsobilých zastávek. Předběžně zvolená způsobilá zastávka nebo jediný kandidát se uzamkne. Při překryvu je nutná volba. Chybějící GPS, nepřesné měření nebo žádný kandidát znamenají stav vyžadující řešení; žádná náhradní zastávka se neodhadne.
- Testovací konfigurovatelná kvalita GPS: nejvýše 50 m nepřesnosti, stáří nejvýše 120 sekund, žádný budoucí timestamp. Jde o nastavení této implementace, nikoliv tvrzení o originálním pravidle. Případné rychlostní údaje nejsou automatickým důkazem dopravního režimu.
- Matching a Measuring implicitně používají uzamčenou zastávku. Radar má explicitní volbu cíle (stanoviště / skutečná GPS) pro **novou hru**. Změna konfigurace nepřepíše rozpracovanou otázku. Hledači dostávají vlastní snapshot při položení otázky; cíl se také uzamkne a diagnostika jej ukazuje pouze v místní testovací laboratoři.
- Matching/Measuring/Radar mají pětiminutové reakční okno. Automatická odpověď může přijít dříve potvrzením schovaného, jinak při vypršení. Při selhání resolveru zůstane chyba bez odpovědi a bez odměny. Ruční otázka ani fotografie nikdy nevrací automaticky odhad.
- Odměny: Matching a Measuring 3 → 1, Radar a Thermometer 2 → 1, Tentacles 4 → 2. Výběr K různých karet je atomický; případný overflow blokuje další otázku. Nabídka se uloží při otevření; znovuotevření/reload ji nezmění. Karty lze hrát před otevřením odměny.
- Limit ruky je šest, uložený efekt jej může zvýšit. Při překročení je nutné zahrát či odhodit přebytek; reload nepomůže limit obejít. Časové bonusy se nehrají jako akční karta, započítávají se z karet zbylých v ruce na konci kola.
- Přepínač „Jsem pěšky“ rozhoduje o upozornění schovaného při vstupu do vzdálenosti ≤400 m. V dopravě se nespouští. Upozornění nemění fázi ani dostupnost otázek/karet a není součástí hledačského DTO/historie. Uložený přechod se při reloadu nespustí znovu.
- Prokletí mají skutečný stav a mohou blokovat příkazy jádra, nejen tlačítko UI. Časované efekty končí časem, ruční úkoly mají potvrzení splnění.

## Dostupnost a vědomě nedokončené části

Registr obsahuje všech šest požadovaných typů a uvedené podkategorie. Stav `ready/manual/missing_data/unsupported`, požadavky, cíl, resolver, reakční okno a odměna pocházejí z konfigurace, ne ze seznamu natvrdo v komponentě.

- Automaticky fungují dostupné letištní/zoo/nemocniční/knihovní/kinové POI otázky, přesné městské části a katastry, vodní Measuring a Radar 400/800/1500/3000/6000 m.
- „Přírodní park“ není automaticky zaměněn za městské parky z jiného katalogu. Chybějící ulice, pevniny, golf, aquaparky, železniční stanice, Vltava a výška zůstávají nedostupné. Výškový text porovnává výšku, nikoli vzdálenost.
- Linka MHD a délka názvu zastávky mají explicitní ruční odpověď ANO/NE.
- **Thermometer a Tentacles jsou funkční v nových hrách** s `questionVersion: 2` a verzí geografického pravidla `spatialVersion: 2`. [Postup, dostupné kategorie a dosahy](../README.md#thermometer-a-tentacles). Historické hry zachovávají uložená pravidla včetně nedostupných variant. Nové otázky vyžadují novou simulaci; staré exporty se tiše nemigrují.
- Thermometer ukládá A/H při zahájení, B explicitně po přesunu. Fáze `awaiting_second_measurement` má nulovou lhůtu, nečerpá další karetní modifikátory a neumožňuje odpověď. B přechází do `awaiting_response` a stanoví pět minut. `secondCapturedAt` uchovává okamžik B nezávisle na případném výslovně nakonfigurovaném restartu reakčního časovače Randomize. Přesná hranice přesunu používá numerickou toleranci 1 μm. Rozdíl A–H/B–H do 1 m má stav `error` s kódem `thermometer_tie`; dohoda hráčů má audit a teprve poté odměnu. Žádná aktuální GPS nepřepíše snapshot.
- Tentacles v2 filtruje C podle dosahu od S, poté volí nejbližší H v C a kontroluje jeho dosah od H. Polygony se měří k ploše; Matching/Measuring parků nadále k referenčnímu bodu. Schválené zdroje jsou výhradně z uzamčeného veřejného release. Vrácený `answerPoi` se ověřuje i při importu a role jej vidí až po odpovědi.
- Zvýšená karetní cena opakovaných otázek není dosud implementována. Zůstává WIP; nejde o plnou implementaci originálních pravidel opakování.
- Fotografie okolí je výslovně testovací ruční zadání bez karetní odměny. Finální fotografické karty a jejich odměny čekají na konkrétní pravidla.
- Referenční odkaz správce: https://jetlag.denull.ru/en/rules/. Dne 22. 10. 2026 jej síť tohoto prostředí vrátila s **HTTP 403**. To není důkaz, že pravidla na webu chybí. Konkrétní neuvedené účinky a složení balíčku nejsou vydávané za ověřené originální pravidlo.

**Nové hry používají `prague-cards-100-v1:small|medium|large` a herní stav verze 2.** Před založením je nutné výslovně zvolit variantu; aplikace nepřiřazuje Praze automaticky Medium. Varianta i kompletní pravidla jsou uzamčená ve stavu partie. Nový balíček má přesně 100 původních instancí: 55 časových bonusů, 21 powerupů a 24 jedinečných prokletí. Duplicate vytváří další auditovanou instanci vybrané karty libovolného typu; nemění složení základního balíčku. Identita, původ kopie a umístění všech původních i vytvořených karet se kontrolují při obnově/importu.

Úplné původní texty všech 24 prokletí, ceny a české překlady jsou v `packages/game-core/src/curse-catalog.json`. Zdrojem je [tabulka správce](https://docs.google.com/spreadsheets/d/1jbE0vujOeOzc4oSfkqbOxmL9IiEaln2w_IOkmN60rQY/edit?gid=2072350586), jejíž obsah uživatel vložil 22. 10. 2026 po síťové chybě CONNECT 403. Překlepy originálu zůstávají dohledatelné. Správce následně rozhodl použít kilometrové hodnoty: Bridge Troll 300 / 1 500 / 9 100 m, Mediocre Travel Agent 400 / 400 / 500 m. Powerupy Duplicate, Move, Veto a Draw 1 Expand 1 byly upřesněné přímo správcem.

Time Bonus: Red 25× (2/3/5 min), Orange 15× (4/6/10), Yellow 10× (6/9/15), Green 3× (8/12/20), Blue 2× (12/18/30). Bonus se započte jen z karet zbývajících v ruce na konci kola.

Powerupy: Randomize 4×, Veto 4×, Duplicate 2×, Move 1×, Discard 1 Draw 2 4×, Discard 2 Draw 3 4×, Draw 1 Expand 1 2×. Discard/Draw vyžaduje přesný počet dalších vybraných karet a dobere karty do ruky. Draw 1 Expand 1 zvětší kapacitu po zbytek této hry, včetně uložení a obnovy. Veto zruší čekající otázku bez odměny. Randomize zachovává dosavadní kompatibilní dostupnou automatickou otázku stejného typu, GPS snapshoty a termín; úplné originální znění Randomize zatím nebylo dodáno a tato zachovaná konfigurace se nevydává za jeho nezávislé ověření.

Move odhodí všechny ostatní karty, veřejně oznámí dosavadní zastávku a otevře nejvýše 20minutový přesun. Jádro odmítá změnu simulované polohy hledačů i po vypnutí/opětovném zapnutí jejich GPS. Pozastavený čas se odečítá od skóre a telefonního času schovaného. Nová zastávka se uzamkne pouze po ověření aktuální GPS, herní oblasti a okruhu 400 m. Při vypršení limitu se uchová seznam tehdy způsobilých cílů; při překryvu je nutná volba a bez spolehlivého cíle se stanoviště neodhadne. Dřívější dokončení vyžaduje stejnou geografickou kontrolu. Více přesunů přes kopie Move má oddělenou historii pauz.

Seslání prokletí má vlastní přípravu. Dokud není atomicky zaplacena celá cena, karta zůstává v ruce a žádný účinek se neaktivuje. Podporované ceny zahrnují konkrétní počty či typy karet, celou ruku, foto/video, první příslušný auditovaný hod, geografickou podmínku i výslovné ruční potvrzení fyzických a zvláštních podmínek. Endless Tumble při 5/6 a Gambler’s Feet při sudém casting hodu kartu spotřebují bez aktivace účinku. Neúspěšné příkazy nepřepíší původní stav.

Každé prokletí obsahuje samostatné účinky. Rozlišuje přípravu, blokující úkol, čekání na ověření schovaným, pokračující povinnost, časový účinek, účinek do konce kola, splnění, ukončení i porušení. Water Weight, Egg Partner, Lemon Phylactery a suvenýr Travel Agent zůstávají po úvodním úkolu samostatnou povinností s variantní penalizací. Požadované ověření fotografie se neukončí pouhým nahráním souboru. Fyzické potvrzení se nikdy neoznačuje jako senzorový důkaz.

Spotty Memory používá hody hledačů: 1 Matching, 2 Measuring, 3 Radar, 4 Thermometer, 5 Tentacles, 6 Fotky. Po každé úspěšně položené otázce je nutný nový hod; stejná kategorie může padnout opakovaně. Zakázaná kategorie se deaktivuje v telefonu i v jádře. Drained Brain vyžaduje tři konkrétní otázky ze tří různých kategorií. Overflowing Chalice přidá jednu dobíranou kartu ke třem způsobilým odměnám; Veto ani otázka zdarma nespálí odměnový účinek. Impressionable Consumer skutečně odstraní odměnu za následující otázku. Ransom Note vyžaduje ruční potvrzení výstřižků a text nejméně o pěti slovech.

Jammed Door má časový limit, audit 2d6 se součtem alespoň 7 a opakovací lhůtu 5/10/15 minut; různé dveře téhož prostoru používají stejné ručně určené ID. Gambler’s Feet vydává a spotřebovává rozpočet kroků podle hodu. Right Turn a ostatní časové účinky používají herní čas. Šibenice podporuje tajné slovo, tipy a maskovaný pohled hledačů; výhru potvrzuje schovaný, protože zdroj neurčuje počet povolených chyb.

**Známá pravidlová omezení:** fyzické úkoly, obsah foto/videa, pobyt pod mostem či na nádraží, kontinuita záběru a endgame potvrzují hráči. Bird Guide v dodaném textu neříká, že blokuje další otázku, proto se taková blokace nedoplňuje. Pro vzdálenosti zahraničních kuchyní chybí schválená metoda a GIS vrstva; porovnání se potvrzuje ručně. U-Turn ověřuje vzdálenost další zastávky geograficky, ale jinou navazující dopravu v časovém okně potvrzuje hráč, protože herní katalog neobsahuje jízdní řád odjezdů. Street View se dodává jako ručně připravený snímek, bez dalšího externího API. Fyzické chování nelze zablokovat telefonem; jádro odmítá zaznamenané nepovolené vstupy, kroky, dopravní režim a otázky.

**Historická konfigurace `prague-mvp-test-v1` zůstává beze změny.** Obsahuje 56 demonstračních karet. Staré uložené hry, scénáře a exporty zůstávají verzí 1 s původními pravidly; nedochází k automatické výměně balíčku, čísel bonusů ani karetních instancí. Novou konfiguraci uživatel získá výslovným založením nové hry. Neplatný uložený stav se nepřepíše.

Scénáře `TEST MECHANISMU` mají oddělené ID a výslovné testovací parametry pro ověření chyb, neznámé penalizace a jednotlivých fází. Jejich ceny a zkrácené časy nejsou pravidly skutečných karet. Diagnostika umí přesunout existující instanci z balíčku do ruky pouze v lokálním simulátoru; nevyrábí neauditované původní karty a není součástí role transportu.

## Data, ukládání a fotografie

Simulátor používá stejný statický katalog jako veřejná hra a kontroluje SHA-256 i historické schéma. Starší nebo referenční PID je výrazně označený a zůstává použitelný pouze pro simulaci; neposouvá se mu datum a nevydává se za platný zdroj pro ostrou partii.

DB **`jetlag-praha:simulator:v1`**, stores `games` a `photos`, je oddělená od editoru. Neukládá nic do editorového localStorage ani jeho IndexedDB. Pauza, rychlost, seed, rozehraná otázka, GPS snapshot, nabídka karet, prokletí a přechod přiblížení přežijí reload. Virtuální čas při zavřené stránce neběží. Simulované location providery v běžící simulaci hlásí explicitně nastavené polohy; vypnutá GPS zůstává chybějící.

JPEG/PNG/WebP do 10 MB se validují a překódují do JPEG (nejdelší strana 1920 px), čímž se odstraní původní EXIF včetně případných souřadnic. Náhled využívá dočasný object URL a odvolá jej po použití. Soukromá příloha zůstává Blob v místní DB; v exportu scénáře je obnovitelná JPEG data URL. Hledač dostane ID fotografie teprve po jejím odeslání; totéž platí pro důkazy při aktivaci prokletí. MP4/WebM do 20 MB se ukládá jako soukromý Blob po kontrole formátu, bez externího přenosu. Videa se nepřekódují; vlastní export může obsahovat jejich původní metadata. Soukromý export/import zahrnuje i všechny přílohy prokletí.

Pro skutečný multiplayer je potřeba autorizované soukromé objektové úložiště: přiřazení souboru ke konkrétní partii a otázce, ověření role, kontrola obsahu a velikosti na serveru, odstranění EXIF, přístup jen účastníkům, časově omezené odkazy a pravidla mazání. Nikdy neukládat fotografie do veřejného release katalogu, GitHub Pages nebo veřejného bucketu.

## Budoucí autoritativní server

`GameTransport`, `LocationProvider`, role DTO, perzistence a čisté přechody jsou oddělené. Produkční server musí ověřovat hráče a roli, přijmout pouze povolený příkaz, dodat vlastní čas a důvěryhodný uzamčený katalog a kontrolovat GPS. `GameState` je privátní serverový objekt; hledači smějí dostat pouze výsledek `viewForRole(...,'hunter',...)`, nikdy stav pro lokální společný simulátor. Síťové klientské hodiny, lokální hand/deck ani seed nejsou autoritou. Současný lokální transport neposkytuje zabezpečený multiplayer.

## Ověření

Kontroly zahrnují deterministické přechody, pětiminutové okno, manuální a fotografické otázky bez náhodných odpovědí, snapshoty a změnu cíle Radaru, uzamčení a překryvy zastávek, 3 → 1 i 2 → 1, discard, opakované otevření odměny, kapacitu a overflow, bonusy, Veto/Randomize, prokletí, přiblížení a rolové DTO. Geografické integrační testy používají skutečné ověřené publikované podklady.

E2E operují skutečnými komponentami telefonů a formuláři přímo v minifikovaném Pages artefaktu pod `/JetLagPrague/simulator/`. Zahrnují celý tok otázka → odpověď → nabídka → ponechání → reload, virtuální čas, karty, fotografie, soukromý export/import, oddělení dvou prohlížečových kontextů a nezměněné editorové úložiště na stejném originu. Síťový audit při změnách GPS, fotografiích, kartách, diagnostice, exportu a reloadu dovoluje pouze veřejné GET bez těla: statické soubory, katalog a dynamické XYZ dlaždice Mapy.com. Odmítá jakýkoli jiný cíl, změnové metody nebo WebSocket; test navíc zakáže skutečnou geolokaci a otevření cizí databáze. Mapový server je v testech nahrazen deterministickou obrazovou odpovědí; dostupnost živé služby se tím netvrdí. Samostatný smoke test ověřuje i `npm run dev:simulator`.

Workflow `.github/workflows/pages.yml` vybere prohlížeč a spouští celou E2E sadu po produkčním buildu s `PLAYWRIGHT_SKIP_BUILD=1`, tedy nad přesně tím artefaktem, který se později nahraje na Pages. Testy neprovádějí autentizaci ani publikaci; případný nakonfigurovaný publisher je nahrazen testovací odpovědí bez relace. Selhání blokuje deploy a uloží diagnostiku. Jednotkové testy navíc kontrolují omezené veřejné čtení, rolovou GPS a nativní URL dlaždic. POI katalogy a historické publikace karetní implementace neupravuje.

Předchozí nasazení webového simulátoru ověřilo lint, typecheck, produkční build, **249 jednotkových a 66 E2E testů**. Karetní rozšíření navíc testuje přesné složení, všech 24 casting procesů, varianty, role, náhodu, trvalé a časové účinky, Move, Duplicate a prohlížečové důkazy. Dva jednotkové a dva E2E audity původních GTFS/parkových archivů jsou výslovně přeskočené. Kontroly administrativních dat, PID a všech sedmi neměnných publikací prošly bez úpravy dat.

GitHub Actions spouští celou E2E sadu proti hotovému artefaktu Pages. Přednostně používá Chrome z hostovaného Ubuntu runneru přes `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; jeho verze se vypíše v logu. Pokud runner prohlížeč nemá, nainstaluje spravovaný Chromium Playwrightu. Testy se kvůli síti nevynechávají. Tato volba odstraňuje zbytečné opakované stahování prohlížeče a nativních závislostí, které 22. 10. blokovalo nasazení.


Aktuální úvod partie, upozornění a pražská pravidla Hangmana jsou popsané v [GAME_UX_HANGMAN.md](GAME_UX_HANGMAN.md).
