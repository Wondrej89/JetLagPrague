# Návrh samostatné fáze: aktivní obsluha z GTFS PID

Tento dokument je návrh; adaptér ani zdroj ostrých her se nyní nemění. [Audit z 16. října](PID_REFRESH_AUDIT_2026-10-16.md) potvrdil, že geodata aktivních zastávek a tras zůstala srpnová, přestože skupiny zastávek se aktualizují.

Oficiální stránka [Otevřená data PID](https://pid.cz/o-systemu/opendata/) odkazuje na [PID_GTFS.zip](https://data.pid.cz/PID_GTFS.zip). Při kontrole 16. 10. odpověděl archiv na HEAD HTTP 200, s Last-Modified `2026-10-16 01:52:02 UTC` a velikostí 53 119 580 B. To je slibný kandidát na aktuální zdroj. Obsah ZIP a skutečné sloupce tohoto vydání se v této opravě nezkoumaly; samotná hlavička neprokazuje platnost jízdního řádu.

Před implementací je potřeba provést samostatný audit jednoho úplně staženého vydání, ověřit licenci, SHA-256, skutečné soubory a schémata. Následující názvy souborů označují očekávané části standardu GTFS, nikoli již ověřený obsah uvedeného archivu.

1. Ověřit kalendář obsluhy (`calendar.txt`, `calendar_dates.txt`), rozsah platnosti a časové pásmo. Aktivní provoz pro konkrétní pražský den odvodit z platných služeb a výjimek. Ověřit noční spoje a časy nad 24:00; neplést přítomnost zastávky v feedu s aktivní obsluhou daného dne.
2. Prověřit skutečné vazby `trips`, `stop_times`, `stops` a `routes`, včetně neobsluhovaných nebo pouze provozních míst, omezení nástupu/výstupu a druhů dopravy. Nestandardní hodnoty odmítnout k revizi. Noční provoz neodhadovat z čísel linek bez doloženého pravidla.
3. Ověřit přesné identity GTFS `stop_id` a případnou hierarchii `parent_station` proti stávajícím fyzickým stanovištím a oficiálním kódům. Zachovat původní ID i výjimky. Neslučovat podle názvu či blízkosti a neodstraňovat přípony ID bez důkazu. Změny vazeb vyžadují porovnání a revizi.
4. Prověřit `shapes` a jejich skutečné vazby na spoje. Pokud GTFS neposkytuje potřebnou geometrii nebo chybí vazba, vrátit „nelze určit“; nevytvářet náhradní rovné linie. Dosavadní geodatové trasy mohou zůstat samostatnou datovanou referenční vrstvou.
5. Připravovat zpracovaný snapshot v GitHub Actions, uložit jej jako komprimovanou statickou publikaci a zachovat atomické přijetí, verze a kontrolní součty. Aplikace na Pages nebude při každém otevření stahovat a zpracovávat celý archiv. Geografické jádro a UI budou dál používat existující rozhraní snapshotu, rozšířené pouze o řádně verzovanou evidenci nového zdroje.
6. Před přepnutím ověřit pracovní den, víkend, svátek, výjimku, noční spoj, konečnou, změnu stanoviště, nejednoznačné ID, chybějící shape a výpadek aktualizace. Porovnat několik konkrétních pražských míst s publikovaným jízdním řádem. Ověření musí zahrnout i zachování ručních výjimek a starých záloh.

Přechod vyžaduje schválení této další fáze a audit skutečné struktury dat. Do té doby zůstávají historické PID údaje dostupnou, výrazně označenou geografickou referencí.
