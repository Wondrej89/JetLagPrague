# Jet Lag Praha – Iterace 03: Veřejná doprava PID a úkrytové zóny

**Repozitář:** https://github.com/Wondrej89/JetLagPrague

## 1. Kontext projektu

Vyvíjíme geografický editor pro pražskou variantu hry inspirované Jet Lag: The Game.

Současná aplikace obsahuje:
- Mapový podklad Mapy.com.
- Ruční kreslení a editaci geografických objektů.
- Definici herní oblasti.
- Spravované vrstvy městských částí a katastrálních území Prahy.
- Nástroj pro ověřování polohy.
- Lokální ukládání do IndexedDB.
- Import, export a správu zdrojových dat.

Tyto funkce musí zůstat zachovány.

**Cílem iterace 03 je doplnit skutečná geografická data pražské integrované dopravy a připravit pravidla pro určování povolených úkrytových zón.**

Editor musí umožnit zobrazit zastávky, filtrovat je podle dopravních prostředků, zobrazovat trasy linek, aktualizovat zdrojová data a vyhodnocovat vzdálenost od zastávky.

Zatím neimplementuj multiplayer, editor herních otázek ani sledování skutečných hráčů.

---

## 2. Zdrojová data PID

Použij oficiální otevřená data systému PID.

### Primární zdroje

**Aktivní zastávky v aktuálním dni:**

https://data.pid.cz/geodata/Zastavky_WGS84.json

**Skupiny zastávek a jejich jednotlivá stanoviště:**

https://data.pid.cz/stops/json/stops.json

**Trasy linek:**

https://data.pid.cz/geodata/Linky_7d_WGS84.json

Dokumentace:
https://pid.cz/o-systemu/opendata/

Před implementací:
1. Ověř dostupnost souborů.
2. Prozkoumej skutečnou strukturu a názvy atributů.
3. Identifikuj stabilní ID zastávek, skupin a stanovišť.
4. Ověř, jak jsou uvedeny jednotlivé dopravní prostředky.
5. Ověř, zda lze jednotlivé zdroje bezpečně propojit.
6. Ověř, co zdroj považuje za aktivní zastávku a jak reprezentuje konečné stanice.

**Nevymýšlej atributy ani propojení, která nelze doložit z dat.**

Pokud prostředí Codexu nebude mít přístup k externím souborům, připrav podporu pro jejich ruční vložení do `data/raw/pid/` a sděl, které přesné soubory jsou potřeba.

Mapy.com používej pouze jako mapový podklad, nikoliv ke stahování databáze zastávek.

---

## 3. Denní aktualizace dat PID

Zastávky se mohou měnit kvůli výlukám, změnám linek nebo zřizování nových stanovišť.

Aplikace proto musí mít možnost pracovat s aktuálním seznamem aktivních zastávek.

### Chování aplikace

- Při prvním otevření editoru v daném kalendářním dni stáhni aktuální data PID.
- Datum určuj podle časového pásma `Europe/Prague`.
- Ověřená data ulož do IndexedDB.
- Při dalším otevření ve stejný den používej uložený snapshot.
- Umožni ručně vyvolat aktualizaci.
- Pokud aktualizace selže, zachovej poslední funkční snapshot a zobraz informaci o jeho stáří.
- Nový snapshot přijmi až po úspěšném stažení a validaci všech povinných částí.

U každého snapshotu eviduj:
- Datum, pro které byl vytvořen.
- Datum a čas stažení.
- Případnou platnost deklarovanou zdrojem.
- Kontrolní součet.
- Identifikaci zdroje a jeho verze.

### Důležité pro budoucí multiplayer

Při vytvoření herní místnosti bude nutné uzamknout jednu konkrétní verzi zastávkových dat pro všechny hráče.

Aktualizace dat během rozehrané partie nesmí změnit povolené úkrytové zóny.

V této iteraci pouze připrav datový model pro verzované snapshoty. Není potřeba implementovat server ani herní místnosti.

Pokud přímé stahování z prohlížeče blokuje CORS, navrhni minimální alternativu, například publikování denního snapshotu přes GitHub Actions. Nevyžaduj backend pouze kvůli základnímu zobrazení mapy.

---

## 4. Model zastávek PID

Rozlišuj tři úrovně:

**A. Zdrojová skupina zastávek**

Obsahuje oficiální identifikátor, název a související stanoviště.

