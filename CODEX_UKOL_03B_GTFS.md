# JetLagPrague – Iterace 03B: Aktualizace PID prostřednictvím GTFS

Repozitář: https://github.com/Wondrej89/JetLagPrague

## Cíl

Přepracovat načítání dopravních dat PID tak, aby hra pracovala s aktuálně obsluhovanými zastávkami a trasami podle oficiálního denního GTFS.

Zachovat stávající mapový editor, definici herní oblasti, ruční úpravy zastávek, úkrytové zóny, IndexedDB a verze snapshotů.

Neimplementovat zatím kompletní multiplayer.

## 1. Nový hlavní datový zdroj

Primární zdroj:

https://data.pid.cz/PID_GTFS.zip

Doplňkový zdroj:

https://data.pid.cz/stops/json/stops.json

GTFS musí být hlavním zdrojem pro určení aktuálně obsluhovaných zastávek a provozovaných tras.

Původní `Zastavky_WGS84.json` a `Linky_7d_WGS84.json` nesmějí být povinné pro vytvoření aktuálního snapshotu.

Použij `stops.json` pro skupiny fyzických zastávek a stabilní referenční body, pokud lze bezpečně doložit vazbu na GTFS.

## 2. Určování aktivních zastávek

Ze souborů GTFS zpracuj zejména:

- `stops.txt`
- `routes.txt`
- `trips.txt`
- `stop_times.txt`
- `calendar.txt`
- `calendar_dates.txt`
- `shapes.txt`

Pro zvolené pražské datum určuj skutečně plánovanou obsluhu podle aktivních služeb a výjimek v kalendáři.

Zastávka je aktivní, pokud má alespoň jeden plánovaný spoj, u kterého je povolen nástup nebo výstup cestujících.

Zachovej také konečné zastávky, kde je povolen pouze výstup.

Nerozhoduj pouze podle přítomnosti zastávky v `stops.txt`.

Zohledni GTFS časy přesahující 24:00, aby správně fungoval noční provoz přes půlnoc.

Zachovej aktuální pravidla dominantního dopravního typu.

Rozlišuj:
- Aktivní zastávku.
- Neaktivní zastávku bez plánované obsluhy.
- Zastávku, jejíž stav nelze určit kvůli chybějícím nebo nejednoznačným datům.

Neaktivní a neurčitelné zastávky nesmějí být automaticky povoleny jako úkryt.

## 3. Trasy spojů

Geometrii aktuálně provozovaných tras vytvářej z `shapes.txt`.

Používej pouze tvary přiřazené spojům platným ve zvoleném dni.

Zachovej dopravní typy včetně vlaku, metra, tramvaje, autobusu, trolejbusu, přívozu a lanovky.

Nespojuj zastávky umělými přímkami.

V rámci testů zvlášť prověř:
- Praha-Zličín.
- Praha-Stodůlky.
- Praha-Cibulka.
- Újezd, Nebozízek a Petřín.

Pokud se zdrojová data liší kvůli výluce, zobraz skutečný doložený stav a jeho datum.

## 4. Ruční aktualizace v editoru

Odstraň automatické denní aktualizace a pokusy o živé stažení při každém otevření editoru.

V editoru zachovej načítání posledního publikovaného snapshotu.

Přidej administrátorskou funkci „Aktualizovat data PID“:

- Aktualizace spustí serverové zpracování GTFS.
- Po dokončení zpřístupní nový snapshot.
- Zobrazí datum, čas poslední úspěšné aktualizace, verzi a počet aktivních zastávek.
- Ukáže rozdíly oproti předchozímu snapshotu.
- Při chybě zachová poslední funkční verzi a zobrazí diagnostiku.

Protože GitHub Pages neumí spouštět zabezpečené serverové procesy, nesnaž se vyvolávat GitHub Actions z veřejného JavaScriptu pomocí uloženého tokenu.

Navrhni minimální bezpečné řešení. Preferovaně samostatný GitHub Actions workflow `workflow_dispatch` pro sestavení snapshotu, který bude možné později spouštět i zabezpečeným backendem.

Pokud nebude v této iteraci implementován autentizovaný backend, poskytni v editoru jasný odkaz na ruční spuštění workflow a možnost načíst jeho výsledek. Nezobrazuj falešné tlačítko, které pouze opakuje problematické přímé stahování.

## 5. Odstranění zbytečných aktualizací

Odstraň `schedule` pro denní aktualizaci PID z GitHub Actions.

