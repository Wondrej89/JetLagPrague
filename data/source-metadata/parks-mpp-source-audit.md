# MPP – Městské parky: ověření zdroje 16. 10. 2026

Otevřena skutečná stránka z uživatelského zadání:
https://geoportalpraha.cz/data-a-sluzby/35e82d77fbd44d96b470bf5731fbb0d4

Ve veřejné aplikaci Geoportálu bylo ověřeno její aktuální API `https://geoportalpraha.cz/backend/`, ze kterého stránka čte metadata přes POST `selectmongo` s tělem `{"id":"35e82d77fbd44d96b470bf5731fbb0d4"}`. Nejde o odhad datové URL ani o zjišťování databází.

Odpověď potvrzuje:

- Název: **MPP – Městské parky**; dataset ID `CZ-70883858-MPP_CUR.MPP_100_Parky_p`.
- Popis: městské parky v zastavitelném území a krajinné parky v otevřené krajině s hierarchií; nejedná se o obecnou vrstvu veškeré zeleně ani o doklad současného provozního stavu všech parků.
- Poskytovatel: Institut plánování a rozvoje hl. m. Prahy.
- Originální CRS: **EPSG:5514**.
- Atributy: `OBJECTID`, `ID`, `NAZEV`, `HIERARCHIE`, `LOKALITA`, `ZASTAVITELNE_UZEMI`, `KAPITOLA`, `SHAPE`, `VPS_VPO`, `INDIVIDUALNI_REG`, `SHAPE.AREA`. Export Shapefile může názvy některých polí zkrátit; import používá skutečné atributy DBF.
- `ID` má typ SmallInteger. Metadata neprokazují jeho jednoznačnost ani stabilitu; importér ověřuje duplicity skutečného souboru. `OBJECTID` se automaticky nepovažuje za stabilní mezi exporty.
- V metadatech je datum změny dat **1. 9. 2026**, vzniku 31. 8. 2026. Nejde o datum ověřené z obsahu staženého ZIPu. Formulář data sám nedoplňuje z názvu souboru ani z času stažení.
- `openData: true`; konkrétní licence a její URL v této odpovědi **nejsou uvedené**. Příznak otevřených dat se nevydává za konkrétní licenci.
- Potvrzený odkaz ZIP: https://mp.iprpraha.cz/portal/sharing/rest/content/items/72516a5b78b749bb8ecaae563e0c47c8/data
- Titulek ZIPu: „Celá Praha (SHP)(S-JTSK) 2 MB“, velikost uvedená v metadatech 2 098 951 bajtů.
- Služba uvedená v metadatech: https://mp.iprpraha.cz/arcgis/rest/services/Hosted/MPP_CUR_MPP_100_PARKY_P/FeatureServer/0

**Originální archiv skutečně stažen a ověřen 16. 10. 2026.** Dřívější CONNECT 403 se při aktuálním pokusu již neprojevil. Velikost je 2 098 951 bajtů; SHA-256:

`b6edf4d01e704f16362aad810d9f5dcb338d235ecea4234bdab6470446c463d9`

Archiv obsahuje 953 polygonových záznamů a CPG `UTF-8`. Skutečná pole DBF jsou `ID`, `NAZEV`, `HIERARCHIE`, `ZASTAVITEL`, `KAPITOLA`, `LOKALITA`, `VPS_VPO`, `INDIVIDUAL`, `SHAPE_LEN`; `OBJECTID` v tomto exportu není. PRJ obsahuje `S-JTSK_Krovak_East_North`; převod proj4 zachoval všechny zdrojové vrcholy.

Původní topologická kontrola zjistila přesně tři chyby `Ring Self-intersection`:

| Původní řádek | ID | Název | Výsledek GEOS MakeValid |
| --- | --- | --- | --- |
| 197 | 3121 | Park V Pláni | Polygon s otvorem |
| 222 | 2440 | Skalky v Křeslicích | MultiPolygon, všechny části zachovány |
| 835 | 2589 | Park u Kaštanu | Polygon s otvorem |

Opravy GEOS 3.13.0 byly opětovně validovány; změna geografické plochy každé je pod 0,000001 m², výrazně pod limitem `max(0,01 m²; 0,1 %)`. Žádný výsledek neobsahuje nepolygonové zbytky. Řádky **944 a 945**, „Park u OC Letňany“ a „Park u OC Letňany II.“, mají stejné oficiální ID **2773** a byly sjednoceny do jednoho parku. Název prvního v deterministickém pořadí je „Park u OC Letňany“; všechny názvy, atributy a původní geometrie jsou dohledatelné.

Výsledek: **952 unikátních parků**, 0 blokujících chyb, všechny geometrie platné podle JSTS IsValidOp i GEOSisValid, právě jeden striktně vnitřní referenční bod u každého parku. Ověřen opakovaný import, zachování schválení/vyloučení i referenčních bodů a kompletní GeoJSON přenos světa. [Strojově čitelný audit včetně checksumů jednotlivých souborů a geometrických operací](parks-mpp-import-audit.json).

XML v ZIPu uvádí „Pravidla pro poskytování dat a výstupů z datového skladu Geografického informačního systému hl. m. Prahy“ a odkaz na Geoportál. Konkrétní licenční identifikátor a úplné podmínky nejsou součástí záznamu. Import proto automaticky nenahrazuje nedoloženou licenci ani neschvaluje parky pro hru. Samotný ZIP není přibalen jako publikovaný katalog.

Opakování auditu bez síťové závislosti testů:

```sh
PARKS_ZIP=/cesta/MPP_CUR_MPP_100_PARKY_P.zip npm test
PARKS_ZIP=/cesta/MPP_CUR_MPP_100_PARKY_P.zip npm run test:e2e
```

Bez souboru jsou samostatné audity originálu výslovně přeskočené. Testy se nikdy nevydávají za audit aktuálně dostupného upstream archivu bez jeho načtení. Běžný build ani GitHub Pages zdroj nestahují.
