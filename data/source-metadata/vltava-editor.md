# Řeky – sestavení vodní plochy

V geografickém editoru otevřete **Řeky – sestavení vodní plochy**. Společná vodní plocha vzniká výběrem původních polygonů Vltavy a Berounky. Její revize a revize pevniny jsou samostatné.

## Pracovní výběr a vodní plocha

1. **Načíst 62 kandidátů z auditu** načte výchozí výběr z 2 755 zdrojových toků typu T. Počet v editoru vychází z načteného zdroje.
2. **Vybrat všechny navazující úseky řeky** projde graf prostorových sousedů od výchozích kandidátů. V nezměněném výběru rozšíří skupinu na 173 úseků, tedy o 111. Skupina zahrnuje i přítoky určené k ruční revizi.
3. Kliknutím na polygon jej přidáte nebo odeberete. Modrá označuje vybrané, šedá ostatní a zelený obrys krátce zvýrazní nově přidané úseky. Pokud polygon není vidět, vyhledejte jeho GLOBALID nebo přepněte na všechny toky T.
4. **Přidat všechny sousední úseky vybraného polygonu** přidá jen přímé sousedy polygonu zobrazeného v detailu. Ručně vyřazený úsek se vrátí samostatným kliknutím nebo po potvrzení hromadného přidání. Vyřazené úseky se při běžném průchodu přeskočí, včetně větví, ke kterým vedou jako jediná cesta.
5. **Vytvořit náhled sjednocené řeky** provede GEOS union ve workeru. Inspector ukáže plochu, komponenty, otvory a stav geometrie. Kontrola břehů, přítoků a podmostí zůstává součástí ruční revize.

Ke schválení vodní plochy předejte náhled k revizi a vyplňte kontrolní seznam, poznámky k orientačním místům, původ dat a autora revize. Doložte konkrétní licenci a datum revize zdrojových dat. Po schválení lze vyexportovat místní GeoJSON s vodním Polygonem nebo MultiPolygonem, zdrojovým SHA-256 a seznamem GLOBALID. Původní schválení samotné Vltavy zůstává evidované v draftu a vyžaduje novou revizi společné plochy.

## Oddělovací linie a pevnina

1. Přibližte se k chybějícímu rameni, například u Mánesa. Aktivujte **Oddělit ostrov / pevninu**, přidejte vrcholy klikáním a dokončete dvojklikem. Konce umístěte na břeh nebo zřetelně do vody na obou stranách mezery.
2. Vyplňte název, důvod, doložení a autora. V detailu lze vrcholy přesouvat, vkládat a odebírat. Uložení úpravy vrátí linii do draftu. Odstranění a úpravy lze vrátit historií. Mapou vede výrazná přerušovaná linie.
3. Pro započtení do výpočtu nastavte stav **Schváleno pro výpočet**. Stiskněte **Zobrazit pevninu a ostrovy**. Worker odečte sjednocenou vodu od herní oblasti a polygonizuje nódované hranice souše a schválené linie. Pokud linie nevytvoří rozdělení nebo má konec uvnitř souše, editor ji vynechá a nabídne úpravu. Linie nemění geometrii vody ani vzdálenost k řece.
4. Klikněte na vybarvenou oblast a zkontrolujte plochu a použitá ruční oddělení. Název se uloží pod stabilním otiskem normalizované geometrie. Ke schválení doplňte správce a doklad úplnosti. Editor ověřuje jednoznačné přiřazení způsobilých referenčních bodů PID na souši. Bod na společné hranici zůstane nejednoznačný a schválení blokuje. Jednotlivé oblasti lze místně schválit po ruční kontrole. K dokončení kontroly pokrytí celé vrstvy je potřeba použitelný snapshot se způsobilými stanovišti.

## Uložení a publikace

Draft se ukládá se světem v IndexedDB. **Uložit draft řek** čeká na zápis. Do zálohy JSON a úplné zálohy světa se ukládá checksum zdroje, vybraná a ručně vyřazená GLOBALID, linie, názvy, poznámky a historie schválení. Import říčního draftu upravuje pouze pracovní stav editoru řek. Starší zálohy Vltavy se načtou se stávajícími ID, vyloučeními a poznámkami. Jiný checksum zdroje import odmítne.

Změna výběru ruší aktuální revizi vody i pevniny. Úprava linie ruší revizi pevniny. Náhled lze po reloadu přepočítat, názvy stejných geometrií zůstanou připojené. Místní schválení pevniny je vázané na přesnou geometrii. Kontrola pokrytí se aktualizuje při změně stanovišť PID.

