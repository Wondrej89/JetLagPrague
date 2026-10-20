# Veřejná aplikace, editor a centrální publikace

## Co je implementováno v repozitáři

- Veřejný klient: https://wondrej89.github.io/JetLagPrague/ (`apps/game`). Editor: https://wondrej89.github.io/JetLagPrague/editor/ (`apps/editor`). Jde o samostatné Vite sestavy. Build veřejné aplikace odmítne import editoru, Geomanu, GEOS WASM, Shapefile a projekčních importérů. Sdílené geometrické validace zůstávají v `packages/geo-core`.
- Pracovní draft zůstává v IndexedDB `jetlag-praha-editor`, verze 1, store `drafts`, klíč `world`. Formát světa zůstává 2, starší JSON/GeoJSON a localStorage zůstávají kompatibilní. Veřejný klient toto úložiště vůbec neotvírá. Změna cesty na stejném originu databázi nestěhuje ani nemaže.
- Nový editor upozorní na přesun a nabídne úplnou zálohu. **Před prvními úpravami použijte Export zálohy a soubor uložte mimo prohlížeč.** Obnovíte jej přes Import → úplný svět; nahrazení vyžaduje potvrzení a lze je vrátit. Nemažte data webu, chcete-li zachovat rozpracovaný svět. Přechod na jiný origin nebo profil prohlížeče vyžaduje export/import.
- Panel **Publikace herních podkladů** sestaví návrh ve workeru, ověří jej a porovná s veřejně nasazenou verzí. Ukazuje počty, oblast, verze a licence zdrojů, přidané/změněné/odstraněné objekty i blokující chyby. Změna draftu nebo snapshotu po kontrole návrh zneplatní. Kontrola a zálohování fungují také bez publikačního serveru.
- `apps/publisher` obsahuje Cloudflare Worker s GitHub App autentizací, Durable Object koordinátorem, patnáctiminutovými relacemi, serverovým oprávněním a atomickým zápisem do GitHubu. **Worker ani přihlašovací údaje se při nasazení GitHub Pages nevytvářejí.** Bez nich panel zobrazuje „Publikace není nakonfigurována“ a zápis je zakázaný.
- Publikace vytváří pouze nový `data/releases/release-{SHA256}.json` a ukazatel `data/releases/current.json`. Neodesílá celý svět, původní GIS atributy, importní audit, poznámky nebo neodsouhlasené parky. Zdroje a licence sloučených částí parků zůstávají doložené veřejnými metadaty původu.
- Schválená verze obsahuje přesně tři pevné ARP letišť, schválené parky s vnitřními referenčními body, herní polygon, administrativní hranice a kompilované aktivní herní zastávky. Povolené prostředky, ruční slučování, vyloučení a referenční body se vyhodnotí před publikací. Zastávky mimo polygon nebo v jeho otvorech se vyloučí; společná hranice se zahrnuje. Úkrytové kruhy se počítají geograficky a ořezávají herním polygonem.

## Verze, integrita a oddělení PID

`GameDataRelease` se nově sestavuje ve schématu 4; čtečky nadále ověřují historická schémata 1, 2 a 3 bez změny jeho obsahu nebo hashů. Zoo a adresy vyžadují nejméně schéma 2; nemocnice vyžadují schéma 3. Nemocnice mohou mít adresu prázdnou nebo neuvedenou. Knihovny vyžadují schéma 4, adresu, oficiální URL a ověření pro konkrétní referenční bod. Obsahuje `kind`, `releaseId`, `publishedAt`, `data` (gameArea, administrativeAreas, pois, pidSnapshot, rulesConfig, sourceVersions) a SHA-256 každé části i celku. ID závisí na kanonickém obsahu a typu verze, nikoli na čase sestavení; seřazení záznamů je deterministické. Sestavení používá explicitní datum publikace: pozdější opakování se stejnými vstupy zachová katalog i ID, zatímco dnešní platnost PID se posuzuje samostatně. Ukazatel navíc kontroluje SHA-256 celého souboru včetně času publikace. Starší soubory se nepřepisují. Normální build pouze ověřuje a kopíruje už zaznamenané verze, žádný nový release negeneruje.

