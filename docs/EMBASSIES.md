# Ambasády a konzuláty

## Vstup a stav poloh

`data/raw/prazska_diplomaticka_zastoupeni_pracovni.xlsx` je původní dodaný soubor. Výběr má 60 pracovišť, všechna bez GPS. Metodika uvádí datum 22. 10. 2026 a [diplomatickou listinu MZV](https://mzv.gov.cz/file/442309/DL2026_10_22.pdf). Obsah PDF nebyl nezávisle ověřen a licence listiny ani pracovního výběru není doložená. MIT licence programu neuděluje licenci zdrojovým datům.

SHA-256 Excelu: `503de00a80fe4098d99f9d2f863e36ddbde0b989709895dc69a0a5d1683eed26`.

K 31. 10. 2026 je oficiální server RÚIAN v cloudovém prostředí blokovaný HTTP 403. Připravený návrh síťového nastavení povoluje `vdp.cuzk.gov.cz`, `cuzk.gov.cz`, `mzv.gov.cz`; jeho uložení samo nezmění běžící prostředí. Je potřeba v nastavení návrh zkontrolovat, uložit a prostředí publikovat. Alternativou pro další zpracování je dodání oficiálního exportu adresních bodů RÚIAN pro obec Praha **554782**, včetně kódu adresního místa, úplných adres, souřadnic, deklarovaného CRS, data a zdrojové URL. Adaptér tohoto exportu se musí nejprve ověřit na skutečné struktuře dat; nynější importér jeho podporu nepředstírá.

Aktuální distribuovaný katalog proto má **0 geografických POI, 60 záznamů `review` bez polohy**. Nemají značku, nespadají do geografických otázek a nelze je schválit před doložením polohy. Nebyly použity přibližné středy ulic, automatické prohození čísel ani hromadná extrakce objektů z Mapy.com. Adresy s obráceným zápisem čísla popisného/orientačního nebo rozsahem čísel, například Truhlářská 13–15, vyžadují jednoznačné nalezení skutečného adresního bodu; rozsah se nenahrazuje průměrem dvou bodů.

## Identita a ovládání

Kategorie je `embassy`, zobrazovaný název **Ambasády a konzuláty**. Stabilní ID má tvar `embassy:<ISO země>:<typ úřadu>`. Tento klíč není oficiálním identifikátorem MZV. Samostatné konzulární oddělení není sloučené s velvyslanectvím téže země. Oprava názvu nebo adresy ID nemění. Ručně přidaná pracoviště mají UUID `manual-embassy:…`; pouze ta lze odstranit. Zdrojový záznam se vyřazuje, aby zůstala zachovaná identita a audit.

V sekci Body zájmu lze filtrovat stav, hledat název, ID, zemi i adresu, zapnout vrstvu, vybrat objekt a upravit jeho údaje. Detail zachovává zdrojové atributy, řádek a stránku listiny. Doplněný bod se uloží jako GeoJSON `Point` v pořadí `[longitude, latitude]`. Ručně potvrzené souřadnice se nevydávají za oficiální geodetické zaměření. Změna adresy nebo souřadnic ruší použitelnost předchozího ověření a schválený objekt se vrací k revizi; přejmenování nebo poznámka samy o sobě polohu nemění.

Rozhodnutí jsou oddělená od zdrojových řádků. Reload, přibalení dalších záznamů ani import původního seznamu nepřepisují vlastní body, názvy, vyřazení a viditelnost. JSON i GeoJSON zálohy obsahují rovněž záznamy bez polohy.

## Hromadně doplnit GPS

Editor nabízí šablonu JSON pro aktuálně neumístěné objekty. Povoleny jsou také CSV se záhlavím, oddělovačem čárka a desetinnou tečkou. Pole pro každý řádek:

| Pole | Hodnota |
| --- | --- |
| `id` | Existující stabilní ID z šablony, beze změny |
| `address` | Přesná aktuální adresa objektu v editoru |
| `longitude` | Skutečná zeměpisná délka WGS84 |
| `latitude` | Skutečná zeměpisná šířka WGS84 |
| `sourceUrl` | HTTPS odkaz dokládající konkrétní bod |
| `checkedAt` | Datum ruční kontroly ISO UTC, např. `2026-10-31T12:00:00.000Z` |
| `note` | Popis kontroly a případných odchylek adresy |

Šablona má prázdné souřadnice, není připravená k importu bez jejich doplnění. Před importem správce výslovně potvrzuje kontrolu každého bodu pro danou adresu. Import odmítá neznámá nebo duplicitní ID, neshodu adres, neplatné souřadnice a body mimo skutečnou administrativní hranici Prahy. Chyba kteréhokoli řádku nezapíše žádné změny. Již vyřazený objekt se importem nevrátí do hry. Ostatní body zůstávají k individuálnímu schválení; bez něj se nepublikují. Import neprovádí geokódování pouhých adres.

## Výpočty a publikace

Matching porovnává stabilní ID nejbližších schválených pracovišť; Measuring vzdálenosti v metrech k jejich referenčním bodům. Neschválené a vyřazené objekty se ignorují. Existující tolerance shody a lexikografické pravidlo zůstávají beze změny. Bez schváleného kandidáta je výsledek „nelze určit“ a otázka ve veřejném katalogu není dostupná.

Katalog bez ambasád se nadále sestavuje ve schématu 6; podporu schématu 7 Worker potřebuje teprve pro jejich první publikaci. Schéma `GameDataRelease` 7 zahrnuje schválené ambasády, jejich adresy, metadata a ověření bodů. Kontrolní součty a verze zdrojů jsou zachované. Soukromá poznámka ověření se do veřejného katalogu nekopíruje. Starší schémata 1–6 a jejich neměnné artefakty zůstávají podporované. Žádná nová produkční publikace s fiktivními souřadnicemi se nevytváří. Po doplnění reálných bodů se používá stávající autorizovaný Worker a GitHub App, včetně aktuálního Workeru podporujícího schéma 7. [Postup publikace](PUBLISHING.md).

## Opakovatelnost a ověření

```sh
python scripts/extract-embassies.py
npx tsx scripts/prepare-embassies.ts
npm test -- packages/geo-core/src/embassy.test.ts
npm run test:e2e -- tests/embassy.spec.ts
```

První dva příkazy opakují import původního **neumístěného** seznamu, nikoli následných uživatelských rozhodnutí. Testovací body v jednotkových a E2E scénářích jsou výslovně syntetické a nejsou distribuovány jako skutečné polohy ambasád. Testy pokrývají výpočty, nové ověření po přesunu, zachování záloh a ostatních kategorií, hromadný import, publikační Worker a čtení historických katalogů.

Závěrečné ověření 31. 10. 2026: lint, typecheck, produkční build, **538 jednotkových testů a 121 E2E scénářů prošlo**. Dva jednotkové a dva E2E audity původních archivů GTFS/parků zůstávají výslovně přeskočené jako před touto změnou. Kontrola 57 městských částí, 112 katastrálních území, výchozí Prahy a sedmi historických publikací rovněž prošla. Živé geokódování nebylo kvůli síťovému blokování ověřeno.
