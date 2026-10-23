# Herní vrstvy, dedukční mapa a Move

Nové funkce používají sdílený `Game Core`, `Geo Resolver`, `Game UI` a původní Leaflet `MapSurface`. Stejná implementace běží v desktopovém i mobilním rozložení webového simulátoru. Editor ani publikovaná geodata se nemění.

## Zapnutí v nové simulaci

Zvolte Small / Medium / Large a založte novou partii. Přímo na **každém telefonu** potvrďte Ano / Bez zakreslování. Zapne se pouze po dvou Ano; oba telefony zobrazí výsledek dohody. Potom každý samostatně potvrdí **Jsem připraven**. Teprve druhé potvrzení spustí herní čas. Rozhodnutí jsou uložená v `lobby.choices`, v `GameRules.automaticDeductionMap` a `deductionConsent` s autoritou `simulator`; po startu se nemění. Nastavení v administraci slouží rychlým testovacím scénářům a nenahrazuje rozhodnutí rolí při standardní nové hře. [Podrobnosti](GAME_UX_HANGMAN.md).

Historické exporty zůstávají čitelné. Starým hrám se automatická dedukce ani nový protokol Move potichu nezapínají. Nové hry mají `mapVersion: 1` a `moveVersion: 2`; uložená starší pravidla se nepřepisují.

Nejde o implementaci multiplayeru. Lokální souhlas za dvě role není serverový souhlas skutečných účastníků. Game Core odmítne vytvořit `live` partii s automatickým zakreslováním na základě simulátorového souhlasu. Ostrý transport musí ověřit jednotlivé účastníky, jejich souhlasy a neměnnou konfiguraci na autorizovaném serveru; nyní takový transport není připojený.

## Vrstvy během otázky

Na mapě telefonu hledačů otevřete **Vrstvy**. Každá položka má ikonu, barvu, počet a stav zdroje. Katalog vzniká z ověřeného neměnného `GameDataRelease` a metadat kategorií. Žádná data z pracovního editorového draftu se nečtou.

Dostupné jsou schválené body letišť, zoo, nemocnic, kin a knihoven, polygonové parky a vodní plochy, městské části, katastrální území a publikované způsobilé zastávky PID. Železniční stanice jsou skutečná podmnožina publikovaných zastávek s referenčním módem `train`. Golfová hřiště, aquaparky a Vltava jsou označené jako chybějící; nevznikají náhradní objekty. Metadata mohou doplnit další publikovanou kategorii bez přepisování mapového UI.

Kliknutí na objekt zobrazí jeho název, kategorii, ID, zdroj, případnou adresu a referenční GPS. Souřadnice ani polygon se pro mapu neposouvají. Polygon/MultiPolygon zachovává otvory a oddělené části. Výplň a hranice lze přepínat zvlášť; hledání podle názvu nebo ID umí objekt zvýraznit. Výběr ani změna vrstev nemění GPS nebo rozpracovanou otázku. Z otázky lze přejít na mapu a zpět.

Zobrazení je nezávislé na automatické dedukci. Volby viditelnosti se ukládají odděleně jako místní zobrazovací nastavení podle hry a role. Neovlivňují schválení ani geografické odpovědi.

Schválení katalogu označuje herní výběr, nikoli úplnost registru všech míst v Praze. Referenční PID se stále výrazně označuje **Historická referenční data – neověřeno**. Tato iterace žádné zdroje PID neaktualizuje.

## Zdroj pravdy a soukromí

Primárním zdrojem jsou neměnné odpovězené `QuestionInstance`. Odvozený `Deduction` ukládá ID otázky, etapu, release, rozhodný cíl, operaci, typ, výsledek, čas a pouze veřejné geometrické parametry: uloženou GPS hledačů, případné B, kategorii, poloměr, metriku a toleranci. Neukládá vykreslený GeoJSON jako herní pravdu.

Při importu/reloadu se kontroluje vazba dedukcí na původní otázky, odpovědi, etapu a uzamčený katalog. Změna poloměru v dedukci bez změny historie se odmítne. Odvozené geometrie lze z těchto údajů znovu sestavit.

Hunter DTO neobsahuje skrytou GPS, cílový bod otázky, novou zastávku Move, průběžnou GPS přesunu, ruku ani soukromé fotografie. Schovanému se neposílají nové dedukční parametry s historickými polohami hledačů. Správcovská mapa simulátoru má jako dosud úplné místní diagnostické polohy, mimo telefony.

Worker dostane pouze veřejný katalog a sanitizované dedukce. Žádná skrytá poloha se nepoužívá k zakreslení oblasti hledačům. Výpočet ani historie se neodesílají na server. Pevný atlas Mapy.com zůstává stejný; pohyb simulovaných hráčů nevyvolává nové mapové požadavky podle jejich soukromé polohy.

## Prostorové podmínky

