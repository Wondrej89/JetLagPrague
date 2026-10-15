# Jet Lag Praha — specifikace produktu a architektury

**Stav:** návrh zadání v1.0 (15. 10. 2026)  
**Typ projektu:** webový editor a simulátor herního světa, následně mobilní PWA hra pro 2–4 hráče  
**Územní zaměření:** Praha (nikoli univerzální aplikace pro libovolné město)

## 1. Cíl a hranice projektu

Vytvořit specializovanou pražskou variantu terénní hry inspirované *Jet Lag: The Game – Hide and Seek*. Nejprve připravit **editor herních dat**, který vytvoří kontrolovaný, verzovaný geografický model Prahy („zdroj pravdy“). Následně **editor otázek a simulátor**, kde se ověřuje jejich jednoznačnost a vyváženost. Až potom **mobilní multiplayerovou PWA**, která bude nad stejnými daty a výpočetní logikou řídit reálnou hru.

Projekt **není** univerzální generátor her pro všechny lokality. Nemá vytvářet chat, systém posílání fotografií, veřejnou sociální síť ani navigaci od bodu k bodu. Externí fotografické důkazy si hráči pošlou jinou aplikací; hra zaznamená pouze stav vyřízení požadavku.

### Klíčové principy

1. Jednoznačná pravidla: každá strojově ověřitelná otázka má přesně určený algoritmus, data a jednotky.
2. Editor je autoritativní: pro každé muzeum, zoo, park a stanici platí pouze objekty výslovně obsažené v publikovaném herním datovém balíčku.
3. Trvalé ruční úpravy: import dat nikdy nesmí tiše obnovit vyřazený POI nebo přepsat ručně upravený objekt.
4. Neměnná verze pro každou partii: probíhající hra je navázána na konkrétní publikovanou verzi dat **i** pravidel.
5. Důsledné role a soukromí: skutečná poloha schovávače není nikdy dostupná hledačům ani v API, websocketových zprávách či skrytých datech klienta.
6. Mapy.com slouží jako mapový podklad; trvale ukládaná herní geodata pocházejí z licenčně vhodných otevřených zdrojů nebo z vlastních úprav.

## 2. Fáze a priority

| Fáze | Výsledek | Co není součástí |
|---|---|---|
| **A — Geografický editor (MVP)** | Herní hranice, vrstvy polygonů, zastávky/trasy, POI, ruční korekce, import/export a publikování dat | Multiplayer, karty a GPS monitoring |
| **B — Otázky a simulátor** | Knihovna otázek, konfigurace vzdáleností a kategorií, dva simulované body, vyhodnocení, test vyváženosti | Živá hra a skutečná poloha |
| **C — Multiplayer PWA** | Lobby 2–4 hráčů, tajná poloha schovávače, viditelné polohy hledačů, cyklus otázek, protikarty, částečná kontrola GPS | Chat, foto úložiště, absolutní ochrana proti spoofingu |
| **D — Herní vyvážení** | Statistiky, kalibrace otázek a náročnosti, export herních konfigurací | Další města |

## 3. Fáze A — geografický editor

### A1. Mapové rozhraní a rozsah území

- Hlavní podklad **Mapy.com REST API**, se správným logem/copyrightem a bezpečně konfigurovaným API klíčem. Podklad musí být vyměnitelný bez změny datového modelu.
- Ovládání: zapínání vrstev, přehled vrstev vlevo, vlastnosti vybraného objektu vpravo, nástrojová lišta kreslení, hledání vlastních objektů, legenda a měřítko.
- Definice jedné **herní oblasti**, která je `Polygon` nebo `MultiPolygon` (lze ručně nakreslit, importovat GeoJSON, případně převzít z otevřených hranic Prahy). Možnost výslovně vyloučených ploch (voda, nepřístupné oblasti, areály atd.).
- Editor musí umět přidat/upravit/smazat polygon, multipolygon a polygon s dírou, bod, linii, kruh definovaný středem a metrickým poloměrem; přesouvat vrcholy, vrátit změnu (undo/redo), převést na GeoJSON, importovat GeoJSON a validovat geometrie.
- Kružnice a buffery jsou **geodetické metrické vzdálenosti**, nikoli počet pixelů nebo kružnice v zeměpisných stupních. Zobrazení se může přibližovat, ale numerický výsledek v metrech musí být stabilní.
- Operace nad plochami: průnik, sjednocení, rozdíl, clipping na herní oblast, metricky vyjádřená plocha a vzdálenost. Výsledky umožnit uložit jako novou vrstvu.

