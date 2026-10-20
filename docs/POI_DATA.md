# Letiště, parky a přímý import GIS ZIP

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

Toto dřívější zjištění se vztahuje k vrstvě URK. Nově byla stažena a skutečně ověřena konkrétní vrstva **MPP_100_Parky_p**: [audit zdroje](../data/source-metadata/parks-mpp-source-audit.md), [strojově čitelný audit](../data/source-metadata/parks-mpp-import-audit.json). ZIP obsahuje 953 záznamů; automatický postup vytvoří **952 validních parků** po třech opravách a jednom sjednocení ID 2773. Nepoužívá náhradní zelené plochy ani data z Mapy.com.

Publikovaný katalog zatím obsahuje **0 schválených oficiálních parků**. Ověření geometrie nenahrazuje herní schválení a konkrétní licenci. Metadata archivu odkazují na pravidla poskytování dat IPR; neposkytují konkrétní licenční identifikátor ani úplné podmínky. Kandidáty lze nyní importovat přímo bez externí GIS opravy.

## Jaký soubor dodat a jak ho importovat

Přijímá se původní **Shapefile ZIP MPP_100_Parky_p** i GeoJSON konkrétní parkové vrstvy; název URK není podmínkou. Pro GeoJSON platí:

- Neprázdný `.geojson` jako RFC 7946 **FeatureCollection**, souřadnice WGS84 / EPSG:4326 v pořadí `[délka, šířka]`. Polygon nebo MultiPolygon, přesné hranice, zachované otvory a oddělené části. Žádné starší pole `crs`; S-JTSK/EPSG:5514 je nutné nejdřív skutečně transformovat v GIS.
- Původní stabilní identifikátor každého parku. Doložte, které pole ho obsahuje; import podporuje také Feature.id přes volbu `$id`. Automaticky se nepředpokládá, že pořadové číslo či `OBJECTID` je stabilní mezi exporty.
- Původní pole názvu, pokud existuje. Bez doloženého názvu bude park k revizi a před schválením je nutné název doplnit.
- Skutečné URL zdrojové služby nebo metadat, poskytovatele, licenci s odkazem a datum dat, pokud je doložené. Neznámé údaje označte jako nedoložené; nestanovujte je podle data stažení.

V editoru otevřete **Body zájmu → Načíst / aktualizovat parky** a vyberte ZIP. Rozpoznaná polygonová vrstva s ID se automaticky načte, převede, opraví, sjednotí a ověří. Náhled ukáže přidané, změněné a chybějící objekty i audit oprav a sloučení; až **Použít parkový zdroj** mění svět. Vlastní GeoJSON umožňuje vyplnit pole ID/názvu a metadata a zvolit **Zkontrolovat import**. Parametry lze upravit i po automatickém náhledu ZIPu. Limit je 20 MB a 10 000 zdrojových objektů.

Chybějící ID, neplatné souřadnice nebo nebezpečná oprava odmítnou celý import. Shodná ID se automaticky sjednotí do jednoho parku. Import sám neuděluje status ověřeného poskytovatele ani neschvaluje kandidáty pro otázky.

Při aktualizaci použijte **stejné stálé ID zdroje a stejná oficiální ID objektů**. Nová pole ID nebo přejmenování namespace by vytvořily nové identity. Zdrojová metadata, všechny původní atributy, původní ID a SHA-256 vstupního souboru i zpracovaného datasetu zůstávají uložené.

## Přímý Shapefile ZIP

Vyberte původní ZIP ve stejném souborovém vstupu jako GeoJSON. Importér automaticky vybere jedinou vrstvu, případně jednoznačnou `MPP_100_Parky_p`. Vyžaduje soubory SHP, SHX, DBF, PRJ a CPG se stejným základem názvu; kontroluje binární hlavičky, typ geometrie, všechny SHX offsety a délky, počet a velikost DBF řádků i zachování všech zdrojových vrcholů. Smazané DBF řádky se neposouvají k jiným geometriím; nejednoznačný soubor se odmítne.

Dekódování zajišťuje `shpjs`, projekci `proj4`; PRJ je skutečná definice transformace, CPG určuje kódování. Nepodporovaný nebo chybějící CRS/CPG se neodhaduje. Výstup je WGS84 `[longitude, latitude]` bez zaokrouhlování. Používá se datumová transformace deklarovaná v PRJ a databázi proj4; nejde o přesný český transformační grid. Pro S-JTSK bez explicitních parametrů použije proj4 svůj Helmertův převod, nikoli vlastní Křovákův algoritmus. Výstup není náhradou zeměměřického převodu s gridovou korekcí.

