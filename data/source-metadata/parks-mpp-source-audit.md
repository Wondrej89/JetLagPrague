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

**Blokace skutečného souboru:** přímý ZIP potvrzený také uživatelem vrací v cloudovém prostředí CONNECT 403 z proxy pro `mp.iprpraha.cz`. Nebyl stažen. Tvrzení o **953 objektech pochází ze zadání**, nikoli z úspěšného auditu binárního archivu. Nelze dosud doložit jeho SHA-256, skutečné duplicity, kódování CPG ani seznam případných neplatných geometrií. Síťová blokace se neobchází a skutečný test není nahrazen syntetickými parky.

Návrh cloudového nastavení doplňuje `geoportalpraha.cz`, `mp.iprpraha.cz` a `iprpraha.maps.arcgis.com`, zachovává dřívější domény. Aktivace vyžaduje uložení/publikování prostředí uživatelem. Alternativou je přiložení původního ZIPu do chatu. Samotná aplikace uživatelský ZIP zpracuje lokálně v prohlížeči bez přístupu cloudu k tomuto hostu.

Po zpřístupnění originálu spusťte:

```sh
PARKS_ZIP=/cesta/MPP_CUR_MPP_100_PARKY_P.zip npx vitest run packages/geo-core/src/park-import.test.ts
```

Audit vyžaduje skutečných 953 záznamů, kontroluje S-JTSK a české atributy a vypíše počty validních/neplatných geometrií a identit i konkrétní problémy. Stažení není součástí běžného sestavení ani GitHub Pages.
