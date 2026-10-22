# JetLagPrague · veřejná hra a geografický editor

Veřejný klient je na **[JetLagPrague/](https://wondrej89.github.io/JetLagPrague/)**, geografický editor na **[JetLagPrague/editor/](https://wondrej89.github.io/JetLagPrague/editor/)**. Lokální světy, parky, PID rozhodnutí a zálohy editoru zůstávají zachované na stejném originu; veřejná stránka jejich IndexedDB nečte ani nemění. Před dalšími úpravami si v editoru stáhněte úplnou zálohu.

Panel **Publikace herních podkladů** kontroluje a porovnává samostatný verzovaný herní katalog. Publikace používá autorizovanou GitHub App a Cloudflare Worker; stávající konfigurace a ochrany se zachovávají. V novém prostředí bez konfigurace zůstává zápis zakázaný. Český [postup nastavení, publikace, ověření nasazení a rollbacku](docs/PUBLISHING.md) obsahuje také kompatibilitu verzí a aktualizaci Workeru.

Herní podklady se načítají z neměnných publikací. Poslední zveřejněný katalog navazuje na publikaci z 20. 10. 2026: zachovává **117 parků, 3 letiště, 10 zoo a míst se zvířaty, 10 nemocnic, 45 knihoven, 25 kin, administrativní hranice a stejný PID snapshot** a přidává **307 schválených vodních ploch**. Kvůli staršímu PID je označen jako historická reference. Starší publikace zůstávají dostupné. Soukromé úpravy v prohlížeči se projeví ve hře až po publikaci; multiplayer zatím není dostupný.


Český desktopový editor geodat podle [specifikace](JETLAG_PRAHA_SPEC.md) a [první iterace](CODEX_UKOL_01_EDITOR.md). Iterace 02 přidává administrativní vrstvy; iterace 03 doplňuje veřejnou dopravu PID a úkrytové zóny. [Iterace 03B](CODEX_UKOL_03B_GTFS.md) používá aktuální obsluhu z GTFS a ruční serverovou publikaci. **Iterace 04A** přidává letiště, správu parků a geografické funkce POI pro Matching a Measuring.

Iterace 02 používá dodané soubory `data/raw/mestskecasti.geojson` (**57 městských částí**) a `data/raw/katastralni-uzemi-praha.geojson` (**112 katastrálních území Prahy**). Zachovává všechny souřadnice a atributy, podporuje samostatné zobrazení vrstev, zvýraznění území, přesouvatelný testovací bod a kontrolovanou aktualizaci zdrojů. Mapy.com poskytuje pouze mapový podklad.

Původ je zaznamenán v `data/source-metadata/`: městské části mají v dodaných datech poskytovatele HMP-IPR a katalogový odkaz IPR, katalogový odkaz ČSÚ pro katastry doložil uživatel. **Licence a datum platnosti celé sady nejsou v dodaných souborech uvedeny a zůstávají výslovně nedoložené.** Datum převzetí do repozitáře se za datum platnosti nevydává. MIT licence kódu automaticky neurčuje licenci zdrojových geodat.

## Game MVP – mobilní UI a webový simulátor

Plnohodnotný simulátor otevřete přímo na **[/JetLagPrague/simulator/](https://wondrej89.github.io/JetLagPrague/simulator/)**, bez instalace Node.js a bez přihlášení. Obsahuje testovací mapu, dva virtuální telefony, scénáře, časovače, otázky, karty, fotografie a diagnostiku. Je označen **„Testovací simulace – nejde o skutečnou multiplayerovou hru“**. Vyberte scénář a klikněte na **Načíst testovací scénář**; **Reset hry** vyžaduje potvrzení. Lokální vývoj zůstává dostupný přes `npm run dev:simulator` na **http://127.0.0.1:4177/**.

Sdílené `packages/game-core`, `packages/geo-resolver` a `packages/game-ui` používají stejný stavový automat i mobilní komponenty při lokálním vývoji a na Pages. Simulátor čte pouze veřejné katalogy s ověřenými SHA-256 a schématem, včetně verze uzamčené v uloženém scénáři. Nepřistupuje ke skutečným partiím, editorovým draftům, OAuth ani publisheru a nemá oprávnění publikovat. Veřejné mobilní pohledy [hledačů](https://wondrej89.github.io/JetLagPrague/?role=hunter) a [schovaného](https://wondrej89.github.io/JetLagPrague/?role=hider) nadále oznamují chybějící serverovou partii.

Polohy jsou výhradně simulované; aplikace nezjišťuje skutečnou GPS návštěvníka. Herní stav, fotografie, karetní ruka a diagnostika zůstávají v samostatné IndexedDB **`jetlag-praha:simulator:v1`** daného prohlížeče. Reload obnoví stejný scénář, jiný profil nebo prohlížeč má vlastní stav. **Uložit scénář** stáhne soukromý JSON včetně fotografií; jeho další sdílení řídí uživatel. Neexistuje automatická synchronizace ani odesílání soukromých dat. Smazání dat webu smaže místní simulaci; pro zálohu použijte export.

Mapy.com slouží pouze jako podklad. Simulátor načte jednu pevnou sadu dlaždic Prahy do paměti, sdílenou třemi mapami; kamera ani pohyb hráčů nemění síťové URL. Detail podkladu je do zoomu 13, při větším přiblížení se zvětšuje. Mimo tento pevný rozsah není podklad; přesné geometrie, špendlíky a geografické výpočty fungují dále. Bez klientského klíče nebo při nedostupnosti Mapy.com zůstává mapa použitelná s výslovným upozorněním. Poskytovatel dostává běžné požadavky na pevné veřejné dlaždice, veřejný klientský klíč a origin webu, žádné scénářové souřadnice nebo fotografie. Dlaždice se nepřibalují do projektu ani trvale neukládají.

Matching, Measuring a Radar zachovávají dosavadní pravidla a odměny. **Thermometer a Tentacles zůstávají Work in progress**. Neověřené karetní účinky a složení balíčku jsou výslovně testovací konfigurace. Historický PID zůstává označen jako neověřená reference, nikoli zdroj pro ostrou hru. [Úplný návod, architektura, pravidla a omezení](docs/GAME_MVP.md).

Ověření webového simulátoru zahrnuje produkční sestavení pod `/JetLagPrague/`, celý průchod otázka → odpověď → odměna → reload, fotografie a soukromý import/export, skutečné přesuny špendlíků, časovače, oddělené prohlížeče, zachování editorových úložišť a audit všech síťových požadavků. GitHub Actions spouští E2E proti přesnému artefaktu před jeho nasazením. **Lint, typecheck, produkční build, 249 jednotkových testů a 66 E2E scénářů prošly.** Dva jednotkové a dva E2E audity jsou výslovně přeskočené kvůli nedodaným původním archivům GTFS a parků. Sedm historických publikací, administrativní zdroje a kontrolní součty PID zůstaly platné.

## Vodní plochy

Samostatná vrstva **Vodní plochy** používá dodaný `AGD_CUR_AGD_OCH_VODNIPLOCHYTOKY_P.zip` z [Geoportálu Praha](https://geoportalpraha.cz/data-a-sluzby/ke-stazeni/e01b4bb6d148496abff4f065686290ff). Z **3 524 polygonů** je **769 typu P**, z nich **763 pojmenovaných**. Import zachovává **763 kandidátních objektů podle původních GLOBALID**: **307 schválených, 384 k revizi a 72 vyřazených**. Šest nepojmenovaných ploch a 2 755 polygonů typu T nevstupuje do této kategorie. Původní ZIP se uchovává celý. [Audit, pravidla a známá omezení](data/source-metadata/waterbodies.md).

**Biotop Lhotka, Biotop Radotín, Biotop Braník, Koupaliště Benice a Koupaliště Řeporyje zůstávají schválené.** Biotopy a přírodní koupaliště jsou platné vodní plochy. Samotné slovo „koupaliště“ neznamená bazén: nejednoznačné případy zůstávají k revizi. Automaticky lze vyřadit jen výslovně označené bazény a přesně zadaných 19 názvů areálů. **Jejich součet v tomto ZIPu je 72 polygonů, nikoliv uvedených 70.** `ČZU – libosad` odpovídá zdrojovému názvu `ČZU - libosad`; název se nepřepisuje. Všechny názvy z tabulky ručních kontrol jsou `review` (20 polygonů po rozepsání Louka Prague I/II/III). RN/PN/VN se podle zkratky nevyřazují a velikost není klasifikačním kritériem.

Přepínač vrstvy a **Stav vodních ploch → approved / review / excluded** mají vlastní nastavení, které přetrvá reload. Stavový filtr mění mapu i seznam; vyhledávání používá název a GLOBALID. Detail umožní změnit název a poznámku, schválit, vrátit k revizi, vyřadit a **obnovit vyřazený objekt**. Zdroje uchovávají původní názvy, GIS atributy a přesné geometrie všech vyřazených záznamů. Nedochází k mazání podle statusu.

Zdroj EPSG:5514 se převádí podle PRJ pomocí proj4 do WGS84; nic se nezjednodušuje ani nezaokrouhluje. Všech 763 dodaných pojmenovaných geometrií prošlo validací v GEOS bez oprav. Případná budoucí oprava používá GEOS MakeValid s auditem, pouze polygonovým výsledkem a maximální změnou plochy `max(0,01 m²; 0,1 %)`. Nejasná oprava import zablokuje a ponechá poslední funkční zdroj.

Stejné názvy se **automaticky neslučují napříč Prahou**. Vícedílné či nejasné kandidáty zůstávají k revizi. Správce může vybrané skutečné části ručně sjednotit; výsledkem je Polygon/MultiPolygon k novému schválení, se seznamem původních GLOBALID. Akce **Rozdělit na původní zdrojové objekty** obnoví zdrojové části i předchozí rozhodnutí a zachová pozdější individuální úpravy. Nejde o nástroj pro libovolný řez hranic.

**Import / aktualizace vodních ploch (GIS ZIP)** běží ve workeru. Nejprve zobrazí souhrn a rozdíly; data se změní až přes **Potvrdit import vodních ploch**. Aktualizace zachovává individuální názvy, poznámky a vyloučení; změna geometrie ručně schváleného objektu vyžaduje revizi. Zmizelé zdrojové objekty se archivují. IndexedDB i úplné JSON/GeoJSON zálohy obsahují zdroj a rozhodnutí. Automatické doplnění při prvním otevření nepřepisuje již uloženou vodní sadu.

`nearestApprovedPoi`, Matching a Measuring používají pro `waterbody` výhradně schválené **polygony**. Vzdálenost je nejkratší geografická vzdálenost v metrech k ploše; uvnitř i na hranici je **0 m**. Otvory jsou mimo vodu, oddělené části MultiPolygonu patří k jedné schválené lokalitě. Pomocný vnitřní bod není cílem měření. Při chybějící geometrii nebo bez schváleného kandidáta vracejí „nelze určit“. Shody zachovávají dosavadní deterministické pravidlo ID.

Nové publikace používají **GameDataRelease 6**, čtení a kontrolní součty historických schémat 1–5 zůstávají kompatibilní. Veřejný katalog obsahuje 307 schválených polygonů a původní GLOBALID, soukromý GIS audit a neaktivní objekty se nepublikují. Zabezpečení GitHub App/Worker, aktuálnost PID a atomický zápis se nemění. **Obsah předchozího PID, herní oblasti, pravidel a ostatních POI zůstává přesně zachovaný.** Jelikož převzatý veřejný PID má datum 20. 10. 2026, nová publikace z 21. 10. je historickou referencí; není vydávána za platný podklad ostré hry. Aktualizace PID je samostatný krok.

**Vltava se v tomto kroku nevytváří ani neupravuje**, podle upřesnění správce. Neodvozují se žádné polygony z anonymních toků T.

Licence konkrétního ZIPu není doložená (metadata odkazují pouze na opendata IPR). Datum 5. 10. 2026 je datum synchronizace metadat; nejde o nové geodetické měření. Konzervativní revize zůstávají u nejednoznačných názvů a duplicit, ne podle velikosti vodní plochy.

Ověření vodních ploch: lint, typecheck, produkční sestavy obou aplikací, 221 jednotkových testů a 57 E2E scénářů prošly. E2E zahrnuje úspěšné opakování čtyř starších scénářů po zpřesnění selektoru tlačítka importu světa. Dva jednotkové a dva E2E audity byly přeskočené kvůli chybějícím původním archivům GTFS a parků. **Dodaný vodní ZIP se skutečně zpracoval v jednotkových testech i v prohlížeči.** Prošla kontrola sedmi neměnných publikací, administrativních dat, PID a sestavení Workeru (`wrangler deploy --dry-run`). Veřejná hra při buildu nadále odmítá import editorových GIS knihoven.

## Kina

Vrstva **Body zájmu → Kina** obsahuje přesně **26 lokalit ze zadání: 25 schválených a jednu k revizi**. Dodaná ID, názvy, adresy a souřadnice zůstávají přesné; GeoJSON používá `[longitude, latitude]`. Původní tabulka je v [cinemas-curated.json](data/raw/cinemas-curated.json), její SHA-256 a [audit výběru](data/source-metadata/cinemas.md) jsou součástí projektu. Nový prohlížeč dostane body ze statického katalogu před prvním automatickým uložením, bez ručního importu.

**`priemere-citenas-hostivar` – Priemere Citenas Praha Hostivař** zůstává `review`. Je třeba potvrdit skutečný název a existenci kina. Adresa Švehlova 1391/32 i bod `[14.5172589, 50.0529997]` se neopravují odhadem. Tento objekt se nepublikuje a nevstupuje do herních geografických výpočtů. Ostatních 25 kin schválil správce dodaným výběrem; nejde o nezávislé ověření aktuálního provozu všech kin.

Kina mají vlastní přepínač, ikony filmového pásu a počty schválených, vyřazených a neověřených lokalit. Vyhledávání podporuje název, ID i adresu. Výběr v seznamu nebo mapě otevře název, adresu, poznámku, GPS a metadata. **Přesunout bod kina v mapě** umožní tažení, **Vyřadit kino ze hry / Vrátit kino do hry** mění herní způsobilost. **Přidat kino** vloží skutečný bod; schválení vyžaduje název a adresu. Katalogová kina se vyřazují, odstranit lze ručně vytvořená kina.

ID se při přejmenování nemění. Zdrojový katalog a individuální rozhodnutí zůstávají oddělené; IndexedDB, reload, undo/redo i úplné JSON/GeoJSON zálohy zachovávají úpravy, schválení, vyloučení a viditelnost. Doplnění či aktualizace výchozího katalogu nepřepíše existující body ani rozhodnutí. Stávající světy se doplní o kina bez změny vlastní herní oblasti, ostatních POI nebo pravidel PID.

`nearestApprovedPoi`, Matching a Measuring používají jen schválená kina, geografické vzdálenosti v metrech a dosavadní deterministické řešení shod podle ID. Multiplex je jediný objekt, nezávisle na počtu sálů. Bod neurčuje hranici budovy; nepočítá se vzdálenost k polygonu, cestovní čas ani program projekcí.

Veřejný katalog **GameDataRelease 5** zahrnuje pouze schválená kina s ID, názvem, adresou a bodem. Čtení, SHA-256 a rollback historických schémat 1–4 zůstávají kompatibilní. Panel publikace ukazuje počet kin i obvyklé porovnání přidaných/změněných/odstraněných objektů. Editor před novou publikací vyžaduje Worker podporující schéma 5; OAuth, GitHub App, CSRF, atomický zápis a ochrana aktuálnosti PID se nemění. [Publikace a nasazení](docs/PUBLISHING.md).

Ověření kin: prošly lint, typecheck, produkční build obou aplikací, 211 jednotkových a 53 E2E testů, kontrola šesti neměnných publikací a sestavení Workeru (`wrangler deploy --dry-run`). Dva jednotkové a dva E2E audity původních archivů byly přeskočené, protože v prostředí chybí úplný GTFS a původní parkový ZIP.

Zdroj bodů je **Ruční výběr na Mapy.com**. Nejde o oficiální dataset ani geodetické měření; licence převzatých bodů není doložená. Oficiální weby kin nebyly dodané, jejich URL se nevymýšlejí. Mapy.com slouží aplikaci jako mapový podklad; pro tento katalog se na něj neposílají hromadné dotazy.

Statický katalog lze z původní tabulky sestavit příkazem `npx tsx scripts/prepare-cinemas.ts`; běžný build jej nespouští. Již publikované verze a lokální rozhodnutí tento příkaz nemění. Další veřejné změny patří přes stávající autorizovanou publikaci z editoru.

## Knihovny Městské knihovny v Praze

Vrstva **Body zájmu → Knihovny** obsahuje **45 schválených poboček s GPS**, dostupných i při prvním otevření a ve veřejné publikaci schématu 4. Dne **20. 10. 2026** se podařilo načíst oficiální katalog i všech 45 detailů. U každé pobočky přesně souhlasí původní adresa a souřadnice odkazů **Zobrazit na Mapy.com** a **Zobrazit na Google Maps**. Všechny body leží uvnitř skutečného polygonu Prahy. **Nedořešené pobočky: 0.** [Úplný audit a souřadnice](data/source-metadata/mkp-libraries.md).

Souřadnice jsou převzaté z odkazů oficiálního webu MLP, bez dotazování na mapová API a bez geokódování. Mapy.com `center=longitude,latitude` se přijímá jen s `marker=true`; Google Maps musí obsahovat výslovný souřadnicový cíl. Střed výřezu, Street View kamera a textové hledání adresy se nepřijímají. Neshodné odkazy nezpůsobí průměrování ani schválení. Barrandov má GeoJSON bod `[14.36824, 50.028402]`.

**Původní stabilní ID, názvy a adresy zůstávají zachované.** Prefix `library-pending:mkp-selection:…` zůstává kvůli kompatibilitě uložených draftů; status už není odvozován z jeho názvu. Oficiální detail a oba zdrojové mapové odkazy jsou evidované samostatně, spolu s časem kontroly, adresou a SHA-256 HTML detailu. Původní neověřený záznam je archivován v metadatech objektu.

Nezahrnují se Modřany, DOK16, kiosky, doplňkové služby Ústřední knihovny, duplicitní dětské oddělení ani bibliobusy. Brusnice a Velký mlýn zůstávají ve výběru. Krátké uzavření Hloubětína dne 19. 10. a Jezerky dne 19.–20. 10. 2026 je zaznamenané v auditu; běžná otevírací doba a dočasné uzavření nemění herní kategorii. Dlouhodobá technická uzávěra brání automatickému schválení.

Přepínač **Knihovny** má vlastní viditelnost a počty schválených, vyřazených a neověřených objektů. Hledání funguje podle názvu, ID a adresy. Detail zobrazuje zdroje a dovolí měnit název, adresu, poznámku, GPS i tažení v mapě. **Každá změna bodu zruší ověření a vrátí schválenou knihovnu k revizi**, dokud správce novou polohu výslovně nepotvrdí. Vlastní knihovnu lze doplnit přes **Přidat knihovnu**; duplicitní oficiální identita se odmítne.

Při otevření starého draftu se doplní body dosud neumístěných kandidátů ještě před automatickým ukládáním. **Ruční názvy, adresy, poznámky, vyloučení, stav k revizi a již upravené body se nepřepisují.** Dříve ručně umístěné pobočky s URL identitou zůstávají funkční bez duplicit. IndexedDB a JSON/GeoJSON zálohy zachovávají data i rozhodnutí. Ostatní POI, PID a herní oblast se nemění.

`nearestApprovedPoi`, Matching a Measuring používají jen schválené knihovny s doloženým bodem, geografickou vzdálenost v metrech a stávající pravidlo shod podle ID. Veřejná hra a autorizovaný Worker podporují **GameDataRelease 5** i historická schémata 1–4. Starší neměnné publikace zůstaly beze změny. Do publikace se neposílá archiv původního kandidáta ani soukromé poznámky.

Opakovatelný sběr a kontrola (nejprve zkontrolujte hlášení a audit, teprve pak zapište statický katalog):

```sh
python scripts/collect-mlp-library-evidence.py
npx tsx scripts/prepare-library-points.ts
npx tsx scripts/prepare-library-points.ts --write
```

Sběrač získává skutečné URL detailů z katalogu a uloží podklady do `data/source-metadata/mkp-library-points.json`. Kontrola bez `--write` nic nepřepisuje; rozpor, chybějící doklad, odlišná adresa nebo bod mimo Prahu ponechají pobočku k revizi. Síťový přístup při běžném otevření aplikace není potřeba. Další změny do veřejné hry patří přes stávající autorizovanou publikaci v editoru.

Ověření doplnění GPS: lint, typecheck, produkční build, 204 jednotkových a 48 E2E testů (včetně samostatného opakování opraveného migračního testu), kontrola všech pěti neměnných publikací a sestavení Workeru prošly. Dva jednotkové a dva E2E audity původních archivů byly přeskočené: chybí plný GTFS a původní parkový ZIP.

**Omezení:** jde o referenční body zveřejněné knihovnou, nikoliv nezávisle zaměřené geodetické souřadnice. Licence katalogu a bodů zůstává nedoložená; MIT licence aplikace ji nenahrazuje. Otevírací doba ani budoucí přestěhování se automaticky nesledují.

## Nemocnice

Vrstva **Body zájmu → Nemocnice** obsahuje přesně deset schválených nemocnic ze zadání. Má vlastní viditelnost, ikonu kříže, počty a hledání podle názvu i stabilního ID. Dodané GPS body jsou uložené jako GeoJSON `Point` v pořadí `[longitude, latitude]`; nemocnice sv. Alžběty má adresu prázdnou. Výchozí body jsou součástí aplikace a veřejné publikace, dostupné i na novém zařízení.

Výběr v seznamu nebo mapě otevře název, volitelnou adresu, poznámku, GPS a metadata. **Přesunout bod nemocnice v mapě** dovolí přetažení; **Vyřadit ze hry / Vrátit do hry** mění herní způsobilost. **Přidat nemocnici** vloží vlastní bod, který vyžaduje název a schválení, adresa není povinná. Odstranit lze vlastní nemocnici; katalogová se vyřazuje. Úpravy, schválení i viditelnost zůstávají v IndexedDB, undo/redo a úplných JSON/GeoJSON zálohách. Doplnění katalogu při inicializaci před autosave zachovává uložené body a rozhodnutí.

Kategorie `hospital` používá stejné `nearestApprovedPoi`, Matching a Measuring jako zoo: geografickou vzdálenost v metrech k bodu, jen schválené kandidáty, stabilní ID při shodě a „nelze určit“ bez schváleného kandidáta. Viditelnost nerozhoduje o účasti ve hře. Publikují se pouze schválené nemocnice přes stávající GitHub App a Cloudflare Worker; osobní poznámky zůstávají soukromé. Starší publikace jsou nadále ověřitelné.

Zdroj **Ruční výběr na Mapy.com** znamená výběr správce pro lokální hru, nikoli úplný zdravotnický registr nebo nezávisle ověřené geodetické souřadnice. Body neurčují hranice areálů; geokódování se nepoužívá. Licence převzatých bodů a datum platnosti nejsou doložené. [Původ a audit nemocnic](data/source-metadata/hospitals-curated.md).

## Zoo a místa se zvířaty

V **Body zájmu** je samostatný přepínač, počty schválených lokalit a deset bodů s ikonou tlapky. Hledání funguje podle názvu i ID. Výchozí katalog je součástí aplikace, nikoli pouze IndexedDB autora. Obsahuje přesně deset lokalit ze zadání, včetně původních stabilních ID, adres a souřadnic uložených v pořadí `[longitude, latitude]`.

Zdroj je **Mapy.com – ruční převzetí bodů** z výběru správce. Nejde o oficiální dataset zoo ani nezávisle ověřené geodetické souřadnice; bod nevymezuje areál. Žádné další body se nestahují ani nedohledávají geokódováním. Licence převzatých souřadnic zůstává výslovně nedoložená.

Výběr bodem nebo seznamem umožní upravit název, adresu, pracovní poznámku a GPS, přesunout bod přetažením v mapě, vyřadit lokalitu, vrátit ji k revizi nebo znovu schválit. **Přidat zoo nebo místo se zvířaty** vloží vlastní bod kliknutím do mapy. Nový bod vyžaduje název, adresu a schválení; odstranit lze pouze ručně vytvořenou lokalitu. Katalogové lokality se vyřazují ze hry. Změny podporují běžné undo/redo a kompletní JSON/GeoJSON zálohy.

Zdrojové body jsou v nepovinném `poi.pointCatalog`, uživatelské zásahy odděleně v `poi.decisions`; vlastní zoo jsou v `poi.manual`. Aktualizace katalogu přidá neznámá ID a nepřepíše uložené záznamy, rozhodnutí ani viditelnost. Starší drafty ve schématu světa 2 a parkové zdroje zůstávají kompatibilní. Výchozí zoo se bezpečně doplní při inicializaci editoru.

`nearestApprovedPoi`, `matchingPois` a `measuringPois` pracují i přímo s veřejnými DTO zoo: používají geografickou vzdálenost k referenčnímu bodu, ignorují `excluded` a `review` a při shodné vzdálenosti zachovávají pravidlo stabilního ID. Viditelnost vrstvy nemění herní způsobilost.

Nové herní katalogy používají **GameDataRelease 6**, který podporuje kategorie `zoo`, `hospital`, `library`, `cinema`, `waterbody`, adresy a doklad ověření knihoven. Čtení a kontrolní součty historických schémat 1–5 zůstávají zachované; staré soubory se nepřepisují. Publikují se pouze schválené zoo. Pracovní poznámky a importní audit se do veřejného katalogu neposílají. Aktuální Worker v `/status` oznamuje podporu verzí 1–6; starší server publikaci nového schématu bezpečně zablokuje do aktualizace. V tomto repozitáři je také připojen automatický **Workers Builds** pro publikační server; jeho výsledek se ověřuje odděleně od Pages.

## Iterace 04A – letiště a parky

Vlevo v **Body zájmu** jsou samostatné přepínače letišť a parků, počty schválených/neschválených objektů, hledání a volitelné referenční body parků. Tři pevná schválená letiště **LKPR, LKKB a LKTC** s přesnými souřadnicemi ze zadání jsou součástí statického katalogu aplikace a fungují i na novém zařízení. Výběr v mapě nebo seznamu zobrazí ID, souřadnice a původ.

Parky lze bezpečně importovat z GeoJSON, nakreslit, přejmenovat, skutečně sjednotit jejich části, schválit nebo vyloučit a přesunout referenční bod uvnitř polygonu. Zdrojová data jsou oddělená od ručních rozhodnutí; jejich aktualizace zachová jména, body, schválení i vyloučení. Vše se uchovává v draftu a kompletních JSON/GeoJSON zálohách.

**Výběr parků pro hru:** v **Body zájmu → Výběr parků podle hierarchie** jsou skutečné počty čtyř hierarchií (výchozí výběr 1) a samostatná skupina bez hierarchie. Jedním potvrzením lze celý výběr schválit nebo vyloučit, nezávisle na hledání a mapovém výřezu. Neplatní kandidáti se přeskočí s diagnostikou. **Vrátit poslední hromadnou akci** obnoví původní rozhodnutí a zachová pozdější individuální úpravy.

**Zobrazit jen parky ve hře** ukáže v mapě **všechny schválené parky napříč hierarchiemi**, včetně ručně přidaných výjimek. Seznam má filtry **Vše / Schválené / Vyloučené / K revizi**, hledání a volbu zobrazení parků mimo pracovní hierarchie. Pro úplný seznam schválených použijte **Schválené** a **Zobrazit také parky mimo vybrané hierarchie**. Živé počty ukazují celý katalog. Schválené parky jsou zelené, vyloučené šedé, revize má neutrální obrys. Ve vlastnostech jsou rychlé akce **Vyřadit ze hry / Vrátit do hry**. Pracovní filtry a stav mapového náhledu se uchovávají v draftu; nezmění schválení ani geografické výsledky.

Nové parky při aktualizaci zůstávají k revizi. `npm run poi:publish` zachovává úplné editorové zdroje a navíc vytváří `gameParks` pouze ze schválených parků. Matching a Measuring nadále ignorují vyloučené i neschválené objekty. [Podrobnosti a omezení](docs/POI_DATA.md#hromadná-správa-podle-hierarchie).

**Původní omezení zdrojů URK a letišť:** dokumentaci IPR `URK_Parky_p` i letecké podklady AIM blokovala síť cloudového prostředí (HTTPS CONNECT 403). Endpoint parkových geometrií, atributy, stabilní ID a licence proto nejsou ověřené; publikováno je **0 oficiálních parků**. Nevkládají se náhradní zelené plochy. Letiště používají schválené ARP souřadnice ze zadání s výslovným záznamem, že aktuální oficiální letecký dokument nebylo možné nezávisle ověřit.

Pro parky použijte **Načíst / aktualizovat parky**. Přijímá původní ZIP **MPP_100_Parky_p** i WGS84 GeoJSON konkrétní parkové vrstvy (včetně URK, pokud je doložená). Všichni noví kandidáti začínají k revizi; publikování schválených parků do statického katalogu má samostatný příkaz `npm run poi:publish -- --world cesta/k/exportu.json`.

**Jednoduchý GIS ZIP import:** po výběru `MPP_CUR_MPP_100_PARKY_P.zip` se automaticky načtou SHP/SHX/DBF/PRJ/CPG, české atributy a přes `proj4` souřadnice WGS84. **GEOS MakeValid 3.13.0** opraví bezpečné samoprůniky a geometrický union sjednotí záznamy se stejným oficiálním ID. Náhled obsahuje souhrn, opravy, sloučení, rozdíly a možnost zobrazení v mapě. Stačí potvrdit **Použít parkový zdroj**; ruční opravy ani přidělování klíčů nejsou potřeba.

Ověřeno přímo na originálním archivu: **953 záznamů → tři opravy (3121, 2440, 2589) + sloučení dvojice 2773 → 952 validních parků**, každý s jedním bodem striktně uvnitř. Zachovávají se všechny polygonové části, otvory, původní názvy a atributy. Bez zjednodušování hranic. [Audit zdroje a kontrolních součtů](data/source-metadata/parks-mpp-source-audit.md).

Automatické přijetí opravy vyžaduje pouze polygonový výsledek, opětovnou validaci a změnu geografické plochy nejvýše `max(0,01 m²; 0,1 % původní plochy)`. Nespolehlivá či nulová původní plocha a nepolygonové zbytky import zablokují s varováním; žádné části se nezahazují. Herní schválení a doložení licence zůstávají oddělené od geometrické kontroly.

Původní souřadnice, atributy, metadata, SHA-256 a audit automatických operací zůstávají v datasetu i exportu světa. Diagnostiku lze stáhnout také před potvrzením. Stabilní ID používá původní oficiální kód; opakovaný import zachovává ruční body, názvy, schválení a vyloučení. Při přechodu ze starých rozdělených duplicit se původní identity a rozhodnutí archivují; shodná rozhodnutí se přenesou, rozporná či neúplná vyžadují revizi.

[Úplný návod POI, přesný požadovaný soubor, pravidla geometrie a publikace](docs/POI_DATA.md).

## Iterace 03 – PID a úkrytové zóny

Editor podporuje skutečné zastávky a trasy PID, filtrování sedmi druhů dopravy a denního/nočního provozu, dopravní priority, jeden referenční bod, odůvodněné ruční výjimky, propojení skupin, skutečný průnik úkrytového kruhu s herní oblastí a ověření polohy podle geografické vzdálenosti. Zapnutí je vlevo v **Veřejná doprava PID**; správa verzí je pod tlačítkem **Doprava PID**.

Dodaná trojice obsahuje **8 526 skupin, 17 229 fyzických stanovišť a 853 linek**. Z 16 118 bodů aktivního zdroje má 15 910 doloženou vazbu na fyzické stanoviště, což tvoří 8 066 herních zastávek s obsluhou ve zdrojovém období. Ostatních 208 bodů se nepřiřazuje odhadem. Zachovávají se všechny původní souřadnice a všech **1 101 102 vrcholů tras**; aktualizace zdrojů nepřepisuje vlastní vrstvy, herní hranici ani výjimky.

**Omezení dodaných dat:** aktivní zastávky mají platnost **2026-08-20**, trasy **2026-08-20 až 2026-08-26**, ale skupiny byly vygenerované **2026-10-15**. Přibalený referenční snapshot proto vyžaduje revizi a povolenost úkrytu vrací **„nelze určit“**. Body, trasy, měřená vzdálenost a skutečná geometrie průniku zůstávají dostupné. Čas původního stažení a licence dodaných souborů nejsou doložené; čas přípravy snapshotu se eviduje samostatně.

**Iterace 03B:** aktuální obsluhu určuje [oficiální GTFS PID](https://data.pid.cz/PID_GTFS.zip), `stops.json` doplňuje ověřené fyzické identity a body. Pro provozní den se vyhodnotí kalendáře, výjimky a povolený nástup **nebo** výstup. Aktivní geometrie pochází výhradně z přiřazených GTFS shapes; srpnové geodatové soubory nejsou podmínkou aktualizace. Neaktivní a neurčitelné uzly jsou dostupné ve správě zdroje a nejsou automaticky povolené úkryty.

**Aktualizace:** otevřete **Doprava PID → Aktualizovat data PID ↗**, na GitHubu spusťte **Run workflow** a počkejte na dokončení aktualizace i navazujícího nasazení Pages. Poté v editoru zvolte **Načíst publikovaný výsledek**, zkontrolujte rozdíly skupin i tras a potvrďte přijetí. Workflow vyžaduje oprávnění správce repozitáře; aplikace neobsahuje GitHub token. Denní plán je odstraněný. Prohlížeč čte pouze statické publikace, nestahuje živý GTFS ani původní geodata.

Datový workflow ukládá neměnné GZIP snapshoty a katalog verzí do samostatné větve `pid-data`. Běžný push kódu je pouze převezme a ověří, nestahuje zdroje PID a nevrací publikaci na starší bootstrap. Pro stejný den se ověřená verze použije opakovaně bez stažení; nové sestavení lze výslovně vynutit. Selhání zachová poslední publikaci a vlastní drafty. Ověřený aktuální GTFS z 16. 10. obsahuje **52 663 plánovaných spojů, 870 aktivních linek, 8 265 herních uzlů s obsluhou** v celé síti PID; nejde o počty omezené pouze na Prahu. [Audit skutečného feedu a konkrétních míst](data/source-metadata/pid-gtfs-source-audit.md).

[Podrobný návod, architektura, pravidla a omezení PID](docs/PID_DATA.md) · [audit dodané trojice](data/source-metadata/pid-source-audit.md) · [vložení JSON/ZIP/GZIP](data/raw/pid/README.md)

### Obnova PID při výpadku aktualizace

Ověřený snapshot z IndexedDB se načte **před síťovou aktualizací**, i když je starší. Selhání serverové aktualizace, timeout nebo nedostupná publikace jej nesmaže ani nevypne zobrazení. Aktualizace má vlastní chybu oddělenou od prvotního načtení; editor u dostupných dat stále ukazuje datum a počty. Pokud chybí i lokální kopie, oznámí chybu načtení a nabídne nový pokus. Kontrola SHA-256, schématu, vazeb a verzí zůstává povinná; poškozený snapshot se nepoužije.

Starší nebo nekonzistentní zdroj má výrazné označení **Historická referenční data – neověřeno**. Zůstává použitelný pro prohlížení zastávek, tras, jednotlivých i společných úkrytových zón a geografickou diagnostiku. Měření vzdálenosti a poloha v oblasti fungují, ale ostrá povolenost úkrytu vrací **„nelze určit“**. Ani dříve konzistentní snapshot se po změně pražského dne automaticky nepovažuje za dnešní ověřená data.

Viditelnost zastávek a tras, všechny dopravní a prostorové filtry, hledání, vybraná linka a přepínače zón se ukládají odděleně pod `jetlag-praha:pid-preferences:v1`. Při prvním otevření bez uloženého nastavení jsou zastávky zapnuté; další otevření respektuje také výslovné vypnutí. Předvolba Prahy nepřepisuje již uloženou volbu prostorového filtru. Poškozené nebo nedostupné nastavení má vlastní upozornění a nemaže snapshot ani herní draft.

Filtr **Pouze PID v herní oblasti** během výpočtu ukazuje načítání a počty dostupného zdroje. Nepředstírá výsledek `0 / 0`. Existující výsledek pro stejnou oblast se při přepočtu zachová; mapa označí čekání na nový výsledek. Při chybě či chybějící oblasti lze filtr vypnout jedním tlačítkem a prohlížet dostupná PID data.

Příčinu původního výpadku dokumentuje [audit aktualizací z 16. 10.](docs/PID_REFRESH_AUDIT_2026-10-16.md). Tehdejší návrh přechodu na GTFS je nyní realizovaný v iteraci 03B. Nové stahování eviduje jednotlivé URL, HTTP chyby, datum a výsledek v souhrnu Actions a artefaktu `pid-gtfs-diagnostics`. Zdroj nedostupný dnes se nevydává za dnešní obsluhu.

### Celá Praha a souhrnná úkrytová plocha

Každý **nový svět** automaticky obsahuje celou Prahu jako jediný objekt vrstvy **Herní oblast**. Geometrie pochází z předpočítaného [GeoJSON](apps/editor/public/defaults/prague-game-area.geojson), vytvořeného funkcí `municipalGameArea()` z ověřené vrstvy všech 57 městských částí. Vnitřní správní hranice jsou odstraněné skutečným sjednocením; vnější souřadnice, případné otvory a oddělené části zůstávají přesné. Při otevření ani obnově se už sjednocení nepočítá. Výchozí Praha funguje na novém zařízení i po smazání úložiště prohlížeče a nezávisí na úspěšném načtení samostatných administrativních vrstev.

Inicializace nejdřív ověří **IndexedDB**, a jen když v ní svět chybí, použije starší **localStorage**. Existující vlastní i dříve uložená pražská hranice se zachová, bez stahování nové výchozí geometrie. Teprve po dokončení inicializace se povolí automatické ukládání. Při chybě výchozího souboru se nový prázdný svět neuloží; chyba je viditelná a **Obnovit výchozí území Prahy** umožní načtení zopakovat. Poškozené uložené drafty zůstávají chráněné před přepsáním.

**Starší prázdné drafty:** původní formát neuchovává vznik světa ani historii smazání hranice, proto nelze bezpečně odlišit dosud nenastavenou oblast od vědomě odstraněné. Jednorázová migrace přidá stav `legacy-empty` a zachová prázdnou oblast, všechny vlastní objekty i pravidla. Editor vysvětlí situaci a nabídne obnovení. Od této verze se vědomé odstranění eviduje jako `intentionally-empty`; reload, import/export, aktualizace zdrojů ani další nasazení oblast automaticky nevrátí. Volitelné `gameAreaInitialization` rozšiřuje stávající schéma 2, původní `newWorld()` a čtení starších verzí zůstávají kompatibilní.

Tlačítko **Obnovit výchozí území Prahy** načte připravený soubor. Náhrada existující hranice vyžaduje potvrzení a lze ji vrátit přes **Zpět**; ostatní vrstvy a uživatelské úpravy se nemění. Změny oficiálních podkladů samy uloženou hranici nepřepíší. Nový výchozí polygon po úpravě podkladů připravuje správce výslovně příkazem `npm run data:default-area`.

GeoJSON obsahuje celá metadata použitých podkladů (poskytovatel, URL, verze, 57 oficiálních kódů, datum převzetí, evidovaná licence a datum platnosti), SHA-256 podkladové vrstvy, vlastní geometrie i celého souboru a čas přípravy. **Nedoložená licence a datum platnosti městských částí zůstávají výslovně nedoložené**; příprava polygonu tyto údaje nevymýšlí. Herní objekt si zachovává zdrojová metadata a kontrolní součty v atributech, také při JSON/GeoJSON exportu.

Nový svět bez uložených preferencí a ruční obnova zapnou **Pouze PID v herní oblasti**. Přepínač lze použít také s vlastní nakreslenou oblastí. Zastávky se vybírají podle referenčního bodu uvnitř nebo na hranici, linky podle skutečného dotyku či průniku celé trasy s plochou včetně otvorů a MultiPolygonů. Zachová se celá protínající linka včetně úseků mimo Prahu; samotný překryv bounding boxů nestačí. Chybějící bod se neodhaduje a bez definované oblasti je výsledek neurčitý. Při dalším otevření se obnoví uložená volba filtru, včetně vypnutí.

**Zobrazit všechny úkrytové zóny** zobrazí sjednocení kruhů kolem všech nevyloučených zastávek s bodem uvnitř oblasti, oříznuté herní hranicí. Výchozí poloměr je **400 m**, jeho změna v pravidlech přepočítá plochu. Vrstva je nezávislá na hledání, dopravních filtrech, výřezu mapy i zobrazení jednotlivých zastávek. Překryvy se počítají jednou, mezery zůstávají prázdné. Souhrn ukazuje počty a plochu; zastávky k revizi jsou zahrnuté do výslovně označeného geometrického náhledu, vyloučené a neurčené body se nezahrnují.

V přibaleném referenčním snapshotu vychází **1 431 zastávek a 404 linek** v Praze a přibližně **314,25 km²** spojených 400m zón. Jde o výsledek dodané verze dat, nikoli garantované dnešní pokrytí. Všech 1 431 zastávek této nekonzistentní verze vyžaduje revizi. Kruhy mají 128 geodetických úseků (odchylka obvodu přibližně 0,12 m při 400 m); rozhodnutí o konkrétním úkrytu nadále používá přímo vzdálenost v metrech. Výpočet sjednocení běží v samostatném workeru a změna vstupů zruší starý výpočet.

## Spuštění

Node.js **22.12+** (ověřeno na 24.19), npm a moderní prohlížeč.

```sh
npm ci
cp .env.example .env.local
# Do .env.local doplňte VITE_MAPY_API_KEY.
npm run dev:editor  # editor; npm run dev:game nebo npm run dev spustí veřejného klienta
```

Příkazy spouštějte z kořene repozitáře. Na strojích s nedostupnou výchozí npm cache lze použít `npm ci --cache /tmp/jetlag-npm-cache`. Pro produkční výstup spusťte `npm run build`; vznikne `dist/site/` s oběma aplikacemi. Samostatné sestavy jsou v `dist/game/` a `dist/editor/`; `npm run preview` zobrazí veřejnou aplikaci, `npm run preview:editor` editor.

## Mapy.com a klíč

V [portálu Mapy.com](https://developer.mapy.com/account/) vytvořte **klientský** klíč. Povolte pouze potřebnou službu mapových dlaždic a omezte HTTP referery na vývojový a produkční web. Vložte jej do ignorovaného `.env.local` jako `VITE_MAPY_API_KEY=…`; po změně restartujte Vite. V **Nastavení mapy** lze klíč zadat i do paměti aktuální stránky, bez trvalého uložení.

Klíč není součástí Git repozitáře, lokálního draftu ani exportu. Klientský klíč je ovšem viditelný v sestaveném JavaScriptu a síťových požadavcích. Nepoužívejte administrační/serverový klíč. Build se zabudovaným klíčem nezveřejňujte bez správných omezení jeho použití.

Editor používá dokumentovaný endpoint `https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=…`, povinné logo s odkazem na Mapy.com a copyright s odkazem na poskytovatele. Chybějící klíč nevyvolává dotazy na dlaždice. Při selhání načítání se zobrazí doporučení ověřit klíč, referer, službu, limit a síť; chyba není zaměněna za prázdnou mapu. Editor neprovádí geokódování, sběr POI ani stahování databáze objektů z Mapy.com.

Před veřejným nasazením ověřte vhodnost **Basic tarifu** nebo písemné povolení kombinace podkladu s vlastními geodaty; nepředpokládejte automaticky podmínky Extended. V omezeném cloudovém prostředí musí síť dovolovat `api.mapy.com` pro dlaždice a logo. Bez platného klíče nebo přístupu k API zůstane mapová plocha bez podkladu, s výslovným hlášením. Neexistuje náhradní podklad ani smyšlená geografická data.

Dokumentace poskytovatele: [dlaždice a atribuce](https://github.com/mapycom/developer/blob/master/docs/rest-api/map-tiles.md), [podmínky](https://developer.mapy.com/terms-and-conditions/).

## Práce s editorem

1. Nový svět už má jako **Herní oblast** celou Prahu. Pro vlastní oblast lze hranici upravit, importovat jiný polygon nebo ji smazat a nástrojem **Polygon** nakreslit novou. Klikáním přidávejte vrcholy, uzavřete prvním vrcholem. Původní Prahu vrátí **Obnovit výchozí území Prahy**. Hranice je jeden Polygon nebo MultiPolygon; další samostatné části lze importovat jako MultiPolygon nebo vložit přes editor GeoJSON souřadnic.
2. Pro bod, linii nebo další polygon vyberte **Vlastní objekty** nebo přidejte vrstvu. Linii dokončíte dalším kliknutím na poslední vrchol. Nástroj lze zrušit tlačítkem pod mapou.
3. Pro otvor vyberte existující polygon a nástroj **Otvor**. Nakreslete uzavřený prstenec celý uvnitř jedné části. Validace odmítne křížení, dotyk hranic, překrývající se i vnořené otvory.
4. Kliknutím vyberte objekt. Vpravo upravte jméno, poznámku, zdroj a potvrďte **Uložit vlastnosti**. ID, datum vytvoření/importu a zdrojové atributy jsou dostupné ve vlastnostech.
5. **Upravit vrcholy v mapě** umožní přesun vrcholů i otvorů; prostřední značkou přidáte vrchol, pravým tlačítkem jej odstraníte. Potvrďte **Uložit geometrii**, nebo úpravy zrušte. Uložit lze pouze validní geometrii. Během této úpravy jsou změny ostatních dat zablokované.
6. **Kruh**: zadejte poloměr v metrech a klikněte na střed. Střed a poloměr lze později změnit ve vlastnostech. U kruhu se neupravují jednotlivé vrcholy, aby nepřestal být kruhem. **Měření**: dva kliky vypočítají vzdálenost; třetí začne nové měření. Zoom nemění uložené souřadnice ani poloměr.
7. Vlevo lze vrstvy přidávat, přejmenovat, obarvit, skrýt a smazat. Herní vrstva je vždy právě jedna a nelze ji smazat, její hranici ano. Vyhledávání prohledává názvy objektů aktivní vrstvy. Zpět/Znovu pokrývá nejvýše 50 datových změn; historie nepřežije obnovení stránky.

Nástroje **Zobrazit vše** a **Zpět na Prahu** upravují pouze pohled. Mapové měřítko je v metrech/km. Editor pracuje i s importovanými MultiPolygony včetně otvorů; počet oddělených částí se při úpravách zachová.

## Import, export a lokální uložení

- **GeoJSON → nová vrstva**: Point, LineString, Polygon, MultiPolygon, samostatný Feature i FeatureCollection. Zadejte název a popis původu/licence. Původní `properties` zůstanou u objektu v atributech. Neznámé typy, `null` geometrie, starší deklarace `crs`, neuzavřené a nevalidní geometrie jsou odmítnuté s chybou. CRS se automaticky nepřevádí: vstup předem transformujte na WGS84 / RFC 7946.
- **GeoJSON → herní oblast**: pouze polygony; více vstupních polygonů se převede na jeden MultiPolygon. Původní atributy dílčích objektů se uloží do `importedFeatures`. Existující hranice se nahradí až po potvrzení.
- **Export zálohy**: JSON obsahuje manifest (schéma 2, datum, zdroje, souřadnicový systém a jednotky) a celý `WorldDraft`, včetně prázdných vrstev, ID a atributů.
- **Exportovat GeoJSON**: standardní FeatureCollection s geometriemi a rozšiřujícími poli `manifest`, `world`, `layers` a vlastnostmi `_jetlag`. Pro bezeztrátovou obnovu použijte **Kompletní svět JSON / GeoJSON**. Běžný GIS může vlastní metadata při úpravách odstranit; obyčejný import vrstvy pak není obnovou celého světa.
- Import je atomický: chybný objekt odmítne celý soubor. UI limit je 10 MB pro vlastní GeoJSON, 100 MB pro kompletní svět či zdrojový balíček; 10 000 objektů na vrstvu, 200 vrstev. Reálný výkon závisí na počtu vrcholů. Větší soubory nejprve zjednodušte/rozdělte mimo editor.
- Plný draft se po změnách ukládá do **IndexedDB**, databáze `jetlag-praha-editor`, store `drafts`, klíč `world`. Tím nejsou velké administrativní geometrie omezené kvótou localStorage. Malé drafty se navíc zrcadlí do původního `localStorage` klíče `jetlag-praha:world:v1`; tento původní klíč se nemění ani nemaže. Pokud IndexedDB není dostupná, použije se localStorage a UI to oznámí. Chyba ukládání je viditelná; proveďte export.
- Existující drafty a JSON/GeoJSON balíčky **verze 1** se automaticky načtou jako verze 2. ID, geometrie, atributy i herní hranice se zachovají. Novější IndexedDB má při načítání přednost před starou kopií. Poškozený záznam se automaticky nepřepisuje. Historie undo je pouze v paměti a nepřenáší se. Starší aplikace iterace 01 neumí balíčky verze 2.

**Úložiště prohlížeče není týmová ani cloudová databáze.** Je vázané na origin a prohlížeč, může být smazáno a více otevřených oken se nesynchronizuje. Pro souběžnou editaci používejte pouze jednu kartu. Pravidelně exportujte soubory. Prázdná herní hranice je přípustný rozpracovaný stav s viditelným upozorněním.

## Architektura a výpočty

GTFS import odděluje čisté jádro `pid-gtfs.ts` od ZIP/CSV a sítě ve `scripts/gtfs-input.ts` a `gtfs-publication.ts`. `pid-catalog.ts` popisuje neměnné publikované verze. `pid-shared.ts` poskytuje znovupoužitelnou denní cache s požadovaným sdíleným zámkem; `hide-selection.ts` validuje kandidáty a soukromé potvrzení proti uzamčenému snapshotu. Autentizovaný backend, distribuované úložiště a hráčské UI zůstávají další fází. [Kontrakty a pravidla nasazení](docs/PID_DATA.md).

- `apps/editor/src/App.tsx`: vrstvy, vlastnosti, import/export, historie a lokální ukládání.
- `apps/editor/src/MapCanvas.tsx`: adaptér Leaflet + Geoman Free, Mapy.com podklad a kreslicí nástroje. Poskytovatel podkladu neovlivňuje datový kontrakt.
- `packages/geo-core/src/index.ts`: sdílené typy `WorldDraft`, `GeoLayer`, `GeoFeature`, Zod validace a služby `importGeoJson`, `exportWorld`, `distanceMeters`, `makeMetricCircle`, `pointInArea`, `addHole`, `saveDraft`, `loadDraft`. Jádro nepoužívá DOM ani mapový klíč; lze je později využít na serveru. Verze 2 přidává zdrojová metadata vrstvy; volitelné `gameStops` zachovává oddělená pravidla, propojení a ruční výjimky iterace 03. Volitelné `poi` odděluje zdroje parků, ruční objekty, rozhodnutí a viditelnost; `poi.ts` obsahuje rozšiřitelný POI model a geografické funkce.
- `packages/geo-core/src/administrative.ts`: stabilní oficiální identity, SHA-256, porovnání verzí, bezpečná aktualizace a klasifikace bodu.
- `apps/editor/src/PositionInspector.tsx`, `AdministrativePanel.tsx`: diagnostika bodu a správa zdrojových verzí. `draft-store.ts` spravuje IndexedDB a kompatibilní zálohu.
- `tests/editor.spec.ts`, `tests/administrative.spec.ts`, `tests/prague-editor.spec.ts`: funkční scénáře v reálném Chromiu, včetně migrace a zachování vlastních dat.

GeoJSON používá **[longitude, latitude]**, volitelně třetí výškovou souřadnici. Turf počítá vzdálenost velké kružnice na kouli s poloměrem 6 371 008,8 m (nikoli elipsoidální geodézii). Metrický kruh je aproximován 128 úseky; každý vrchol leží v požadované geodetické vzdálenosti od středu. Vrcholy jsou stabilní bez ohledu na zoom. `pointInArea` používá celý polygon včetně otvorů a všech částí, nikoli obdélník nebo centroid. Vnější hranice a hranice otvoru se započítává do plochy, vnitřek otvoru se nezapočítává. Tato iterace neřeší geometrii přes datovou hranici ±180°; projekt je zaměřený na Prahu.

## Testy

Testy POI ověřují přesné tři ARP body, Matching/Measuring v metrech, deterministické shody, konkávní parky, otvory i MultiPolygony, zachování revizí při změně a zmizení zdroje, přesun bodu, skutečný union a bezeztrátový JSON/GeoJSON přenos. Originální ZIP lze ověřit příkazem `PARKS_ZIP=/cesta/MPP_CUR_MPP_100_PARKY_P.zip npm test` a stejnou proměnnou při `npm run test:e2e`; testy bez ní tento samostatný audit výslovně přeskočí. GEOS ve workeru je součástí sestavení a nepotřebuje CDN ani server. [Licence knihovny](docs/THIRD_PARTY.md). Test publikace chrání letiště a odmítá nezdokumentované licence; E2E prochází celé ovládání včetně reloadu a přetažení bodu.

Testy výchozí oblasti ověřují přesnou shodu se sjednocením všech 57 částí, kontrolní součty, MultiPolygon s otvory, první otevření bez cache, pořadí úložišť, blokaci autosave během načítání/chyby, zachování vlastní i smazané oblasti, obnovu s potvrzením a PID/zóny bez ručního vytvoření hranice.

```sh
npm test
npm run lint
npm run typecheck
npm run build
# Jednorázově, pokud systémový Chromium není k dispozici:
npx playwright install chromium
npm run test:e2e
# Povinná kontrola skutečných přibalených zdrojů před nasazením:
npm run data:check
npm run pid:check
```

Playwright lokálně použije `/usr/bin/chromium`, pokud existuje; jinak svůj nainstalovaný prohlížeč. CI instaluje odpovídající Chromium přes `npx playwright install --with-deps chromium`. `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e` testuje již sestavený `dist/site`, jinak se artefakt sestaví automaticky. Vlastní cestu nastavíte přes `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Testy nepoužívají skutečný API klíč a nekontrolují dostupnost živého podkladu. Selhání dlaždic je simulováno; dostupnost živých Mapy.com dlaždic se musí ověřit s vlastním omezeným klíčem.

Regresní scénáře s přesnými počty historických zastávek, stanovišti Anděla a plochou sjednocených zón explicitně načítají neměnný ověřený snapshot z 20. 8. 2026. Nezávisí na aktuálním obsahu větve `pid-data`; produkční editor dál dostává novější publikaci. CI hlásí chyby Playwrightu i v anotacích GitHub Checks, vedle archivovaných stop a logů.

## GitHub Pages

1. V repozitáři nastavte **Settings → Pages → Source: GitHub Actions**.
2. Do **Settings → Secrets and variables → Actions** přidejte secret `VITE_MAPY_API_KEY` s veřejným klientským klíčem, omezeným na svůj web Pages (a příslušnou cestu, pokud omezení poskytovatele cesty podporuje).
3. Workflow **Test and deploy game, editor and simulator to GitHub Pages** se spustí po každém pushi do `main`; lze jej spustit také ručně v záložce Actions přes **Run workflow**.
4. Workflow ověří lint, jednotkové testy, administrativní data (`data:check`), převezme publikaci z `pid-data` (`pid:stage`), ověří ji (`pid:check`), ověří herní release při buildu, spustí všechny E2E testy proti témuž artefaktu a po jejich úspěchu nasadí `dist/site` (veřejná aplikace v kořeni, editor v `editor/`, simulátor v `simulator/`). Selhání E2E blokuje nasazení a ukládá diagnostiku jako dočasný Actions artefakt. Nestahuje GTFS ani jiné živé zdroje PID. Pokud větev ještě neexistuje, použije označený historický bootstrap. Chybu přístupu k existující větvi neobchází návratem ke starým datům. Chybějící nebo chybné hranice nasazení zastaví. Relativní Vite `base: './'` podporuje cesty `/JetLagPrague/`, `/JetLagPrague/editor/` a `/JetLagPrague/simulator/`. Pro vlastní doménu upravte povolené referery klíče.

Bez secretu se build úmyslně nezastaví: editor zobrazí stav chybějícího klíče. Pro funkční podklad musí být klíč doplněn při buildu nebo v Nastavení mapy.

## Administrativní vrstvy a ověřování polohy

Po úspěšném načtení statického katalogu se chybějící zdrojové vrstvy přidají k draftu. Začínají skryté, každou zapnete zvlášť checkboxem. Vyberte vrstvu vlevo a konkrétní oblast v seznamu nebo kliknutím na její polygon; oblast se zvýrazní a vpravo uvidíte název, oficiální kód, geometrii a původ dat. **Městská část a katastrální území jsou vždy dvě samostatné vrstvy.**

Režim **Ověřit polohu** vytvoří samostatný přetahovatelný špendlík. Vpravo se průběžně zobrazuje zeměpisná šířka a délka, pořadí souřadnic pro GeoJSON, vztah k herní oblasti a příslušnost k oběma administrativním vrstvám. Špendlík se neukládá mezi vlastní objekty ani do exportu. Vyhodnocení je nezávislé na viditelnosti vrstev a nepoužívá GPS zařízení.

Pravidlo hranic: při shodě s více územími (společná hranice nebo překryv) se vrací **nejednoznačné / nelze jednoznačně určit** se všemi kódy; nikdy se svévolně nevybere první polygon. Jediné území na vnějším obvodu má stav `boundary`. U herní oblasti se hranice započítává dovnitř. Vnitřek otvoru je mimo, hranice otvoru se započítává. Mimo kompletní známou vrstvu je výsledek „mimo pokrytí vrstvy“; chybějící či nepoužitelná data jsou „nelze určit“. Při klasifikaci se použijí všechny části a otvory, nikoli bounding box. Neprovádí se přichytávání bodu k nejbližší oblasti ani umělé vyplňování mezer v datech.

Spravované zdroje mají neměnnou identitu `praha-municipal` / `praha-cadastral`; objekty používají `datasetId:oficiálníKód`. Geometrie a názvy zdrojových objektů jsou jen pro čtení, aby ruční kreslení nezměnilo autoritativní data. Barva a viditelnost zůstávají nastavitelné. Zdroj eviduje poskytovatele, oficiální URL, licenci a její URL, datum dat (nebo explicitně neznámé), čas stažení, verzi, pole oficiálního kódu, počet území, postup zpracování a SHA-256.

**Správa zdrojů** umožní porovnat přibalenou verzi nebo načíst nový administrativní balíček. Zobrazí nové, změněné, odebrané a nezměněné objekty. Až po kliknutí na **Použít tuto verzi zdroje** se nahradí pouze daná zdrojová vrstva. Vlastní vrstvy a herní hranice zůstávají stejné; barva a viditelnost původní zdrojové vrstvy se zachová. Nová přibalená verze nikdy automaticky nepřepíše již přijatý zdroj. Změnu lze vrátit pomocí Zpět.

## Příprava skutečných zdrojových dat

Dodaný soubor městských částí obsahuje 57 MultiPolygonů, stabilní kód `kod_mc`, název `nazev_mc` a poskytovatele `poskyt = HMP-IPR`. Evidovaný [katalog IPR Praha](https://data.gov.cz/dataset?iri=https://data.gov.cz/zdroj/datov%C3%A9-sady/70883858/f197f73c3094eb6291e61da50a03893d) popisuje požadovanou sadu. Nejde o 22 správních obvodů.

Katastry obsahují 112 polygonů, kód `kod_ku`, název `naz_ku` a ve všech záznamech `kod_obec = 554782`. Příprava tento filtr znovu kontroluje. Uživatel doložil [katalogový záznam ČSÚ](https://data.gov.cz/datov%C3%A1-sada?iri=https%3A%2F%2Fdata.gov.cz%2Fzdroj%2Fdatov%C3%A9-sady%2F00025593%2F952c52a45f233de3121e801b3fc33b81). Pole `platiod` a `neplatipo` je platnost jednotlivého záznamu, nikoli datum vydání celé sady.

Původní soubory se nemění. Metadata uvádějí neměnný GitHub odkaz na vstupní commit a SHA-256 původního souboru; přípravný skript změnu surového vstupu bez aktualizace metadat odmítne. Katalogové údaje o licenci a platnosti zatím nebyly nezávisle ověřeny u poskytovatele. Geometrická validace a kontrolní součet toto ověření nenahrazují.

Vstup přípravy je GeoJSON ve WGS84 / RFC 7946 a JSON metadat podle `sourceDatasetSchema` bez `checksum` a `featureCount`. Je nutné uvést ověřené `id`, `provider`, `sourceUrl`, `license: {name, url}`, `dataDate`, `retrievedAt`, `version`, `codeField`, `processing`. Do `processing` zaznamenejte případnou transformaci CRS a filtr. Nedoložená licence má výslovně uvedený stav v názvu a `url: null`; neznámé datum má `dataDate: null`. Datum stažení není automaticky vydáváno za datum platnosti dat. Při jiném CRS proveďte doloženou transformaci standardním GIS nástrojem; přípravný skript vstup s nevyřešenou deklarací CRS odmítne. Známou deklaraci `urn:ogc:def:crs:OGC:1.3:CRS84` odstraní bez změny souřadnic, protože už přesně znamená WGS84 [délka, šířka]. Nezaokrouhluje ani nezjednodušuje vrcholy.

```sh
# Opakovatelná příprava obou dodaných souborů s evidovanými metadaty:
npm run data:bundle
# Po změně městských částí výslovně přepočítat a commitnout výchozí GeoJSON:
npm run data:default-area
npm run data:check
# Pro novou vstupní distribuci lze použít samostatnou přípravu:
npm run data:prepare -- --input /cesta/oficialni.geojson --metadata /cesta/overena-metadata.json --code-field OFICIALNI_KOD --name-field OFICIALNI_NAZEV
# Volitelný přesný atributový filtr pro celostátní vstup:
# --filter-field POLE_KODU_OBCE --filter-value 554782
npm run data:check
```

Názvy polí v příkazu nahraďte skutečnými názvy atributů daného oficiálního zdroje. Výstup tvoří `apps/editor/public/administrative/municipal.json`, `cadastral.json` a až po přípravě obou validovaných sad také `index.json`. Aplikace stahuje jen tyto statické soubory ze svého hostingu; při běžném otevření nekontaktuje poskytovatele geodat. Manifest balíčku má `format: jetlag-praha-administrative`, `schemaVersion: 1`, `dataset` a `features` ve společném modelu `GeoFeature`. SHA-256 je vypočten nad kanonizovanými ID, názvy, atributy a celou geometrií, ne nad mapovým obrázkem. Kontrolní součet chrání integritu, neprokazuje původ ani oprávnění k užití; původ a licenci ověřte zvlášť.

`npm run data:check` i automatické testy nad přibalenými daty ověřují reálná místa Anděl (Praha 5 / Smíchov), Karlínské náměstí (Praha 8 / Karlín), Letenské náměstí (Praha 7 / Holešovice) a náměstí Míru (Praha 2 / Vinohrady). **Bez skutečných souborů skončí chybou.** Úspěšné jednotkové a integrační testy se syntetickými útvary tuto kontrolu nenahrazují. Letná je místní název, nikoli samostatné katastrální území.

## Omezení dat a iterace 02

Datum platnosti celé sady a její licence nejsou v dodaných souborech doložené; UI je ukazuje jako neznámé. Autoritativní aktuálnost nebyla nezávisle potvrzena na serverech poskytovatelů. Katastrální vrcholy mají v dodaném souboru nižší počet desetinných míst než městské části; jejich přesnost se uměle nedoplňuje. Hraniční linie obou různých zdrojů proto nelze považovat za numericky totožné. Mezery ani překryvy se automaticky neopravují a těsná místa hranic mohou být nejednoznačná. Souřadnice se nezaokrouhlují ani nezjednodušují; nejde o právně závaznou evidenci hranic.

Validace skutečných 169 geometrií a všech čtyř pražských referenčních bodů prošla. Při opakované práci se už ověřené geometrie používají jako neměnné objekty, aby každá úprava vlastností znovu neověřovala všech téměř 100 tisíc vrcholů. Po obnovení stránky proběhne validace uloženého draftu znovu. Pro plnou sadu je určená IndexedDB; pokud ji prohlížeč zakáže a localStorage nemá dost místa, editor oznámí neuložené změny a je potřeba použít export.

PID je implementované podle návodu výše; přibalená časově nesourodá data zůstávají výslovně označená k revizi. Další POI kategorie mimo současný katalog, úplný katalog schválených otázek, multiplayer a obecné GIS union/difference/clipping v editoru zůstávají odložené. Testovací simulátor a publikování neměnných herních release jsou dostupné podle návodů výše. GeoJSON export editoru zůstává draftem. Kreslení nové oddělené části vlastního MultiPolygonu nemá samostatný nástroj; podporuje se import, úprava vrcholů a validovaný editor GeoJSON. Souběžná editace více kartami není podporovaná.


## Karetní balíček simulátoru

Nové partie ve [webovém simulátoru](https://wondrej89.github.io/JetLagPrague/simulator/) používají verzovaný balíček **100 karet: 55 časových bonusů, 21 powerupů, 24 prokletí**. Při založení zvolte Small / Medium / Large; volba je po celou partii pevná. Všechna prokletí mají původní anglický text z tabulky dodané správcem, český překlad, cenu a samostatné stavy účinků. Duplicate kopíruje libovolnou kartu; Move stojí ostatní ruku, oznámí dosavadní zastávku a během nejvýše 20 minut zastaví hledače i započítávání času schovaného. Doba a skutečná GPS cíle se ověřují v jádře.

Karty, hody, nabídky, čekající ověření, časovače, průběžné povinnosti, penalizace i soukromé foto/video přílohy přežijí reload a vlastní export/import. Staré hry `prague-mvp-test-v1` zůstávají beze změny ve stavu verze 1; nová konfigurace používá verzi 2. Simulátor stále běží pouze v prohlížeči a neposkytuje autoritativní multiplayer. Diagnostické přidání karty a pracovní scénáře jsou jasně označené.

Fyzické úkoly a obsah médií potvrzují hráči; aplikace nepředstírá rozpoznávání mostů, budov či zvířat z GPS. Chybějící pravidlo délky šibenice, neúplné původní znění Randomize, výslovná otázková blokace Bird Guide a automatické ověřování zahraničních kuchyní či návazných odjezdů jsou popsané v [pravidlech a omezeních](docs/GAME_MVP.md). Thermometer, Tentacles a další herní mechaniky se tímto rozšířením nemění.