Před publikací ověřte skutečný rozsah obou řek, doklady ke zdroji, polohu oddělení a úplnost pevninských oblastí nad aktuálními stanovišti. Výchozí data editoru a původní prostorový audit lze reprodukovat příkazem `npm run data:vltava-editor`. [Audit původní Vltavy](vltava.md)

## Řeka a pevnina v herních datech

Příkaz pro lokální audit nad aktuálním katalogem spusťte z kořene repozitáře.

```sh
npx tsx scripts/prepare-river-release.ts --metadata-review data/source-metadata/vltava-berounka-review.json
```

Skript čte vodní polygon s 173 původními GLOBALID z `data/raw/vltava-berounka-approved.geojson`. Výběr, kontrolní součet polygonu a schválenou linii u Mánesa ověří podle editorového exportu `data/raw/reky-draft.json`. Jiný aktuální export lze předat přes `--assembly`. Skript kontroluje SHA-256 původního GIS archivu a znovu sestaví výběr z ověřeného zdroje editoru. Sjednocený polygon ze 173 záznamů má 17 otvorů a stejný kontrolní součet jako schválený export.

Odečtení vody od publikované hranice a použití linie u Mánesa dalo 24 samostatných komponent. Šest sdílí úsek hranice hry. Mezi nimi jsou tři velké části o přibližně 323, 149 a 15,9 km² a tři drobné okrajové části o rozloze 615 až 1 503 m². Uvnitř území je 18 izolovaných komponent včetně Žofína. Bez linie u Mánesa se Žofín spojí s pravým břehem a počet komponent klesne na 23. Ze snapshotu PID z 20. 10. 2026 dostalo jedinou oblast všech 1 457 způsobilých stanovišť. Samostatná kontrola novějšího ověřeného snapshotu PID z 2. 11. 2026 přiřadila 1 460 z 1 460 způsobilých stanovišť. Pro ostré vydání se kontrola opakuje s PID platným v den vydání. [Katalog kontrolovaného snapshotu](https://github.com/Wondrej89/JetLagPrague/blob/339efb7cc0837f87f904fe5b388b74b3f0088aa7/pid/index.json).

Vodní data **Oázy chladu – vodní plochy a toky** pořídil Institut plánování a rozvoje hl. m. Prahy a zveřejnil je pod licencí **CC BY 4.0** podle výpisu z Geoportálu dodaného správcem. XML `AGD_OCH_VodniPlochyToky_p.shp.xml` v původním archivu potvrzuje identifikátor vrstvy `CZ-70883858-AGD_CUR.AGD_OCH_VodniPlochyToky_p`, identifikátor metadat `B132F767-6ECE-47C0-9701-49FA9F18477F`, prostorový rozsah a revizi vrstvy **31. 7. 2026** v poli `dataIdInfo/idCitation/date/reviseDate`. JetLagPrague vybral a sjednotil toky, převedl je do WGS84 a odvodil pevninu podle herní oblasti a schválené linie u Mánesa. [Záznam datové sady](https://geoportalpraha.cz/data-a-sluzby/e01b4bb6d148496abff4f065686290ff) · [Licence CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en) · [Záznam revize](vltava-berounka-review.json).

Referenční katalog schématu 9 v repozitáři používá PID z 20. 10. 2026. Příkaz níže ověří dodané podklady a přidá referenční vydání do katalogu. Pokud je shodné vydání již aktuální, zopakuje kontrolu.

```sh
npx tsx scripts/prepare-river-release.ts --metadata-review data/source-metadata/vltava-berounka-review.json --write-reference-release
```

Pro ostré vydání připravte vrstvy ke kontrole v editoru pomocí volby `--output ricni-podklady.json`. V dialogu **Publikace herních podkladů** importujte JSON a zkontrolujte návrh. Schéma 9 ověří kontrolní součty obou vrstev, vazbu pevniny na verzi řek a hranice hry i jednoznačné přiřazení způsobilých zastávek. Položka `landAreas` váže pevninu na kontrolní součet celé vrstvy `riverArea` i samotné říční geometrie. Ostré vydání vyžaduje nasazený Worker se schématem 9 a PID platný v den vydání.

Ze schváleného katalogu používá **Vzdálenost k řece** celou plochu včetně otvorů a měří v metrech k nejbližší vodě. **Pevnina** porovnává stabilní ID souvislých oblastí podle uzamčeného stanoviště. Body ve vodě a na hranici jsou pro Matching nejednoznačné. Obě vrstvy lze zapnout na mapě. Dedukce kombinují skutečné pevninské polygony s konzervativním vybarvováním vzdáleností.
