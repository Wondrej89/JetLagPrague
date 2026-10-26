# Sdílené mapy a poloha hledačů

Simulátor i mobilní klient používají stejný Leaflet `GameMap` / `MapSurface` a přímé dynamické dlaždice Mapy.com. Statický atlas, přednačítání celé Prahy a omezení detailu na zoom 13 byly odstraněny. Přepínač mapových režimů není potřeba.

## Nativní detail

Pro vrstvu **basic** má služba nativní zoom **0–20**. Leaflet má shodné limity mapy i vrstvy (`maxZoom: 20`, `maxNativeZoom: 20`), takže nad nativní rozsah nepřibližuje. Při změně zoomu a výřezu žádá odpovídající XYZ dlaždice `/v1/maptiles/basic/256/{z}/{x}/{y}`. Na displeji s vyšší hustotou pixelů používá `256@2x` ve stejném zoomu; nepřidává umělou úroveň 21. Body, polygony a vzdálenosti zůstávají ve svých skutečných souřadnicích WGS84.

Rozsah a HiDPI varianta byly ověřeny 26. 10. 2026 v [dokumentaci poskytovatele](https://github.com/mapycom/developer/blob/c322fefbab6f18073f3bb80b2b965b632a1d2c03/docs/rest-api/map-tiles.md). Web dokumentace a přímý host API v prostředí Codex vracejí síťové HTTP 403; dokumentace byla získána z veřejného GitHub repozitáře Mapy.com. Živé vykreslení služby tím není nezávisle ověřené. Automatické síťové testy nahrazují odpovědi dlaždic kontrolovanými obrázky a ověřují skutečnou práci Leafletu, URL, zoomy, zachování pozic a maximální přiblížení.

Klientský klíč zůstává `VITE_MAPY_API_KEY`: při lokálním vývoji v `.env.local`, při nasazení v dosavadním GitHub Actions secretu. Musí mít povolené mapové dlaždice a webové původy aplikace, včetně GitHub Pages a případně lokálního vývoje. Konkrétní oprávnění klíče se mění v účtu Mapy.com; aplikace je neobchází. Atribuce a klikatelné logo Mapy.com zůstávají na mapě.

Bez klíče nebo při chybě služby je zobrazena informace, zatímco geometrie a GPS fungují dále. Náhradní rozmazaný atlas se nevytváří. Změny mapy nemění pravidla, otázky, karty, GPS, stanoviště ani dedukční epochu. Běžné dlaždice spravuje prohlížeč; aplikace je trvale nearchivuje ani nevkládá do herních katalogů.

Mapy.com nyní vidí požadavky podle výřezu a zoomu. Z polohy požadovaných dlaždic lze odvodit zobrazenou oblast. To je očekávané chování dynamické mapy. Herní stav, fotografie, karetní ruka ani diagnostika nejsou tělem nebo parametrem těchto požadavků; veřejný klientský klíč a běžný webový původ zůstávají součástí mapového přístupu.

## Rolové GPS

`RoleView.hunterLocation` je určeno **pouze schovanému**. `viewForRole()` ho odvozuje z aktuálního pozorování hledačů a konfigurace GPS. Obsahuje `fix` (bod, původní čas, přesnost), `status` a vysvětlení. Phone ani mapové komponenty nečtou administrátorský `GameState`.

- `current`: platná aktuální poloha; modrá značka H.
- `stale`: skutečná poslední známá poloha, označená jako neaktuální; původní čas zůstává viditelný, přesnost je zachovaná v rolových datech.
- `inaccurate`: pozorovaný bod s výslovným upozorněním na nepřesnost.
- `unavailable`: GPS není dostupná, žádná náhradní značka se nevytváří.
- `invalid`: neplatné souřadnice, čas nebo přesnost; bod se nepředává k zobrazení.

Hranice stáří a přesnosti se přebírají z uložených pravidel konkrétní partie; podmínky způsobilosti ve hře se nemění. Schovanému zůstává vlastní fialová GPS, uzamčené stanoviště i okruh. Hledači nedostávají GPS ani aktuální uzamčenou zastávku schovaného. Zůstává pouze existující pravidlo Move, které výslovně odhaluje **původní** stanoviště.

Přesun GPS hledačů formulářem nebo tažením v simulátoru aktualizuje sdílený stav a oba odpovídající role pohledy. Během Move platí původní zákaz simulovaného pohybu. Výslovně zapnutá diagnostická pozorování skutečného posunu se dál auditují; schovaný vidí zaznamenanou polohu, pravidla tím nejsou zrušena. V budoucím multiplayeru musí rolové pohledy poskytovat autorizovaný server; místní transport zůstává simulátorem.

## Rozhraní telefonu

Horní lišta nemá aplikační logo. Dva krátké řádky obsahují jméno týmu, roli a kolo, hlavní čas hry a při schovávání souběžný odpočet. Při schovávání zabírá přibližně 60 px i na úzkém telefonu. Mapa využívá většinu zbývající výšky; informace o stanovišti a herní akce jsou dostupné posunutím obsahu pod mapu. Důležitá upozornění a příchozí otázky zůstávají zachované. Logo a atribuce poskytovatele Mapy.com zůstávají na mapě.

Během přípravy, schovávání a čekání na stanoviště se v telefonu nezobrazuje poloha hledačů, jejich značka ani tlačítko pro její centrování. Od fáze hledání má schovaný pod časovačem stručné **Hledači jsou X m daleko**. Vzdálenost se počítá geograficky mezi jeho vlastní GPS a rolově předanou GPS hledačů, nikoliv od uzamčené zastávky. Souřadnice hráčů se v telefonních panelech nevypisují; diagnostika správce a souřadnice veřejných POI zůstávají dostupné.

U staré polohy se text změní na **Hledači naposledy X m daleko**, doplněný původním datem a časem pozorování. Nepřesná GPS je označená a má rovněž timestamp. Bez polohy hledačů nebo bez spolehlivé vlastní GPS se vzdálenost neodhaduje; zobrazí se důvod nedostupnosti. Zastávka ani nula nenahrazují chybějící měření. Informace zůstává v horní liště také při otevření karet nebo otázek. Vlastní a sdílené GPS, herní časování a pravidla způsobilosti se touto změnou nemění.

## Kamera

Na mapě telefonu je **Moje GPS**. Schovaný má během hledání také **Zobrazit hledače**, které centruje poslední známý dostupný bod. Při chybějící poloze je tlačítko zakázané. Tlačítka fungují opakovaně i po ručním posunutí mapy. Posun značek zachovává úroveň přiblížení; tlačítka, veřejné POI, dedukční vrstvy a dosavadní mapové interakce používají společnou mapovou komponentu. Nastavení kamery není herní příkaz. Při odstranění mapy se odpojí její události a opožděné resize callbacky; rychlá změna velikosti okna společně s přepnutím záložky nebo scénáře proto nečte odstraněný Leaflet panel.

## Ověření

Jednotkové testy ověřují rolovou izolaci, aktuální a poslední známou GPS, přesnost, neplatné hodnoty, obnovu uloženého stavu a Move. E2E ověřují kompaktní lištu, větší mapu na úzkém telefonu, skrytí informací o hledačích při schovávání, vzdálenost mezi skutečnými GPS body a zachování timestampu při reloadu, tři značky schovaného během hledání, přesun formulářem i skutečným tažením, výpadek a stáří GPS, opakované centrování, nativní dlaždice do zoomu 20, HiDPI, geografické zarovnání POI a dedukcí, veřejný mobilní pohled a odstranění mapy během čekající události resize/moveend.

Pro lokální E2E bez vlastního klíče lze použít pouze testovací klientskou hodnotu při buildu: `VITE_MAPY_API_KEY=public-map-tiles-test-client npm run build` a následně `PLAYWRIGHT_SKIP_BUILD=1 npm run test:e2e`. Testy API odpovědi nahrazují; takový klíč neposkytuje přístup k živé službě. Publikační workflow stále sestavuje aplikaci s vlastním existujícím Actions secretem. Zdroje geodat, kontrolní součty a uložené světy se nemění.
