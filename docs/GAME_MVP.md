# Game MVP: mobilní klient a lokální simulátor

Tato etapa přidává skutečný sdílený stav hry a dvě mobilní role. Nezavádí multiplayer ani produkční autentizaci. Geografický editor, zdroje, existující publikace a zabezpečený publisher se nemění.

## Spuštění a reset

```sh
npm ci
npm run dev:simulator
```

Otevřete **http://127.0.0.1:4177/** nebo použijte odkaz **Herní simulátor** v lokálním editoru. V produkčním editoru odkaz vede na bezpečnou návodovou stránku. Server naslouchá pouze na loopbacku. Pro mapový podklad použijte stávající klientský `VITE_MAPY_API_KEY` v `.env.local`, s povoleným lokálním refererem. Bez klíče fungují geografické výpočty a špendlíky; aplikace výslovně oznamuje chybějící podklad. Nevkládejte do aplikace serverové klíče.

1. Výchozí nová hra je pozastavená. V pravém telefonu vyberte zastávku ze seznamu nebo mapy. Je nutná platná GPS v jejím 400m okruhu a uvnitř herní oblasti. Potvrďte **Potvrdit a uzamknout stanoviště**.
2. V levém telefonu zvolte **Otázky → Matching / Measuring / Radar**, konkrétní otázku a **Položit otázku**. Pravý telefon dostane stejnou otázku.
3. Vpravo otevřete **Otázka → Odpovědět nyní**, nebo v ovládání posuňte čas o pět minut. Ruční a fotografické otázky potřebují skutečný vstup schovaného.
4. Otevřete **Karty → Otevřít karetní odměnu**, vyberte jednu ze skutečně vylosovaných karet. Ostatní se odhodí. Po reloadu zůstává stejná nabídka i balíček.
5. Horní špendlíky nebo formuláře mění skutečně simulované GPS. Nepřichytávají se k ulicím ani zastávkám. Značka uzamčeného stanoviště je třetí, samostatný objekt.
6. Vyberte některý z přednastavených scénářů a stiskněte **Načíst testovací scénář**. Změna výběru sama nerozbije rozehraný stav. **Reset hry** vyžaduje potvrzení. **Nová hra** začne znovu výběrem stanoviště. Stejný seed a scénář vytvoří stejné rozložení karet a stejné přechody.

**Uložit scénář** stáhne soukromý JSON včetně obrázků. **Načíst soukromý scénář** obnoví data pouze po kontrole verze, katalogu, stavu a příloh. Nepublikujte tento JSON do GitHubu: obsahuje polohy a soukromé informace obou rolí.

## URL a bezpečné nasazení

- Veřejná hra zůstává na `/JetLagPrague/`, editor na `/JetLagPrague/editor/`.
- `/JetLagPrague/?role=hunter` a `?role=hider` používají stejný renderer mobilních telefonů. Bez autorizované partie zobrazují stav bez připojení, umožňují lokální zobrazení vlastní GPS po výslovném spuštění, nemají tajné polohy ani přístup k simulátorové DB. Nevytvářejí zdánlivou multiplayerovou místnost.
- Na **https://wondrej89.github.io/JetLagPrague/simulator/** se publikuje pouze bezpečná vstupní stránka s lokálním návodem. Diagnostická aplikace a její úložiště nejsou obsahem tohoto produkčního artefaktu. Rozhoduje samostatný build entry point a kontrola modulů, nikoli kontrola hostname, skrytý odkaz nebo heslo v JS.
- Plně funkční desktopový simulátor je v této etapě místní na `127.0.0.1:4177`.
- Stávající OAuth cookie publisheru patří jeho serveru a není automaticky důkazem administrátorské relace pro jiný frontend. Nepřidáváme veřejný endpoint vracející plný stav nebo fotografie a neobcházíme GitHub App/Worker.

