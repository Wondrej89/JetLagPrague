# PID: data, pravidla a aktualizace iterace 03

Editor zobrazuje skutečné zdrojové zastávky a trasy, nabízí vlastní pravidla zastávek a ověřuje polohu bez GPS zařízení. Mapy.com dodává pouze dlaždice. Žádné zastávky, linky ani POI se z Mapy.com nezískávají.

## Použití

Vlevo v **Veřejná doprava PID** zapněte **Zobrazit zastávky PID**. Vyhledejte jméno a vyberte zastávku v seznamu nebo přímo v mapě. Jeden symbol představuje jednu herní zastávku. Přepínače sedmi druhů dopravy jsou nezávislé, denní/noční filtr i filtr dominantního druhu mají vlastní volbu. Dopravní filtry mění zobrazení; nepřepočítávají herní prioritu podle toho, co právě skrýváte. Seznam omezuje počet řádků na 60; mapa používá všechny odpovídající zastávky v zobrazeném výřezu.

Vlastnosti ukazují aktivní druhy, prioritu, počty relevantních/aktivních/všech stanovišť, automatický a výsledný referenční bod, metodu a datum snapshotu. **Zobrazit zdrojová stanoviště** zahrnuje i zachované body bez doložené aktivní obsluhy; ty nevstupují do středu ani seznamu aktivních herních zastávek. Souřadnice obou zdrojů jsou dostupné zvlášť. Konečné se nevyřazují podle chybějícího odjezdu; je zachované i doložené `exitOnly` stanoviště Anděla.

**Trasy linek · sedmidenní podoba** umožní zapnout trasy podle stejných přepínačů dopravy, vyhledat číslo, vybrat linku a skrýt ostatní. Barva vychází ze zdrojového `route_color`. Varianty mají různé dny platnosti: zobrazená sedmidenní geometrie není tvrzení, že všechny části jezdí ve stejný den. Trasy nevytvářejí úkryty.

Výchozí poloměr **400 m** změníte v **Pravidla úkrytu**. Ve vlastnostech zastávky zapněte úkrytovou zónu a nástrojem **Ověřit polohu** položte testovací špendlík. Přetahování průběžně mění vzdálenost, vztah k poloměru, herní oblasti a výsledek povolenosti. Špendlík ani vybraná zastávka se neukládají do draftu. Editor nečte polohu zařízení.

## Referenční bod a výjimky

Pevná priorita je vlak → metro → tramvaj → autobus/trolejbus. Při souběhu autobusu a trolejbusu přispějí obě skupiny stejně prioritních stanovišť, jedno fyzické stanoviště pouze jednou; stabilní dominantní označení společné třídy je `bus`. Střed je aritmetický průměr příslušných aktivních stanovišť. Smíšený průměr skupiny `avgLon/avgLat` se jako střed metra nepoužívá. Dodaná data nemají samostatně doložený reprezentativní bod stanice, proto i vlaky používají průměr relevantních bodů; správce jej může odůvodněně změnit.

V **Referenční bod a ruční rozhodnutí** lze referenční značku přetáhnout nebo zadat obě souřadnice. Návrh se nejprve zobrazuje jako neschválený a jeho povolenost je „nelze určit“. Zadejte zdůvodnění a zvolte **Schválit ruční úpravu**. Lze také výslovně povolit/vyloučit zastávku a vrátit se k automatickému bodu. Ruční bod má přednost, zdrojové souřadnice se nepřepisují.

Přívoz a lanovka nejsou členy pevné hierarchie. Jednodruhová zastávka může zobrazit referenční průměr k revizi, ale pro hru vyžaduje výslovné povolení. Kombinovaný uzel s těmito druhy potřebuje také výslovnou volbu dopravy. Nejednoznačný uzel bez zvoleného středu nemá odhadnutý mapový bod; je dostupný v seznamu k rozhodnutí.

