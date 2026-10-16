# Iterace 04A: letiště a parky

## Co je dostupné

Sekce **Body zájmu** nabízí samostatné přepínače letišť a parků, počty schválených/neschválených objektů, hledání podle názvu i ID a volitelné referenční body parků. Výběr v seznamu nebo mapě otevře vlastnosti vpravo. Skrytí vrstvy nemění schválení ani geografické výsledky.

Statický katalog `apps/editor/src/data/poi-catalog.json` je součástí sestavené aplikace na GitHub Pages a funguje při prvním otevření bez autorova draftu. Obsahuje přesně tři schválená letiště lokální herní kategorie:

| ID | Název | GeoJSON `[longitude, latitude]` |
| --- | --- | --- |
| LKPR | Letiště Václava Havla Praha – Ruzyně | `[14.260000, 50.100833]` |
| LKKB | Letiště Praha-Kbely | `[14.543639, 50.121367]` |
| LKTC | Letiště Točná | `[14.425556, 49.985278]` |

Jde o **přesné ARP souřadnice schválené v zadání**, nikoli centroidy letištních ploch nebo výběr podle komerčního provozu. `airportArpInput` uchovává vstup, jeho SHA-256 je u zdroje. Metadata poctivě rozlišují schválení pro místní hru a ověření původního leteckého dokumentu. Dne 16. 10. 2026 cloudová síť odmítla přístup na `https://aim.rlp.cz/` při HTTPS CONNECT (403). Aktuální oficiální ARP publikace, její datum ani licence tedy **nebyly nezávisle ověřeny**. Datum zpracování není datem platnosti AIP. Souřadnice se automaticky nepřepisují.

## Skutečný stav zdroje parků