PID nadále publikuje samostatný workflow do větve `pid-data`; refresh PID nemění pracovní rozhodnutí ani statické herní release. Aktuální workflow se spouští **ručně**, plánované denní spouštění zůstává vypnuté podle předchozího nastavení. Samotná aktualizace PID nemění uzamčený herní release. Správce přijme nový snapshot v editoru, zkontroluje pravidla a výslovně publikuje nové podklady. Backend vyžaduje nejnovější ověřený snapshot z `pid-data` pro dnešní pražské datum; stará nebo revizní data pro ostrou hru odmítne.

Historický počáteční release z 18. 10. 2026 má **0 schválených parků, 3 letiště, 169 administrativních území a 1 465 referenčních zastávek v herní oblasti** ze snapshotu PID 2026-10-16. Jde o `kind: reference`, ne schválení dat pro dnešní hru. Schválení parků uložená pouze ve vašem prohlížeči nejsou přístupná automatickému buildu. Vaše rozhodnutí převezme první skutečná publikace z editoru. Licence/datum dodaných administrativních podkladů zůstávají výslovně nedoložené; toto vydání jejich stav nezastírá.

Veřejný klient ověří schéma, všechny hashe, geometrii, úplnost a odkazy. Selhání se zobrazí, data se nenahrazují odhadem ani draftem z prohlížeče. `loadGameDataRelease(base, fetch, releaseId)` umožňuje připnout konkrétní historickou verzi; chybějící ID se nenahradí aktuální verzí. Otevřená stránka automaticky nepřepíná release. Historická PID data nejsou v herních funkcích automaticky platná. Multiplayer, lobby a herní role zde zatím nejsou.

## Ruční aktivace: vaše přihlášení do GitHubu a Cloudflare

Následující kroky vyžadují přístup vlastníka účtů. **Žádné tokeny, klientské secrets ani privátní klíče neposílejte do chatu a neukládejte do Git repozitáře nebo `VITE_*`.**

1. V Cloudflare si zvolte účet pro Worker `jetlag-prague-publisher`. Lokálně v repozitáři spusťte `npm ci` a `npx wrangler login`. Pro větší geografické katalogy konfigurace počítá s CPU limitem 30 000 ms; zkontrolujte odpovídající plán Workers a jeho aktuální limity. Durable Object používá SQLite migraci `v1`. Případné `account_id` doplňte vlastní skutečnou hodnotou do `apps/publisher/wrangler.toml` nebo zvolte účet při nasazení.
2. První `npm run publisher:deploy` může nasadit dosud nenakonfigurovaný server. `/status` má vrátit `configured:false`, `/publish` nesmí přijmout zápis. Zapište si skutečnou HTTPS adresu Workeru. Nezapisujte smyšlenou ukázkovou adresu do produkce.
3. GitHub → Settings → Developer settings → **GitHub Apps → New GitHub App**. Homepage nastavte na URL editoru a **Callback URL** na `https://VAŠE-SKUTEČNÁ-ADRESA-WORKERU/auth/callback`. Zvolte autorizaci uživatelů pomocí GitHub App webového toku. Device flow a webhooks nejsou potřeba; webhook lze vypnout.
4. Nastavte **Repository permissions: Contents → Read and write; Actions → Read-only; Metadata → Read-only**. Žádná oprávnění organizace ani jiné zápisové pravomoci nejsou potřeba. App instalujte pouze pro vlastní účet a **Only select repositories → JetLagPrague**. Nevolte všechny repozitáře. App push spouští obvyklý Pages workflow; backend nepoužívá `GITHUB_TOKEN` Actions k rekurzivnímu spouštění workflow.
5. Zkopírujte skutečné **App ID**, **Client ID**, **Installation ID** do stejně pojmenovaných `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`, `GITHUB_INSTALLATION_ID` ve `[vars]` souboru `apps/publisher/wrangler.toml`. Installation ID zjistíte v URL nastavení konkrétní instalace App. Tyto identifikátory nejsou secrets. Vygenerujte Client secret a privátní RSA klíč GitHub App.
6. Secrets vložte bezpečně interaktivně příkazy:

   ```sh
   npx wrangler secret put GITHUB_CLIENT_SECRET --config apps/publisher/wrangler.toml
   npx wrangler secret put GITHUB_APP_PRIVATE_KEY --config apps/publisher/wrangler.toml
   ```

   Do druhého promptu vložte celý PEM včetně řádků BEGIN/END. Podporované jsou PKCS#1 a PKCS#8. Hodnoty nezapisujte do shellového příkazu, logu ani repozitáře. Pro místní ověřování lze použít ignorovaný `apps/publisher/.dev.vars`; produkční secrets patří do Cloudflare.