### A2. Předpřipravené územní vrstvy

- Správní **městské části** (např. Praha 2, Praha 5); samostatně **katastrální území** (např. Karlín, Malá Strana). Nikdy nesměšovat městskou část, správní obvod a katastrální území.
- **Břeh Vltavy:** explicitní herní polygony (levý, pravý; ostrovy a samotné koryto jako samostatné/nezadané území podle rozhodnutých pravidel). Neodvozovat „levý/pravý“ pouze z jedné přímky ani od středového bodu řeky. Zobrazit orientaci po proudu.
- **Městské parky, zahrady, lesoparky a chráněná území** jako odlišné vrstvy. Odlišit veřejně přístupný park, zoologickou zahradu a chráněnou lokalitu, nepovažovat je automaticky za totéž.
- Jednotlivé vrstvy musí mít vlastní identifikátor, zdroj, datum platnosti, viditelnost, název a editovatelnou geometrii. Více vrstev může překrývat totéž území.
- Otázky typu „jsi ve stejné oblasti“ musí používat výslovně zvolenou vrstvu (městská část vs. katastrální území).

### A3. Doprava a zastávky

- Importovat a zobrazit **stanice, zastávky i trasy** PID; filtrování metro, tramvaj, trolejbus, autobus, vlak, přívoz, lanovka. Dále filtry denní/noční, pravidelné/dočasné, relevantní datum, aktivní/neaktivní a konkrétní linka.
- Preferovat otevřené geodatové sady PID GeoJSON (zastávky dle druhu dopravy a linky) pro snadný první import. Oficiální GTFS a soupis označníků poslouží tam, kde jsou nutné linky, stanoviště, kalendář platnosti či vztahy mezi zastávkami.
- Explicitně rozlišovat **zastávkový uzel / stanici / nástupiště / označník**. Stejný název nebo stejné souřadnice neznamenají automaticky totožný objekt. Pro herní zóny definovat referenční bod či sadu bodů každého schváleného uzlu.
- Deduplikace při importu dle stabilních zdrojových identifikátorů a geometrie, nikoli pouze názvu. Nezařazovat pomocné průjezdní body jako stanice ani zastávky, kde ve vybraném období žádný relevantní spoj nezastavuje.
- Zobrazení kružnic okolo jedné, skupiny nebo všech filtrovaných zastávek, s editovatelným poloměrem (např. 250 m). Umět hromadné sjednocení a clipping na herní hranice, výpočet plošného pokrytí.
- Nastavit **definici legálního úkrytu**: např. maximální přímá vzdálenost od nejbližší schválené zastávky vybraného typu; povolené vrstvy dopravy, výjimky a metrický poloměr. Tyto volby nejsou pevně zakódované.
- Import musí ukládat datum zdroje a umožnit přepnout mezi schváleným snapshotem a novými kandidátními daty.

### A4. Správa bodů zájmu (POI)

- Konfigurovatelné herní kategorie: zoo / zoopark; golf / minigolf; muzeum; letiště; nemocnice; zábavní park; sportoviště; kostely; vodní plochy; parky a další dle editoru.
- Každá kategorie má: `id`, název, definici inkluze a exkluze, požadovaný typ geometrie (bod / areál), případně podkategorie a příslušné otázky.
- Importovat kandidáty z **otevřených licenčně kompatibilních zdrojů**. Mapy.com geokódování lze používat pro interaktivní orientaci v souladu s API podmínkami, **nikoli jako zdroj pro hromadně ukládanou či exportovanou vlastní POI databázi** bez odpovídajícího svolení.
- Každý kandidát má stavy `pending`, `approved`, `rejected`, `needs_review`. Hlavní herní mapa a vyhodnocování používají jen `approved`.
- Správce může záznam přidat ručně, potvrdit, vyřadit, změnit kategorii, upravit souřadnice/polygon, spojit duplicity, poznamenat důvod a zobrazit odkaz na zdroj.
- **Rozhodnutí o vyřazení se pamatuje mezi importy.** Nový zdrojový záznam nesmí automaticky přebít ruční override. Pokud objekt změní pozici/název nebo zmizí, nabídnout přehled změn k ruční revizi, nikoli tichou změnu platné herní mapy.
- Např. „zoo“ neobsahuje obchody s potřebami pro zvířata; zahrnutí zooparku je samostatné, editovatelné pravidlo. U minigolfu se má explicitně rozhodnout, zda patří do společné kategorie s golfem.
- Otázky k plochám musí měřit **nejkratší vzdálenost k hranici areálu** (ne k náhodnému středu), není-li u otázky výslovně vybrána definice přes referenční bod.

