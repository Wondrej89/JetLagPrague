# Ověření aktualizací PID · 16. 10. 2026

Kontrola proběhla kolem 08:50–09:05 CEST (Europe/Prague). Závěry rozlišují metadata GitHub Actions, skutečně stažené upstream soubory a lokální opakování stejného publikačního příkazu. Nedochází k úpravě platnosti ani k nahrazení dodaných souborů v `data/raw/pid`.

## GitHub Actions

- Výchozí větev repozitáře je `main`, workflow `pages.yml` je podle API ve stavu `active`.
- Cron `30 4 * * *` znamená 16. října **06:30 CEST**. Dotaz `GET /repos/Wondrej89/JetLagPrague/actions/workflows/pages.yml/runs?event=schedule` vrátil `total_count: 0`. Plánovaný běh pro tento den tedy v době kontroly není evidovaný; nelze jej popsat jako proběhlý neúspěšný download.
- Poslední běh [38810160873](https://github.com/Wondrej89/JetLagPrague/actions/runs/38810160873) byl `push`, začal 15. 10. v 23:28:42 CEST a skončil úspěšně. V tomto režimu skript dovoluje nasazení kódu s předchozí referencí, pokud neexistuje platná dnešní aktualizace. Úspěch nasazení proto neprokazuje aktuálnost PID.
- Konkrétní důvod, proč GitHub plánovaný běh nezaregistroval, API nevysvětluje. Konfigurace cronu ani aktivní výchozí větev tuto absenci nevysvětlují; zpoždění či omezení plánovače nelze bez dalšího důkazu vydávat za zjištěnou příčinu.
- Stažení kompletního historického logu přes `gh run view --log` skončilo HTTP 403 na službě logů Actions. Následující závěry o zdrojích jsou založené na přímém ověření a opakování publikačního příkazu, nikoli na nepřístupném logu starého běhu.

## Přímé ověření zdrojů

Všechny tři zdroje byly celé stažené přes HTTPS a zpracované stávajícím adaptérem. Nejde o domněnku odvozenou pouze z HTTP hlaviček.

| Zdroj | HTTP | Platnost uvnitř souboru | Last-Modified (UTC) | Výsledek |
| --- | --- | --- | --- | --- |
| [Zastavky_WGS84.json](https://data.pid.cz/geodata/Zastavky_WGS84.json) | 200 | 2026-08-20 | 2026-08-20 03:17:50 | Historické aktivní body |
| [stops.json](https://data.pid.cz/stops/json/stops.json) | 200 | generatedAt 2026-10-16T03:53:05, bez offsetu | 2026-10-16 01:53:06 | Novější skupiny/stanoviště |
| [Linky_7d_WGS84.json](https://data.pid.cz/geodata/Linky_7d_WGS84.json) | 200 | 2026-08-20 až 2026-08-26 | 2026-08-20 03:17:26 | Historické trasy |

Požadavky s `Origin: https://wondrej89.github.io` neobdržely `Access-Control-Allow-Origin` ani u jednoho zdroje. Běžný prohlížeč proto jejich tělo neposkytne aplikaci kvůli CORS, i když server odpoví HTTP 200. Samotné `Failed to fetch` obecně může znamenat také síťovou chybu; zde je absence potřebné CORS hlavičky přímo ověřená.

SHA-256 aktivních bodů a tras jsou **totožné** s uživatelem dodanými srpnovými soubory:

- Zastávky: `1cdd825dd89f30d2d2052f9af5c545e28d55bab5b4d97debf3d7676edea9bad3`.
- Trasy: `7ca7fa9c803d0fd1ba60bbcb970ab748a63dcf3f7f1c9f1752eaeb2c9df647cd`.
- Skupiny z 16. října: `5b985f56d5f7c4ca294207e8bb4121217b61819b91489eb920eb031482b00452`.

Nová živá kombinace obsahuje 8 527 skupin a 853 linek; **206** aktivních bodů nemá jednoznačnou vazbu. Přibalená kombinace z předchozího dne má 8 526 skupin a 208 nepřiřazených bodů. Tyto dvě verze se nezaměňují a nová nekonzistentní kombinace nenahradila přibalený snapshot.

## Proč nevznikla aktuálnější publikace

Příkaz `npm run pid:publish -- --strict` se skutečnými zdroji skončil očekávaným odmítnutím: srpnová platnost aktivní obsluhy neodpovídá 16. říjnu, skupiny patří jinému dni a část vazeb není doložená. Nešlo o HTTP download selhání. Skript nepublikoval nic a kontrolní součet přibalené publikace zůstal zachovaný. Zrušení kontroly konzistence by pouze vydávalo historické údaje za aktuální.

Oprava rozšiřuje diagnostiku v `data/reports/pid-refresh.json`: konkrétní URL, HTTP stav, Last-Modified, ETag, doložená platnost, SHA-256, chyby a zvolená verze. Actions ji uloží jako artefakt **pid-refresh-diagnostics** i při selhání kroku a vypíše souhrn běhu. Striktní denní režim nadále nepřepisuje předchozí web při neplatné aktualizaci.

## Další postup

Zobrazování poslední ověřitelné reference je opravené nezávisle na stavu upstream serveru a cronu. Oba geodatové zdroje jsou v době kontroly pro aktuální obsluhu prokazatelně zastaralé. [Samostatný návrh GTFS](PID_GTFS_PROPOSAL.md) popisuje další fázi; tato oprava datový adaptér nemění.