Pro MPP jsou předvolené namespace `ipr-mpp-100-parky`, poskytovatel `IPR Praha – MPP_100_Parky_p`, skutečné pole `park_id` nebo `ID` a `NAZEV`. URL metadat lze ověřit na uvedeném Geoportálu. Licence zůstává **Nedoložena** a datum prázdné, dokud je uživatel nedoloží; import nezaměňuje datum DBF či stažení za datum platnosti.

Rozbalování ZIPu přes `@zip.js/zip.js` kontroluje CRC-32 a překryvy položek. Limity: 20 MB vstup, 32 MB na rozbalený soubor, 64 MB celkem, 100 položek, kompresní poměr nejvýše 200:1, 10 000 záznamů a 1 000 000 vrcholů celkem. Odmítají se šifrované archivy, podezřelé cesty a duplicitní názvy včetně rozdílů jen ve velikosti písmen. Skutečný tok rozbalených bajtů se kontroluje průběžně; nejde pouze o důvěru v deklarovanou velikost. Nic z archivu se nespouští ani nevypisuje na serverový disk.

Čtení, projekce, topologická validace, návrhy referenčních bodů i kontrolní součty běží ve zrušitelném Web Workeru. Zavření dialogu worker ukončí. Při přenosu hotového výsledku se na hlavním vlákně používají malé dávky s předáním řízení mapě. Analýza ani zrušení importu nemění svět. Aplikace funguje jako statická GitHub Pages bez vlastního serveru.

### Topologie, diagnostika a opravy

Celý import ukáže všechny zjištěné chyby s číslem původního záznamu, ID a názvem. Bezchybných parků se částečně neukládá: celá operace čeká na odstranění problémů. Tlačítko u chyb či duplicit otevře samostatný červený mapový náhled; tato geometrie nikdy nevstupuje do světa ani do geografických otázek.

Globální `validateGeometry()` nadále kontroluje každou plochu. JSTS `IsValidOp` ověřuje OGC topologii: rozlišuje přípustný izolovaný bodový dotyk od skutečných samoprůniků, překryvů, vnějších/vnořených otvorů a odpojeného vnitřku. Samotný `Turf.kinks()` toto rozlišení neměl. Validní otvor může s pláštěm sdílet jediný bod, pokud zůstává topologicky validní; ruční nástroj přidání otvoru si zachovává přísnější pravidlo kreslení striktně uvnitř. Drobné validní části se nevynechávají a práh 0,01 m² už neodmítá nenulové GIS plochy.

Při `Ring Self-intersection` nebo `Self-intersection` se automaticky provede **GEOS 3.13.0 MakeValid**, standardní algoritmus linework, pomocí `geos-wasm 3.1.1`. Nepoužívá se buffer(0), zjednodušování ani vynechávání malých ploch. GEOS zachovává polygonové části a otvory; kolekce obsahující pouze polygony se bezeztrátově převede na MultiPolygon. Jakýkoliv nepolygonový prvek opravu zablokuje a zůstane v diagnostice. Výsledek musí projít GEOS i globálním JSTS `validateGeometry()`.

Geografická plocha v m² se před/po opravě počítá Turf `area()` ze souřadnic WGS84. Automatické přijetí vyžaduje nenulovou kladnou konečnou původní i výslednou plochu a rozdíl nejvýše **max(0,01 m²; 0,1 % původní plochy)**. Plocha samoprotínajícího se vstupu není sama důkazem správné interpretace; kontrola je konzervativní pojistka a nejasný či nulový základ vyžaduje revizi. Tři konkrétní MPP opravy mění plochu o méně než 0,000001 m². Další typy neplatnosti (např. otvor mimo plášť) se automaticky neodhadují.

Náhled uvádí každý opravený objekt i případná varování. **Stáhnout diagnostiku a audit** uchová původní objekty, nepolygonové výsledky i neúspěšné pokusy před potvrzením. Geometricky bezpečné opravy nepotřebují jednotlivé schválení.

### Shodná ID a aktualizace

Všechny záznamy stejného oficiálního ID jsou **jeden park**. GEOS `UnaryUnion` provede skutečné sjednocení: překryvy se rozpustí, nesouvislé části zůstanou MultiPolygonem, otvory se zachovají podle výsledné topologie. Stabilní identita je `park:<namespace>:<oficiální ID>`; pořadová čísla ani otisky atributů identitu nemění.

