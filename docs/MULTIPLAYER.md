# Herní místnosti JetLagPrague

Veřejná hra má vlastní Cloudflare Worker v `apps/multiplayer`. Každý čtyřpísmenný kód má svůj SQLite Durable Object, který může atomicky přidělit kód jedné místnosti. Vygenerované UUID rozlišuje místnosti při opětovném použití kódu. Samostatný objekt omezuje zakládání, vstupy, obnovu a WebSocket handshaky podle hashované IP adresy. Worker používá `Game Core` a `Geo Resolver` se stejným stavovým automatem jako simulátor.

## Partie a návrat do hry

Nové veřejné partie používají pravidla Medium. Zakladatel povolí GPS a po úspěšné kontrole sdílí čtyřpísmenný kód. Server požaduje měření z posledních 30 sekund s přesností do 100 m a kontroluje, že kruh deklarované přesnosti zůstává bezpečně uvnitř herní oblasti. Polohu hlásí prohlížeč. Druhý tým může vstoupit odkudkoliv a herní GPS se uplatní při hraní.

Každý tým dostane vlastní relační token a samostatný obnovovací kód. Prohlížeč uloží token místně. Obnovovací kód se zobrazí při vydání a hráč si ho může uložit odděleně. Jeho použití přidělí nový token a nový obnovovací kód, ukončí předchozí spojení a převáže tým na nový telefon. Sdílený odkaz obsahuje pouze kód místnosti. Po připojení se každý telefon řídí autorizovaným snímkem stavu a po výpadku se obnoví poslední uložený snímek včetně historie.

Každý příkaz má jedinečné ID a ID kola. Zápis změny a záznam ID proběhnou v jedné transakci. Aktuální WebSocket spojení určuje, které zařízení může tým ovládat. Server vydává krátkodobé jednorázové lístky k navázání WebSocketu a přeposílá jen autorizované pohledy. Uložený release, serverový čas a Durable Object Alarms řídí začátek hry, lhůty a pauzy. Po výměně rolí je historie prvního kola stále dostupná ze svého původního rolového pohledu.

Čekající místnost vyprší po dvou hodinách. Rozběhnutá místnost vyprší po 24 hodinách bez úspěšné herní akce a dokončená hra má dvouhodinovou retenční lhůtu. Po vypršení Worker odstraní herní stav, přílohy a relace a uvolní kód. Server uchovává hash relačního tokenu a hash obnovovacího tajemství. Autorizační údaje se předávají v hlavičkách nebo těle požadavku. Fotografie klient převádí na JPEG bez původních metadat. Dokumenty a média dodaná hráči mohou sama obsahovat soukromé údaje. Rozpoznání ulic používá ručně ověřené názvy. Fotografie a video důkazy hráč potvrzuje podle existujících herních pravidel.

## Místní ověření

```sh
npm ci
npm run multiplayer:build
npm run test:multiplayer
npm run test:multiplayer:e2e
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Integrační sada používá lokální workerd přes Miniflare, skutečný dopravní katalog a restart runtime nad stejnou SQLite databází. Playwright používá dva nezávislé kontexty prohlížeče a samostatnou instanci Workeru na portu 4180. Testy s referenčními daty a zrychleným schováváním vyžadují výslovný testovací režim s loopback originem. Podmínka pro klientský `createLobbyGame` zůstává zachovaná. Worker zakládá hru přes samostatný `createServerLobbyGame` a připisuje souhlasy autentizovaným týmům.

## Nasazení

1. Připravte schválené herní vydání s ověřeným PID snapshotem pro den zahájení přes workflow **Update PID and game catalog**. Veřejný Worker ověřuje katalog při každém zakládání místnosti. [Synchronizace PID](PUBLISHING.md#synchronizace-pid-a-herního-katalogu)
2. Přihlaste Wrangler do správného Cloudflare účtu. Zkontrolujte povolený origin, adresu statických vydání a plán s kapacitou pro ověřování katalogu a SQLite Durable Objects. [Konfigurace Workeru](../apps/multiplayer/wrangler.toml)
3. Spusťte `npm run multiplayer:deploy`. Migrace `v1` založí SQLite objekty `GameRoom` a `RoomRateLimiter`. Tento příkaz se týká samostatné služby herních místností.
4. Pages používá veřejnou adresu Workeru uvedenou ve workflow. Jinou HTTPS adresu lze nastavit jako `MULTIPLAYER_URL` v GitHub Actions. Klient ji dostane jako `VITE_MULTIPLAYER_URL`. Pages před zveřejněním kontroluje odpověď `/status` a povolení původu GitHub Pages. [Vzor prostředí](../.env.example)
5. Po zveřejnění ověřte založení místnosti z Prahy, pozvánku, odpojení a obnovu ve dvou skutečných prohlížečích. Zkontrolujte původ požadavků, trvalé uložení a limity na nasazeném Workeru.

Veřejné funkční ověření vyžaduje Cloudflare účet, nasazený Worker, nastavenou proměnnou GitHub Actions a aktuální schválený katalog.