7. Konfigurace už obsahuje **ověřené numerické ID správce Wondrej89 `64984949`** a repozitáře **`1420367545`** (ověřeno přes GitHub API 18. 10. 2026), origin `https://wondrej89.github.io` a přesnou adresu editoru. Backend porovnává číselnou identitu, nikoli měnitelné jméno. Pokud oprávnění vědomě předáváte, změňte ID na skutečného správce. Cílový repozitář a datové cesty jsou pevně omezené v backendu a klient je nemůže dodat.
8. Znovu spusťte `npm run publisher:deploy`. Ověřte `/status` s `configured:true`; potvrzuje úplnost konfigurace, nikoli úspěšný přístup do GitHubu. V nastavení repozitáře **Settings → Secrets and variables → Actions → Variables** přidejte **repository variable `PUBLISHER_URL`** se skutečnou HTTPS adresou Workeru bez koncového lomítka. Není to secret. Pak znovu spusťte workflow **Deploy game and editor to GitHub Pages**. Existující secret `VITE_MAPY_API_KEY` zachovejte.
9. Otevřete editor, stáhněte plnou zálohu a zvolte **Publikace herních podkladů → Přihlásit přes GitHub**. Povolte popup pro přihlášení. Přihlaste se účtem správce a autorizujte App. Nesprávný účet musí dostat 403. Backend posílá `state`, S256 PKCE challenge a verifier, používá serverový client secret a jednorázové desetiminutové navázání pomocí Secure/HttpOnly/SameSite cookie. Skutečnou podporu GitHub App webového toku a konfiguraci callbacku je potřeba ověřit tímto živým testem; doposud proběhly pouze automatické testy proti řízeným odpovědím GitHubu.
10. Před první ostrou publikací spusťte v Actions ruční workflow pro PID GTFS, pokud neexistuje ověřený snapshot dnešního dne. V editoru přes Doprava PID přijměte aktuální publikovaný snapshot. Zkontrolujte schválené parky, jejich doložené licence, herní hranici, výjimky PID a povolené dopravní prostředky. Použijte **Zkontrolovat data k publikaci**, projděte souhrn a opravte blokující chyby. Pak potvrďte **Publikovat změny**.
11. Ověřte nový commit GitHub App v `main`, obsah pouze povolených datových souborů a úspěšný Pages workflow. Panel po přijetí commitu ukazuje **čekání na nasazení**, nikoli hotovou publikaci. Každých 20 s porovnává nasazený veřejný ukazatel s repozitářem a ukazuje chyby Actions odděleně. Úspěch ověřte shodou `releaseId` v panelu, veřejné aplikaci a `https://wondrej89.github.io/JetLagPrague/releases/current.json`. Zkontrolujte počty a integritu v čistém profilu prohlížeče. Otevřená starší stránka si ponechá svůj release do reloadu.
12. Ověřte také skutečné odmítnutí neoprávněného účtu, konflikt při souběžné změně a návrat na předchozí release. Teprve potom lze považovat živou centrální publikaci za uvedenou do provozu. Pokud branch protection vyžaduje PR nebo nepovoluje commity App, nastavte vědomě oprávnění podle své politiky; backend pravidla neobchází. App nemá právo upravovat workflow.

## Relace a provozní ochrany

