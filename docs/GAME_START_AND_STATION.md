# Začátek hry a výběr stanoviště

Po samostatném rozhodnutí o zakreslování odpovědí oba telefony zobrazí **Jste připraveni začít?**. Modrý blok hledačům vysvětluje čekání na místě, fialový blok schovanému výběr stanoviště a okruh 400 m. Pod instrukcí je **Jsem připraven**, potom běžný sekundární text výsledku dohody. Čas začne až po připravenosti obou rolí. Volba týmových jmen zůstává zachovaná.

Po začátku běží celkový čas a odpočet 45 minut. Pokyny pro danou roli jsou nad mapou mimo posuvný obsah. Hledači vidí, že mají čekat na místě a otázky ještě nejsou dostupné. Schovaný vidí instrukci **Najdi úkryt a vyber stanoviště**, případný konkrétní problém s GPS a název již potvrzené předběžné volby.

## Tři odlišné kroky

1. **Náhled:** klepnutí na způsobilou značku zvýrazní bod, zobrazí skutečný 400m kruh a otevře potvrzovací panel. Zatím se neposílá herní příkaz, nemění se GPS ani se neuzamyká stanoviště. Lze klepnout na jinou zastávku nebo náhled zrušit. Stejně lze vybrat zastávku ze seznamu **Zastávky a GPS** nebo z veřejné vrstvy PID/železničních stanic. Značky podporují také Enter a mezerník.
2. **Předběžné potvrzení během schovávání:** tlačítko **Potvrdit stanoviště** odešle `select_station`. Jádro nové partie ověří původ zastávky, platnost GPS, herní oblast a vzdálenost. Potvrzená volba přežije reload, lze ji dále změnit a hledání zatím nezačne. Zrušení nového náhledu zachová dříve potvrzenou volbu.
3. **Definitivní uzamčení:** po 45 minutách jádro znovu vyhodnotí způsobilost. Zachovává dosavadní pravidlo: uzamkne způsobilou potvrzenou volbu, případně jediného způsobilého kandidáta. Při nejednoznačnosti přejde do `needs_station`. Zde klepnutí stále pouze otevírá náhled a **Potvrdit stanoviště** teprve odešle `lock_station` a zahájí hledání.

Seznam po vypršení lhůty je zmrazený podle rozhodného okamžiku. Pozdější GPS jej nerozšíří a její pozdější výpadek nebrání výslovnému potvrzení již způsobilého kandidáta. Pokud při vypršení lhůty chyběla spolehlivá GPS nebo způsobilá zastávka, aplikace nezvolí odhad a vyžádá řešení správcem / reset testu. Tato pravidla se nemění.

Typ zastávky přebírá UI z publikovaného `dominantMode`; prioritu vlak → metro → tramvaj → autobus/trolejbus ani referenční bod znovu neodvozuje. Bez doloženého typu ukáže „Typ dopravy nelze určit“.

## Mobilní rozložení

Instrukce a potvrzovací panel jsou součástí pevného sloupcového rozložení telefonu, mimo posuvnou oblast. Panel leží před spodní navigací, která započítává `safe-area-inset-bottom`. Mapa pružně využije zbývající výšku, její ovládání zůstává uvnitř mapy. Zastávky, hledání a GPS jsou v rozbalovacím seznamu; hlavní potvrzovací tlačítko nevyžaduje scrollování pod mapu. Stejné komponenty používá simulátor i mobilní klient; veřejný mobilní náhled bez autorizované partie výběr stanoviště nenabízí.

## Kompatibilita

Nová partie vytvořená přes `createLobbyGame()` má `rules.stationSelectionVersion: 1`. Jádro odmítá předčasný `lock_station` i import nového stavu s předčasně uzamčeným stanovištěm. Druhé kolo pravidlo dědí a celých 45 minut se nadále započítává do celkového času.

Historické uložené hry a výslovné mechanismové scénáře bez příznaku zachovávají původní pravidla jádra. Nedochází k jejich tiché migraci ani k přepisování již uzamčených stanovišť. Standardní nové partie používají celý nový průchod. Geometrie, publikované katalogy, dedukce, karty a Move zůstávají zachované.

## Ověření

`station-start.test.ts` testuje předběžné potvrzení, zákaz předčasného uzamčení, GPS a publikovaná ID, přesný přechod ve 45. minutě, zmrazené kandidáty, ukládání a historickou kompatibilitu. Testy týmového vyhodnocení nyní procházejí celou přípravnou fází a kontrolují její započítání do skóre.

`tests/station-start.spec.ts` prochází oba telefony, skutečné klepání na značky, změnu/zrušení výběru, vykreslený 400m kruh, potvrzení a reload, chybějící GPS i přechod do hledání. Telefon má skutečnou vnitřní plochu **375 × 750 px** a test navíc simuluje **34 px** spodní bezpečné oblasti. Potvrzovací tlačítko musí zůstat uvnitř telefonu nad navigací a posuvná oblast musí mít nulový svislý posun.

Závěrečné ověření **4. 11. 2026**: lint, typecheck a produkční build prošly, stejně jako **543 jednotkových testů a 124 E2E scénářů**. Dva jednotkové a dva E2E audity původních archivů GTFS/parků zůstávají přeskočené jako před touto změnou. Kontrolní součty rozpracovaných souborů editoru a ambasád zůstaly beze změny.