**B. Fyzická stanoviště**

Jednotlivé nástupní, výstupní nebo jiné zastávkové body, pokud je zdroj PID poskytuje.

**C. Herní zastávka**

Logická jednotka, kterou si hráč může zvolit jako svou úkrytovou zastávku.

Herní zastávka má:
- Stabilní identifikátor.
- Název.
- Vazbu na jednu nebo více doložených zdrojových skupin.
- Seznam aktivních druhů dopravy.
- Jeden prioritní druh dopravy.
- Jeden referenční geografický bod.
- Jednu úkrytovou zónu.
- Případné ruční úpravy správce editoru.

Na mapě standardně zobrazuj **jeden symbol pro jednu herní zastávku**, nikoliv každý jednotlivý označník.

Původní souřadnice stanovišť však zachovej pro případný výpočet středu.

### Aktivní zastávky

Zobrazuj pouze zastávky obsluhované podle aktuálního snapshotu PID.

Zachovej konečné stanice, včetně těch, na kterých spoje končí a nemusejí pokračovat dál.

Není nutné vizuálně odlišovat nástupní a výstupní zastávky.

Pokud však zdroj obsahuje pomocné provozní body, které nejsou veřejnými zastávkami, nezahrnuj je do seznamu herních zastávek.

Denní a noční provoz eviduj odděleně, pokud to zdrojová data umožňují.

Nepovažuj zastávku za neaktivní jen proto, že v okamžiku otevření aplikace nemá nejbližší odjezd.

---

## 5. Priority druhů dopravy

Každá herní zastávka má právě jeden dominantní druh dopravy podle pevné priority:

| Priorita | Druh dopravy |
|---|---|
| 1 – nejvyšší | Vlak |
| 2 | Metro |
| 3 | Tramvaj |
| 4 | Autobus a trolejbus |

Autobus a trolejbus mají stejnou prioritu.

Započítávají se pouze druhy dopravy aktivní podle denního snapshotu.

### Příklad – Anděl

Pokud je jedna herní zastávka obsluhována metrem, tramvají a autobusem, prioritním druhem dopravy je metro.

Pro výpočet úkrytové zóny se proto použije pouze referenční bod metra.

Tramvajová a autobusová stanoviště nesmějí úkrytovou zónu rozšiřovat.

Pokud metro není v daném dni aktivní, další prioritou bude tramvaj.

### Přestupní uzly

Některé dopravní prostředky může PID evidovat v oddělených zastávkových skupinách.

Neslučuj automaticky všechny skupiny se stejným názvem nebo blízkými souřadnicemi.

Pokud zdroj obsahuje spolehlivou společnou identitu přestupního uzlu, použij ji.

Jinak umožni v editoru ruční propojení několika zdrojových skupin do jedné herní zastávky.

Automatická priorita se potom vyhodnotí nad propojenými skupinami.

**Přívozy a lanovku** eviduj jako samostatné druhy dopravy. Zatím je nezařazuj do výše uvedené priority. Editor musí umožnit jejich zobrazení a výslovné schválení jako samostatných herních zastávek. U kombinovaných uzlů vyžaduj pravidlo nebo ruční rozhodnutí správce.

---

## 6. Určení referenčního bodu zastávky

Každá herní zastávka musí mít právě jeden referenční bod, od kterého se počítá vzdálenost 400 metrů.

### Automatické určení

Použij následující postup:

1. Urči nejvyšší aktivní druh dopravy podle priority.
2. Vyber pouze stanoviště tohoto druhu dopravy.
3. Pokud PID poskytuje vhodný oficiální referenční bod příslušné stanice, může být použit.
4. Jinak vypočítej geografický střed z relevantních stanovišť stejného druhu dopravy.

Jako výchozí výpočet použij aritmetický průměr souřadnic stanovišť, nikoliv medián jednotlivých souřadnic.

Pro lokální vzdálenosti v Praze zajisti korektní geografický výpočet; nevypočítávej vzdálenost mezi GPS souřadnicemi jako vzdálenost v metrech bez transformace.

Pozor: pokud PID poskytuje průměrnou souřadnici skupiny obsahující metro, tramvaj a autobus, tento bod automaticky nepoužívej jako střed metra.

U vlaků a metra upřednostni doložený reprezentativní bod stanice, pokud lépe odpovídá její skutečné geografii.

### Ruční úprava

