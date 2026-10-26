# Dva týmy, nalezení a výsledek partie

Partie má dva stálé týmy po dvou hráčích, vždy jeden aktivní telefon pro tým. V úvodu na obou telefonech zadejte a uložte různá jména (1–40 znaků), rozhodněte o dedukční mapě a potvrďte připravenost. Tým 1 začíná jako hledači, tým 2 jako schovaní. Jména lze měnit do potvrzení vlastní připravenosti; během partie zůstávají stejná.

## Nalezení a společná kontrola

1. Hledači na mapě použijí **Našli jsme tě**. Čas pro případný výsledek se zastaví v okamžiku tohoto hlášení. Během Move je hlášení nedostupné.
2. Schovaní na svém telefonu potvrdí **Ano, našli jste nás**, nebo hlášení odmítnou. Při odmítnutí hra pokračuje včetně celého čekání na odpověď. Při potvrzení následuje dialog společné kontroly; čekání a vyplňování už skóre neprodlužují.
3. Dialog zahrne skutečně použité účinky prokletí s časovým bonusem za porušení. Citrony, suvenýr, vejce a vodu posuzují oba týmy podle textu karty; rozhodnutí zapíše schovaný. Kontrola Endless Tumble se týká skutečného incidentu během úkolu. Karty jen držené v ruce, zrušené sesílání a casting hod s nulovým účinkem kontrolu nevytvářejí. **Bug Friend není součástí tohoto formátu ani kontroly.**
4. U povinnosti, která ještě čekala na úvodní úkol, lze zvolit **Povinnost ještě nezačala**. Nezískání předmětu samo o sobě nepřidává bonus za jeho ztrátu. U dokončeného úkolu se již tato možnost nenabízí. Zkontrolujte i průběh podmínky, nejen stav předmětů při setkání.
5. Již oznámené porušení se zobrazí jako uzamčené a podruhé se nezapočte. U ostatních kontrol vyberte dodržení nebo porušení. Při neznámé výši bonusu se konečný čas neodhaduje a uzavření zůstane zablokované.
6. Schovaný potvrdí společnou kontrolu a zobrazí se výsledek na obou telefonech.

Fyzické úkoly zůstávají potvrzeními hráčů. Aplikace neověřuje fotografie, předměty ani dodržení povinnosti senzory.

## Výpočet výsledku

`celkový čas = čas od začátku do hlášení nalezení − pauzy Move + časové karty v uzavřené ruce + bonusy z porušených prokletí`

Čas do nalezení zahrnuje i počátečních 45 minut schovávání podle dosavadního časování hry. V přehledu jsou oddělené všechny složky včetně pauz a započteného herního času. Po nalezení se nové odměny nelížou a karty nehrají. Je-li ruka nad limitem, schovaný nejprve odhodí pouze přebytečné karty; konečné skóre používá legální ruku. Nedokončené odměny jsou ve výsledku evidované, jejich nevybrané karty se nepřičítají.

Výsledek a rozhodnutí kontrol se ukládají do IndexedDB i soukromého exportu. Čekání na potvrzení, rozepsaná kontrola a dokončené výsledky přežijí reload. Opakované potvrzení nepřidá druhý výsledek ani druhý bonus.

## Druhé kolo

Oba týmy na svém telefonu potvrdí **Prohodit role a pokračovat**. Po prvním potvrzení aplikace čeká na druhé. Pak se týmy prohodí a začne nový 45minutový výběr stanoviště. Telefon zůstane stejnému týmu, přepne roli a vyčistí místní navigaci.

Zůstávají jména, zvolená pravidla a velikost balíčku, uzamčená publikace dat, dohoda o dedukční mapě a první výsledek. Souřadnice se přesunou spolu se svým týmem a zachovají původní čas pozorování. Nové kolo má nový balíček a ID/etapu; původní stanoviště, ruce, odměny, otázky, prokletí a dedukce se nepřenášejí. Historický scénář bez zaznamenané dohody nejprve projde jejím potvrzením.

Po nalezení a vyhodnocení druhého kola aplikace porovná celkové časy obou týmů. Vyhrává delší čas schovávání včetně bonusů. Shodné časy znamenají remízu. Porovnání i zobrazení používají přesnost na milisekundy; pokud čas nemá zlomkovou sekundu, zobrazuje se bez desetinné části.

## Technické hranice a kompatibilita

- `createLobbyGame()` inicializuje novou týmovou partii. Rozhraní `createGame()` zůstává kompatibilní s historickými testy a scénáři. Starší rozehrané scénáře dostanou týmy při prvním hlášení nalezení; staré již ukončené scénáře se automaticky nepřepočítávají.
- `TeamMatch`, `RoundEnd` a `RoundResult` jsou volitelné verzované části uloženého stavu. Import validuje přiřazení rolí, původ kontrol a bonusů, rozdělení karet a výslednou aritmetiku. Starší exporty bez těchto částí zůstávají čitelné.
- `RoleView` přenáší tým a veřejné výsledky. Hledači ani po výměně rolí nedostanou aktuální GPS, stanoviště nebo soukromou ruku druhého týmu. Po uzavření se sdílejí pouze započtené časové karty a veřejný audit kontrol; soukromá slova, přílohy a ostatní karty se do výsledku nekopírují.
- `LocalGameSession.teamTransport(teamId)` při každém příkazu i čtení odvozuje aktuální roli týmu a používá stejnou rolovou filtraci jako ostatní transporty. Dva telefony jsou nyní místní virtuální telefony jednoho prohlížeče. Skutečné připojení dvou fyzických telefonů, relace aktivního zařízení a jejich serverová autorizace zůstávají budoucí multiplayerovou vrstvou.
- Simulátor má scénáře **Dva týmy · před nalezením / čekání na potvrzení nalezení / kontrola citronu, suvenýru, vejce a vody**. Používají skutečné ceny karet a přechody Game Core. Přidávání diagnostických karet je po hlášení nalezení vypnuté.
- Herní stav a rozhodnutí se ukládají pouze místně, sdílení je možné explicitním soukromým exportem. Mapové podklady nadále používají běžné dynamické dlaždice Mapy.com.

Jednotkové testy v `packages/game-core/src/match.test.ts` a E2E v `tests/match.spec.ts` kontrolují názvy a role, potvrzení/odmítnutí, přesné časování, bonusy bez dvojího započtení, legální ruku, Move, čekající Hangman, reload, export/import, izolaci prohlížečů a celé druhé kolo s vítězem. Jsou součástí stávající GitHub Actions CI před nasazením na Pages.
