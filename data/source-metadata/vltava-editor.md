# Vltava – sestavení řeky v geografickém editoru

Nástroj je v editoru na `/JetLagPrague/editor/`, v samostatné sekci **Vltava – sestavení řeky**. Nezaměňuje se s katalogem `waterbody` a nemění veřejnou hru. Zdrojový ZIP ani sedm historických publikací se neupravují.

## Práce na mapě

1. Stiskněte **Otevřít nástroj Vltava**. Načte se 2 755 původních polygonů T; výchozí mapa ukazuje 62 oranžových kandidátů, zatím bez zařazení.
2. **Načíst 62 kandidátů z auditu** nahradí výběr kandidátní množinou. Nejde o schválení. Změnu lze vrátit pomocí **Zpět ve výběru / Znovu ve výběru**, které využívají historii světa.
3. Klikání na skutečné vodní polygony přidává a odebírá jednotlivé GLOBALID bez dialogů. Zařazené úseky jsou modré, kandidáti oranžoví, ostatní / explicitně vyřazené šedé. Původní vrcholy se nemění. Vpravo jsou GLOBALID, původní pořadí, příslušnost k 62/173, atributy a explicitní akce Přidat/Odebrat/Přiblížit.
4. Přepínejte mezi 62 kandidáty, širší skupinou 173, všemi T, vybranými úseky a platným sjednoceným náhledem. Posuvník mění krytí vodních polygonů nad stávajícím podkladem Mapy.com.
5. **Zobrazit sousední nevybrané polygony** zvýrazní fialovým obrysem skutečné sousedy aktuálního úseku, i mimo základní zobrazovací filtr. Žádný soused se nepřidá automaticky. Hledání podle GLOBALID prohledává všech 2 755 záznamů; výběr ze seznamu přepne potřebný zobrazovací režim a přiblíží polygon.
6. **Prověřit přítoky** ukáže širší komponentu a okolí napojení Berounky. Sousednost znamená pouze kontakt zdrojových polygonů, nikoli příslušnost k Vltavě.
7. **Vytvořit náhled sjednocené řeky / Najít přerušená místa** provede skutečný GEOS union a validaci ve Web Workeru. Vpravo jsou počet vstupů, Polygon/MultiPolygon, oddělené komponenty, otvory, plocha a počet vrcholů. Každou komponentu a otvor lze samostatně přiblížit. Červený obrys oddělených částí označuje místo k prověření; sám neznamená neplatný polygon. Chyba validace označí problémové zdrojové úseky. Nic se neopravuje bufferem, convex hull ani domýšlením spojnic.

Při odebrání propojujícího úseku nástroj upozorní na možné rozdělení výběru. Přesný výsledný počet vodních komponent ověřuje až GEOS náhled, nikoli pouze graf sousednosti. Otvory jsou možné skutečné ostrovy, ne automaticky chyby.

## Uložení a zálohy

Každá změna se ukládá se světem v původní IndexedDB, s dosavadní localStorage zálohou. Tlačítko **Uložit draft Vltavy** čeká na dokončení zápisu a oznámí případnou chybu. Před uzavřením stránky vyčkejte na potvrzení uložení.

Po reloadu znovu otevřete nástroj. Výběr, vyřazená kandidátní ID, poznámky, metadata i kontroly zůstanou zachované. U stavu `review` / `approved` se z původních ID znovu vypočítá náhled; neukládají se kopie všech zdrojových polygonů.

**Export výběru Vltavy JSON / Import výběru Vltavy JSON** přenáší pouze rozpracovanou práci. Import mění jen výběr Vltavy a jde vrátit historií; nevymění vlastní objekty, PID, herní oblast ani vodní plochy. Stejná data obsahují také úplné JSON/GeoJSON zálohy světa. Starší světy bez `vltavaAssembly` zůstávají kompatibilní.

Draft eviduje ID datasetu, SHA-256 ZIPu a připraveného datasetu, vybrané ID, explicitně vyřazené kandidáty, ruční kontroly, poznámky a čas úprav. Odlišný checksum nebo neznámá ID import odmítne. Při nové verzi aplikace se starý výběr nesmí tiše aplikovat na jiné geometrie: původní práce zůstane zachovaná a dostupná k exportu. Lze obnovit odpovídající zdroj nebo výslovně založit nový výběr pro nový zdroj; ostatní data světa se nemažou.