GitHub přístupové tokeny a privátní klíč zůstávají na serveru. Prohlížeč dostává jen neprůhlednou aplikační relaci a CSRF token na 15 minut, v paměti otevřeného panelu. Reload/zavření panelu vyžaduje nové přihlášení. Nejde o GitHub token. Popup odpověď má CSP s nonce, přesný `postMessage` origin a editor kontroluje i zdrojové okno. Publikační API vyžaduje přesný Origin, Bearer relaci a CSRF token, kontroluje číselnou identitu při každé změně. Backend má IP limity, limit těla **16 MiB**, kontrolu struktury a checksumů, publikační zámek a časový úklid relací. Při překročení limitu zdroj rozdělte až v další revizi formátu; tuto verzi nelze obejít vypnutím kontrol.

App installation token je explicitně omezený na jedno repo a backend ověří vrácený seznam repozitářů. GitHub GraphQL `createCommitOnBranch` zapisuje nový release a ukazatel v jediném commitu a atomicky porovnává `expectedHeadOid`. Souběžná změna včetně přesunutí větve způsobí odmítnutí, nikdy force push. Totožný obsah již přítomný v historii se znovu nepublikuje; pro návrat použijte rollback. Žádný obecný endpoint pro cesty nebo repozitáře neexistuje.

Frontend čte pouze nasazené statické soubory. Build před vytvořením Pages artefaktu kontroluje všechny historické release. Upload a deployment závisejí na úspěšném buildu, takže neplatná verze nebo chyba testů předchozí nasazení nevymění. Git commit při pozdější chybě nasazení může být novější než veřejná stránka; panel tento rozdíl ukazuje. Obnovte úspěšný workflow nebo vraťte ukazatel. Větev `pid-data` a immutable release se nepřepisují navzájem.

## Návrat na předchozí publikaci

Po přihlášení v panelu zvolte **Návrat na předchozí publikaci**, vyberte zaznamenanou verzi a potvrďte. Server znovu ověří relaci, očekávaný commit i celý starý soubor a změní pouze `current.json`; žádný historický soubor ani soukromý draft nemaže. Počkejte na Pages a ověřte shodu ID. Návrat na starší PID se označí jako historická reference, nikoli jako dnešní oprávnění ke hře. Při neúspěšném buildu z důvodu jiného poškozeného historického souboru opravte jeho přesnou původní podobu podle Git historie; nepřepočítávejte checksum poškozených dat.

## Vývoj a ověření

```sh
npm run dev:game       # veřejný klient; také npm run dev
npm run dev:editor     # samostatný editor na vývojovém kořeni
npm run build:game     # dist/game
npm run build:editor   # dist/editor
npm run build          # dist/site + dist/site/editor; finální Pages artefakt
npm run release:check
npm run publisher:dev  # lokální Worker; bez secrets uzavřený
npm run lint
npm run typecheck
npm test
PARKS_ZIP=/tmp/MPP_CUR_MPP_100_PARKY_P.zip npm run test:e2e
```

E2E spouští editor a produkční artefakt pod `/JetLagPrague/` i `/JetLagPrague/editor/`. Ověřuje také zachování původní DB, plnou zálohu, bezpečně vypnuté publikování a chybné veřejné soubory. Backendové testy ověřují OAuth state/cookie/verifier, relace, číselné ID, CSRF/CORS, omezení cest, duplicity, konflikt, GitHub chybu, chybu deploymentu a rollback. **Tyto řízené testy nenahrazují reálný OAuth → GitHub App commit → Pages test po vaší konfiguraci.**

V omezeném cloudovém prostředí lze nástroje ověřit bez přihlášení: `XDG_CONFIG_HOME=/tmp/jetlag-cloudflare-config WRANGLER_SEND_METRICS=false npx wrangler deploy --config apps/publisher/wrangler.toml --dry-run`. To pouze sestaví Worker, nic nenasazuje. Npm cache může být `/tmp/jetlag-npm-cache`. Proxy ani důvěryhodné CA neměňte. `npm run release:bootstrap -- --pid-directory adresář/pid` slouží k výslovné přípravě první statické reference; běžná publikace používá panel a backend. Počáteční reference se negeneruje při běžném buildu znovu.

## Ověření v této iteraci (18. 10. 2026)