Zdrojové části se řadí podle názvu a následně kanonického obsahu podle kódů Unicode, nezávisle na pořadí řádků či jazykovém nastavení. Zobrazený název je první neprázdný. Všechny původní názvy a kompletní atributy každého záznamu jsou v `Poi.importAudit`; původní geometrie jsou v `ParkDataset.importRecord.originalFeatures`. Po sjednocení se vytvoří právě jeden striktně vnitřní referenční bod. Dvojice „Park u OC Letňany“ / „Park u OC Letňany II.“ tak používá ID **2773**.

Aktualizace zachová rozhodnutí podle oficiálního ID. Starší importér mohl rozdělit duplicitní ID pomocí `sourceIdentity.key`; toto pole zůstává kvůli kompatibilitě podporované. Při aktualizaci se staré identity archivují se všemi rozhodnutími a vazbou `sourceMergedInto`, přestanou vstupovat do otázek. Shodná a úplná schválení/vyloučení se přenesou na sjednocenou identitu; rozpory nebo neúplné revize vytvoří stav k revizi. Konfliktní ruční názvy či body zůstávají dohledatelné v původních rozhodnutích a archivovaných objektech. Již existující rozhodnutí pro sjednocené ID má přednost.

`ParkDataset.importRecord` uchovává původní geometrie v originálním CRS a atributy, PRJ, CPG, zvolená pole, transformační postup, seznam souborů s velikostí a SHA-256 a checksum originálního archivu. Audit verze 2 navíc uvádí engine, parametry kontroly plochy, řádky, důvod opravy, původní/výslednou plochu, geometrické checksumy a celý opravený výsledek; sloučení odkazuje na všechny původní řádky a názvy. `Poi.importAudit` umožňuje dohledat zpracování konkrétního parku ve vlastnostech. SHA-256 datasetu zahrnuje celý audit. Starší dataset bez `importRecord` a/nebo `importAudit` se ověřuje původním způsobem; schéma světa se nemění.

## Ruční revize

- **+ Nakreslit park** spustí samostatné kreslení skutečného polygonu. Vlastní vrstvy ani herní hranice se tím nemění. Po dokončení doplňte jméno a případně poznámku, uložte a zvolte **Schválit park**. Lze také vyloučit nebo vrátit k revizi.
- Návrh referenčního bodu vzniká průsečíky vodorovných řezů s hranami mezi sousedními výškami vrcholů, s paritním vyhodnocením otvorů. Zkoušejí se všechny části MultiPolygonu. Zvolený bod se ještě ověřuje jako **striktně vnitřní**. Nejde o střed obálky ani centroid, který může skončit mimo konkávní park. Pokud vnitřní bod nelze spolehlivě určit, import selže.
- Referenční bod lze upravit souřadnicemi nebo přetažením po volbě **Přesunout bod parku v mapě**. Bod mimo polygon, uvnitř otvoru nebo přesně na hranici se odmítne. Přetažení se ukládá až po dokončení pohybu a lze ho vrátit.
- Zaškrtněte několik částí v seznamu, vyplňte společný název a zvolte **Sloučit … částí parku**. Jádro provede skutečný polygonový union; nesouvislé části zůstanou MultiPolygonem. Vznikne nový ruční park k revizi a původní části dostanou rozhodnutí o vyloučení. Výsledný park uchovává členská ID i metadata původních zdrojů. Jeho ruční geometrie se při aktualizaci zdrojů automaticky nepřepočítává.

Schválení, vyloučení, přejmenování, poznámky a ruční bod jsou samostatná rozhodnutí podle stabilního ID; nezasahují do zdrojových záznamů ani jejich kontrolního součtu. Aktualizace je nesmaže. Pokud zdroj změní hranici tak, že ruční bod leží mimo ni, bod i původní rozhodnutí zůstanou uchované, ale účinný stav bude k revizi, dokud se bod neopraví. Zmizelý zdrojový objekt se zachová s historickou geometrií k revizi, neslouží automaticky pro otázky; původní vyloučení zůstává účinné. Při návratu stejného ID se rozhodnutí opět použije.

## Hromadná správa podle hierarchie

V bloku **Výběr parků podle hierarchie** vyberte jednu nebo více skupin: 1 – metropolitní, 2 – čtvrťové, 3 – lokalitní, 4 – místní. Výchozí je pouze 1. Počty vznikají z aktuálních parků po sjednocení duplicitních ID, nikdy z pevné tabulky. `HIERARCHIE` přijímá čísla i číselné řetězce. Chybějící/neznámá hodnota a rozporné hodnoty původních sloučených částí patří do **Bez určené hierarchie**, kterou lze vybrat samostatně. Vlastní parky bez atributu jsou v této skupině také.

