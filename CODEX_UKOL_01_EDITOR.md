# První implementační úkol pro Codex — geografický editor Jet Lag Praha

Před implementací si přečti `JETLAG_PRAHA_SPEC.md`. Tento úkol řeší výhradně **fázi A, první vertikální řez**. Nerealizuj multiplayer, GPS, role, herní karty ani simulátor otázek.

## Cíl iterace

V repozitáři vytvořit funkční základ webové aplikace v češtině s **Mapy.com REST API** jako mapovým podkladem a editačním rozhraním. Aplikace musí být použitelná na desktopu, kde bude hlavní práce s daty. Má umožnit kreslit, upravovat, ukládat, importovat a exportovat skutečné geometické vrstvy, definovat herní oblast a měřit vzdálenosti. Základy architektury musí umožnit doplnění městských částí, katastrálních území, zastávek a schvalování POI bez přepisování jádra.

## Co nejprve zjistit

1. Prozkoumej stávající soubory repozitáře, dostupné frameworky, build a deploy postup.
2. Zachovej existující technologii, pokud je rozumně použitelná; nevytvářej další paralelní aplikaci bez důvodu.
3. Navrhni ve stručnosti strukturu editoru, `geo-core`, modelu vrstev a způsobu ukládání dat. Teprve potom implementuj.

## Funkce první iterace

- Mapový podklad Mapy.com v dokumentovaném API režimu, povinná atribuce + logo a konfigurace klíče bez jeho commitu. Poskytnout `.env.example` a popis nastavení GitHub Pages.
- Levý panel vrstev: seznam, přidání, přejmenování, změna barvy, show/hide, delete, aktivní vrstva.
- Mapa: kreslení a úpravy bodu, linie, polygonu a polygonu s otvorem (pokud použitá knihovna tuto editaci neumí spolehlivě, napiš explicitně omezení a návrh řešení), opakované vrácení kroku, prohlížení atributů.
- Herní oblast jako samostatná povinně označená polygonová/multipolygonová vrstva. Musí jít kreslit i importovat.
- Import GeoJSON s validací WGS84 souřadnic a s přívětivou chybovou hláškou. Export kompletních vrstev do GeoJSON/JSON s manifestem, verzí schématu, datem, popisem zdroje a bez API klíče.
- Funkce měření vzdálenosti mezi 2 body v metrech/km po zemském povrchu; kruh z určeného středu a poloměru v metrech. Kružnice se nesmí měnit při zoomu.
- Ukládat rozpracované změny lokálně (např. IndexedDB nebo localStorage dle velikosti) a poskytnout ruční export jako zálohu; upozornit, že browser storage není týmová/cloudová databáze.
- Zobrazení vlastností: ID, typ geometrie, jméno, poznámka, zdroj, datum importu a stav `draft`.
- Rozumně responzivní layout, včetně bočního panelu, možnost resetovat zobrazení na Prahu.

## Datový kontrakt a testy

- Důsledně používat `[longitude, latitude]` pro GeoJSON a metry pro vzdálenosti.
- Založit sdílené TypeScript typy `WorldDraft`, `GeoLayer`, `GeoFeature` a služby `importGeoJson`, `exportWorld`, `distanceMeters`, `makeMetricCircle`, `pointInArea`.
- Žádná falešná/geograficky vymyšlená data nesmí být prezentována jako reálné objekty PID nebo města.
- Testovat alespoň: roundtrip import/export, zachování multipolygonu, validaci vadných souřadnic, poloměr kružnice, obnovu z uloženého draftu.
- Po implementaci spustit lint, typecheck a build, pokud jsou dostupné. Ověřit srozumitelné chování při nepřítomném/nesprávném API klíči.
- Přidat krátký `README` (spuštění, nastavení mapového klíče, použití editoru, limity první iterace).

## Co výslovně odložit

- Automatické stahování veškerých dat PID, POI a hranic městských částí; nejdřív připravit robustní importní rozhraní.
- GIS operace union/difference pro tisíce bufferů; budou samostatnou iterací po validaci základních geometrií.
- Editor otázek a simulátor; vzniknou ve fázi B.
- Reálné role hráčů, backend, WebSocket a GPS; patří do fáze C.

## Definice dokončení

Po spuštění aplikace dokážu na Mapy.com vymezit ručně herní oblast, přidat další polygon nebo bod, všechny prvky editovat, uložit lokálně, exportovat do souboru a tentýž soubor znovu naimportovat bez ztráty geometrie a atributů. Vše je česky a mapový API klíč není v repozitáři.

Na konci shrň změněné soubory, výsledky testů, známé limity a **navrhni další malý navazující úkol**, ale bez jeho automatické implementace.