| Typ | Podmínka přípustné polohy P |
| --- | --- |
| Radar ANO / NE | `distance(S,P) <= R` / `> R`, ze snapshotu S |
| Measuring BLÍŽ / DÁL | `min distance(P, category) < D` / `> D`; D pochází z uloženého S |
| Thermometer TEPLEJI / CHLADNĚJI | `distance(B,P) < distance(A,P)` / opačně, z neměnných A/B |
| Matching POI ANO / NE | nejbližší schválený objekt v P má / nemá stejné ID jako nejbližší objekt v S |
| Matching administrativní | skutečná příslušnost k publikovanému polygonu stejné městské části/katastru |

Measuring bere minimum přes **všechny** způsobilé objekty, nikoli vzdálenost k jedinému objektu nejbližšímu hledačům. V nové verzi měří polygonové Matching/Measuring k celé ploše, uvnitř 0, v otvorech k jejich hranici. Historické definice bez `distanceMode: geometry` si zachovávají původní referenční metriku; vodní plochy se jako dosud měří k ploše.

Shodu nejbližších vzdáleností resolver rozhoduje podle stabilního ID s existující tolerancí 1 μm. Vykreslení přes nerozhodné pásmo nic nepředstírá. Measuring `STEJNĚ`, ručně dohodnutý nerozhodný Thermometer, fotografie, Tentacles a ruční otázky o lince/délce názvu nemají v této iteraci automatickou prostorovou dedukci; jejich výsledky zůstávají v historii. Neimplementuje se další herní pravidlo pro jejich zakreslování.

### Přesnost a neutrální plocha

Herní odpovědi se nadále rozhodují z plných WGS84 geometrií a geografických vzdáleností v metrech. Zjednodušená hranice obrazovky se nikdy nepoužívá k odpovědi.

**Barevné plochy jsou konzervativní aproximace, nikoli přesná matematická hranice.** Worker používá metrickou projekci UTM 33N a adaptivní čtvercové buňky do 64 m. V centru buňky vyhodnotí skutečnou geografickou vzdálenost a pomocí Lipschitzovy meze ověří celou buňku: vzdálenost k množině je 1-Lipschitzova, rozdíl vzdáleností pro Matching/Thermometer 2-Lipschitzův. Poloměr buňky obsahuje rezervu 1 % pro měřítko projekce a 2 m pro odvozené zobrazovací geometrie; zahrne se i tolerance otázky. U polygonů se navíc přičítá konzervativní rezerva pro rozdíl mezi lineární WGS84 hranou GeoJSON a geodetickou hranou: pro segment délky L je odchylka shora omezena `L² / 6 371 008,8` m; pole používá dvojnásobek této meze, rozdíl dvou polí čtyřnásobek. Hodnota se zobrazí v panelu. Rezerva stromu zohledňuje tutéž křivost, aby nevyřadil bližší segment podle jeho obálky.

- Zelená: všechny aktivní podmínky jsou potvrzené přes celou buňku.
- Červená: alespoň jedna podmínka je přes celou buňku vyloučená.
- Neutrální: výsledek v celé buňce nelze prokázat. Zahrnuje hraniční pásma, shody a chybějící administrativní příslušnost.

Neutrální plocha je stále potenciálně přípustná. Šířka pásma nemá univerzální horní mez 64 m: u podobných vzdálenostních funkcí může být širší. Při výpočetním limitu 45 000 buněk nebo 300 000 vyhodnocení podmínek zůstávají nevyřešené buňky neutrální a UI zobrazí upozornění. Prázdná zelená vrstva sama o sobě nedokazuje matematicky prázdnou oblast, pokud zbývá neutrální plocha.

Buňky se skutečně sjednocují a protínají s celou herní geometrií. Otvory, oddělené části a hranice Prahy se nenahrazují bounding boxem. Bounding-volume strom slouží jen pro bezpečné zrychlení hledání; rozhoduje přesná vzdálenost k bodu/polygonu/segmentu. Projekce je ověřená pro 13–16° E a 49–51° N, segmenty indexované hranice musí být kratší než 50 km; nepodporovaný rozsah vrátí chybu místo odhadu.

Radar navíc má metrický obrys a administrativní Matching obrys původního polygonu. Thermometer zobrazuje A, B, spojnici a orientační dělící čáru získanou řešením skutečné geodesické rovnosti v metrických řezech. Barevnou jistotu určují výše uvedené konzervativní podmínky. Uvedené rozlišení ani metrová tolerance nejsou tvrzením o skutečné přesnosti GPS zařízení.

## Kombinace, historie a výkon

Panel **Dedukce** ukazuje počet otázek, aktivní podmínky, odpovědi, parametry, časy a archiv. Vrstva „Možná oblast“ počítá průnik všech aktivních podmínek stejné etapy **o stanovišti**. Jednotlivý výsledek lze vybrat a zvýraznit; jeho skrytí nemění historii ani platnost celkového průniku.