Před vzdáleným provozem plného simulátoru je nutná skutečná serverová kontrola správce (například přístupová brána před celou aplikací), oddělený origin a oprávnění. GitHub Pages samotné takovou ochranu neposkytují. Do té doby nepublikujte vývojový entry point, nespouštějte dev server na veřejném rozhraní a nedávejte před něj pouze klientské heslo.

## Architektura

| Část | Úloha |
| --- | --- |
| `packages/game-core` | Deterministický stavový automat, pravidla a registr, role, GPS snapshoty, stanoviště, časovače, karty, odměny, prokletí, historie a validace uloženého stavu. Bez Reactu, mapy, úložiště, síťových volání, vlastního času nebo náhodného generátoru mimo uložený seed. |
| `packages/geo-resolver` | Adaptér **ověřeného publikovaného `GameDataRelease`** na existující `geo-core`. Matching/Measuring používají dosavadní geografické funkce, administrativní oblasti dosavadní pravidlo hranic, vodní plochy vzdálenost k přesnému polygonu. |
| `packages/game-ui` | Jedna sada mobilních komponent obou rolí, read-only Leaflet mapa s Mapy.com, kontrakt rolového transportu a location provideru. `GamePhone` se používá v simulátoru; `PhoneScreen` také ve veřejných mobilních pohledech bez partie. |
| `apps/simulator` | Výhradně místní administrativa: dva telefony, tři mapové objekty, scénáře, virtuální čas, oddělená IndexedDB, fotografie, soukromý import/export a diagnostika mimo telefony. Produkční `public.tsx` obsahuje pouze návod. |

Události mají stabilní ID, čas a publikum. Čas a seed předává volající. Opakovaný příkaz se stejným ID nemá další účinek. Při změně katalogu se rozehraný scénář načítá s původním ID; chybějící historická verze se nenahrazuje novou. Žádný výpočet nesahá do editorového draftu ani nepoužívá Mapy.com jako zdroj objektové databáze.

## Pravidla implementovaná podle zadání

- Úvodní limit je 45 minut, okruh stanoviště 400 m. Po uzamčení jej nelze měnit.
- Při vypršení limitu se použije platná poloha a uchová seznam způsobilých zastávek. Předběžně zvolená způsobilá zastávka nebo jediný kandidát se uzamkne. Při překryvu je nutná volba. Chybějící GPS, nepřesné měření nebo žádný kandidát znamenají stav vyžadující řešení; žádná náhradní zastávka se neodhadne.
- Testovací konfigurovatelná kvalita GPS: nejvýše 50 m nepřesnosti, stáří nejvýše 120 sekund, žádný budoucí timestamp. Jde o nastavení této implementace, nikoliv tvrzení o originálním pravidle. Případné rychlostní údaje nejsou automatickým důkazem dopravního režimu.
- Matching a Measuring implicitně používají uzamčenou zastávku. Radar má explicitní volbu cíle (stanoviště / skutečná GPS) pro **novou hru**. Změna konfigurace nepřepíše rozpracovanou otázku. Hledači dostávají vlastní snapshot při položení otázky; cíl se také uzamkne a diagnostika jej ukazuje pouze správci.
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

E2E operují skutečnými komponentami telefonů a formuláři; zahrnují celý tok otázka → odpověď → nabídka → ponechání → reload, virtuální čas, karty, fotografie, soukromý export a prázdné veřejné úložiště. Produkční kontrola navíc odmítne build obsahující editorový GIS nebo soukromé moduly simulátoru. Závěrečné počty testů jsou v README.

Závěrečné ověření: lint, typecheck, build editoru / veřejné hry / veřejného vstupu simulátoru, 246 jednotkových a 63 E2E scénářů prošly. Šest E2E simulátoru bylo po posledních úpravách opakováno včetně importu/exportu fotografie a atomického odmítnutí neplatného scénáře. Dva jednotkové a dva E2E audity jsou přeskočené kvůli nedodaným původním archivům GTFS a parků. Sedm historických publikací a geodatové kontrolní součty zůstaly platné.