Odděl sestavení webové aplikace od aktualizace PID.

Běžný push zdrojového kódu nesmí:
- Zbytečně stahovat GTFS.
- Přepisovat novější snapshot starší verzí z repozitáře.
- Měnit stávající ruční úpravy dat.

Dokončená aktualizace PID musí bezpečně publikovat novou verzi dostupnou editoru, včetně katalogu snapshotů a kontrolních součtů.

## 6. Sdílená cache pro budoucí multiplayer

Připrav rozhraní geografického jádra, které umožní později následující postup:

1. První hráč se přihlásí v daném pražském dni.
2. Backend zkontroluje centrálně uložený dnešní snapshot.
3. Pokud je dostupný a ověřený, okamžitě ho použije.
4. Pokud chybí, spustí jedno zpracování aktuálního GTFS.
5. Ostatní současně přihlášení hráči čekají na stejný výsledek, nikoliv na své samostatné stahování.
6. Hotový snapshot se uloží do sdíleného úložiště.
7. Nová herní místnost uzamkne ID a kontrolní součet daného snapshotu.

Pro rozhodování o datu používej `Europe/Prague`.

Zajisti ochranu před souběžnými aktualizacemi a duplicitním zpracováním.

Multiplayer backend nyní nemusíš vytvářet, ale připrav znovupoužitelné funkce a datové kontrakty.

## 7. Budoucí výběr úkrytové zastávky

Do specifikace a geografického jádra přidej kontrakt pro výběr úkrytové zastávky:

- Klient dostane pouze aktivní herní zastávky.
- Lze filtrovat zastávky v okolí aktuální polohy a v rámci herní oblasti.
- Schovávač vybere konkrétní zastávku podle jejího stabilního ID.
- Backend při potvrzení opět ověří její povolenost v uzamčeném snapshotu.
- Zvolené ID je soukromým údajem schovávače a nesmí být zahrnuto v datech odesílaných hledačům.
- Povolený úkrytový okruh nadále vychází z jednoho referenčního bodu zastávky.

Mobilní uživatelské rozhraní ani herní místnosti nyní neimplementuj.

## 8. Validace a ochrana dat

- Každý snapshot obsahuje datum, SHA-256, verzi adaptéru a záznam o původu dat.
- Neplatný nebo neúplný GTFS nesmí přepsat poslední funkční snapshot.
- Data načtená dnes musí být ověřena jako použitelná pro požadovaný den, nikoliv pouze opatřena dnešním časem stažení.
- Starý snapshot lze v editoru zobrazit jako historický, ale nesmí být automaticky použit pro novou ostrou hru.
- Jednotlivá nespárovaná stanoviště označ k revizi; pokud je zbytek dat prokazatelně konzistentní, nepovažuj automaticky celý snapshot za nepoužitelný.
- Zachovej všechny ruční výjimky, geometrie a schválené referenční body.

## 9. Testování

Ověř:
- Pracovní a nepracovní den.
- Kalendářní výjimku a zrušený spoj.
- Dočasně neobsluhovanou zastávku.
- Pouze výstupní konečnou zastávku.
- Přesun provozu přes půlnoc.
- Lanovku s obnoveným provozem podle dat pro příslušné datum.
- Nedostupnost zdroje PID.
- Aktualizaci pouze na vyžádání.
- Opakované použití snapshotu bez opětovného stažení.
- Zachování staršího snapshotu při chybě.
- Zachování ručních úprav a exportů.

Doplň jednotkové a integrační testy s kontrolovanými daty a ověř reálné soubory PID, pokud jsou dostupné.

## 10. Rozsah implementace

Nyní implementuj:
- GTFS importér a validaci.
- Serverové sestavování snapshotu.
- Ručně spustitelnou aktualizaci pro editor.
- Publikování a načítání verzovaných dat.
- Datový kontrakt pro budoucí multiplayer.
- Testy a dokumentaci.

Zatím neimplementuj:
- Přihlášení hráčů.
- Mobilní multiplayer.
- Sdílení GPS.
- Herní místnosti.
- Automatické dotazy na mimořádnosti v reálném čase.

Před implementací prověř skutečné schéma GTFS PID a navrhni nutné změny současných modulů. Zachovej dosavadní funkční editor a kompatibilitu geografických dat.

Po dokončení proveď lint, typecheck, jednotkové testy, E2E testy a build. Aktualizuj README a dokumentaci PID.