Prošly lint, TypeScript, obě produkční sestavy, kontrola administrativních dat, PID a herního katalogu. Jednotkové testy: **178 úspěšných**, 1 volitelný audit úplného živého GTFS feedu přeskočen (feed nebyl dodán); audit skutečného ZIPu IPR proběhl. Celá sada **37 E2E** v Chromiu prošla včetně původního editoru a zachování dat; závěrečné cílené testy znovu ověřily produkční publikaci, zachování DB a chování PID. Cloudflare bundle prošel `wrangler deploy --dry-run`; skutečný místní runtime ověřil `/status` 200 s `configured:false`, `/publish` 503 bez konfigurace a zakázaný origin 403. GitHub API, autentizace, chyby deploymentu a rollback se testovaly řízenými odpověďmi, bez skutečné GitHub App nebo Cloudflare účtu. Živý publikační tok tedy zůstává k aktivaci a ověření podle postupu výše.


## Zoo a aktualizace publikace (20. 10. 2026)

Nový neměnný release přidává deset schválených bodů zoo k existující schválené publikaci `ec2c0804b760…`. Všech 117 parků, tři letiště, herní oblast, administrativní hranice, pravidla a PID včetně jeho checksumu zůstávají přesně zachované. Aktualizace nezakládá nový pracovní svět a nezískává nové dopravní údaje. Další úpravy, vyloučení a ručně přidané zoo se sestavují z editoru a podléhají stejnému ověření správce a atomickému zápisu jako dosavadní POI.

Cloudflare Worker a Pages se nasazují odděleně. Stávající GitHub App ID, instalace, secrets, správce a observability se při této změně nepřepisují. Repo má připojený Cloudflare **Workers Builds: jetlag-prague-publisher**; po pushi ověřte jeho úspěch i Pages workflow. Pokud automatické sestavení není připojené, správce s již nastaveným účtem provede `npm run publisher:deploy`; nová App ani změna secrets nejsou potřeba. `/status` aktuálního Workeru obsahuje `releaseSchemaVersions: [1, 2, 3]`. Pokud editor tuto podporu neobdrží, publikování nových katalogů zůstává vypnuté s vysvětlením; po aktualizaci serveru panel znovu otevřete. Přihlášení, CSRF, limity, ochrany zdrojů a rollback zůstávají stejné.

Samostatný příkaz `npx tsx scripts/prepare-zoo-release.ts` slouží pouze k jednorázovému přidání schváleného výchozího katalogu k dosavadní neměnné historii. Pokud aktuální publikace již zoo obsahuje, odmítne je nahradit výchozími body. Běžný build jej nespouští. Změny po zavedení kategorie publikujte z editoru, aby se zachovala vaše rozhodnutí a nové vlastní body.


Ověření iterace zoo: lint, typecheck, produkční sestavy obou aplikací a 185 jednotkových testů prošly. Celá sada E2E má 39 úspěšných testů; dva audity původního parkového ZIPu se přeskočily, protože ZIP nebyl v prostředí k dispozici. Jednotkové audity úplného GTFS a původního parkového ZIPu byly rovněž přeskočené; syntetické geometrické, PID a importní testy proběhly. Worker byl ověřen sestavením `wrangler deploy --dry-run`. Přímý HTTPS přístup k produkčnímu Workeru blokuje síťová politika tohoto prostředí (CONNECT 403), proto zde nový živý OAuth tok nelze ověřit; při nasazení se kontrolují GitHub Pages a připojené Cloudflare Workers Builds. Toto omezení sítě se nevydává za chybu vaší GitHub App.

## Nemocnice a schéma 3 (20. 10. 2026)

Kategorie `hospital` vstupuje do téhož schváleného katalogu jako zoo. Nová publikace `2a63e4db546a…` přidává pouze deset schválených nemocnic k dosavadní verzi `3b0174b470be…`: veškeré zoo, 117 parků, tři letiště, Praha, pravidla a PID zůstávají beze změny. Publikuje se stabilní ID, název, případná adresa, bod a zdrojová metadata. Poznámky z draftu se neposílají. Prázdná adresa sv. Alžběty je záměrná.

