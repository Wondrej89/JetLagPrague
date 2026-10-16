# PID: GTFS, pravidla a ruční aktualizace (iterace 03B)

Editor používá skutečnou plánovanou obsluhu a geometrii PID. Mapy.com dodává pouze dlaždice. Podrobný [audit úplného GTFS z 16. 10. 2026](../data/source-metadata/pid-gtfs-source-audit.md) předcházel implementaci. [Zadání](../CODEX_UKOL_03B_GTFS.md) vymezuje rozsah bez hráčských účtů a multiplayeru.

## Aktualizace na GitHub Pages

1. V editoru otevřete **Doprava PID → Aktualizovat data PID ↗**. Odkaz vede na [Update PID data from GTFS](https://github.com/Wondrej89/JetLagPrague/actions/workflows/pid-data.yml).
2. Přihlaste se na GitHub s oprávněním spouštět workflow v repozitáři a zvolte **Run workflow** na větvi `main`. Datum ponechte prázdné pro dnešní **Europe/Prague**, nebo zadejte `YYYY-MM-DD` v platnosti feedu. `force` použijte pouze pro požadované nové sestavení již uloženého dne; běžný požadavek ověřený den opakovaně použije bez stažení.
3. Workflow stáhne GTFS a volitelně skupiny, ověří je, sestaví neměnnou verzi ve větvi **`pid-data`** a spustí samostatné nasazení **Deploy editor to GitHub Pages**. Počkejte na úspěch obou běhů. Souhrn a artefakt `pid-gtfs-diagnostics` uvádějí jednotlivé URL, HTTP chyby, požadované datum, výsledek a SHA-256. Chyba před zveřejněním nezmění datovou větev; chyba deploye ponechá předchozí web. Při chybě deploye lze ručně zopakovat Pages workflow bez stahování GTFS.
4. V editoru zvolte **Načíst publikovaný výsledek**. Zkontrolujte datum, čas posledního sestavení, adaptér, kontrolní součet, aktivní stanoviště a rozdíly **skupin i tras**. Přijetí porovnané verze je výslovné. Obnovení stránky rovněž kontroluje hotovou publikaci a může převzít novější ověřenou verzi. Editor přednostně vybírá ověřený dnešek, jinak poslední dostupnou referenci do dneška. Jiný konkrétní den lze prohlédnout importem jeho neměnného snapshotu z katalogu; starší i budoucí datum je výslovně referenční.

**GitHub token se do klienta nevkládá.** Odkaz není přímým spuštěním serveru z veřejné aplikace; tlačítko načtení čte pouze vlastní statický katalog. Oprávnění kontroluje GitHub. Automatický `schedule` je odstraněný. Otevření editoru ani běžný push kódu nestahují GTFS či jiné živé zdroje PID. Ruční CLI je alternativní serverový vstup, nikoli automatický proces prohlížeče.

Běžný Pages build načte katalog a těla ze samostatné větve, ověří je a nasadí s kódem. Při chybě čtení existující větve selže; nevrátí se ke starším datům v `main`. Pouze před prvním založením `pid-data` je bootstrap v `apps/editor/public/pid` výslovně historickou referencí. Datový workflow má jeden sdílený concurrency zámek, neruší běžící sestavení a používá běžný push bez přepisování historie. Také kódové nasazení po datové aktualizaci přebírá `pid-data`, takže nepřepíše novější data starým bootstrapem.

## Obsluha pro konkrétní den

Primární zdroj je https://data.pid.cz/PID_GTFS.zip. Zpracují se `agency`, `feed_info`, `calendar`, `calendar_dates`, `stops`, `routes`, `trips`, `stop_times` a `shapes`. Je požadován alespoň jeden z kalendářů. `feed_info` musí pokrývat požadované datum; samotné dnešní stažení aktuálnost nedokazuje. Časové pásmo agentury musí být `Europe/Prague`.

Den je **provozní den GTFS**, jak jej popisuje PID. Kalendář vybere den v týdnu a platnost služby, výjimky typu 1 přidají a typu 2 zruší provoz. Časy `25:10:00` nebo `47:59:59` se převedou na sekundy bez modulo 24 a zůstávají v původním provozním dni, i když občansky pokračují další den. Nepřičítají se k novému kalendáři ani se z nich neodvozuje noční linka. Denní/noční charakter určuje doložené PID `is_night`; chybějící údaj je neznámý. Statické GTFS nepotvrzuje aktuální zpoždění, odřeknutí nebo mimořádnou výluku v reálném čase.

Zastávka je aktivní pouze s návštěvou aktivního spoje, kde není současně zakázaný nástup **i** výstup (`pickup_type = drop_off_type = 1`). Výstupní konečná se zachová. Typy 2/3 označují podmíněně dostupný nástup/výstup, nikoli zákaz; aplikace nyní tyto podmínky dále nezobrazuje. Veřejná fyzická místa musí mít vhodný `location_type`; PID provozní pomocné body `zone_region_type = 0` nebo prázdné se nezpřístupňují jako zastávky. Ve standardním GTFS bez této doplňkové kolonky rozhoduje veřejný `location_type`.

PID `trip_operation_type` 7–10 se nezakazuje plošně: podle dokumentace zahrnuje i veřejné tramvajové výjezdy/zátahy a přesuny. Rozhodují omezení nástupu a výstupu. Hierarchická nástupiště, vchody a interní uzly zůstávají vstupem pro kontrolu vazeb; nejde automaticky o herní zastávky. Interní uzly typu 3 mohou mít legitimně prázdné jméno.

Stanoviště má `serviceStatus: active | inactive | unknown`. Chybějící GTFS vazba fyzického stanoviště znamená **nelze určit**, doložené místo bez spoje **neaktivní**. Herní uzel má odvozenou `activity`; ani ruční povolení neudělá úkryt z uzlu bez aktivních veřejných stanovišť. Neaktivní a neurčitelné uzly lze vyhledat a otevřít v rozbalené části správy zdrojů; původní stanoviště zůstávají v exportu.

Pro aktivní veřejné spoje se vyberou jen jejich `shape_id`, seřadí původní vrcholy a zachovají celé oddělené části. Geometrie linky je MultiLineString s evidencí použitých shapes a jediným dnem platnosti. Žádné zastávky se nespojují umělými přímkami. Sedm doložených typů: `0` tramvaj, `1` metro, `2` vlak, `3` autobus, `4` přívoz, `7` lanovka, `11` trolejbus. U starého snapshotu UI dále výslovně uvádí sedmidenní geometrii.

## Identity a referenční body

Doplňkový zdroj https://data.pid.cz/stops/json/stops.json má ověřený formát 3. Fyzické ID `node/stop` a dřívější skupinové ID se zachovávají. Nejprve se zkouší jednoznačné přesné `gtfsIds`, případně doložené `asw_node_id/asw_stop_id` s kontrolou uzlu a případného rozporu. Přípona `P` se neodstraňuje. Více GTFS variant jednoho prokazatelně stejného fyzického místa se započítá jednou. Neslučuje se podle názvu, blízkosti ani samotného ASW uzlu: Anděl a Na Knížecí zůstávají oddělené.

Nespárované GTFS místo zůstává pod stabilním `gtfs-stop:stop_id`, s původní souřadnicí a **místní revizí**. Chybějící doplňkový soubor neblokuje technicky platný GTFS, ale neumožní automatické schválení nedoložených fyzických vazeb. Nejednoznačná místa, neznámá stanoviště a rozporné souřadnice aktivních variant mají lokální seznam revizí; nepoškodí ověřené uzly zbytku snapshotu. Místní revizi lze překonat pouze zdůvodněným schválením konkrétního bodu se stále shodným podpisem. Globální historická/nekonzistentní data takto obejít nelze.

Priorita zůstává **vlak → metro → tramvaj → autobus/trolejbus**, společná třída autobusu a trolejbusu přispívá oběma druhy. Jeden bod je průměrem relevantních aktivních **fyzických** stanovišť z doplňkového zdroje; smíšený průměr `avgLon/avgLat` se nepoužije. GTFS souřadnice jsou evidované zvlášť. Není-li doložený samostatný bod stanice, nevymýšlí se. Referenční bod lze přetáhnout či zadat a schválit s odůvodněním. Přívoz a lanovka dále vyžadují výslovné schválení a při smíšení druhů také volbu dopravy.

Výjimky a ruční propojení jsou ve `WorldDraft.gameStops`, nikoli ve zdrojových datech. Změna identity/aktivních stanovišť/dopravy vyžádá revizi starého schválení; uložený ruční bod se nemaže. Samotná oprava zdrojových souřadnic schválený bod nezruší. Osiřelé výjimky zůstávají dostupné ve správě. Samostatné fyzické skupiny lze propojit výslovným odůvodněným rozhodnutím správce.

## Validace, verze a obnova

Nový snapshot má schéma **2**, zdroj GTFS, volitelné skupiny, datum, čas převzetí i sestavení, verzi adaptéru `pid-gtfs-v1`, původ a CC BY 4.0 podle oficiální dokumentace. Obsahuje SHA-256 celého ZIP, jednotlivých zpracovaných tabulek i doplňkového JSON a kontrolní součet normalizovaného snapshotu. Starší schéma **1** se všemi třemi původními zdroji se načítá beze změny jeho kontrolního součtu. Formát draftů světa zůstává stejný.

Odmítají se chybějící tabulky/sloupce, duplicitní ID, vadné souřadnice, neznámé druhy, chybné vazby, chybějící stop_times/tvary aktivních spojů, neplatné pořadí/časy, neznámé kalendářní výjimky a feed mimo požadovaný den. ZIP má limit 100 MiB, zpracované rozbalené tabulky dohromady 512 MiB, jednotlivá 256 MiB a nejvýše 100 položek. CSV podporuje BOM, UTF-8, uvozovky i vložené nové řádky. Archiv se nerozbaluje do souborového systému. Velké CSV se parsují po záznamech; tvary zůstávají v paměti sestavovače.

Publikace ukládá `snapshot-<úplný SHA256>.json.gz`, teprve pak atomicky mění `index.json`. Katalog v2 zachovává **všechny verze**, datum, identitu, adaptér a hash; starší názvy s 16 znaky se nadále čtou. Kořen ukazuje nejnovější den a sestavení; vložení historického dne jej neposune zpět. Staré verze se automaticky nemažou. Pro historii nedochází k náhradě „nejbližším“ či nejnovějším snapshotem. CLI má být spouštěné jedním zapisovatelem, v Actions to zajišťuje concurrency; budoucí backend musí poskytnout distribuovaný zámek.

Prohlížeč nejprve ověří IndexedDB `jetlag-praha-pid`, teprve pak čte statickou publikaci. Databáze má oddělené `snapshots` a `state`; nové tělo a ukazatel `current` se zapisují v jedné transakci. Pokud neuspěje síť, kontrola nebo zápis (např. kvóta), stará verze zůstává. Chyba načtení bez dat je oddělená od chyby nové publikace při dostupném snapshotu. Datum, počty a mapové funkce zůstávají viditelné. Výsledek nedokončeného prostorového filtru není předstírán jako `0 / 0`; chyba umožní filtr vypnout.

Historická nebo globálně nekonzistentní data nesou **Historická referenční data – neověřeno**. Body, trasy, kruhy, sjednocené pokrytí a geografická diagnostika fungují i nad nimi. Ostrá povolenost vrací „nelze určit“. Po změně pražského dne se pravidla přehodnotí bez stahování a bez automatického přeznačení starých dat jako dnešních. Zobrazení a filtry jsou odděleně uložené pod `jetlag-praha:pid-preferences:v1`.

Původní bootstrap má aktivní geodata ze **2026-08-20**, trasy do **2026-08-26** a skupiny z **2026-10-15**. Zůstává historický a jeho licence/čas původního stažení jsou nedoložené; nově doložená licence GTFS se na něj zpětně nepřipisuje. [Původní audit](../data/source-metadata/pid-source-audit.md) a [audit výpadku](PID_REFRESH_AUDIT_2026-10-16.md) popisují tehdejší stav.

## Geometrie a zachování editoru

Pražská předvolba je skutečné sjednocení 57 městských částí včetně otvorů a oddělených částí. Aktualizace PID ani administrativních vrstev definici herní oblasti nemění. Prostorový filtr používá referenční bod a skutečný průnik celé linky; obálky pouze zrychlují vyhledávání. Celá protínající trasa zůstává zachovaná.

Úkrytová zóna vychází z **jediného referenčního bodu**, výchozích **400 m** a skutečného průniku kruhu s herním Polygonem/MultiPolygonem. Souhrnné pokrytí sjednotí kruhy, překryvy počítá jednou a ořízne výsledek herní hranicí. Zastávky k revizi mají označený geometrický náhled; vyloučené a neurčené body se nezahrnou. Geografickou povolenost rozhoduje Turf vzdálenost velké kružnice a celý polygon, nikoli nakreslený obvod nebo bounding box. Přesně 400 m a hranice oblasti se započítávají; vnitřek otvoru je vně. Kruh má 128 úseků a model vzdálenosti je kulový, nikoli elipsoidální.

`WorldDraft` v IndexedDB i JSON/GeoJSON zachovává vlastní objekty, administrativní data, hranici, propojení, výjimky a schválené body. PID zdroj má samostatný export `.json.gz` a import s porovnáním. Pro přenos přesné kombinace pravidel a dat uchovejte **obě** zálohy. Výběr zastávky v tomto editoru a diagnostický špendlík jsou lokální dočasné nástroje správce.

## Moduly a budoucí serverové kontrakty

- `pid-gtfs.ts`: čistý adaptér a kalendář/časy; `scripts/gtfs-input.ts`: ZIP a streamované CSV; `gtfs-publication.ts`: stahování, validace a diagnostika.
- `pid-snapshot.ts`: integrita v1/v2, neměnnost a porovnání; `pid-catalog.ts` a `scripts/pid-publication.ts`: verze a atomické přijetí. `stage-pid-publication.ts` pouze přebírá hotová data do webu.
- `game-stops.ts`: aktivita, dominance, body a úkryty; `territory.ts`: skutečné sjednocení a prostorové operace. `pid.worker.ts` drží velký snapshot mimo React; `territory.worker.ts` odděleně počítá rozsáhlé sjednocení kruhů.
- `pid-shared.ts`: `createSharedPidCache(SharedPidStorage, build)` nejprve ověří centrální den, chybějící sestaví pod zámkem, po získání zámku znovu zkontroluje cache a publikuje atomicky. Lokální Promise sdílí souběh v procesu, povinné `withExclusiveDay` musí v budoucím úložišti poskytovat skutečný distribuovaný lock/lease. Test se dvěma nezávislými instancemi ověřuje jediný build. Konkrétní distribuované úložiště není součástí této iterace.
- `SnapshotReference` uzamkne ID, SHA-256, den a adaptér. Čtení `pinned` musí najít přesně tuto verzi a ověřit celý obsah; nepřepíná na poslední publikaci. Historie je nutná i po následujících aktualizacích.
- `hide-selection.ts`: `hideCandidates` vrací jen aktivní, povolené body ve skutečné oblasti, volitelně ve vzdálenosti od polohy. `confirmHideSelection` přijímá jen vybrané stabilní ID a pravidla/hraniční geometrii/verzi/identitu hráče z důvěryhodného serverového stavu; povolenost znovu ověří proti přesnému snapshotu. Historická data nejsou automatický zdroj nové hry. `PrivateHideSelection` je soukromý údaj schovávače. `hideSelectionForViewer` vrátí pro hledače i jiného schovávače `null`; role a identita musejí pocházet z autentizace serveru. Soukromé ID se nesmí přidat do veřejného DTO ani do výstupu hledačům. Podrobné požadavky jsou ve [specifikaci](../JETLAG_PRAHA_SPEC.md).

Tyto funkce jsou skutečná validace a výpočty; nenahrazují autentizaci, centrální úložiště ani běžící backend. Pages žádný takový proces nemá. Hráčské účty, místnosti, mobilní UI, sdílení GPS, realtime mimořádnosti, otázky a simulátor hráčů zůstávají mimo tuto iteraci.

## Příkazy a ověření

```sh
npm run pid:gtfs                          # ruční serverové sestavení/použití dneška
npm run pid:gtfs -- --date 2026-10-16 --output /tmp/pid-publication
npm run pid:gtfs -- --date 2026-10-16 --force
# Bez stahování, z ověřených místních zdrojů:
npm run pid:gtfs -- --date 2026-10-16 --archive /cesta/PID_GTFS.zip --groups /cesta/stops.json --output /tmp/pid-publication
npm run pid:stage -- --from /cesta/pid-data/pid
npm run pid:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

`pid:publish` je alias nového GTFS sestavení. Staré `pid:inspect`, `pid:bundle` a `pid:legacy:publish` slouží výhradně kompatibilnímu auditu/importu původních geodat; produkční workflow je nepoužívá. `pid:bundle` by lokálně nahradil bootstrap, proto jej nepoužívejte jako aktualizaci aktuální GTFS publikace.

Automatické kontrolované scénáře pokrývají pracovní/víkendový den, přidání i zrušení kalendáře, výstupní konečnou, zákaz obou směrů, neaktivní/neurčitelné uzly, přes půlnoc, návrat lanovky, všech sedm druhů, přesné identity, neúplné shapes/stop_times, CSV/ZIP, výpadky, opakované použití bez síťového požadavku, historie a souběh cache, soukromí výběru i zachování pravidel a exportů. E2E kontroluje načtení GTFS a rozdíly tras, neaktivní uzel, nulové živé požadavky, cache po reloadu při výpadku publikace, vlastní drafty, ruční body, zóny a filtry. Reálný plný audit se spouští samostatně s `GTFS_REAL_SNAPSHOT`; běžné testy nestahují síť a tento jeden volitelný audit označují jako přeskočený.