### A5. Aktualizace a publikování

- Umožnit opakovaný import ze stejného zdroje, porovnání `nové / změněné / odebrané / beze změny` a schválení aktualizace.
- Každý edit/ruční override má auditní záznam (uživatel, čas, původní a nová hodnota).
- Rozlišovat **rozpracovanou verzi (draft)** a **publikovanou verzi (release)** geografického světa. Publikovaná verze je neměnná; aktualizace vytvoří novou verzi.
- Exportovat/načíst kompletní přenosný datový balíček: GeoJSON geometrie, tabulky objektů a konfigurace, manifest se zdroji, časem sestavení, schématem a číslem verze. Validace a kontrolní součet.
- Zachovat data nezávislá na mapovém poskytovateli. Pro editor MVP stačí uložení v prohlížeči pro rozpracované změny a export/import balíčku; cloudová databáze přijde až pro multiplay.

## 4. Fáze B — editor herních otázek a simulátor

### B1. Knihovna otázek

Inspirace kategoriemi **Matching, Measuring, Radar, Thermometer, Photo, Tentacles**; pražská verze smí kategorie měnit, vyřazovat a vytvářet vlastní. Nejde o automatický import všech původních otázek.

Každá definice otázky zahrnuje:
- jedinečné `question_id`, kategorii, český název, textovou šablonu a popis;
- příznak `enabled`, verzi definice, případně podmínky dostupnosti;
- metodu vyhodnocení (`point_in_polygon`, `same_area`, `distance_lte`, `same_nearest_poi`, `compare_distances`, `thermometer`, `manual_confirmation` aj.);
- parametry (vrstvy, poloměry v metrech, přesnost a toleranci, počet metrů/cestu, filtr POI/dopravy);
- režim odpovědi `automatic`, `manual`, `hybrid` a její povolené typy (ano/ne, kategorie, tepleji/chladněji, ručně potvrzeno, nelze odpovědět);
- dobu na odpověď, odměnu schovávače/karty, opakovatelnost, limity a použitelné protikarty;
- srozumitelný příklad s očekávaným výsledkem.

**Výchozí pražské kandidáty:** stejné katastrální území / městská část / břeh Vltavy; nejbližší stanice metra či tramvajová zastávka; radar s kalibrovanými poloměry; vzdálenost k nejbližší zoo, muzeu, parku, řece či nemocnici; nacházíš se v parku / chráněné lokalitě; thermometer; žádost o externě poslanou fotografii.

**Pozor na význam:** „jsi do 1 km ode mě“ je vzdálenost polohy schovávače od referenční polohy konkrétního hledače v okamžiku odeslání otázky, nikoli vzdálenost k jeho úkrytové zóně. „Stejné katastrální území“ vyžaduje jednoznačný výsledek prostorové klasifikace obou poloh. Otázka „jaká je nejbližší zoo“ musí mít pravidlo pro shodné vzdálenosti a rozlehlé areály.

### B2. Simulace

- Na mapu umístit **schovávače (H)** a **hledače (S1, S2, S3)** (aktivních podle počtu hráčů), přesouvat body přetažením a zadat souřadnice ručně.
- Vybrat otázku ze schválené knihovny, její parametry a položit ji. Vypočítat odpověď, zobrazit postup: referenční polohy, použité objekty, vzdálenosti, hraniční geometrii a dataset verzi.
- Výsledek přepínat na mapové omezení („území stále možné“), pokud jej otázka umí spolehlivě vyjádřit. Kombinovat omezení operacemi průnik/rozdíl; umožnit reset a historii.
- Simulovat `veto`, ruční odpověď a později další protikarty. Pravidla protikaret nesmějí být natvrdo zakódována v jedné otázce.
- U thermometeru vybrat **výchozí a koncovou** polohu konkrétního hledače, vypočítat rozdíl vzdáleností k H a ověřit požadovanou skutečnou dráhu/čas. Rozhodnutí hotter/colder je dáno změnou vzdálenosti, nikoli jen směrem telefonu; chování při nezměněné vzdálenosti a GPS toleranci musí být explicitní.
- Diagnostika: jakékoli chybějící údaje nebo geometrii zobrazit jako **nelze automaticky vyhodnotit**, nikdy nespekulovat.

