# Jet Lag Praha · geografický editor

Český desktopový editor geodat podle [specifikace](JETLAG_PRAHA_SPEC.md) a [první iterace](CODEX_UKOL_01_EDITOR.md). Iterace 02 přidává administrativní vrstvy; iterace 03 doplňuje veřejnou dopravu PID a úkrytové zóny. [Iterace 03B](CODEX_UKOL_03B_GTFS.md) používá aktuální obsluhu z GTFS a ruční serverovou publikaci.

Iterace 02 používá dodané soubory `data/raw/mestskecasti.geojson` (**57 městských částí**) a `data/raw/katastralni-uzemi-praha.geojson` (**112 katastrálních území Prahy**). Zachovává všechny souřadnice a atributy, podporuje samostatné zobrazení vrstev, zvýraznění území, přesouvatelný testovací bod a kontrolovanou aktualizaci zdrojů. Mapy.com poskytuje pouze mapový podklad.

Původ je zaznamenán v `data/source-metadata/`: městské části mají v dodaných datech poskytovatele HMP-IPR a katalogový odkaz IPR, katalogový odkaz ČSÚ pro katastry doložil uživatel. **Licence a datum platnosti celé sady nejsou v dodaných souborech uvedeny a zůstávají výslovně nedoložené.** Datum převzetí do repozitáře se za datum platnosti nevydává. MIT licence kódu automaticky neurčuje licenci zdrojových geodat.

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

Vlevo v **Herní území a pokrytí** stiskněte **Použít celé území Prahy**. Předvolba skutečně sjednotí všech 57 načtených městských částí a odstraní jejich vnitřní hranice. Zachová přesné vnější souřadnice, otvory i případné nesouvislé části; nevytváří obdélník ani konvexní obálku. Existující herní hranice se nahradí po potvrzení, vlastní objekty zůstanou zachované a změnu lze vrátit přes **Zpět**. Uložená hranice obsahuje původ, verzi, kontrolní součet a oficiální kódy podkladů. Aktualizace administrativních dat ji automaticky nezmění; nové hranice lze převzít opětovným použitím předvolby.

Předvolba při použití zapne **Pouze PID v herní oblasti**. Přepínač lze použít také s vlastní nakreslenou oblastí. Zastávky se vybírají podle referenčního bodu uvnitř nebo na hranici, linky podle skutečného dotyku či průniku celé trasy s plochou včetně otvorů a MultiPolygonů. Zachová se celá protínající linka včetně úseků mimo Prahu; samotný překryv bounding boxů nestačí. Chybějící bod se neodhaduje a bez definované oblasti je výsledek neurčitý. Při dalším otevření se obnoví uložená volba filtru, včetně vypnutí.

**Zobrazit všechny úkrytové zóny** zobrazí sjednocení kruhů kolem všech nevyloučených zastávek s bodem uvnitř oblasti, oříznuté herní hranicí. Výchozí poloměr je **400 m**, jeho změna v pravidlech přepočítá plochu. Vrstva je nezávislá na hledání, dopravních filtrech, výřezu mapy i zobrazení jednotlivých zastávek. Překryvy se počítají jednou, mezery zůstávají prázdné. Souhrn ukazuje počty a plochu; zastávky k revizi jsou zahrnuté do výslovně označeného geometrického náhledu, vyloučené a neurčené body se nezahrnují.

V přibaleném referenčním snapshotu vychází **1 431 zastávek a 404 linek** v Praze a přibližně **314,25 km²** spojených 400m zón. Jde o výsledek dodané verze dat, nikoli garantované dnešní pokrytí. Všech 1 431 zastávek této nekonzistentní verze vyžaduje revizi. Kruhy mají 128 geodetických úseků (odchylka obvodu přibližně 0,12 m při 400 m); rozhodnutí o konkrétním úkrytu nadále používá přímo vzdálenost v metrech. Výpočet sjednocení běží v samostatném workeru a změna vstupů zruší starý výpočet.

## Spuštění

Node.js **22.12+** (ověřeno na 24.19), npm a moderní prohlížeč.

```sh
npm ci
cp .env.example .env.local
# Do .env.local doplňte VITE_MAPY_API_KEY.
npm run dev
```

Příkazy spouštějte z kořene repozitáře. Na strojích s nedostupnou výchozí npm cache lze použít `npm ci --cache /tmp/jetlag-npm-cache`. Pro produkční výstup spusťte `npm run build`; vznikne `dist/`. `npm run preview` jej umožní lokálně ověřit.

## Mapy.com a klíč