**Propojit nebo oddělit zdrojové skupiny** umožňuje vyhledat další uzly, vybrat skupiny, pojmenovat uzel a uložit odůvodnění. Automatické slučování podle názvu, blízkosti nebo samotného ASW uzlu se neprovádí. Odpojení vrátí zdrojové skupiny do samostatných herních zastávek. Výjimky zaniklých herních identit zůstávají uložené a ve správě PID jsou označené jako osiřelé. Ruční uzly bez platné vazby lze otevřít ze seznamu revizí.

Ruční úpravy jsou v `WorldDraft.gameStops`, oddělené od zdrojové databáze. Identita a skladba skupin/stanovišť a aktivní druhy tvoří podpis schválení. Změna podpisu ponechá výjimku uloženou, ale její bod nebo povolení nepoužije bez revize. Vyloučení zůstává konzervativně vyloučené. Starý bod k revizi lze výslovně převzít do nového návrhu. Ruční schválení bodu nemůže odstranit globální problém nekonzistentních zdrojových dat.

## Zdroje a skutečná omezení dodané trojice

Oficiální zdroje:

- https://data.pid.cz/geodata/Zastavky_WGS84.json
- https://data.pid.cz/stops/json/stops.json
- https://data.pid.cz/geodata/Linky_7d_WGS84.json
- Dokumentace: https://pid.cz/o-systemu/opendata/

Dodaná trojice obsahuje **16 118 aktivních bodů**, **8 526 skupin / 17 229 fyzických stanovišť** a **1 297 variant tras / 853 ID linek**. Zdrojová geometrie linek má **1 101 102 souřadnicových vrcholů**, které se zachovají. **15 910** aktivních bodů lze přiřadit fyzickému stanovišti; **208** nemá jednoznačnou vazbu a není odhadnutých. Z toho vzniká **8 066** herních zastávek s doloženou obsluhou ve zdrojovém období. Nejde pouze o území Prahy: PID zahrnuje i regionální zastávky.

Zásadní omezení: `Zastavky_WGS84.json` deklaruje **2026-08-20**, linky **2026-08-20 až 2026-08-26**, ale `stops.json.generatedAt` je **2026-10-15T03:52:54**. Aktuální skupiny navíc mají některé jiné souřadnice nebo stanoviště. Takto smíšená data nelze označit za dnešní ověřenou obsluhu. Bootstrap snapshot proto má stav `review`: editor může ukázat body, trasy, geografický průměr i skutečný průnik zóny, ale povolenost úkrytu vrací **„nelze určit“**. Aktuální validní denní aktualizace může tuto referenční verzi nahradit.

Licence ani čas původního stažení dodaných souborů nejsou doložené; `license` a `downloadedAt` jsou `null`, čas přípravy je samostatné `preparedAt`. Nezaměňují se za platnost zdroje. U živého stažení se zaznamená skutečný čas převzetí. `generatedAt` ve zdroji nemá časový offset; adaptér porovnává jeho explicitní kalendářní datum, nepředstírá přesnější časovou informaci. Podrobné atributy a kontrolní součty jsou v [inspekci zdrojů](../data/source-metadata/pid-source-audit.md).

## Denní aktualizace a GitHub Pages

První otevření v pražském kalendářním dni zkusí načíst všechny tři oficiální URL. Jejich úplné stažení, kontrola schémat, vztahů, souřadnic, platností a SHA-256 běží ve workeru. Nová automatická verze musí odpovídat dnešnímu datu v `Europe/Prague` a být konzistentní. Chyba kterékoli části nepřepíše stávající data.

Pokud prohlížeč přímé URL nemůže načíst například kvůli CORS, zkusí ověřený snapshot na stejném hostingu (`pid/index.json` a příslušný GZIP). Výsledek denního pokusu se uloží; další otevření téhož dne použije cache. **Doprava PID → Aktualizovat z URL** umožňuje vynucený nový pokus. Při selhání zůstává poslední funkční verze, její datum a konkrétní chyba. CORS živého serveru nebyl v tomto cloudovém prostředí ověřen, jeho přímý přístup blokuje síťová politika; automatická alternativa nevyžaduje backend ani nový API klíč.