### B3. Vyvážení a kalibrace

- Editor má umět vygenerovat vzorky možných legálních úkrytů a simulovat otázky z různých poloh hledačů.
- Statistiky: podíl území vyloučený odpovědí ano/ne, podíl odpovědí každého typu, počet POI v kategorii, pokrytí zastávek a počet legálních úkrytů; zvažovat plochu i dostupnost zastávek.
- Poloměry 250 m / 500 m / 1 km / 2 km / 3 km jsou **testovací kandidáti**, ne automaticky schválená pravidla; finální otázky zvolit po vyhodnocení pražského měřítka.
- Kalibrace se provádí na draftu a výsledek se publikuje společně s definicemi otázek.

## 5. Fáze C — mobilní hra

### C1. Herní místnost a role

- Host vytvoří neveřejnou místnost s krátkým kódem / pozvánkou; 2–4 účastníci, jeden je schovávač a 1–3 hledači. Host vybere publikovaný datový balíček a sadu pravidel.
- Stavový automat: `lobby → hide_phase → seek_phase → found / timeout / abandoned → summary`. Host může hru pozastavit, zrušit a řešit spor.
- Hledači mohou podle konfigurace vidět sebe a ostatní hledače, schovávač vidí polohy hledačů. Hledači nevidí aktuální ani historickou tajnou polohu schovávače, dokud hra neskončí nebo ji hra autorizovaně neodhalí.
- Volba úkrytu: schovávač potvrdí své úkrytové místo / referenční stanici, server ověří geometrii a případné GPS důkazy. Rozlišit `hiding_anchor` (zvolené místo/zóna) a `current_position` (aktuální fix); otázky jasně definují, která poloha se používá.
- Přihlášení do konkrétní hry může být jednoduché přes jméno/přezdívku a ověřenou pozvánku; není nutná registrace do globální sociální sítě.

### C2. Poloha a omezení podvádění

- Mobilní zařízení nabízí GPS polohu s časem, deklarovanou přesností a souhlasem účastníka. Zpracovávat jen při aktivní hře, informovat, koho systém sleduje a kdy.
- Server je jediným autoritativním místem pro geolokační rozhodnutí. Nevěřit klientem poslaným odpovědím, rychlostem ani souřadnicím bez validace.
- Minimální kontrola: stáří fixu, přesnost, skoky/nereálná rychlost, ztráta signálu, viditelný stav „poloha nejistá“, možnost moderovaného řešení. GPS lze falšovat; aplikace **nezaručuje nemožnost podvádění**.
- Telefon v metru či tunelu může mít výpadek přesné polohy. Vyhodnocení při neplatném fixu pozastavit/vyžádat aktuální polohu nebo označit k ručnímu ověření.
- Živá lokace se nepoužije mimo probíhající hru; nastavit rozumnou frekvenci aktualizací a mazání polohové historie po zvoleném retenčním období.

### C3. Tok otázky a protikaret

1. Hledač vybere dostupnou otázku a odešle žádost; server uzamkne okamžik, pozici hledače a platná pravidla.
2. Server spočítá návrh odpovědi (nebo nastaví ruční režim). Návrh se ukáže **jen schovávači**, nikoli hledačům.
3. Schovávač odpověď potvrdí, použije povolenou protikartu, nebo označí ruční úkol jako splněný (např. „fotka odeslána mimo aplikaci“).
4. Server ověří oprávnění, účinek karty, čas a stav; teprve potom rozešle hledačům povolený finální výsledek.
5. Karty/odměny se přidělí podle explicitních pravidel; vše se zaznamená v herním logu a odpověď nelze vyřídit dvakrát.

