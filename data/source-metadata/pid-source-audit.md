# Audit skutečných zdrojů PID

Podklady jsou nezměněné soubory v `data/raw/pid/` z revize `380ac21` repozitáře. Jejich obsah byl ověřený příkazem `pid:inspect`, adaptérem a automatickými testy. Audit neprokazuje licenci ani aktuálnost vůči živému serveru: přímý přístup z cloudového prostředí blokuje síťová politika (CONNECT 403).

| Zdroj | Původní bajty | SHA-256 rozbaleného originálu |
| --- | ---: | --- |
| `Zastavky_WGS84.json` | 9 423 075 | `1cdd825dd89f30d2d2052f9af5c545e28d55bab5b4d97debf3d7676edea9bad3` |
| `stops.json` | 19 006 137 | `749c2809d53e29adcc0c0a25c53731c10c0cade0ba5975b1878b6bac0cc73869` |
| `Linky_7d_WGS84.json` | 38 795 036 | `7ca7fa9c803d0fd1ba60bbcb970ab748a63dcf3f7f1c9f1752eaeb2c9df647cd` |

Linky jsou dodané v `Linky_7d_WGS84.zip`, 6 677 294 bajtů, SHA-256 archivu `f922573c68b5cd7764640b499d8bba2d54d154cc7fdabaa126a9c3634cb784fb`. Archiv obsahuje původní `Linky_7d_WGS84.json`; rozbalení nemění souřadnice.

## Pozorovaná schémata a identity

`Zastavky_WGS84.json` je GeoJSON FeatureCollection s 16 118 Point. `stop_id` je v dodané sadě jedinečné. `asw_node_id` a `asw_stop_id` jsou textové oficiální složky ASW identity. `OBJECTID` je pořadové číslo a pro stabilní identity se nepoužívá. `route_type`, `routes_id`, `routes_names`, `is_night` a další atributy jsou často čárkami oddělené seznamy, nikoli jednotlivé hodnoty.

`stops.json` má `dataFormatVersion = "3"`, `generatedAt` a 8 526 položek `stopGroups`. Skupina poskytuje `node`, `cis`, `idosCategory`, `name/fullName`, `municipality`, průměr skupiny a pole `stops`. Celkem je 17 229 fyzických stanovišť s jedinečným `id`, WGS84 `lon/lat`, `gtfsIds`, `mainTrafficType` a seznamem linek. Žádná skupina nemá prázdné `stops`.

**Samotné `node`, `cis` ani `uniqueName` nejsou globálně jedinečné.** Například Anděl, Na Knížecí a Pivovarská sdílejí `node = 1040`; dvě různě vymezené skupiny hlavního nádraží sdílejí i `node/cis/category`. Adaptér nikdy nesloučí záznamy jen podle těchto neúplných klíčů. Používá složenou identitu `asw:{node}:cis:{cis}:cat:{idosCategory}:p:{nejmenší_oficiální_id_stanoviště}`. Poslední složka je stabilní zdrojová kotva, nikoli index nebo název. Změna skladby, která kotvu změní, znamená změnu vazby k revizi. Herní automatická identita je `pid-group:{id_skupiny}`; ruční propojení má samostatné `manual:UUID`.

Přesná vazba stanoviště používá buď jediný odpovídající `gtfsIds`, nebo shodu oficiálních ASW složek s jedinečným fyzickým `id = node/stop`, včetně kontroly uzlu skupiny. **Přípona `P` se neodstraňuje, názvy ani vzdálenost neslouží k propojení.** 13 180 bodů se shoduje přesně přes GTFS alias; celkem lze jednoznačně přiřadit 15 910 aktivních bodů. U 208 chybí doložená vazba. Všechny fyzické body jsou zachované; bez doložené aktivní obsluhy nevstupují do herního středu.