Schémata 1 a 2 se nadále čtou a ověřují původními SHA-256, včetně rollbacku. Hospital nelze prohlásit za schéma 1 nebo 2. Worker oznamuje `[1, 2, 3]`, editor před publikací vyžaduje podporu 3. Stávající OAuth, GitHub App, CSRF, kontrola PID, očekávaného commitu, atomický zápis a omezení povolených cest se nemění. Automatické Workers Builds a Pages se kontrolují samostatně.

`npx tsx scripts/prepare-hospital-release.ts` slouží pouze k jednorázovému zavedení výchozích bodů do neměnné historie. Odmítne běh, pokud aktuální katalog již nemocnice obsahuje; běžný build jej nespouští. Pozdější změny patří do **Editor → Kontrola změn → Publikovat**, aby se zachovala ruční rozhodnutí. Příkaz nedatovává znovu starý PID ani nenahrazuje staré soubory.

Ověření nemocnic: lint, typecheck, produkční build obou aplikací, kontrola čtyř neměnných publikací a 192 jednotkových testů prošly. V celé sadě E2E prošlo 43 testů. Dva jednotkové audity vyžadující úplný GTFS a původní parkový ZIP a dva E2E audity původního ZIPu se přeskočily kvůli chybějícím vstupním archivům. Syntetické importy, opravy geometrií, parkové, zoo, PID i hospital testy běžely. Worker prošel sestavením `wrangler deploy --dry-run`; lokální workerd oznamuje `[1, 2, 3]` a bez konfigurace odmítá zápis. Skutečný nový OAuth tok zde nelze ověřit kvůli síťovému omezení produkčního Workeru uvedenému výše.

## Knihovny – schéma 4 a nedostupný zdroj

`library` je bodová kategorie s metadaty `library.officialUrl` a `library.verification` (bod, metoda, datum kontroly a URL). Server ověřuje shodu identity s oficiálním URL, shodu ověřených souřadnic s bodem a geometrií Point i všechny dosavadní kontrolní součty. Historická schémata 1–3 nelze označit za obsahující knihovny. `/status` aktuálního Workeru oznamuje `[1, 2, 3, 4]`; editor před publikací vyžaduje podporu 4. OAuth, CSRF, GitHub App, povolené cesty, ověření PID a atomický zápis se nemění.

Oficiální katalog MKP je z tohoto prostředí nedostupný (403). Výchozí seznam všech 45 poboček je proto dodán jako neověření kandidáti bez souřadnic. Tyto záznamy se nikdy nestanou součástí `GameDataRelease`; veřejná hra má pro knihovny výsledek „nelze určit“. Současný schválený release s 117 parky, 3 letišti, 10 zoo, 10 nemocnicemi a stejným PID zůstává beze změny, včetně původních hashů a historie. Nevydává se prázdný nový datový release ani odhadované body.

Po skutečném ověření pobočky lze použít stávající **Editor → Kontrola změn → Publikovat**. Nová poloha nebo tažení vrátí knihovnu k revizi; schválení vyžaduje nové ověření tohoto bodu. Uvedení provozních hodin nemá vliv na herní způsobilost. Hráči sdílejí stejný neměnný katalog a stabilní ID, nikoli pracovní stavy editoru. [Seznam neověřených poboček a audit](../data/source-metadata/mkp-libraries.md).

Ověření implementace knihoven: lint, typecheck a produkční sestavy obou aplikací prošly, stejně jako 201 jednotkových testů a 47 E2E. Dva jednotkové audity plného GTFS a původního parkového ZIPu a dva E2E audity původního ZIPu jsou přeskočené, protože vstupní archivy nejsou v prostředí k dispozici. Nové knihovní testy používají výslovně syntetické body a URL; nevydávají je za skutečné pobočky. Ověřují i přenos vyloučení při pozdějším doplnění oficiálních bodů a zachování všech dřívějších publikací. Worker prošel `wrangler deploy --dry-run`; lokální workerd hlásí `[1, 2, 3, 4]`. Živý produkční OAuth nebyl z tohoto prostředí nově ověřen kvůli síťové politice.