- `Veto` má samostatnou konfigurovatelnou akci a stav „otázka zrušena“; nemá být interpretováno jako „ne“.
- `Randomize` a jiné protikarty musí mít **předem definovaný a auditovatelný účinek pro kompatibilní druhy otázek**. Pokud význam není schválen, nejde kartu povolit.
- Fotografie, hovory a chat zůstávají mimo aplikaci. Herní záznam obsahuje jen potvrzení splnění/nesplnění úkolu, čas a případně použitou protikartu.

## 6. Výpočetní pravidla a hraniční situace

1. Veškeré vzdálenosti uvedené na kartách jsou **vzdušnou čarou po povrchu Země** v metrech, není-li otázka výslovně o cestě/trase. Žádný výpočet se nesmí odvozovat jen z pixelů mapy.
2. `distance <= threshold`: hranice kružnice se započítá; zavést jednotnou malou numerickou toleranci a odděleně pravidlo pro nejistotu GPS.
3. Bod uvnitř polygonu nebo na jeho hranici má předem deklarovaný výsledek; pro správní oblasti (kde se hranice dotýkají) zavést deterministické zacházení s polohou přesně na hranici, včetně případného `ambiguous`.
4. Polygon může mít díry a více oddělených částí; není dovoleno místo celé geometrie použít bounding box nebo centroid.
5. Nejednoznačné nejbližší POI vyřešit pravidlem deterministického pořadí nebo označením nerozhodně; ne losováním.
6. Zákaz započítat objekt mimo herní oblast, není-li v definici otázky explicitně uvedeno jinak.
7. Všechny algoritmy vyhodnocování, které mají běžet v editoru i na serveru, musejí sdílet testy a sémantiku; produkční odpověď je serverová.
8. Bez dat / s nedostatečnou polohou = chybový nebo neurčitý stav, nikoliv automatické ano či ne.

### B4. Příklad strojově definovaných otázek (ilustrativní, parametry zatím nejsou schválené)

```json
[
  {
    "id": "radar-1000m",
    "category": "radar",
    "label": "Jsi do 1 km ode mě?",
    "evaluator": "distance_lte",
    "params": {"reference": "asking_seeker_at_ask_time", "target": "hider_current_position", "radius_m": 1000},
    "answerMode": "automatic",
    "allowedAnswers": ["yes", "no", "unknown"],
    "enabled": true
  },
  {
    "id": "same-cadastral-area",
    "category": "matching",
    "label": "Jsme ve stejném katastrálním území?",
    "evaluator": "same_area",
    "params": {"layerId": "cadastral_areas", "reference": "asking_seeker_at_ask_time", "target": "hider_current_position"},
    "answerMode": "automatic",
    "allowedAnswers": ["yes", "no", "unknown"],
    "enabled": true
  },
  {
    "id": "photo-visible-building",
    "category": "photo",
    "label": "Pošli mimo aplikaci fotografii budovy podle pravidel karty",
    "evaluator": "manual_confirmation",
    "params": {"evidenceChannel": "external"},
    "answerMode": "manual",
    "allowedAnswers": ["sent_externally", "cannot_answer"],
    "enabled": true
  }
]
```

Schéma se postupně rozšíří o ceny, odměny, časové limity, kompatibilní protikarty, opakovatelnost a jejich přesně specifikované účinky. Smyslem příkladu je ukázat oddělení **datově popsané otázky** a opakovaně použitelného **vyhodnocovacího algoritmu**.

## 7. Návrh datového modelu

