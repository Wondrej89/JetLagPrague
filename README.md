# Jet Lag Praha · geografický editor

První vertikální řez fáze A podle [implementačního zadání](CODEX_UKOL_01_EDITOR.md). Český desktopový editor vlastních geodat; neobsahuje herní otázky, simulátor ani multiplayer.

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

1. Vyberte vrstvu **Herní oblast** a nástroj **Polygon**. Klikáním přidávejte vrcholy, uzavřete prvním vrcholem. Hranice je jeden Polygon nebo MultiPolygon; další samostatné části lze importovat jako MultiPolygon nebo vložit přes editor GeoJSON souřadnic.
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
- **Export zálohy**: JSON obsahuje manifest (schéma 1, datum, zdroje, souřadnicový systém a jednotky) a celý `WorldDraft`, včetně prázdných vrstev, ID a atributů.
- **Exportovat GeoJSON**: standardní FeatureCollection s geometriemi a rozšiřujícími poli `manifest`, `world`, `layers` a vlastnostmi `_jetlag`. Pro bezeztrátovou obnovu použijte **Kompletní svět JSON / GeoJSON**. Běžný GIS může vlastní metadata při úpravách odstranit; obyčejný import vrstvy pak není obnovou celého světa.
- Import je atomický: chybný objekt odmítne celý soubor. UI limit je 10 MB, 10 000 objektů na vrstvu, 200 vrstev. Reálný výkon závisí na počtu vrcholů. Větší soubory nejprve zjednodušte/rozdělte mimo editor.
- Po každé potvrzené změně se validovaný draft ukládá do `localStorage` pod `jetlag-praha:world:v1`. Chyba kapacity nebo přístupu je oznámena; proveďte export. Poškozený uložený záznam se automaticky nepřepisuje. Po importu zálohy lze výslovně povolit jeho nahrazení.

**Úložiště prohlížeče není týmová ani cloudová databáze.** Je vázané na origin a prohlížeč, může být smazáno a více otevřených oken se nesynchronizuje. Pro souběžnou editaci používejte pouze jednu kartu. Pravidelně exportujte soubory. Prázdná herní hranice je přípustný rozpracovaný stav s viditelným upozorněním.

## Architektura a výpočty

- `apps/editor/src/App.tsx`: vrstvy, vlastnosti, import/export, historie a lokální ukládání.
- `apps/editor/src/MapCanvas.tsx`: adaptér Leaflet + Geoman Free, Mapy.com podklad a kreslicí nástroje. Poskytovatel podkladu neovlivňuje datový kontrakt.
- `packages/geo-core/src/index.ts`: sdílené typy `WorldDraft`, `GeoLayer`, `GeoFeature`, Zod validace a služby `importGeoJson`, `exportWorld`, `distanceMeters`, `makeMetricCircle`, `pointInArea`, `addHole`, `saveDraft`, `loadDraft`. Jádro nepoužívá DOM ani mapový klíč; lze je později využít na serveru. Druh vrstvy počítá s oddělenými městskými částmi, katastry, dopravou a POI, bez současné implementace těchto modulů.
- `tests/editor.spec.ts`: funkční scénáře v reálném Chromiu.

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
```

Playwright použije `/usr/bin/chromium`, pokud existuje; jinak svůj nainstalovaný prohlížeč. Vlastní cestu nastavíte přes `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. Testy nepoužívají skutečný API klíč a nekontrolují dostupnost živého podkladu. Selhání dlaždic je simulováno; dostupnost živých Mapy.com dlaždic se musí ověřit s vlastním omezeným klíčem.

## GitHub Pages

1. V repozitáři nastavte **Settings → Pages → Source: GitHub Actions**.
2. Do **Settings → Secrets and variables → Actions** přidejte secret `VITE_MAPY_API_KEY` s veřejným klientským klíčem, omezeným na svůj web Pages (a příslušnou cestu, pokud omezení poskytovatele cesty podporuje).
3. Workflow **Deploy editor to GitHub Pages** se spustí po každém pushi do `main`; lze jej spustit také ručně v záložce Actions přes **Run workflow**.
4. Workflow ověří lint, testy a build a nasadí `dist`. Relativní Vite `base: './'` podporuje cestu `/JetLagPrague/` bez změny aplikace. Pro vlastní doménu upravte povolené referery klíče.

Bez secretu se build úmyslně nezastaví: editor zobrazí stav chybějícího klíče. Pro funkční podklad musí být klíč doplněn při buildu nebo v Nastavení mapy.

## Hranice první iterace

Zatím není automatický import PID/POI/hranic, jejich schvalování, GIS union/difference/clipping, publikování neměnných release balíčků a kontrolních součtů, audit uživatelů, editor otázek, simulátor, backend ani multiplayer. Exporty jsou výslovně **draft**, nikoli herní release. Kreslení nové oddělené části MultiPolygonu nemá samostatný nástroj; funguje jeho import, úprava vrcholů a validovaný editor GeoJSON souřadnic. Není implementovaná spolupráce více karet ani IndexedDB pro velké datové sady. Rozhraní se skládá i na úzké obrazovce, hlavní práce je určená pro desktop.

Další malý úkol ke schválení: import jedné otevřené vrstvy městských částí a samostatné vrstvy katastrálních území s evidencí zdroje a diagnostikou bodu v každé vrstvě. Tato funkce zatím není implementovaná.
