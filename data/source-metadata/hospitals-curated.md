# Nemocnice – ručně sestavený herní katalog

Zdroj: **Ruční výběr na Mapy.com**, přesná tabulka dodaná správcem. Nejde o úplný registr zdravotnických zařízení, oficiální dataset ani nezávisle ověřené geodetické souřadnice. Nebylo použito geokódování, stahování dalších objektů ani odhad hranic.

Soubor: `apps/editor/src/data/poi-catalog.json`, pole `hospitals`. Kategorie `hospital`, výchozí status všech deseti objektů `approved`. Geometrie Point je shodná s referenčním bodem WGS84; tabulka níže již používá **longitude, latitude**.

| ID | Název | Adresa | GeoJSON souřadnice |
|---|---|---|---|
| hospital-bulovka | Fakultní nemocnice Bulovka | Budínova 67/2, Praha 8 – Libeň | [14.4643531, 50.1155525] |
| hospital-na-frantisku | Nemocnice Na Františku | Na Františku 847/8, Praha 1 – Staré Město | [14.4214061, 50.0927786] |
| hospital-uvn | Ústřední vojenská nemocnice | U Vojenské nemocnice 1200/1, Praha 6 – Břevnov | [14.3625906, 50.0898339] |
| hospital-motol | Fakultní nemocnice v Motole | V Úvalu 84/1, Praha 5 – Motol | [14.3409883, 50.0740153] |
| hospital-homolka | Nemocnice Na Homolce | Roentgenova 37/2, Praha 5 – Motol | [14.3541617, 50.0754794] |
| hospital-vinohrady | Fakultní nemocnice Královské Vinohrady | Šrobárova 1150/50, Praha 10 – Vinohrady | [14.4754242, 50.0757197] |
| hospital-thomayer | Fakultní Thomayerova nemocnice | Vídeňská 800, Praha 4 – Krč | [14.4563864, 50.0300714] |
| hospital-vfn | Všeobecná fakultní nemocnice v Praze | U Nemocnice 499/2, Praha 2 – Nové Město | [14.4209875, 50.07343] |
| hospital-sv-alzbety | Nemocnice sv. Alžběty Na Slupi | Nedodána; uloženo jako prázdný řetězec | [14.4203839, 50.0692439] |
| hospital-boromejky | Nemocnice Milosrdných sester sv. Karla Boromejského v Praze | Vlašská 336/36, Praha 1 – Malá Strana | [14.3962378, 50.0870408] |

- Převzato do aplikace: 2026-10-20T09:12:21.733Z. Datum platnosti původních bodů není doloženo.
- Identita zdroje: `prague-curated-hospitals-v1`.
- SHA-256 původní vstupní tabulky: `6474510eca8876f4e375b2324261f9d39e50f10acd0a676e781ba41df9f86530`. Tabulka je UTF-8 JSON bez mezer: pole řádků `[id, název, adresa, latitude, longitude]`, v pořadí uvedeném výše, s prázdnou adresou sv. Alžběty.
- Licence: Licence ručně převzatých bodů není doložena; podmínky Mapy.com nejsou licencí otevřeného datasetu. Licence kódu se za licenci bodů nevydává.
- Dodané body jsou podklady pro lokální pravidla, ne informace o pohotovosti, dostupnosti péče nebo hranicích areálů.

Ruční opravy jsou oddělené od zdroje, uchovávají se v IndexedDB a úplných zálohách. Další doplnění katalogu nepřepisuje známé identity a rozhodnutí. Centrálně publikované snapshoty v GameDataRelease 3 mají samostatné kontrolní součty POI, zdrojů, celku i souboru. Starší publikace se nepřepisují.
