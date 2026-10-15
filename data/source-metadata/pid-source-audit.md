# Dosavadní inspekce skutečných zdrojů PID

Tento záznam popisuje dodané soubory; nenahrazuje dokumentaci významu atributů ani neprokazuje aktuální obsluhu v dnešním dni. Přímý přístup k poskytovateli z cloudového prostředí blokuje síťová politika (CONNECT 403).

## `Zastavky_WGS84.json`

- Vstup: `data/raw/pid/Zastavky_WGS84.json`, převzatý v commitu `950a53c9a79f15061e0bb4ab6364ec9070073451` dne 2026-10-15. Datum commitu je datum převzetí, nikoli datum platnosti.
- 9 423 075 bajtů, SHA-256 `1cdd825dd89f30d2d2052f9af5c545e28d55bab5b4d97debf3d7676edea9bad3`.
- GeoJSON `FeatureCollection`, `name = Zastavky_WGS84`, 16 118 geometrických bodů. Všech 16 118 geometrií prošlo validací WGS84 v geo-core. Žádné souřadnice nebyly změněné.

| Atribut | Zjištění v tomto souboru |
| --- | --- |
| `stop_id` | 16 118 jedinečných textových hodnot, například `U1000Z1`; kandidát na vazbu stanoviště, musí se ověřit proti `stops.json`. |
| `asw_node_id` | 7 676 různých textových hodnot; více bodů sdílí stejnou hodnotu. Toto samotné ještě neověřuje strukturu skupin druhého zdroje. |
| `asw_stop_id` | Textový kód v rámci uzlu; sám o sobě není globálně jedinečný. |
| `stop_name` | Název bodu; opakování názvu neprokazuje společnou identitu. |
| `route_type` | Text s jedním nebo více kódy: `0`, `0,11`, `0,3`, `0,3,11`, `1`, `11`, `2`, `3`, `3,11`, `4`. Není to vždy jedno číslo. |
| `is_night` | Textové hodnoty `0`, `1`, `0,1`. Obsahuje agregované příznaky; nelze obecně párovat položky seznamu s položkami `route_type` podle indexu. |
| `routes_id`, `routes_names` | Čárkami oddělené seznamy. Vazba na geometrii linek není ověřena, protože soubor linek zatím chybí. |
| `validity` | Všech 16 118 záznamů má text `20260820`. Význam pole není zatím doložen; neoznačujeme tento údaj automaticky za datum stažení ani za potvrzení dnešní platnosti. |
| `OBJECTID` | Zde jedinečná pořadová čísla; nepoužíváme je jako stabilní identitu zastávek. |

Další přítomná pole: `wheelchair_boarding`, `platform_code`, `is_regional`, `zones_id`, `on_request`. Samotná existence těchto atributů zatím neumožňuje bezpečně rozlišit všechny veřejné a pomocné provozní body nebo vyřazovat konečné stanice.

Příklad skutečných zdrojových záznamů Anděla: devět bodů nese `asw_node_id = 1040`; `U1040Z101` má `route_type = 1`, souřadnice `[14.40367, 50.070026]`, `U1040Z102` má `route_type = 1`, souřadnice `[14.403957, 50.070001]`. Další body mají jiné kódy dopravy. Na základě těchto zjištění zatím nevytváříme normalizovaný herní uzel: nejprve se ověří identita a vazby proti skutečnému `stops.json` a význam kódů proti dokumentaci/ostatním zdrojům.

## `stops.json`

Ve verzi `3e83b27` měl soubor pouze **2 bajty bílých znaků**, nikoli JSON data. V následující verzi `1aefd16` byl prázdný soubor odstraněný. Při této inspekci ještě chybí skutečná struktura skupin a stanovišť, kterou potřebujeme k doložení vazeb. Inspekce může načíst také ZIP se skutečným `stops.json`; chybějící či prázdné vstupy jasně oznámí a sama žádné zdrojové soubory nemaže.

## `Linky_7d_WGS84.json`

Dosud není dodaný. Přijímá se původní JSON, `Linky_7d_WGS84.json.gz` nebo ZIP obsahující původní `Linky_7d_WGS84.json`, případně v podadresáři. Komprese nemění zdrojové atributy ani geometrii; inspekce eviduje kontrolní součet rozbalených bajtů. Podrobnosti: [návod k předání dat](../raw/pid/README.md).

Příjem komprimovaného souboru je podpora kontroly vstupu. Nejde o již dokončený adaptér, vykreslování linek nebo denní aktualizaci aplikace. Licence, CORS a platnost celé trojice zůstávají neověřené.
