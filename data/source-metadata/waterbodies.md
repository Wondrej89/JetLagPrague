# Vodní plochy – audit importu a klasifikace

Rozsah potvrzený správcem: pouze vodní plochy; Vltava zůstává na další krok. Zdrojový ZIP je celý v `data/raw`, bez změny obsahu.

## Počty

- 3 524 vstupních polygonů: 769 typu P a 2 755 typu T.
- 763 pojmenovaných kandidátů; 6 nepojmenovaných ploch mimo herní katalog.
- 307 approved, 384 review, 72 excluded.
- 429 různých názvů; stejné názvy se automaticky neslučují.
- 763/763 platných geometrií v GEOS; žádná oprava, zjednodušení ani ořezání nebylo potřeba.

## Výslovně ponechané lokality

Biotop Lhotka, Biotop Radotín, Biotop Braník, Koupaliště Benice a Koupaliště Řeporyje jsou schválené. RN/PN/VN nejsou automatickým vylučovacím pravidlem. Koupaliště Březiněves a bezejmenné „Koupaliště“ vyžadují posouzení charakteru; samotné slovo není důkazem bazénu.

## Zadaných 19 vyřazených názvů

Součet skutečných polygonů je **72**, nikoliv deklarovaných 70. Přepočet neodstraňuje žádnou z požadovaných výjimek. Matching pomlček ignoruje rozdíl `–`/`-`, původní název zůstává uložený.

| Zadaný název | Skutečný název | Polygonů |
|---|---|---|
| Zoo Praha | Zoo Praha | 22 |
| Zoopark | Zoopark | 2 |
| Pražská botanická zahrada | Pražská botanická zahrada | 8 |
| Golf Vinoř | Golf Vinoř | 9 |
| Golf Zbraslav | Golf Zbraslav | 8 |
| Golf Hostivař | Golf Hostivař | 3 |
| Golf Hodkovičky | Golf Hodkovičky | 3 |
| Golf Černý Most | Golf Černý Most | 1 |
| Golf Resort Black Bridge | Golf Resort Black Bridge | 3 |
| Galerie Golf Hostivař | Galerie Golf Hostivař | 3 |
| Prague City Golf Club Zbraslav | Prague City Golf Club Zbraslav | 2 |
| Vista resort & club | Vista resort & club | 1 |
| Albertov UK | Albertov UK | 1 |
| ČZU – libosad | ČZU - libosad | 1 |
| VÚ Sylva Taroucy | VÚ Sylva Taroucy | 1 |
| VÚŽV | VÚŽV | 1 |
| SSOŠ a SSOÚ BEAN | SSOŠ a SSOÚ BEAN | 1 |
| Chráněné bydlení Lahovice | Chráněné bydlení Lahovice | 1 |
| Rezidence Hvězda | Rezidence Hvězda | 1 |

## Výslovná ruční revize

| Název | Polygonů | Důvod |
|---|---|---|
| Aritma | 1 | Název areálu |
| Bubec | 1 | Název kulturního areálu |
| Dotek | 1 | Nejednoznačný název |
| Focolare | 1 | Název organizace |
| Kejřův mlýn | 1 | Název areálu |
| Mlýn Rohlov | 1 | Název mlýna |
| Pstruhová farma Lochkov | 1 | Název provozu |
| Louka Prague I | 1 | Pravděpodobně areálový název |
| Louka Prague II | 1 | Pravděpodobně areálový název |
| Louka Prague III | 1 | Pravděpodobně areálový název |
| ČHMU | 2 | Instituce |
| RPP | 1 | Nejasná zkratka |
| DRN Pražská cukerní | 1 | Technické označení |
| RN MV ČR | 1 | Retenční nádrž u instituce |
| RN Pneu Šafránek | 1 | Technické označení |
| RN YIT Vysočany | 1 | Nádrž podle developera |
| VP Agrofarma | 1 | Potenciálně areálová nádrž |
| UN ČOV Dolní Chabry | 1 | Technická nádrž |
| UN ČOV Koloděje | 1 | Technická nádrž |

Tento seznam odpovídá 20 polygonům. Další revize jsou konzervativní: stejné názvy na více zdrojových částech, generické názvy, nejasné zkratky a charakter areálových ploch. Neprobíhá automatické slučování podle jména ani automatické vyřazování malých ploch. „Tůň Golf Záběhlice“ má vlastní vodní název mimo seznam 19 areálů, proto vyžaduje revizi místo automatického vyloučení.

## Geometrie, identita a zdroj

SHA-256 celého ZIPu: `e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d`.

Kontrolní součet připravené datové sady: `bd0d2f2a2f5463692a4bc263f9603d0e1be2e961fce13de284bb5e76c233da63`. Strojový audit: [waterbodies-audit.json](waterbodies-audit.json). Pravidla: `packages/geo-core/src/waterbody-rules.json`.

CRS podle PRJ: S-JTSK / Křovák (EPSG:5514); převod pomocí proj4 do WGS84. Zachovány všechny vrcholy, otvory a oddělené části. Stabilní interní ID používá původní GLOBALID, jeho původní zápis včetně závorek zůstává v `sourceId`, `waterbody.globalIds` a původních GIS atributech. Audit importu archivuje i zdrojové souřadnice před transformací. Status není důvodem mazání geometrie.

Oficiální katalogový odkaz je uveden správcem: https://geoportalpraha.cz/data-a-sluzby/ke-stazeni/e01b4bb6d148496abff4f065686290ff. Datum synchronizace v dodaném XML je 5. 10. 2026. Konkrétní licence není uvedena; metadata obsahují jen odkaz na opendata IPR.

## Aktualizace a publikace

Import před potvrzením nemění svět. Schvalování a vylučování jsou samostatná rozhodnutí nad neměnnými zdrojovými záznamy. Obnovení vyřazené plochy, zálohy JSON/GeoJSON a opakovaný import zachovávají názvy, geometrii a GLOBALID. Při zmizení z aktualizace se starý objekt archivuje místo smazání.

Nová publikace `db8e4958e468…` schématu 6 přidává pouze 307 schválených vodních polygonů. Všechna starší data včetně PID mají zachované obsahové kontrolní součty. Datum staršího PID 20. 10. 2026 se nepřepisuje; publikace z 21. 10. je reference, nikoliv ostrá aktuální hra. Vltava není součástí tohoto kroku.

## Ověření

Prošly lint, typecheck, oba produkční buildy, kontrola sedmi historických publikací, administrativních dat a PID, 221 jednotkových a 57 E2E scénářů (čtyři starší scénáře úspěšně zopakovány po zpřesnění selektoru importu světa). Skutečný vodní ZIP prošel jednotkovým importem i importem ve workeru v prohlížeči. Ověřeny jsou filtry všech stavů, reload, obnovení vyřazené plochy, zachování původních geometrií a GLOBALID, obě zálohy, opakovaná aktualizace, bezpečné odmítnutí poškozeného ZIPu a veřejný katalog. Geografické testy pokrývají nepravidelný polygon včetně konkávní části, hranici, otvor, MultiPolygon, Matching/Measuring a deterministické shody. Dva jednotkové a dva E2E audity jiných původních archivů zůstávají přeskočené (GTFS a parkový ZIP nejsou k dispozici).
