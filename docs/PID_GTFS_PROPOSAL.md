# Přechod aktivní obsluhy na GTFS PID

Původní návrh po auditu srpnových geodat byl schválen zadáním [iterace 03B](../CODEX_UKOL_03B_GTFS.md) a je implementovaný. Archiv byl před změnou adaptéru úplně stažený, rozbalený a ověřený; samotné HTTP hlavičky nebyly důkazem platnosti.

- [Audit skutečné struktury, licence a referenčních míst](../data/source-metadata/pid-gtfs-source-audit.md).
- [Aktuální provozní návod, architektura a kontrakty](PID_DATA.md).
- [Původní problém a oddělení chyb načtení/aktualizace](PID_REFRESH_AUDIT_2026-10-16.md).

Primární obsluhu a skutečné trasy určuje GTFS. `stops.json` doplňuje pouze bezpečně propojené fyzické identity a stabilní body. Staré geodatové snapshoty se nadále načítají jako datovaná reference. Další multiplayerový backend ani automatické mimořádnosti tato iterace nezavádí.