GPS a stanoviště jsou oddělené cíle. Navíc se **nekombinují GPS z různých otázek**, protože schovaný se mezi nimi může pohybovat v povoleném okruhu. Panel GPS dovoluje vybrat konkrétní okamžik. Worker nesmí přijmout smíchané releasy, etapy ani více různých GPS snapshotů jako jednu polohu. Přenos omezení mezi stanovištěm a GPS přes 400m vazbu se nyní nepoužívá.

Prostorové operace běží ve sdíleném Web Workeru. Indexy se připravují jednou pro kategorii a metriku. Výsledky mají omezenou cache podle release, otázky, parametrů, cíle a přesnosti. Mapy stejného katalogu sdílejí worker; při zavření posledního spotřebitele se ukončí. Pan/zoom nic nepřepočítává. Při výpočtu a chybě je uveden stav; staré podmínky se nevydávají za aktuální prázdný výsledek. CSP povoluje pouze worker stejného originu, ne vzdálený kód.

## Úplný Move v nových hrách

1. Schovaný musí mít skutečnou kartu Move, uzamčené stanoviště, dokončenou předchozí otázku i nabídku karet; nesmí být potvrzené endgame ani jiný Move.
2. Odloží se celá ruka včetně Move, bez porušení rozdělení balíčku. Zaznamená se původní zastávka s ID/GPS.
3. Hledači dostanou celoplošné oznámení, jméno a mapový bod původní zastávky, dvacetiminutový odpočet a povinnost zůstat na místě. Původní zastávka zůstává odhalená i v historii/mapě.
4. Aktivní dedukce se archivují a okamžitě vznikne nové `epochId`. Staré barevné plochy se vyčistí; historické podmínky lze znovu výslovně zobrazit jako archivované.
5. Po **celých 20 minut** nepřibývá herní čas schovaného. Skutečně uplynulý/virtuální čas dál řídí odpočet. Engine odmítá otázky, simulované přesuny hledačů a ostatní nepovolené herní akce i bez UI.
6. Schovaný zvolí jinou publikovanou způsobilou zastávku do 400 m své platné GPS. Mapa ukáže kandidáty, vybraný bod a 400m okruh. Předběžné potvrzení cíle **neukončí pauzu dříve**; lze ho změnit do limitu.
7. V okamžiku limitu se použije platná GPS nejpozději z tohoto okamžiku. Potvrzený cíl se uzamkne, pokud je stále způsobilý; jinak se jednoznačný jediný kandidát použije podle existujícího pravidla výběru. Při více kandidátech se vyžaduje volba ze zmrazeného seznamu. Chybějící GPS ani nulový seznam se nenahrazují náhodnou zastávkou.
8. Pozdě dodaný GPS bod není důkazem polohy při limitu. Po 20 minutách pauza končí; nevyřešená volba dál blokuje otázky. Bez způsobilého deadline snapshotu je nutné řešení/reset testu, nikoli geografický odhad.
9. Po uzamčení pokračuje hledání s novou zastávkou a čistou dedukční etapou. Žádné staré geografické odpovědi se automaticky nepoužijí pro nové místo.

Simulovaný kontinuální GPS provider při skoku času vloží pozorování do přesného okamžiku limitu. Skutečné GPS se takto nikdy neinterpoluje. Reload zachová pauzu, výběr, audit i časování; virtuální čas zůstává pod kontrolou simulátoru.

Fyzickému pohybu nelze zabránit softwarem. Normální simulované přemístění hledačů se během Move odmítne. Výslovný diagnostický GPS záznam může pohyb zaznamenat a upozornit na porušení; neodblokuje otázky a nepřidává žádnou novou automatickou penalizaci. Endgame se potvrzuje ručně, neodhaduje se ze vzdálenosti hledačů.

## Scénáře a ověření

Nová skupina **Mapa / Move** obsahuje 20 opakovatelných scénářů nad publikovanými daty: oba Radary, překryv, Measuring bodů/polygonů/různých nejbližších míst, obě strany Thermometeru, Matching ANO/NE, kombinace, oddělení GPS, odhalení původu Move, pauza, blokace, výběr, nová etapa, reload a endgame.

Scénář **DIAGNOSTIKA – konflikt** přidává dvě protikladné geometrické podmínky pouze do administrátorské vizualizace. Nezapisuje falešnou odpověď do hry, nemění telefony a neobchází kontrolu importu.

Jednotkové testy kontrolují geografické nerovnosti na vzorkované mřížce, nepravidelné polygony, otvory a MultiPolygon, kombinace, konzervativní hranice, neměnné zdroje, souhlasy, role DTO, epochy, Move a audit po reloadu. E2E používají skutečný produkční artefakt v cestě `/JetLagPrague/simulator/`, reálný worker, veřejný katalog, mobilní rozložení a audit síťových metod. Kontrolují také zachování dosavadních otázek, editorových úložišť a karetních funkcí.

Nepřibyly žádné npm závislosti ani nové POI datasety. Vyžadují se moderní prohlížeče s Web Workerem a IndexedDB. Chybějící golfová hřiště, aquaparky a Vltava zůstávají datovou závislostí; multiplayer potřebuje vlastní autorizovaný serverový transport.
