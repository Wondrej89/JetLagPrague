# Audit skutečného PID GTFS – 16. 10. 2026

Audit úplně stažených souborů proběhl před změnou adaptéru iterace 03B. Nejde o předpokládané schéma ani pouhou kontrolu HTTP hlaviček.

## Původ a licence

| Soubor | Oficiální URL | Velikost | SHA-256 |
| --- | --- | ---: | --- |
| GTFS ZIP | https://data.pid.cz/PID_GTFS.zip | 53 119 580 B | `a406896561136e584df87ec3af93a320b52793a2fdaac107415eec645f09b249` |
| Skupiny JSON | https://data.pid.cz/stops/json/stops.json | 19 078 219 B | `5b985f56d5f7c4ca294207e8bb4121217b61819b91489eb920eb031482b00452` |

GTFS HTTP Last-Modified: **2026-10-16 01:52:02 UTC**. `feed_info` uvádí ROPID, https://pid.cz, jazyk `cs` a období **20261016–20261029**. `agency_timezone` je **Europe/Prague**. Doplňkový JSON má `dataFormatVersion = 3` a `generatedAt = 2026-10-16T03:53:05`. Datum generování nemá offset; nevydává se za přesný UTC čas. Snapshot zvlášť zaznamenává skutečný čas převzetí a sestavení.