| Entita | Základní atributy |
|---|---|
| `WorldRelease` | `id`, `version`, `game_area`, `created_at`, `source_manifest`, `checksum`, `status` |
| `GeoLayer` | `id`, `world_id`, `type`, `title`, `geometry_type`, `source`, `visibility`, `enabled` |
| `GeoFeature` | `id`, `layer_id`, `source_id`, `name`, `geometry`, `attributes`, `source_version` |
| `PoiCategory` | `id`, `name`, `definition`, `geometry_semantics`, `default_enabled` |
| `PoiDecision` | `source_id_or_fingerprint`, `category_id`, `status`, `override_geometry`, `reason`, `updated_at` |
| `TransitStop` | `id`, `source_id`, `station_group_id`, `name`, `modes[]`, `is_night`, `valid_from/to`, `geometry`, `approved` |
| `TransitRoute` | `id`, `source_id`, `mode`, `line_name`, `geometry`, `valid_from/to` |
| `QuestionDefinition` | `id`, `version`, `category`, `text`, `evaluator`, `params`, `answer_mode`, `enabled`, `reward`, `countercards` |
| `RuleSetRelease` | `id`, `version`, `world_release_id`, `questions[]`, `hide_rules`, `card_rules` |
| `GameSession` | `id`, `world_release_id`, `rules_release_id`, `state`, `player_ids`, `created_at` |
| `Player` | `id`, `game_id`, `role`, `display_name`, `permissions` |
| `PositionFix` | `game_id`, `player_id`, `lat`, `lon`, `accuracy_m`, `timestamp`, `validation_state` |
| `QuestionInstance` | `game_id`, `question_id`, `asker_id`, `asked_at`, `reference_fix`, `status`, `proposed_answer`, `final_answer`, `countercard_id` |
| `GameEvent` | `game_id`, `sequence`, `type`, `actor_id`, `timestamp`, `public_payload`, `private_payload` |

Interně používat WGS84 (GeoJSON `[longitude, latitude]`), jasně oddělit zeměpisnou polohu od geometrie v metrech; importované CRS před validací převést.

## 8. Technické řešení (doporučení, nikoli podmínka zadání)

- **Frontend editoru:** Vite + React + TypeScript; Leaflet nebo MapLibre s Mapy.com REST dlaždicemi; kreslicí nástroj a panel vrstev.
- **Geografické výpočty pro MVP:** Turf.js / robustní GIS knihovna, centrálně ve `geo-core` s jednotkovými testy. Pro větší objemy polygonů validovat výkon a přesnost; pokud bude potřeba serverové zpracování, PostGIS.
- **Struktura repozitáře:** `apps/editor`, `apps/game` (později), `packages/geo-core`, `packages/rules-core`, `data/source-metadata`, `data/curated`, `docs`.
- **Pro fázi A:** statický hosting například GitHub Pages, lokální rozpracovaná data + explicitní export/import datového balíčku. Kdo editoval publikované zdrojové soubory v repozitáři, mění je přes commit; editor nevyžaduje vlastní backend.
- **Pro fázi C:** autoritativní server s bezpečně řízenými relacemi, autentizací a per-role filtrací. Možnosti např. Node/TS API + PostgreSQL/PostGIS nebo jiná technologie splňující bezpečnostní požadavky. Pouhé GitHub Pages pro multiplayer nestačí.
- **Sdílené balíčky a validace:** otázky a geometrii definovat ve verzovaných JSON schématech; TypeScript typy a migrace; automatické testy.
- **Mapy.com tarif:** podmínky zvýhodněného Extended tarifu omezují kombinování mapových dat s jinými zdroji; protože projekt kombinuje mapový podklad s vlastními geodaty, před nasazením ověřit vhodnost **Basic tarifu** či získat písemné upřesnění od provozovatele. V žádném případě nepočítat automaticky s podmínkami Extended tarifu.
- **API klíč Mapy.com:** nepřidávat do git repozitáře; použít vhodný klientský klíč s restrikcí HTTP referer a povolených API služeb; administrační či serverové klíče jen na serveru. Při použití Mapy.com zobrazit požadované logo a copyright.

## 9. Akceptační kritéria po fázích

### A — Geografický editor (povinná definice hotovo)

- Na mapě nad funkčním Mapy.com podkladem lze nakreslit a uložit herní polygon včetně díry; po obnovení stránky jej lze znovu načíst z exportu.
- Import GeoJSON vytvoří pojmenovanou vrstvu a zobrazí její počet objektů, zdroj a validační chyby.
- Kliknutí na libovolný bod Prahy vrátí správně **městskou část** i samostatně **katastrální území** z příslušných polygonů, pokud jsou importovány.
- Lze filtrovat metro/tramvaj/autobus atd. a zobrazit metricky správný 250m buffer pouze kolem schválených zastávek.
- Lze vytvořit kategorii „zoo“, ručně vyloučit chovatelský obchod a ověřit, že se po opakovaném importu sám nevrátí.
- Rozpracovaná verze se dá publikovat jako neměnný, opětovně importovatelný balíček.
- Nejsou hardcoded reálná POI ani zastávky jako náhrada zdrojových dat; neexistuje tichý fallback na smyšlená data.