V [portálu Mapy.com](https://developer.mapy.com/account/) vytvořte **klientský** klíč. Povolte pouze potřebnou službu mapových dlaždic a omezte HTTP referery na vývojový a produkční web. Vložte jej do ignorovaného `.env.local` jako `VITE_MAPY_API_KEY=…`; po změně restartujte Vite. V **Nastavení mapy** lze klíč zadat i do paměti aktuální stránky, bez trvalého uložení.

Klíč není součástí Git repozitáře, lokálního draftu ani exportu. Klientský klíč je ovšem viditelný v sestaveném JavaScriptu a síťových požadavcích. Nepoužívejte administrační/serverový klíč. Build se zabudovaným klíčem nezveřejňujte bez správných omezení jeho použití.

Editor používá dokumentovaný endpoint `https://api.mapy.com/v1/maptiles/basic/256/{z}/{x}/{y}?apikey=…`, povinné logo s odkazem na Mapy.com a copyright s odkazem na poskytovatele. Chybějící klíč nevyvolává dotazy na dlaždice. Při selhání načítání se zobrazí doporučení ověřit klíč, referer, službu, limit a síť; chyba není zaměněna za prázdnou mapu. Editor neprovádí geokódování, sběr POI ani stahování databáze objektů z Mapy.com.

Před veřejným nasazením ověřte vhodnost **Basic tarifu** nebo písemné povolení kombinace podkladu s vlastními geodaty; nepředpokládejte automaticky podmínky Extended. V omezeném cloudovém prostředí musí síť dovolovat `api.mapy.com` pro dlaždice a logo. Bez platného klíče nebo přístupu k API zůstane mapová plocha bez podkladu, s výslovným hlášením. Neexistuje náhradní podklad ani smyšlená geografická data.

Dokumentace poskytovatele: [dlaždice a atribuce](https://github.com/mapycom/developer/blob/master/docs/rest-api/map-tiles.md), [podmínky](https://developer.mapy.com/terms-and-conditions/).

## Práce s editorem

1. Použijte **Použít celé území Prahy**, nebo vyberte vrstvu **Herní oblast** a nástroj **Polygon**. Klikáním přidávejte vrcholy, uzavřete prvním vrcholem. Hranice je jeden Polygon nebo MultiPolygon; další samostatné části lze importovat jako MultiPolygon nebo vložit přes editor GeoJSON souřadnic.
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
- `packages/geo-core/src/index.ts`: sdílené typy `WorldDraft`, `GeoLayer`, `GeoFeature`, Zod validace a služby `importGeoJson`, `exportWorld`, `distanceMeters`, `makeMetricCircle`, `pointInArea`, `addHole`, `saveDraft`, `loadDraft`. Jádro nepoužívá DOM ani mapový klíč; lze je později využít na serveru. Verze 2 přidává zdrojová metadata vrstvy; volitelné `gameStops` zachovává oddělená pravidla, propojení a ruční výjimky iterace 03. POI zůstávají rezervované.
- `packages/geo-core/src/administrative.ts`: stabilní oficiální identity, SHA-256, porovnání verzí, bezpečná aktualizace a klasifikace bodu.
- `apps/editor/src/PositionInspector.tsx`, `AdministrativePanel.tsx`: diagnostika bodu a správa zdrojových verzí. `draft-store.ts` spravuje IndexedDB a kompatibilní zálohu.
- `tests/editor.spec.ts`, `tests/administrative.spec.ts`, `tests/prague-editor.spec.ts`: funkční scénáře v reálném Chromiu, včetně migrace a zachování vlastních dat.

GeoJSON používá **[longitude, latitude]**, volitelně třetí výškovou souřadnici. Turf počítá vzdálenost velké kružnice na kouli s poloměrem 6 371 008,8 m (nikoli elipsoidální geodézii). Metrický kruh je aproximován 128 úseky; každý vrchol leží v požadované geodetické vzdálenosti od středu. Vrcholy jsou stabilní bez ohledu na zoom. `pointInArea` používá celý polygon včetně otvorů a všech částí, nikoli obdélník nebo centroid. Vnější hranice a hranice otvoru se započítává do plochy, vnitřek otvoru se nezapočítává. Tato iterace neřeší geometrii přes datovou hranici ±180°; projekt je zaměřený na Prahu.

## Testy

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

Playwright použije `/usr/bin/chromium`, pokud existuje; jinak svůj nainstalovaný prohlížeč. Vlastní cestu nastavíte přes `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Testy nepoužívají skutečný API klíč a nekontrolují dostupnost živého podkladu. Selhání dlaždic je simulováno; dostupnost živých Mapy.com dlaždic se musí ověřit s vlastním omezeným klíčem.

## GitHub Pages

1. V repozitáři nastavte **Settings → Pages → Source: GitHub Actions**.
2. Do **Settings → Secrets and variables → Actions** přidejte secret `VITE_MAPY_API_KEY` s veřejným klientským klíčem, omezeným na svůj web Pages (a příslušnou cestu, pokud omezení poskytovatele cesty podporuje).
3. Workflow **Deploy editor to GitHub Pages** se spustí po každém pushi do `main`; lze jej spustit také ručně v záložce Actions přes **Run workflow**.
4. Workflow ověří lint, jednotkové testy, administrativní data (`data:check`), převezme publikaci z `pid-data` (`pid:stage`), ověří ji (`pid:check`), provede build a nasadí `dist`. Nestahuje GTFS ani jiné živé zdroje PID. Pokud větev ještě neexistuje, použije označený historický bootstrap. Chybu přístupu k existující větvi neobchází návratem ke starým datům. Chybějící nebo chybné hranice nasazení zastaví. Relativní Vite `base: './'` podporuje cestu `/JetLagPrague/` bez změny aplikace. Pro vlastní doménu upravte povolené referery klíče.

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

PID je implementované podle návodu výše; přibalená časově nesourodá data zůstávají výslovně označená k revizi. POI, otázky, simulátor hráčů, multiplayer, obecné GIS union/difference/clipping v editoru a publikování neměnných herních release zůstávají odložené. Export je stále draft. Kreslení nové oddělené části vlastního MultiPolygonu nemá samostatný nástroj; podporuje se import, úprava vrcholů a validovaný editor GeoJSON. Souběžná editace více kartami není podporovaná.