V editoru umožni:
- Zobrazit původní stanoviště.
- Zobrazit vypočítaný referenční bod.
- Ručně referenční bod přesunout.
- Vrátit se k automatickému výpočtu.
- Evidovat, zda je bod automatický nebo ručně schválený.
- Uložit zdůvodnění ruční úpravy.

Schválená ruční úprava má přednost před automatickým výpočtem.

Ruční úpravy uchovávej odděleně od originálních dat PID. Při aktualizaci zdrojových dat je nemaž.

Pokud dojde ke změně identifikátoru nebo struktury zastávky a její původní vazba přestane platit, označ úpravu k revizi.

---

## 7. Úkrytová zóna zastávky

Základní pravidlo hry:

**Schovávač se musí nacházet nejvýše 400 metrů vzdušnou čarou od referenčního bodu své vybrané herní zastávky.**

V editoru nastav výchozí poloměr 400 m, ale ponech možnost jeho změny v konfiguraci pravidel.

Úkrytová zóna:
- Je právě jeden geografický kruh.
- Má střed v jediném referenčním bodě.
- Nepoužívá sjednocení kruhů jednotlivých sloupků.
- Nezávisí na zoomu mapy.
- Je omezena průnikem s definovanou herní oblastí.
- Lze ji zobrazit jako skutečnou polygonovou geometrii.

Povolenost testovací polohy ověřuj primárně přes skutečnou geografickou vzdálenost od referenčního bodu a příslušnost k herní oblasti, aby aproximace kružnice polygonem nevytvářela chybná rozhodnutí na hranici 400 m.

Pro budoucí hru musí být vybraná zastávka schovávače tajná a její poloha nesmí být automaticky viditelná hledačům.

### Příklad – Anděl

Pokud má herní zastávka Anděl jako dominantní druh dopravy metro:

- Středem je referenční bod stanice metra Anděl.
- Úkrytová zóna je jediný kruh s poloměrem 400 m.
- Tramvajová a autobusová stanoviště tento kruh nerozšiřují.

---

## 8. Mapové vrstvy a filtry

V editoru přidej samostatnou sekci **Veřejná doprava PID**.

Umožni nezávisle zobrazovat:
- Metro.
- Tramvaje.
- Trolejbusy.
- Autobusy.
- Vlaky.
- Přívozy.
- Lanovku.

Přidej:
- Filtr denní / noční / všechny zastávky, pokud to data umožňují.
- Filtrování podle dominantního druhu dopravy.
- Vyhledávání zastávek podle názvu.
- Zobrazení celkového počtu aktivních herních zastávek.
- Možnost zapnout a vypnout všechny dopravní vrstvy.

Při kliknutí na zastávku zobraz:
- Název.
- Identifikátor.
- Všechny dostupné aktivní druhy dopravy.
- Dominantní druh dopravy.
- Počet relevantních stanovišť.
- Souřadnice referenčního bodu.
- Metodu výpočtu bodu.
- Datum zdrojového snapshotu.
- Tlačítko pro zobrazení 400m úkrytové zóny.

Velký počet zastávek nesmí způsobovat výrazné zpomalení mapy. Použij vhodnou optimalizaci vykreslování.

---

## 9. Trasy linek PID

Načti geografické trasy linek z oficiálního zdroje PID.

Umožni:
- Zobrazovat trasy jednotlivých druhů dopravy.
- Vyhledat linku podle čísla.
- Zvýraznit konkrétní linku.
- Skrýt ostatní linky.
- Zobrazit trasu v odpovídající barvě nebo odlišném stylu podle druhu dopravy.

Trasy jsou pouze referenční vrstva.

Samy o sobě nevytvářejí úkrytové zóny.

Pokud je dostupná pouze sedmidenní podoba tras, jasně označ, že jde o trasy provozované během sedmidenního období, nikoliv nutně všechny v aktuálním dni.

---

## 10. Testování úkrytových zón v editoru

Rozšiř existující nástroj „Ověřit polohu“.

Správce editoru musí být schopen:
1. Vybrat zastávku kliknutím do mapy.
2. Zobrazit její referenční bod.
3. Zobrazit její povolenou úkrytovou zónu.
4. Umístit do mapy testovací špendlík.
5. Přesouvat špendlík a průběžně sledovat výsledek.

