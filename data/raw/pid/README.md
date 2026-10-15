# Vstupní data PID

Pro ověření importéru jsou potřeba všechny tři **nezměněné** oficiální soubory:

| Soubor v tomto adresáři | Oficiální zdroj |
| --- | --- |
| `Zastavky_WGS84.json` | https://data.pid.cz/geodata/Zastavky_WGS84.json |
| `stops.json` | https://data.pid.cz/stops/json/stops.json |
| `Linky_7d_WGS84.json` | https://data.pid.cz/geodata/Linky_7d_WGS84.json |

Stáhněte je ve stejný den a poznamenejte datum/čas stažení. Nevybírejte zatím jen Prahu, nepřejmenovávejte atributy, nezaokrouhlujte souřadnice a nerozbalujte skupiny ručně: pro doložení vazeb potřebujeme původní strukturu. Soubory lze vložit přes GitHub do tohoto adresáře, stejně jako administrativní hranice.

## Velké soubory: ZIP nebo Git

Webový formulář GitHubu dovoluje nejvýše **25 MiB na soubor**. Soubor linek o velikosti 35 MB lze nahrát běžným Gitem (limit jednoho souboru je 100 MiB), případně jej zabalte do ZIPu a nahrajte archiv přes **Add file → Upload files** do tohoto adresáře. Pro jednorázové ověření je ZIP jednodušší:

1. Stáhněte originální `Linky_7d_WGS84.json`.
2. Ve správci souborů zvolte komprimování do ZIPu, například `Linky_7d_WGS84.zip`.
3. Nahrajte ZIP. Uvnitř musí zůstat soubor pojmenovaný `Linky_7d_WGS84.json`; může být i v podadresáři.

`pid:inspect` čte přímo původní JSON, `název.json.gz` nebo libovolný ZIP v tomto adresáři obsahující očekávaný JSON. Archiv může obsahovat i více požadovaných zdrojů. Na disk se nerozbaluje, nezmění souřadnice a eviduje SHA-256 originálních rozbalených bajtů i samotného archivu. Limit rozbaleného souboru je 100 MiB. Dvě rozdílné verze stejného zdroje odmítne, aby se nestáhly či nepoužily nesouvisející verze omylem.

Prázdný soubor není datový zdroj. Pokud vedle prázdného `stops.json` nahrajete ZIP se skutečným `stops.json`, inspekce použije archiv a výslovně oznámí ignorovaný prázdný soubor. Původní soubory nemaže ani nepřepisuje.

Komprese slouží pro předání vstupních dat a kontrolu schématu. Automatická aktualizace aplikace má nadále načítat oficiální URL nebo denní ověřený snapshot publikovaný přes GitHub Actions; jednorázový ZIP tento mechanismus nenahrazuje.

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

**Stav:** všechny tři dodané zdroje prošly inspekcí a adaptér je implementovaný. Publikace ze surových souborů: `npm run pid:bundle`, následná kontrola: `npm run pid:check`. Zdrojové soubory se nemění. Dodaná trojice má nekompatibilní srpnovou/říjnovou platnost a 208 nespárovaných aktivních bodů, proto je výchozí referenční snapshot označený k revizi. Podrobnosti v [auditu](../../source-metadata/pid-source-audit.md) a [návodu PID](../../../docs/PID_DATA.md). Denní aktualizace používá oficiální URL nebo ověřenou publikaci GitHub Actions; ZIP slouží pro přípravu vstupů.