`Linky_7d_WGS84.json` obsahuje 1 297 variant, 1 236 MultiLineString a 61 LineString. `route_id` má 853 různých hodnot; varianty stejného ID mají shodný druh, číslo a barvu. Agregace zachovává všechny oddělené části a 1 101 102 původních vrcholů. `Shape_Length` se nepoužívá jako délka v metrech. Oficiální `route_color` se přebírá jako bezpečně validovaná šestice hexadecimálních číslic.

## Doprava, obsluha a konečné

Kódy `route_type` odpovídají druhům pojmenovaným v příslušných zdrojových záznamech a GTFS: 0 tramvaj, 1 metro, 2 vlak, 3 autobus, 4 přívoz, 7 pozemní lanovka, 11 trolejbus. Dodané aktivní geodata obsahují 0/1/2/3/4/11, nikoli 7; současné skupiny přesto zachovávají i fyzické body lanovky bez prokázané aktivní obsluhy. Neznámý kód odmítne novou verzi.

Každé `routes_id` aktivního bodu se propojuje **přesnou rovností** na `route_id` geometrie linky. Všechny uvedené linky existují. Pro konkrétní den zastávkového zdroje se vyberou jen varianty s příslušným `validity`. Jejich druhy a souhrn nočního příznaku ve všech záznamech odpovídají `route_type` a `is_night` bodu. Denní/noční obsluha jednotlivého druhu se proto odvozuje z konkrétních doložených linek; seznamy agregovaných atributů se nespojují podle pořadí.

Aktivita nevyžaduje aktuální odjezd ani odchozí spoj. `stops.lines.exitOnly` je doložené například u Anděla `1040/11`; tento bod je zachovaný jako aktivní noční autobusové stanoviště příslušného zdrojového období. Body bez aktivních doložených linek nejsou povolenými herními zastávkami. Zdroj nerozlišuje samostatným spolehlivým příznakem všechny možné pomocné provozní body, proto se jejich veřejnost nevymýšlí podle názvu nebo blízkosti.

## Platnost a geografická omezení

Aktivní body deklarují jediný den `20260820`. Varianty tras deklarují dny od `20260820` do `20260826`. Naopak `stops.generatedAt = 2026-10-15T03:52:54` je říjnové a nemá uvedený offset. **Srpnovou aktivitu nelze bez revize kombinovat s říjnovou skladbou a polohami jako dnešní data.** U některých stanovišť se navíc mění poloha či obsluha. K dispozici je proto referenční snapshot s 8 066 herními jednotkami s obsluhou ve zdrojovém období a globálním stavem `review`; povolenost se vrací jako „nelze určit“.

Například Anděl má dvě relevantní metrová stanoviště `1040/101` a `1040/102`. Průměr původních říjnových fyzických bodů je `[14.4037690, 50.0699500]`, zatímco srpnový aktivní zdroj má pro tyto body jiné souřadnice. Obě sady zůstávají uložené samostatně; tento výpočet se nevydává za potvrzení dnešní povolené oblasti. Smíšený průměr celého uzlu ani autobusová/tramvajová stanoviště se pro střed metra nepoužívají.

Samostatně doložený reprezentativní bod železniční/metrové stanice není v této trojici k dispozici. Automatika používá aritmetický průměr relevantních bodů a dovoluje odůvodněnou ruční korekci. Vzdálenost počítá Turf jako velkou kružnici na kouli, nikoli v pixelech ani jako metry z rozdílu stupňů. Nezaokrouhlují se ani nezjednodušují zdrojové geometrie.

Licenci ani skutečný čas původního stažení dodané trojice nelze ze souborů doložit. Hodnoty proto zůstávají `null`; `preparedAt` je samostatný čas přípravy, ne datum platnosti. Při živé aktualizaci se čas převzetí zaznamená a automatické přijetí vyžaduje dnešní pražský den i konzistentní zdroje. Podrobný provoz a testy: [PID_DATA.md](../../docs/PID_DATA.md).