Workflow Pages má denní běh v **04:30 UTC** (05:30/06:30 v Praze podle sezóny). Runner stáhne všechny tři zdroje a publikuje pouze ověřenou dnešní verzi. Když denní aktualizace selže, workflow nenasadí nic a předchozí web i snapshot zůstávají. Při nasazení změn kódu se navíc zachová dříve publikovaný validní snapshot, pokud nový živý zdroj selže; při prvním nasazení je k dispozici popsaný neověřený bootstrap. GitHub může plánované běhy opozdit nebo je po delší neaktivitě repozitáře vypnout; datum v editoru proto zůstává rozhodující informací.

`Doprava PID` také umožňuje export `.json.gz` snapshotu, načtení jiného validního `.json`/`.json.gz`, porovnání přidaných/změněných/odebraných skupin a explicitní přijetí. Porovnání zahrnuje i posun nižší prioritní stanoviště, který nezměnil výsledný střed. Ruční import staršího či neověřeného snapshotu je výslovná referenční volba s viditelným datem a stavem; není automatickou denní aktualizací.

## Úložiště, geometrie a rozšíření

Předvolba **Použít celé území Prahy** ukládá skutečné sjednocení 57 městských částí do existující herní vrstvy. Identita vrstvy a vlastní objekty zůstávají zachované. Původ hranice je v atributech objektu (`preset`, `datasetId`, `datasetVersion`, `datasetChecksum`, `codes`, `sourceUrl`, `license`, `dataDate`). Jde o uloženou definici hry: aktualizace PID ani administrativních podkladů ji automaticky nepřepíše. JSON/GeoJSON, IndexedDB a historie používají stávající schéma; starší drafty nepotřebují migraci.

**Pouze PID v herní oblasti** filtruje mapu, seznam zastávek i nabídku linek. Referenční bod na hranici patří dovnitř, vnitřek otvoru ven. Linka se zachová při libovolném průniku nebo dotyku některé své části s oblastí, včetně tečného či kolineárního dotyku hranice. Funguje také průjezd s oběma koncovými body mimo oblast. Geometrie celé vybrané linky zůstává zachovaná. Prostorový index hran pouze zrychluje výběr kandidátů; konečné rozhodnutí provádí test úseček a bodu v polygonu. Chybějící oblast nebo bod nikdy nevede k odhadu polohy.

**Zobrazit všechny úkrytové zóny** zobrazuje skutečný union všech kruhů s následným průnikem s herní oblastí. Používá všechny zastávky s aktivními stanovišti a určitelným referenčním bodem uvnitř nebo na hranici oblasti, vynechává ručně vyloučené. Zastávky ve stavu `review` jsou zahrnuté do barevně odlišeného a textově označeného geometrického náhledu. Souhrn uvádí zvlášť povolené, revidované, vyloučené, vnější a neurčitelné body; počet neurčitelných se vztahuje na celý snapshot, protože jejich příslušnost nelze určit. Plocha v km² se počítá ze sjednocené geometrie, překryvy kruhů se nesčítají opakovaně. Změna poloměru, herní hranice, referenčního bodu, vyloučení nebo snapshotu výsledek přepočítá. Hledání, zoom a přepínače dopravy tuto souhrnnou vrstvu nemění. Nejde o automatické schválení úkrytu; diagnostika konkrétního místa zachovává původní pravidla povolenosti.

