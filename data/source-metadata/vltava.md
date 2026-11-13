# Vltava – prostorový audit a dosud neověřené pokrytí

Stav k 13. 11. 2026, výchozí commit `142e4c3`: **původní ZIP obsahuje vodní polygony v trase Vltavy, ale úplný výběr samotné řeky a jejích ostrovních ramen není ověřený. Measuring není zprovozněné.** Žádná kandidátní geometrie se nepublikuje jako herní zdroj.

## Zdroj a reprodukce

- `data/raw/AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip`, SHA-256 `e778e595fc2a6efe606d167468230cad3523583146417620c6245ade6c096f9d`.
- IPR Praha, Oázy chladu – vodní plochy a toky; [katalogový odkaz dodaný správcem](https://geoportalpraha.cz/data-a-sluzby/ke-stazeni/e01b4bb6d148496abff4f065686290ff). Konkrétní licence není v ZIPu doložená. Datum 5. 10. 2026 je synchronizace metadat, nikoli doložené datum měření; audit eviduje datum dat jako `null`.
- 3 524 polygonových záznamů: **769 P, 2 755 T**. Všechny T mají prázdný `NAZEV`. Pole: `NAZEV`, `PRISTUPNOS`, `TYP`, `KOUPANI`, `KOUP_OBL`, `GLOBALID`, `SHAPE_LEN`. GLOBALID identifikuje objekt, ale není atributem příslušnosti k řece.
- UTF-8 podle CPG, S-JTSK / Křovák EPSG:5514 podle PRJ. Použit existující `readParkFile` / proj4; žádná vlastní aproximace transformace.

Spusťte `npx tsx scripts/audit-vltava.ts`. Skript čte místní ZIP a kontrolovanou aktuální publikaci, nepřistupuje k externím API. Zapíše [vltava-audit.json](vltava-audit.json): zdrojový checksum, kompletní seznamy GLOBALID, původní pořadí záznamů (od 1), metodu výběru, shrnutí geometrie, kontrolní body a důvody blokace. **JSON obsahuje diagnostiku, nikoli publikovanou vodní vrstvu.**

## Prostorová kontrola

1. GEOS 3.13.0 ověřil platnost všech 2 755 původních geometrií T. Návaznost se počítá skutečnou vzdáleností polygonů v původním EPSG:5514 s tolerancí 0,000001 m. Bounding box slouží pouze k vyřazení vzdálených párů, nikoli jako náhradní hranice.
2. Vzniká 463 propojených komponent. Hlavní komponenta mezi jižním a severním úsekem Prahy obsahuje **173 záznamů**, včetně Berounky a dalších napojených toků. Celou ji nelze označit jako Vltavu.
3. Diagnostická cesta mezi prostorově zkontrolovanými zdrojovými kotvami vybere **62 kandidátů**. Používá blokový strom grafu sousednosti, zachovává alternativní průchozí větve a odstraňuje slepé větve. Jde o kandidátní množinu, **nikoli počet schválených objektů Vltavy**. Graf slučuje více kontaktů stejné dvojice polygonů; může proto vynechat skutečné ostrovní rameno.
4. GEOS union bez zjednodušování vrátí platný **Polygon s 10 otvory, 7 830 vrcholy a plochou 4 743 060,929 m²**. Rozdíl součtu vstupních ploch a sjednocení je menší než 0,01 m²; významné překryvy kandidátů nebyly zjištěny. Topologická platnost ani návaznost samy nepotvrzují úplnost řeky.
5. Nezávislá, záměrně nadbytečná kontrola sjednotí **všech 3 524 P/T**, včetně rybníků a jiných řek. Výsledkem je 952 oddělených částí; největší má 17 otvorů. Tento výsledek také není Vltava a nesmí vstoupit do hry.

Hlavní kontrolované zdrojové úseky:

| Oblast | Původní řádek | GLOBALID |
| --- | ---: | --- |
| Jižní úsek | 1244 | `{F2D6E82B-C5AB-4E9C-8A3A-ADF9E10010CB}` |
| Karlův most | 2129 | `{A6826945-1811-4F4F-AF83-4758F08A738F}` |
| Severní úsek Troja / městská hranice | 1704 | `{99537C4D-12D7-4AFA-8BBC-7D6DBC269ECF}` |

Všech 62 kandidátních ID i 173 ID smíšené komponenty je v auditním JSONu. Severní zakončení bylo porovnáno s publikovanou hranicí Prahy; samotné zakončení u této hranice není důkazem chybějícího úseku.

## Ostrovy a důvod nepublikování

Pro orientační kontrolu se používají referenční body schválených parků ze skutečné publikace `release:db8e4958e46888be47302ea9998b787572549856497da3adcd04e5850e32222c`, nikoli odhadnuté body ani parkové polygony jako náhrada břehů.

| Kontrolní místo | Otvor v kandidátní páteři | Otvor v kontrole všech vod |
| --- | --- | --- |
| Střelecký ostrov | ano | ano |
| Císařský ostrov | ano | ano |
| Císařská louka | ne | ano |
| Veslařský ostrov | ne | ano |
| Ostrov Žofín | ne | ne |

Císařská louka a Veslařský ostrov dokládají, že samotné prořezání grafu nestačí: některé skutečné ostrovní větve byly vynechány. U Žofína referenční bod neleží uvnitř vnějšího prstence ani při sjednocení všech dodaných vodních polygonů. **To vyžaduje ověření skutečných břehů a vody pod přemostěními; parkový referenční bod sám není autoritativním důkazem průběhu břehu ani přesného místa případné mezery.** Chybějící uzavření nelze bezpečně opravit bufferem, obálkou nebo ručním doplněním vody. Geometrie se takto neupravuje.

Stav pokrytí celého průtoku Prahou: **neověřeno**, ne schváleno. Nalezeny jsou skutečné kandidátní úseky, ale chybí ověřené rozlišení Vltavy od ostatních toků a úplná kontrola ostrovních ramen / vody pod mosty. Počet schválených a publikovaných objektů Vltavy: **0**. Publikovaná geometrie: **žádná**.

## Chybějící podklad a bezpečný vstup

Nejprve je potřeba autoritativně doložený výběr původních GLOBALID samotné Vltavy včetně ostrovních ramen a vyjasnění pokrytí u Žofína. Pokud původní ZIP opravdu některou vodní plochu pod přemostěním vynechává, je třeba opravený nebo doplňující autoritativní GIS podklad, nikoli geometrické domýšlení. Doplnit konkrétní licenci a skutečné datum/verzi dat. Nový externí import se nyní nevytváří.

Alternativním bezpečným vstupem je doložený WGS84 GeoJSON celé pražské vodní plochy Vltavy. Kontrakt `VltavaWaterAreaInput` v `packages/geo-core/src/vltava.ts` vyžaduje:

- `Feature`, ID `river:vltava:prague`, Polygon/MultiPolygon s otvory ostrovů; souřadnice `[longitude, latitude]`.
- Zdroj (`provider`, `url`, `version`, `dataDate`, `retrievedAt`), licenci (`name`, `url`), SHA-256 původního souboru a jedinečné původní `sourceFeatureIds`.
- Záznam kontroly pokrytí: `pending` / `verified`, celý pražský úsek, otvory ostrovů, návaznost vody pod mosty, autor, datum a poznámka. `verified` vyžaduje všechna tato potvrzení.

`readVltavaWaterAreaInput` kontroluje formát a polygonovou topologii, **nikoli pravdivost deklarované odborné revize nebo geografické identity**. Sám data nepublikuje ani otázku nezapíná. Typ `VltavaDistanceResolver` popisuje budoucí adaptér; neobsahuje náhradní výpočet.

Po ověření dat bude potřebná nová komponenta/verze `GameDataRelease` s kontrolním součtem a jedinou sdílenou geometrií pro mapu, polygonovou vzdálenost a konzervativní dedukce. Následně lze ověřit skutečné vzdálenosti, obě odpovědi, shodu, mosty a ostrovy. Tento krok zatím není implementovaný ani označený za hotový.

## Chování aplikace a ověření

`measuring:vltava` a mapová vrstva mají konkrétní `missing_data`. Otázku nelze odeslat; nevzniká odpověď, časovač, odměna ani dedukční geometrie. Text zní „Jsi blíž, nebo dál od Vltavy než já?“, cíl je nadále uzamčené stanoviště, reakční okno pět minut, odměna 3 → 1. `waterbody`, ostatní otázky, Veto a Randomize se nemění.

Všech sedm neměnných publikací schémat 1–6 bylo prověřeno: žádná nemá samostatnou Vltavu, břehy ani vrstvu pevnin. Jejich soubory a kontrolní součty zůstávají beze změny, stejně jako původní ZIP a katalog 307 schválených vodních ploch.

Testy opakují prostorový audit skutečného ZIPu, kontrolují původní ID, vady kandidátního výběru a žádnou publikovanou geometrii. Syntetické testy vstupního kontraktu ověřují otvory, MultiPolygon a odmítnutí vadných vstupů; neslouží jako test skutečné Vltavy. Resolver a E2E kontrolují blokaci otázky, žádnou náhradu rybníkem/parkem, ochranu skrytých poloh a fungování Radaru/dedukcí po reloadu. **Test skutečných vzdáleností k řece a jejího dedukčního vybarvení zůstává závislý na ověřeném podkladu.**
