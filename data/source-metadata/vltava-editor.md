# Řeky – sestavení vodní plochy

V geografickém editoru otevřete **Řeky – sestavení vodní plochy**. Společná vodní plocha vzniká výběrem původních polygonů Vltavy a Berounky. Její revize a revize pevniny jsou samostatné.

## Pracovní výběr a vodní plocha

1. **Načíst 62 kandidátů z auditu** načte výchozí výběr z 2 755 zdrojových toků typu T. Počet v editoru vychází z načteného zdroje.
2. **Vybrat všechny navazující úseky řeky** projde graf prostorových sousedů od výchozích kandidátů. V nezměněném výběru rozšíří skupinu na 173 úseků, tedy o 111. Skupina zahrnuje i přítoky určené k ruční revizi.
3. Kliknutím na polygon jej přidáte nebo odeberete. Modrá označuje vybrané, šedá ostatní a zelený obrys krátce zvýrazní nově přidané úseky. Pokud polygon není vidět, vyhledejte jeho GLOBALID nebo přepněte na všechny toky T.
4. **Přidat všechny sousední úseky vybraného polygonu** přidá jen přímé sousedy polygonu zobrazeného v detailu. Ručně vyřazený úsek se vrátí samostatným kliknutím nebo po potvrzení hromadného přidání. Vyřazené úseky se při běžném průchodu přeskočí, včetně větví, ke kterým vedou jako jediná cesta.
5. **Vytvořit náhled sjednocené řeky** provede GEOS union ve workeru. Inspector ukáže plochu, komponenty, otvory a stav geometrie. Kontrola břehů, přítoků a podmostí zůstává součástí ruční revize.

Ke schválení vodní plochy předejte náhled k revizi a vyplňte kontrolní seznam, poznámky k orientačním místům, původ dat a autora revize. ZIP sám nedokládá licenci ani datum dat. Po schválení lze vyexportovat místní GeoJSON s vodním Polygonem nebo MultiPolygonem, zdrojovým SHA-256 a seznamem GLOBALID. Původní schválení samotné Vltavy zůstává evidované v draftu a vyžaduje novou revizi společné plochy.

## Oddělovací linie a pevnina

1. Přibližte se k chybějícímu rameni, například u Mánesa. Aktivujte **Oddělit ostrov / pevninu**, přidejte vrcholy klikáním a dokončete dvojklikem. Konce umístěte na břeh nebo zřetelně do vody na obou stranách mezery.
2. Vyplňte název, důvod, doložení a autora. V detailu lze vrcholy přesouvat, vkládat a odebírat. Uložení úpravy vrátí linii do draftu. Odstranění a úpravy lze vrátit historií. Mapou vede výrazná přerušovaná linie.
3. Pro započtení do výpočtu nastavte stav **Schváleno pro výpočet**. Stiskněte **Zobrazit pevninu a ostrovy**. Worker odečte sjednocenou vodu od herní oblasti a polygonizuje nódované hranice souše a schválené linie. Pokud linie nevytvoří rozdělení nebo má konec uvnitř souše, editor ji vynechá a nabídne úpravu. Linie nemění geometrii vody ani vzdálenost k řece.
4. Klikněte na vybarvenou oblast a zkontrolujte plochu a použitá ruční oddělení. Název se uloží pod stabilním otiskem normalizované geometrie. Ke schválení doplňte správce a doklad úplnosti. Editor ověřuje jednoznačné přiřazení způsobilých referenčních bodů PID na souši. Bod na společné hranici zůstane nejednoznačný a schválení blokuje. Jednotlivé oblasti lze místně schválit po ruční kontrole. K dokončení kontroly pokrytí celé vrstvy je potřeba použitelný snapshot se způsobilými stanovišti.

## Uložení a publikace

Draft se ukládá se světem v IndexedDB. **Uložit draft řek** čeká na zápis. Do zálohy JSON a úplné zálohy světa se ukládá checksum zdroje, vybraná a ručně vyřazená GLOBALID, linie, názvy, poznámky a historie schválení. Import říčního draftu upravuje pouze pracovní stav editoru řek. Starší zálohy Vltavy se načtou se stávajícími ID, vyloučeními a poznámkami. Jiný checksum zdroje import odmítne.

Změna výběru ruší aktuální revizi vody i pevniny. Úprava linie ruší revizi pevniny. Náhled lze po reloadu přepočítat, názvy stejných geometrií zůstanou připojené. Místní schválení pevniny je vázané na přesnou geometrii. Kontrola pokrytí se aktualizuje při změně stanovišť PID.

Před publikací ověřte skutečný rozsah obou řek, doklady ke zdroji, polohu oddělení a úplnost pevninských oblastí nad aktuálními stanovišti. Následná integrace potřebuje samostatné verzované vstupy pro vodu a pevninu i pravidla resolveru pro Measuring a Matching. Současná veřejná hra používá dosavadní publikace. Výchozí data a původní prostorový audit lze reprodukovat příkazem `npm run data:vltava-editor`. [Audit původní Vltavy](vltava.md)