[Oficiální dokumentace PID](https://pid.cz/o-systemu/opendata/) při ověření uváděla pro publikovaná otevřená data **CC BY 4.0**, https://creativecommons.org/licenses/by/4.0/. Metadata nových distribucí obsahují tuto licenci, oficiální URL a původní kontrolní součty. Licence neznámých starších uživatelských souborů se zpětně nepřepisuje. Atribuce: PID / ROPID, zdroje výše, zpracování JetLagPrague (výběr provozního dne, seskupení fyzických míst, normalizace). Nejde o změnu zdrojových hranic nebo vytváření náhradních tras.

## Ověřené tabulky a vazby

ZIP obsahuje 20 položek. Zpracované tabulky a skutečné klíče:

| Tabulka | Řádky | Ověřené sloupce / význam |
| --- | ---: | --- |
| `agency.txt` | 1 | `agency_id`, `agency_timezone` |
| `feed_info.txt` | 1 | `feed_publisher_name`, `feed_publisher_url`, `feed_lang`, `feed_start_date`, `feed_end_date` |
| `stops.txt` | 20 141 | `stop_id`, `stop_name`, `stop_lat`, `stop_lon`, `location_type`, `parent_station`, `asw_node_id`, `asw_stop_id`, `zone_region_type` |
| `routes.txt` | 891 | `route_id`, `route_short_name`, `route_type`, `route_color`, `is_night` |
| `trips.txt` | 97 181 | `route_id`, `service_id`, `trip_id`, `shape_id` |
| `stop_times.txt` | 1 961 835 | `trip_id`, `stop_id`, `stop_sequence`, `arrival_time`, `departure_time`, `pickup_type`, `drop_off_type`, `trip_operation_type` |
| `shapes.txt` | 3 718 882 | `shape_id`, `shape_pt_sequence`, `shape_pt_lat`, `shape_pt_lon` |
| `calendar.txt` | dle vydání | `service_id`, sedm příznaků dnů, `start_date`, `end_date` |
| `calendar_dates.txt` | dle vydání | `service_id`, `date`, `exception_type` (1 přidání, 2 zrušení) |

Typy míst: 18 664 typu 0, 260 typu 1, 339 typu 2, 628 typu 3 a 250 typu 4. Právě 628 interních uzlů typu 3 má prázdné jméno; všechna mají souřadnice. Prázdný název proto nelze plošně považovat za poškození feedu. Provozní pomocná místa PID mají `zone_region_type` 0/prázdné a nejsou veřejné herní zastávky. Typy nástupu/výstupu zahrnují 0/1/2/3.

Typy linek: autobus 746, vlak 91, tramvaj 39, trolejbus 6, přívoz 5, metro 3, lanovka 1. `is_night`: 843 denních, 48 nočních linek. Provozní typy stop_times 7–10 podle dokumentace zahrnují veřejné tramvajové výjezdy, zátahy a přesuny; neodstraňují se bez ověření nástupu/výstupu.

Časy dosahují až hodiny **47**; 90 674 všech stop_times má čas nad 24 hodin. Dokumentace výslovně vztahuje noční spoje předchozího provozního dne k času např. 30:00, bez dalšího kalendáře. Implementace proto používá provozní den, nikoli prostý občanský interval 00:00–24:00.

## Výsledek plného sestavení pro 2026-10-16

Vybráno **354 aktivních service_id**, **52 663 plánovaných veřejných spojů**, **16 955 aktivních GTFS stop_id**, **870 aktivních ID linek** a **26 621 aktivních návštěv za půlnocí provozního dne**. S doplňkovými skupinami vzniklo 9 215 skupin / 17 922 fyzických nebo výslovně nespárovaných stanovišť, z toho **8 265 herních uzlů s obsluhou** a **950 bez obsluhy**. Celý GTFS prošel kontrolou referencí, časů a tvarů. Síť zahrnuje také Středočeský kraj; území Prahy se filtruje samostatnou skutečnou geometrií.

**689 skupin** má místní revizi fyzické vazby či neznámého stanoviště. Mnohé jsou neobsluhované pomocné vstupy/varianty; nepoškozují globálně zbytek ověřeného dne. Automaticky povolených je 8 250 uzlů; zbylé aktivní vyžadují místní nebo zvláštní schválení (např. přívoz a lanovka). Počet neznámých fyzických míst není totéž co počet neznámých herních uzlů: uzel s jiným ověřeným aktivním stanovištěm může mít aktivní obsluhu, ale místní revizi bodu.

| Ověřené místo | Přesné GTFS / fyzické vazby | Doložený stav 2026-10-16 |
| --- | --- | --- |
| Praha-Zličín | `U612Z301` | Aktivní vlak, 39 návštěv |
| Praha-Stodůlky | `U1483Z301` | Bez plánované obsluhy, nikoli automatický úkryt |
| Praha-Cibulka | `U1482Z301` | Bez plánované obsluhy, nikoli automatický úkryt |
| Újezd – lanovka | uzel 1997, `U1997Z1P` / `U1997Z2P` | Aktivní, 84 návštěv každé varianty |
| Nebozízek | uzel 1998, `U1998Z2P` | Aktivní lanovka, 84 návštěv |
| Petřín | uzel 1999, `U1999Z1P` / `U1999Z2P` | Aktivní lanovka, 84 návštěv každé varianty |
| Anděl | fyzická metro stanoviště `1040/101`, `1040/102` | Referenční bod nadále `[14.403769, 50.06995]`, metro nad tramvají/autobusem |

Tramvajový Újezd (uzel 809) se neslučuje s lanovkou pouze podle názvu. Lanovka má v tomto feedu 168 aktivních spojů, ale herní pravidla nadále vyžadují její výslovné schválení. Přípony `P` mají skutečné samostatné GTFS identity; fyzická shoda se dokládá ASW identifikátory či přesnými aliasy. Stav tabulky není tvrzením o okamžité mimořádnosti v dopravě. Příčinu neobsluhy Stodůlek/Cibulky nelze z pouhé absence spojů vydávat za ověřenou konkrétní výluku.

Následná kontrola skutečné publikace v prohlížeči nad sjednocením 57 městských částí vybrala **1 465 herních uzlů a 426 linek v Praze**. Skutečné sjednocení 400m zón oříznuté Prahou má přibližně **315,85 km²**; zahrnuje 1 459 automaticky povolených a 6 uzlů vyžadujících revizi. Dalších 8 aktivních uzlů celé sítě nemá určitelný bod, takže se jejich příslušnost k Praze neodhaduje. Náhled není plošným schválením šesti revidovaných zastávek.

## Reprodukce a omezení

Archiv se kvůli velikosti neukládá do větve kódu. Větev `pid-data` obsahuje komprimovaný normalizovaný výsledek a všechny jeho verze. Pro opakování auditu je nutné zachovat právě výše uvedené vstupy; oficiální URL se průběžně mění.

```sh
npm run pid:gtfs -- --archive /cesta/PID_GTFS.zip --groups /cesta/stops.json --date 2026-10-16 --output /tmp/pid-audit
# Volitelný test očekává rozbalený JSON výsledku tohoto konkrétního vydání:
GTFS_REAL_SNAPSHOT=/cesta/snapshot.json npx vitest run scripts/gtfs-real.test.ts
```

Kontrolovaný test pokrývá pracovní i víkendový den, výjimky, dočasnou neobsluhu, výstupní konečnou, časy přes půlnoc a návrat lanovky pro příslušný kalendář. Úplný reálný audit navíc ověřuje skutečné kontrolní součty, počty, geometrie, sedm módů a místa výše. Statické plánované GTFS není realtime garant dostupnosti. Nejednoznačná místa vyžadují revizi; žádné chybějící vazby, středy ani trasy se neodhadují.