Pracovní hierarchie a filtry **Vše / Schválené / Vyloučené / K revizi** filtrují seznam i běžné zobrazení mapy. **Zobrazit také parky mimo vybrané hierarchie** dovolí vybrat výjimky nebo zobrazit úplný zdroj. Hledání působí pouze na seznam; název, interní i oficiální ID jsou prohledávané. Živé součty všech/schválených/vyloučených/k revizi vždy popisují celý dostupný katalog, včetně vlastních a historických objektů.

**Zobrazit jen parky ve hře** je samostatný úplný mapový náhled: ukazuje všechny účinně schválené parky napříč hierarchiemi. Pracovní hierarchie, stavový filtr seznamu ani hledání z něj neschovají schválenou výjimku. Pro úplný seznam schválených zároveň vyberte **Schválené** a **Zobrazit také parky mimo vybrané hierarchie**. Globální přepínač vrstvy Parky zůstává nadřazený. Filtry nemění schválení, publikaci ani Matching/Measuring. Přepínače i hierarchie jsou ve volitelném `PoiConfiguration.parkFilters`, ukládají se v IndexedDB a kompletních exportech; staré drafty získají výchozí filtr bez změny zdrojových dat.

**Schválit všechny parky vybraných hierarchií** a **Vyloučit všechny parky vybraných hierarchií** se vztahují přesně na vybrané skupiny v celém katalogu. Před potvrzením se zobrazí počet, bez ohledu na mapový výřez, hledání, stavový filtr, limit prvních 100 řádků seznamu nebo přepínač zobrazení ostatních hierarchií. Schválení používá stejné kontroly jako jednotlivá akce: validní polygon, doložený neprázdný název, jednoznačná identita, aktuální zdroj a platný bod striktně uvnitř. Neplatný kandidát se přeskočí a v souhrnu zůstane jeho ID a důvod. Ostatní validní parky se zpracují; zdrojové geometrie se nemění.

Dávka upraví mapu `PoiDecision` a provede **jeden commit světa / jeden zápis draftu**, nikoli stovky samostatných uložení. Každých 32 kandidátů vrátí řízení prohlížeči. Změní-li se mezitím svět jinou operací, dávka se neuloží přes novější data. Existující body, ruční názvy a poznámky se zachovají. Nový park ve stejné hierarchii při pozdější aktualizaci automaticky nedostane schválení; je třeba další výslovná akce.

**Vrátit poslední hromadnou akci** obnoví pouze rozhodnutí dotčené poslední dávkou. Pozdější individuální změny se zachovají a jejich počet se vypíše. Ostatní vrstvy, PID, hranice, filtry i nové zdrojové aktualizace zůstanou zachované. Dávka se účastní také běžné historie Zpět/Znovu jako jediná operace. Samostatný bod vrácení poslední dávky je dostupný během aktuálního otevření editoru; reload zachová rozhodnutí a filtry, ale historii vrácení neobnovuje.

Zelená označuje schválený park, šedá vyloučený a neutrální přerušovaný obrys park k revizi. Po výběru schváleného parku v seznamu nebo mapě zvolte **Vyřadit ze hry**. Zdroj se nesmaže; změní se rozhodnutí na `excluded`. **Vrátit do hry** znovu používá schvalovací kontroly. V náhledu hry vyloučený park ihned zmizí, vlastnosti zůstanou otevřené pro případné vrácení.

Ověřeno 18. 10. 2026 na originálním ZIPu se stejným SHA-256 jako při importním auditu: 952 parků, hierarchie **58 / 60 / 196 / 638**, bez neurčené hierarchie. Tyto hodnoty jsou audit konkrétního souboru; UI je vždy znovu počítá z vlastních dat. Automatické testy pokrývají i neplatné kandidáty, neznámé hodnoty, řetězcové atributy, potvrzení/storno, jednu databázovou změnu, pozdější individuální změny, reload, import/export a aktualizaci s novým parkem.

## Datový model a přenos

`Poi` obsahuje `id`, rozšiřitelnou `category`, `name`, `point`, `geometry`, `sourceId`, `source`, `status`, `reviewedAt`, `note`; navíc původní `attributes` a případně `memberIds`. Statusy jsou `review`, `approved`, `excluded`. Kategorie je řetězec, proto stejné funkce mohou později používat muzea, zoo, akvária, golf, knihovny, nemocnice a konzuláty. Zoo a nemocnice již mají bodové katalogy a editory; ostatní uvedené kategorie nejsou implementované.

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