- `packages/geo-core/src/pid-adapter.ts` je zdrojový adaptér, `pid-snapshot.ts` validuje neměnné verze a `game-stops.ts` obsahuje znovupoužitelná herní pravidla bez Leafletu nebo DOM.
- `packages/geo-core/src/territory.ts` obsahuje sjednocení území, prostorový výběr zastávek/tras a společnou úkrytovou plochu. `territory.worker.ts` provádí velká sjednocení odděleně od interaktivních dotazů PID; zrušení výpočtu worker ukončí. Výsledná vrstva používá samostatný neinteraktivní canvas pod vlastními objekty. Nevytváří tisíce editovatelných kruhů ve světě; po načtení se odvodí z uložené hranice, pravidel a aktuálního snapshotu.
- `apps/editor/src/pid.worker.ts` zajišťuje síť, rozbalování, validaci, SHA-256, IndexedDB, odvození zastávek a průnik zóny. Dlouhé síťové požadavky neblokují nezávislé dotazy do workeru. Mapa dostává malé přehledy, vybraná stanoviště a části tras v aktuálním výřezu.
- IndexedDB `jetlag-praha-pid` má oddělené `snapshots` a `state`; `current` se zapisuje ve stejné transakci jako celý snapshot. Databáze světa se při aktualizaci PID neotevírá. Starší přijaté verze zůstávají dostupné podle `SnapshotReference` (`id`, SHA-256, datum, adaptér), což připravuje budoucí uzamčení hry. Starší verze zatím nemají automatický úklid; při vyčerpání kvóty se aktualizace odmítne s viditelnou chybou.
- Kompletní JSON/GeoJSON světa zachovává pravidla, propojení a výjimky `gameStops`; starší drafty verzí 1/2 se dál načítají. Velká zdrojová data PID mají samostatný export snapshotu. Pro přenos přesné kombinace pravidel a dat uchovejte **obě** zálohy. Samotná volba zastávky nebo testovací špendlík není součástí exportu.
- Mapa kreslí PID na canvas a vybírá symboly pomocí indexu pixelových pozic. Zobrazení tras používá obálky jednotlivých částí pouze k výběru kandidátů pro vykreslení. Ve zdrojovém snapshotu zůstává celá geometrie; **žádná obálka se nepoužívá pro herní geografické rozhodnutí**. Vlastní polygony zůstávají klikatelné i při zapnutém PID.
- Zóna je jeden kruh s 128 geodetickými úseky, skutečně oříznutý Polygonem/MultiPolygonem herní oblasti včetně otvorů. Když průnik neexistuje nebo chybí oblast, editor to oznámí. Povolenost rozhoduje Turf vzdálenost velké kružnice v metrech a celý polygon, nikoli aproximovaný obvod. Přesně 400 m se započítává; numerická tolerance je 0,000001 m. Hranice herní oblasti včetně hranice otvoru se započítává, vnitřek otvoru se nezapočítává. Přesnost zdrojových souřadnic a kulový model jsou praktickým limitem; nejde o přesnost měření v mikrometrech ani elipsoidální geodézii.

Multiplayer, herní místnosti, hráčská GPS, otázky, chat, realtime odjezdy a navigace nejsou implementované. Budoucí server musí vybranou úkrytovou zastávku držet soukromě podle hráčské role; dnešní výběr je pouze lokální diagnostika správce.

## Příkazy a testy

```sh
npm run pid:inspect       # čte JSON, GZIP i ZIP původních zdrojů
npm run pid:bundle        # připraví referenční snapshot z data/raw/pid
npm run pid:check         # ověří publikaci a kontrolní součet
npm run pid:publish       # produkční pokus o živou denní aktualizaci
npm test
npm run test:e2e
```

Jednotkové testy zpracují skutečné dodané soubory a ověřují Anděl, oddělené skupiny hlavního nádraží, výstupní stanoviště, zachované body a vrcholy i odmítnutí nekompatibilních vstupů. Záměrně konzistentní testovací datum a syntetické scénáře jsou takto označené. E2E ověřuje skutečný snapshot s revizí, ruční přesun, zónu, testovací pin, selhání aktualizace, export/porovnání/obnovu a zachování vlastních dat. Samostatný syntetický ověřený snapshot dovoluje testovat 399/401 m, noční filtr a revizi po změně stanoviště bez tvrzení, že dodaná historická data jsou aktuální.