## Revize, schválení a výstup

Stavy jsou `draft`, `review`, `approved`. Platné GEOS sjednocení dovolí **Předat náhled k revizi**, ale nezaškrtne jedinou ruční kontrolu. Každá změna výběru vrací stav `draft`, ruší schválení a obnoví nezkontrolovaný stav míst i kontrolního seznamu; poznámky se uchovají. Úprava rozhodnutí, poznámek nebo metadat po schválení vrací stav `review`.

Správce musí jednotlivě zkontrolovat Střelecký a Císařský ostrov, Císařskou louku, Veslařský ostrov a Žofín. Stav každého místa může být nezkontrolováno, nevyřešeno nebo ručně ověřeno; u každého je poznámka. Značky jsou převzaté referenční body schválených parků z publikace uvedené ve zdroji. **Nejsou autoritativními břehy ani automatickým důkazem správnosti ostrovů.** Výsledky bod-voda / bod-v-otvoru jsou jen orientační upozornění.

Schválení vyžaduje sedm explicitních kontrol: identitu Vltavy, pokrytí, ostrovní ramena, Žofín, přemostění, mezery a původ dat. Dále všech pět míst ručně ověřených, jméno správce a doložená metadata. Nevyřešené místo schválení blokuje.

Původní ZIP **nedokládá konkrétní licenci ani skutečné datum dat**. Datum synchronizace 5. 10. 2026 se za datum měření nevydává. Je nutné doplnit datum/verzi, licenci a doklad ověření podle skutečného zdroje. Nástroj je nevymýšlí.

**Export schválené Vltavy GeoJSON** vyžaduje úspěšné schválení a shodu kontrolních součtů aktuálního výběru i výsledné geometrie. Výstup znovu ověřuje existující `readVltavaWaterAreaInput`: WGS84 vodní Polygon/MultiPolygon, `river:vltava:prague`, původní GLOBALID, source/version/date/license/SHA a autor/čas revize pokrytí. Totožnost a úplnost potvrzuje správce, nikoli samotný syntaktický validátor.

**GameDataRelease zatím nemá komponentu Vltavy.** Používá se tedy povolená cesta exportu schváleného validovaného kontraktu pro následné zapojení publikace. Současný publikační dialog výslovně informuje, že Vltavu neobsahuje. Lokální draft, review ani approved nezpřístupní Measuring a nevytvoří odpovědi, odměny či dedukce. Publikace a resolver jsou další samostatný krok po ručním ověření skutečných dat.

## Statická data a reprodukce

`npm run data:vltava-editor` vytvoří `apps/editor/public/vltava/streams.json` a manifest v `apps/editor/src/data/vltava-manifest.json`. Zachová všechna T, jejich přesné transformované geometrie, původní atributy, pořadí a GLOBALID. Původní EPSG:5514 zůstává v nezměněném ZIPu; WGS84 používá dosavadní `readParkFile` / proj4.

Členství 62/173 a návaznost jsou reprodukované z prostorového auditu. Kontakty počítá GEOS v původním EPSG:5514 s tolerancí 0,000001 m; bounding box je pouze urychlovací filtr před skutečnou polygonovou operací. Příprava vyžaduje shodu původního ZIPu a kandidátů s uloženým auditem. Změna zdroje vyžaduje nový kontrolovaný audit.

Zdrojový soubor má přibližně 6,7 MB a načítá se až po otevření nástroje. Worker ověřuje SHA-256 proti manifestu, jedinečnost ID, geometrii a souměrnost sousednosti. GEOS je součástí editorového workeru, ne veřejného herního adaptéru. Všechny náročné operace jsou místní; neprobíhá žádný nový import z externího GIS API.

Dosavadní [prostorový audit](vltava.md) zůstává platným výchozím zjištěním: kandidáti nejsou schválená kompletní Vltava, některá ramena chybějí a Žofín vyžaduje odbornou kontrolu. Nástroj dovoluje tato místa ručně prozkoumat a evidovat jako nevyřešená; nepřidává vodu tam, kde ji nedokládá zdroj.