Požadovaná vrstva je **URK_Parky_p**, odkazovaná v [dokumentaci UAP IPR](https://uap.iprpraha.cz/texty/100/2.1.3). Pokus o otevření přesného dodaného odkazu 16. 10. 2026 skončil **HTTPS CONNECT 403 na proxy cloudového prostředí**. Ověřen byl také známý portál `https://opendata.iprpraha.cz/`: vrací HTTP 303 na článek `www.geoportalpraha.cz/cs/clanek/271/prazska-otevrena-data`; cílový host zablokovala proxy stejnou chybou CONNECT 403. Jde o blokaci přístupu v tomto prostředí, nikoli důkaz, že služba IPR neexistuje nebo je neveřejná.

Z tohoto důvodu nelze potvrdit endpoint geometrie, názvy atributů, stabilní ID, počet parků, datum ani licenci. **Žádná datová URL není odhadnutá a žádné zelené plochy ani testovací polygony nejsou vydávané za pražské parky.** Publikovaný katalog zatím obsahuje **0 oficiálních parků**. Syntetické geometrie jsou výhradně v testech.

V nastavení cloudového prostředí je připravené doplnění přístupu na `uap.iprpraha.cz`, `www.geoportalpraha.cz` a `aim.rlp.cz`; pouhé uložení návrhu změny nepovoluje síť běžícího prostředí. Po zpřístupnění lze navázat ověřením konkrétní služby z dokumentace. Mapy.com se pro získávání POI nepoužívá.

## Jaký soubor dodat a jak ho importovat

Dodejte export **přesně vrstvy URK_Parky_p**, nikoli obecné vrstvy zeleně:

- Neprázdný `.geojson` jako RFC 7946 **FeatureCollection**, souřadnice WGS84 / EPSG:4326 v pořadí `[délka, šířka]`. Polygon nebo MultiPolygon, přesné hranice, zachované otvory a oddělené části. Žádné starší pole `crs`; S-JTSK/EPSG:5514 je nutné nejdřív skutečně transformovat v GIS.
- Původní stabilní identifikátor každého parku. Doložte, které pole ho obsahuje; import podporuje také Feature.id přes volbu `$id`. Automaticky se nepředpokládá, že pořadové číslo či `OBJECTID` je stabilní mezi exporty.
- Původní pole názvu, pokud existuje. Bez doloženého názvu bude park k revizi a před schválením je nutné název doplnit.
- Skutečné URL zdrojové služby nebo metadat, poskytovatele, licenci s odkazem a datum dat, pokud je doložené. Neznámé údaje označte jako nedoložené; nestanovujte je podle data stažení.

V editoru otevřete **Body zájmu → Načíst / aktualizovat parky**, vyplňte metadata i přesná pole ID/názvu a nejprve zvolte **Zkontrolovat import**. Limit je 20 MB a 10 000 objektů. Chybná geometrie, duplicitní/chybějící ID nebo neplatné souřadnice odmítnou celý import. Neprobíhá oprava, zjednodušení ani odhad hranic. Náhled ukáže přidané, změněné a chybějící objekty; až **Použít parkový zdroj** mění svět. Import sám neuděluje status ověřeného poskytovatele ani neschvaluje parky.

Při aktualizaci použijte **stejné stálé ID zdroje a stejná oficiální ID objektů**. Nová pole ID nebo přejmenování namespace by vytvořily nové identity. Zdrojová metadata, všechny původní atributy, původní ID a SHA-256 vstupního souboru i zpracovaného datasetu zůstávají uložené.

## Ruční revize

- **+ Nakreslit park** spustí samostatné kreslení skutečného polygonu. Vlastní vrstvy ani herní hranice se tím nemění. Po dokončení doplňte jméno a případně poznámku, uložte a zvolte **Schválit park**. Lze také vyloučit nebo vrátit k revizi.
- Návrh referenčního bodu vzniká průsečíky vodorovných řezů s hranami mezi sousedními výškami vrcholů, s paritním vyhodnocením otvorů. Zkoušejí se všechny části MultiPolygonu. Zvolený bod se ještě ověřuje jako **striktně vnitřní**. Nejde o střed obálky ani centroid, který může skončit mimo konkávní park. Pokud vnitřní bod nelze spolehlivě určit, import selže.
- Referenční bod lze upravit souřadnicemi nebo přetažením po volbě **Přesunout bod parku v mapě**. Bod mimo polygon, uvnitř otvoru nebo přesně na hranici se odmítne. Přetažení se ukládá až po dokončení pohybu a lze ho vrátit.
- Zaškrtněte několik částí v seznamu, vyplňte společný název a zvolte **Sloučit … částí parku**. Jádro provede skutečný polygonový union; nesouvislé části zůstanou MultiPolygonem. Vznikne nový ruční park k revizi a původní části dostanou rozhodnutí o vyloučení. Výsledný park uchovává členská ID i metadata původních zdrojů. Jeho ruční geometrie se při aktualizaci zdrojů automaticky nepřepočítává.

Schválení, vyloučení, přejmenování, poznámky a ruční bod jsou samostatná rozhodnutí podle stabilního ID; nezasahují do zdrojových záznamů ani jejich kontrolního součtu. Aktualizace je nesmaže. Pokud zdroj změní hranici tak, že ruční bod leží mimo ni, bod i původní rozhodnutí zůstanou uchované, ale účinný stav bude k revizi, dokud se bod neopraví. Zmizelý zdrojový objekt se zachová s historickou geometrií k revizi, neslouží automaticky pro otázky; původní vyloučení zůstává účinné. Při návratu stejného ID se rozhodnutí opět použije.

## Datový model a přenos

`Poi` obsahuje `id`, rozšiřitelnou `category`, `name`, `point`, `geometry`, `sourceId`, `source`, `status`, `reviewedAt`, `note`; navíc původní `attributes` a případně `memberIds`. Statusy jsou `review`, `approved`, `excluded`. Kategorie je řetězec, proto stejné funkce mohou později používat muzea, zoo, akvária, golf, knihovny, nemocnice a konzuláty. Jejich editory ani data tato iterace nepřidává.

Volitelné `WorldDraft.poi` (schéma světa stále 2) odděluje `sources`, `manual`, `decisions` a `visibility`. Staré světy pole nepotřebují; `newWorld()` zachovává své původní rozhraní. Drafty z IndexedDB i staršího localStorage a kompletní JSON/GeoJSON zálohy uchovávají zdrojová data, rozhodnutí a přepínače. Zdrojové SHA-256 se kontrolují při načtení a importu; chyba nesmí přepsat uložený svět. Nové přibalené parky se přidají bez přepsání již uloženého zdroje či rozhodnutí. Náhrada existujícího zdroje je výslovná aktualizace.

V úplném GeoJSON exportu jsou definice parků a rozhodnutí bezeztrátově v rozšiřujícím poli `world.poi`. Standardní kolekce `features` nadále obsahuje původní vrstvy světa; běžný GIS nemusí metadata POI zobrazovat ani zachovat. Pro obnovu použijte **Kompletní svět JSON / GeoJSON**.

### Publikace schválených parků všem uživatelům

Lokální import není automatické zveřejnění. Vyexportujte svět, v kořeni repozitáře spusťte:

```sh
npm run poi:publish -- --world /cesta/k/jetlag-praha-draft.json
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Příkaz ověří datasetové checksumy, zachová statická letiště a zapíše pouze parkovou část `apps/editor/src/data/poi-catalog.json`. Před publikací importovaných schválených parků vyžaduje doloženou licenci s URL, také u sloučených původních částí. Ruční rozhodnutí nenahrazují kontrolu skutečného původu dat. Zkontrolujte změny katalogu, commitněte je a nasaďte obvyklým workflow GitHub Pages. Běžný build sám nestahuje parky ani nečte něčí prohlížeč. Katalog otázek, multiplayer a systém neměnných herních release zůstávají mimo rozsah.

## Geografické funkce

`distanceToPoiMeters(point, poi)`, `nearestApprovedPoi(point, category, pois)`, `matchingPois(a, b, category, pois)` a `measuringPois(a, b, category, pois)` jsou čisté funkce `geo-core`, bez DOM a Leafletu. Výsledky mají explicitní `state: 'known' | 'unknown'`. Neschválené a vyloučené POI se ignorují; chybějící schválená kategorie či neplatná poloha vrací **nelze určit**, nikoli odhad.

Vzdálenost je k **referenčnímu bodu** letiště nebo parku, v metrech, Haversinovou formulí na kouli o poloměru 6 371 008,8 m. Nejde o pixely, cestovní vzdálenost ani nejbližší bod okraje parku; elipsoidální geodézie není součástí této iterace. Při shodě do **0,000001 m** rozhodne lexikograficky nejmenší stabilní ID podle znakových kódů, nezávisle na pořadí vstupu. `tiedIds` shodu dokládá. Matching porovnává vybraná ID; Measuring porovnává obě nejbližší vzdálenosti a vrací také rozdíl v metrech a `equal`, `first-closer` nebo `second-closer` se stejnou tolerancí.