Příkaz ověří datasetové checksumy a zachová statická letiště. Do `apps/editor/src/data/poi-catalog.json` zapíše editorové `parks` se všemi zdroji a rozhodnutími a samostatné **`gameParks` pouze ze schválených parků**. Pole `parks` zachovává kandidáty pro další revize a aktualizace; neslouží jako neomezený herní seznam. `gameParks` obsahuje účinná jména, ruční body, stav a ID schválených objektů. Vyloučené a neschválené objekty v tomto herním seznamu nejsou. Publikace ignoruje pracovní filtry a vypnuté vrstvy. Před publikací importovaných schválených parků vyžaduje doloženou licenci s URL, také u sloučených původních částí. Ruční rozhodnutí nenahrazují kontrolu skutečného původu dat. Zkontrolujte změny katalogu, commitněte je a nasaďte obvyklým workflow GitHub Pages. Běžný build sám nestahuje parky ani nečte něčí prohlížeč. Katalog otázek, multiplayer a systém neměnných herních release zůstávají mimo rozsah.

## Geografické funkce

`distanceToPoiMeters(point, poi)`, `nearestApprovedPoi(point, category, pois)`, `matchingPois(a, b, category, pois)` a `measuringPois(a, b, category, pois)` jsou čisté funkce `geo-core`, bez DOM a Leafletu. Výsledky mají explicitní `state: 'known' | 'unknown'`. Neschválené a vyloučené POI se ignorují; chybějící schválená kategorie či neplatná poloha vrací **nelze určit**, nikoli odhad.

Vzdálenost je k **referenčnímu bodu** letiště nebo parku, v metrech, Haversinovou formulí na kouli o poloměru 6 371 008,8 m. Nejde o pixely, cestovní vzdálenost ani nejbližší bod okraje parku; elipsoidální geodézie není součástí této iterace. Při shodě do **0,000001 m** rozhodne lexikograficky nejmenší stabilní ID podle znakových kódů, nezávisle na pořadí vstupu. `tiedIds` shodu dokládá. Matching porovnává vybraná ID; Measuring porovnává obě nejbližší vzdálenosti a vrací také rozdíl v metrech a `equal`, `first-closer` nebo `second-closer` se stejnou tolerancí.

### Stav ověření originálu

Automatická sada nad binárními testovacími Shapefile ZIPy ověřuje čtení, projekci, české názvy, MultiPolygony/otvory, CRC, limity, bezpečné opravy, blokování nepolygonových zbytků a výrazné změny plochy, skutečný union a zachování rozhodnutí včetně migrace starých identit.

Audit byl spuštěn i nad **originálním ZIPem**: 953 načtených objektů, bezpečné opravy 3121/2440/2589, union dvou záznamů 2773, 952 výsledných parků, všechny validní podle JSTS i GEOS a všechny referenční body uvnitř. Ověřuje se opakovaný import a kompletní export/import světa. E2E zahrnuje automatický import téhož ZIPu, potvrzení, IndexedDB a reload.

```sh
curl -fL 'https://mp.iprpraha.cz/portal/sharing/rest/content/items/72516a5b78b749bb8ecaae563e0c47c8/data' -o /tmp/MPP_CUR_MPP_100_PARKY_P.zip
PARKS_ZIP=/tmp/MPP_CUR_MPP_100_PARKY_P.zip npm test
PARKS_ZIP=/tmp/MPP_CUR_MPP_100_PARKY_P.zip npm run test:e2e
```

Bez `PARKS_ZIP` se pouze audit skutečného archivu explicitně přeskočí; syntetické regresní testy se spouštějí vždy. Živá síť není součástí běžného buildu ani importu lokálního ZIPu. Použitý GEOS/WASM je přibalen do importního workeru (přibližně 3,2 MB před gzip); nezvětšuje hlavní vstup aplikace ani nevyžaduje CDN. [Licence a zdroj knihovny](THIRD_PARTY.md).

## Nemocnice – bodový katalog

`hospital` navazuje na zoo, používá `poi.pointCatalog`, oddělené `poi.decisions` a vlastní body v `poi.manual`. Zdrojový katalog obsahuje deset správcem schválených nemocnic; adresy jsou volitelné. `withPublishedHospitals` doplní pouze dosud neznámé identity, nenahrazuje uložené řádky ani uživatelská rozhodnutí. `resolvePois` udržuje shodu Point geometrie s upraveným referenčním bodem. Katalogová nemocnice se vyřazuje, ručně vytvořenou lze odstranit.

Herní funkce používají výhradně referenční bod, schválení a geografickou vzdálenost. Polygon ani silniční vzdálenost se nevyžadují. Vrstva má samostatný přepínač a červený kříž; parkové filtry a hromadné akce se na ni nevztahují. Publikace ve schématu 3 nese jen schválené objekty a zpětně čte schémata 1 a 2. [Původ, přesné body a omezení](../data/source-metadata/hospitals-curated.md).
