# GEOS ve zpracování parků

Importní Web Worker používá nezměněný balíček **geos-wasm 3.1.1**, který obsahuje **GEOS 3.13.0** ve WebAssembly. Hlavní aplikace jej nenačítá při otevření mapy. Provoz nepotřebuje externí CDN ani server.

- Zdrojový kód a sestavení wrapperu: https://github.com/chrispahm/geos-wasm ; verze wrapperu je uzamčena na 3.1.1.
- Přesný distribuovaný balíček: https://registry.npmjs.org/geos-wasm/-/geos-wasm-3.1.1.tgz ; integrita je uzamčena v `package-lock.json`.
- Zdroj GEOS 3.13.0: https://download.osgeo.org/geos/geos-3.13.0.tar.bz2 ; projekt https://libgeos.org/.
- Metadata npm deklarují `LGPL-3.0-or-later`; přibalený soubor `LICENSE.md` obsahuje LGPL 2.1. Tento soubor zachováváme beze změny v publikaci jako `third-party/geos-wasm-LICENSE.txt`. Text LGPL 3 a jeho GPL 3 podmínky jsou přiloženy rovněž.

Tyto knihovny si zachovávají původní licence a autorská práva; MIT licence našeho kódu je nemění. Integrační vrstva `packages/geo-core/src/park-topology.ts` volá veřejné GEOS C API a neupravuje knihovnu. Přibalené knihovny lze v projektu nahradit a sestavení zopakovat pomocí `npm ci` a `npm run build`.