### B — Otázky a simulátor

- Lze definovat a změnit radar 1 km, otázku „stejné katastrální území“, „stejný břeh“ a otázku na nejbližší schválenou zoo.
- Dva posunovatelné špendlíky a tlačítko „Položit otázku“ vrátí konkrétní odpověď a ukáže proč.
- Při chybějících datech simulátor vrátí `unknown`/`needs_review`, ne odhad.
- Změna konfigurace otázky nezmění již publikovanou verzi pravidel.
- Automatické testy pokrývají hranice polygonu, rovnost vzdálenosti prahu a ignorování vyloučených POI.

### C — Mobilní hra

- 2–4 hráči se připojí k jedné hře; přesně jeden je schovávač.
- Hledač nikdy nezíská tajnou polohu schovávače z žádného klientského endpointu ani websocketové zprávy (ověřit automatickým rolovým testem).
- Automatická otázka čeká na schválení schovávačem nebo provedení legální protikarty; hledači uvidí jen finální povolený výsledek.
- Manuální foto-otázku lze vyřešit stavem „fotka odeslána“ bez přenosu obrazového souboru.
- Hra má jasné chování při zastaralé/nepřesné GPS poloze a zaznamenává původ rozhodnutí.
- Existující partie používá stále stejné verze dat a otázek, i když v editoru vznikne nový release.

## 10. Otevřená designová rozhodnutí před definitivním schválením pravidel

1. **Geografie:** celá administrativní Praha, nebo pouze vybraná oblast (např. vnitřní Praha)? Editor musí podporovat obojí.
2. **Legální úkryt:** od kterých zastávek a do jaké vzdálenosti? Mají platit noční, dočasné a školní autobusové zastávky?
3. **Stanice:** jeden herní uzel, nebo každý jednotlivý označník? U přestupních uzlů, jako Anděl či Můstek, je rozdíl zásadní.
4. **Poloha pro odpovědi:** aktuální poloha schovávače nebo pevně zvolené místo v úkrytové zóně? U každé otázky definovat samostatně.
5. **Řeka a ostrovy:** jak klasifikovat ostrovy a hranice Vltavy, případně oblasti mimo její bezprostřední okolí?
6. **GPS:** toleranční limity a chování v metru/tunelu.
7. **Karty:** přesný výčet protikaret a jejich účinků, časové bonusy a podmínky opakování otázek.
8. **Dostupnost:** pro PWA nutné řešit background throttling iOS/Android; nelze předpokládat nepřetržité přesné sledování po minimalizaci.

Žádné z těchto rozhodnutí nesmí blokovat první část editoru: musí být konfigurovatelné a jejich výchozí hodnoty lze určit později.

## 11. Zdroje a licenční pravidla

- Mapy.com REST API: https://developer.mapy.com/rest-api-mapy-cz/ a podmínky https://developer.mapy.com/terms-and-conditions/ — použít jako podklad; nepřejímat hromadně a trvale výsledky POI hledání bez ověření oprávnění. Uvádět povinné logo a copyright.
- Otevřená data PID: https://pid.cz/o-systemu/opendata/ — GTFS, denní seznam zastávek, geodata dle druhu dopravy a trasy; zkontrolovat konkrétní licenci a uvést zdroj.
- Národní katalog otevřených dat: https://data.gov.cz/ — vyhledání distribucí GeoJSON pro linky/zastávky PID a dalších dat.
- Geoportál Praha: https://geoportalpraha.cz/ — městské části, místní hranice, otevřená data.
- ČÚZK / RÚIAN: https://cuzk.gov.cz/ — autoritativní katastrální hranice a územní identifikace.
- Referenční pravidla (inspirace, ne převzetí bez adaptace): https://jetlag.denull.ru/en/rules/ a https://rules.jetlagthegame.com/expansion/.

## 12. Co se v této fázi NEMÁ implementovat

Nezačínat autentizací, multiplayerem, sledováním GPS, chatem, nahráváním fotografií, integrací plateb ani kompletním balíčkem karet. První milník musí být spolehlivý geografický editor s datovým modelem, perzistencí, importem/exportem a testovatelnou geometrií.