Zobraz:
- Vzdálenost testovacího bodu od středu zastávky v metrech.
- Zda je bod do 400 m od zastávky.
- Zda leží uvnitř herní oblasti.
- Celkový výsledek: povolené / nepovolené místo.

V případě bodu přesně na hranici 400 m jej považuj za povolený. Při testování zohledni numerickou přesnost výpočtu.

Tento nástroj je pouze simulační. Nepoužívej zatím skutečnou GPS uživatele.

---

## 11. Správa dat a ruční výjimky

Navazuj na existující systém správy geografických zdrojů z iterace 02.

Doplň možnost:
- Ručně povolit nebo vyloučit zastávku pro herní účely.
- Upravit její referenční bod.
- Propojit nebo oddělit skupiny zastávek v rámci herního modelu.
- Porovnat dva snapshoty PID.
- Zobrazit nově přidané, změněné a odebrané zastávky.

Ruční úpravy musí být uložené odděleně od automaticky importovaných dat.

Při aktualizaci zdrojových dat nesmí dojít ke ztrátě uživatelských úprav, definice herní oblasti ani administrativních vrstev.

Změny vyžadující ruční revizi musí být jasně označené.

---

## 12. Testy a kontrola kvality

Přidej jednotkové a E2E testy.

Ověř minimálně tyto scénáře:

- Anděl: metro má přednost před tramvají a autobusem.
- Zastávka s tramvají a autobusem: dominantní je tramvaj.
- Zastávka s vlakem a metrem: dominantní je vlak, pokud jsou doloženě součástí stejného herního uzlu.
- Dvě protilehlá tramvajová stanoviště: vznikne jeden referenční bod a jeden kruh.
- Konečná stanice: není automaticky vyřazena.
- Velký železniční terminál: lze ručně upravit referenční bod.
- Noční zastávky: správně funguje filtr.
- Výluka dominantního druhu dopravy: priorita se přepočítá podle aktuálního zdroje.
- Stejnojmenné, ale nesouvisející zastávky: nespojí se automaticky.
- Vzdálenost 399 m je povolená, 401 m nepovolená.
- Úkrytová zóna respektuje hranice herní oblasti.
- Aktualizace PID zachovává ruční výjimky.
- Nedostupný zdroj neodstraní poslední funkční snapshot.
- Stávající městské části, katastry a vlastní polygony zůstanou funkční.

Použij skutečné zdrojové záznamy, pokud jsou dostupné. Kde nelze doložit příslušnost k určitému dopravnímu uzlu, nevytvářej umělé propojení jen kvůli úspěšnému testu.

---

## 13. Technické požadavky

Zachovej:
- React + TypeScript.
- Leaflet a Mapy.com podklad.
- Sdílený balíček `packages/geo-core`.
- IndexedDB.
- Současný systém geografických vrstev.
- Import/export a zpětnou kompatibilitu draftů.
- Nasazení na GitHub Pages.

Přidej samostatný modul pro zpracování a validaci PID dat a samostatný modul pro pravidla herních zastávek.

Geografické výpočty nesmějí být závislé na mapové komponentě Reactu. Musí být opakovaně použitelné při budoucím serverovém vyhodnocování hry.

Při větších datových sadách zajisti, aby aktualizace, validace a výpočty nezamrzaly uživatelské rozhraní.

---

## 14. Rozsah této iterace

**Implementuj nyní:**
- Import a denní aktualizaci zastávek PID.
- Datový model herních zastávek.
- Dopravní priority.
- Jeden referenční bod pro každou herní zastávku.
- Ruční úpravy a výjimky.
- Vrstvy a filtry druhů dopravy.
- Vizualizaci tras linek.
- 400m úkrytové zóny.
- Ověřování testovací polohy vůči zóně.
- Testy a dokumentaci.

**Neimplementuj zatím:**
- Multiplayer a herní místnosti.
- GPS sledování hráčů.
- Editor karet a otázek.
- Herní ekonomiku.
- Chat.
- Posílání fotografií.
- Realtime odjezdy a jízdní řády.
- Navigaci a vyhledávání spojení.

Po dokončení proveď testy, lint, typecheck a build. Aktualizuj README a popiš známá omezení zdrojových dat PID.

Pokud některá část závisí na nedostupných nebo nejednoznačných datech, implementuj bezpečný stav „nelze určit“ nebo „vyžaduje revizi“ namísto vymyšleného výsledku.

**Nepokračuj automaticky do další vývojové iterace.**