# Vstupní data PID

Pro ověření importéru jsou potřeba všechny tři **nezměněné** oficiální soubory:

| Soubor v tomto adresáři | Oficiální zdroj |
| --- | --- |
| `Zastavky_WGS84.json` | https://data.pid.cz/geodata/Zastavky_WGS84.json |
| `stops.json` | https://data.pid.cz/stops/json/stops.json |
| `Linky_7d_WGS84.json` | https://data.pid.cz/geodata/Linky_7d_WGS84.json |

Stáhněte je ve stejný den a poznamenejte datum/čas stažení. Nevybírejte zatím jen Prahu, nepřejmenovávejte atributy, nezaokrouhlujte souřadnice a nerozbalujte skupiny ručně: pro doložení vazeb potřebujeme původní strukturu. Soubory lze vložit přes GitHub do tohoto adresáře, stejně jako administrativní hranice.

Kontrola bez jakékoli změny draftu nebo zdrojových souborů:

```sh
npm run pid:inspect
```

Nástroj vypíše chybějící soubory a nenulový návratový kód, pokud trojice není kompletní. Vytvoří ignorovaný lokální report `data/reports/pid-inspection.json`: skutečné cesty atributů, jejich typy, příklady, četnosti a kontrolní součty. Report sám neurčuje stabilní ID, význam kódů dopravy ani pravidla propojení.

Pro prostředí s povoleným přístupem k `data.pid.cz` je připraveno:

```sh
npm run pid:download
```

Stahování používá systémový HTTPS proxy a ověřování TLS. Úspěšné stažení uloží celou trojici do nového adresáře `download-…`, včetně času, SHA-256, ETag, Last-Modified a odpovědi CORS. Nedokončená trojice se nezveřejní a původní soubory se nepřepisují. Poté spusťte `npm run pid:inspect -- data/raw/pid/download-…` s vypsanou cestou.

**Stav:** přístup při implementaci blokovala síťová politika cloudového prostředí (CONNECT 403). Skutečné soubory zatím nebyly k dispozici. Není tedy ověřené jejich schéma, klíče pro propojení, aktivita, koncové/provozní body, denní/noční provoz, licence ani CORS. Do aplikace se zatím nepřidávají žádné odhadnuté zastávky. Interní datový model v `packages/geo-core/src/pid-snapshot.ts` není popisem atributů originálních souborů PID.
