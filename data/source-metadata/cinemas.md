# Kina – původní výběr správce

Výběr ze zadání převzatý 20. 10. 2026: **26 bodových lokalit, 25 schválených a jedna k revizi**. Stabilní ID i všechny názvy, adresy a GPS jsou beze změny. Neprovádělo se geokódování, doplňování dalších kin ani nezávislé ověřování aktuálního provozu. Multiplex se považuje za jediný objekt.

Zdroj: **Ruční výběr na Mapy.com**, poskytnutý správcem. Nejde o oficiální dataset ani geodetické měření. Licence převzatých souřadnic není doložena. Oficiální weby kin nejsou dodané; jejich URL se nevymýšlejí.

## Souřadnice a stavy

| ID | Název | Adresa | GeoJSON [longitude, latitude] | Stav |
|---|---|---|---|---|
| bio-oko | Bio Oko | Františka Křížka 460/15, Praha 7 – Holešovice | [14.4301697, 50.1000567] | approved |
| kino-dlabacov | Kino Dlabačov | Bělohorská 125/24, Praha 6 – Břevnov | [14.3802353, 50.0858464] | approved |
| kino-atlas | Kino Atlas | Ke Štvanici 371/4, Praha 8 – Karlín | [14.4383706, 50.0915856] | approved |
| kino-lucerna | Kino Lucerna | Vodičkova 1935/38, Praha 1 – Nové Město | [14.4255711, 50.0815567] | approved |
| kino-svetozor | Kino Světozor | Vodičkova 791/41, Praha 1 – Nové Město | [14.4255328, 50.0819742] | approved |
| kino-pilotu | Kino Pilotů | Donská 168/19, Praha 10 – Vršovice | [14.4468981, 50.0714064] | approved |
| kino-aero | Kino Aero | Biskupcova 87/31a, Praha 3 – Žižkov | [14.4719042, 50.0903361] | approved |
| edison-filmhub | Edison Filmhub | Jeruzalémská 1321/2, Praha 1 – Nové Město | [14.4314144, 50.0848642] | approved |
| kino-evald | Kino Evald | Národní 60/28, Praha 1 – Nové Město | [14.4200992, 50.0824489] | approved |
| kino-ponrepo | Kino Ponrepo | Bartolomějská 291/11, Praha 1 – Staré Město | [14.4175569, 50.0830725] | approved |
| cinema-city-slovansky-dum | Cinema City Slovanský dům | Na Příkopě 859/22, Praha 1 – Nové Město | [14.4273172, 50.0864125] | approved |
| kino-balt | Kino Balt | Blahníkova 575/1, Praha 3 – Žižkov | [14.4469761, 50.0848936] | approved |
| pritomnost | Přítomnost | Siwiecova 1800/1, Praha 3 – Žižkov | [14.4431447, 50.0844917] | approved |
| cinema-city-flora | Cinema City Flora | Vinohradská 2828/151, Praha 3 – Žižkov | [14.4609867, 50.0794036] | approved |
| priemere-citenas-hostivar | Priemere Citenas Praha Hostivař | Švehlova 1391/32, Praha 15 – Hostivař | [14.5172589, 50.0529997] | review |
| cinema-city-chodov | Cinema City Chodov | Roztylská 2321/19, Praha 11 – Chodov | [14.4904822, 50.0303447] | approved |
| modransky-biograf | Modřanský Biograf | U Kina 44/1, Praha 12 – Modřany | [14.4045469, 50.0035578] | approved |
| kino-radotin | Kino Radotín | Na Výšince 875/4, Praha 16 – Radotín | [14.356355, 49.9841428] | approved |
| cinema-city-zlicin | Cinema City Zličín | Řevnická 121/1, Praha-Zličín – Třebonice | [14.2877942, 50.0543953] | approved |
| kino-kavalirka | Kino Kavalírka | Plzeňská 2576/210, Praha 5 – Smíchov | [14.3679311, 50.0700725] | approved |
| cinema-city-letnany | Cinema City Letňany | Veselská 663, Praha 18 – Letňany | [14.5028497, 50.1368472] | approved |
| cinestar-cerny-most | CineStar Černý Most | Chlumecká 765/6, Praha 14 – Černý Most | [14.5852778, 50.1090125] | approved |
| ucko-kino | Účko Kino | K Sokolovně 201/8, Praha 22 – Uhříněves | [14.6058964, 50.0287886] | approved |
| cinestar-andel | CineStar Anděl | Radlická 3179/1e, Praha 5 – Smíchov | [14.4015656, 50.0713056] | approved |
| cinema-city-novy-smichov | Cinema City Nový Smíchov | Plzeňská 233/8, Praha 5 – Smíchov | [14.4027925, 50.0741017] | approved |
| kino-mat | Kino MAT | Karlovo náměstí 285/19, Praha 2 – Nové Město | [14.4192894, 50.07782] | approved |

## Nedokončená revize

`priemere-citenas-hostivar`: je třeba potvrdit skutečný název a existenci kina. Dodaný název **Priemere Citenas Praha Hostivař**, adresa **Švehlova 1391/32, Praha 15 – Hostivař** a souřadnice **[14.5172589, 50.0529997]** se zachovávají. Výchozí status `review`, bez veřejné publikace a bez účasti v Matching/Measuring. Schválení je explicitním rozhodnutím správce po ověření.

## Integrita a aktualizace

Původní tabulka: [cinemas-curated.json](../raw/cinemas-curated.json), SHA-256 `812a17fbcd1a42287ae1d273eb7d5f0a10f907dcc3726458658850708af8013d` (přesné bajty UTF-8 souboru včetně formátování). Referenční body v GeoJSON jsou v opačném pořadí oproti vstupním sloupcům latitude/longitude.

Datum převzetí katalogu: `2026-10-20T12:38:08.506Z`. Datum původního zaměření či výběru není doložené (`dataDate: null`). Každý objekt archivuje původní ID, název, adresu a bod; ruční úpravy, schválení a vyloučení jsou samostatná rozhodnutí.

Katalog sestavuje `scripts/prepare-cinemas.ts`; runtime nespoléhá na autorovu IndexedDB ani na síťové získávání bodů. Nová neměnná veřejná verze schématu 5 obsahuje pouze 25 schválených kin. Navazuje na `1df560d4f22e…`, staré soubory ani ostatní data nepřepisuje.
