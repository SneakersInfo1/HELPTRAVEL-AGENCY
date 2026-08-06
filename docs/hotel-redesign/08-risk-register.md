# 08 — Rejestr ryzyk

| # | Ryzyko | Prawd. | Skutek | Wczesny sygnał | Ograniczenie |
|---|---|---|---|---|---|
| R-01 | Rozszerzenie schematów `lib/liteapi` psuje **rezerwację lub loty** (te same moduły) | średnie | 🔴 utrata przychodu | `pnpm test` czerwone na `booking.test.ts` / `booking-routes.test.ts` | wyłącznie **dodawanie pól opcjonalnych** (R3); po Etapie 1 pełny przebieg testów + ręczny prebook na kluczu `sand_` |
| R-02 | Zaostrzenie walidacji wywraca hotele „sparse" (powtórka incydentu `LITEAPI_VALIDATION`) | średnie | wysoki — 404 na stronach hoteli | wzrost `LITEAPI_VALIDATION` w logach Vercela | każde nowe pole `.nullish()`; test schematu na rekordzie z samymi `null` |
| ~~R-03~~ | ~~Dopasowanie taryfa↔pokój myli pokoje~~ **NIEAKTUALNE 2026-08-06** | — | — | — | LiteAPI ma klucz obcy: `roomMapping: true` → `rates[].mappedRoomId` → `rooms[].id`. Pomiar: 31/31 taryf, 4 hotele. Żadnego zgadywania po nazwach. Zostaje R10 (placeholder przy nietrafieniu) i pomiar na większej próbce w Etapie 9 |
| R-03b | Dodanie `roomMapping: true` zmienia treść zapytania o stawki → **stary cache serwuje odpowiedzi bez `mappedRoomId`** | wysokie | średni — pokoje bez zdjęć mimo poprawnego kodu | zdjęcia pokoi puste tylko dla części hoteli, znikają po czasie | podbić `KEY_VERSION` w `lib/hotels/rate-cache.ts` w tym samym commicie |
| R-04 | Zmiany w `globals.css` (warstwy, tokeny) psują **homepage** | średnie | wysoki — homepage jest „nietykalny" | porównanie zrzutów z Etapu 0 | tokeny **dodawane**, nie zmieniane; przepinanie warstw tylko w plikach hotelowych i launcherze czatu |
| R-05 | Brak punktu odniesienia → nie da się wykazać poprawy ani wykryć regresji wydajności | **wysokie** (dziś realne) | średni | brak katalogu `baseline/` | Etap 0 **przed** jakąkolwiek zmianą UI |
| R-06 | Mapa podnosi JS i psuje LCP listy | średnie | średni | wzrost rozmiaru paczki w `pnpm analyze` | import dynamiczny, ładowanie po interakcji, pomiar przed/po |
| R-07 | Dostawca kafelków map przekracza darmowy limit albo odcina (OSM) | średnie | średni | licznik u dostawcy, mapa przestaje się renderować | brama D1 — świadomy wybór; MapLibre pozwala podmienić kafelki bez przepisywania |
| R-08 | Pokazanie ceny Booking.com jako przeceny → **zarzut UOKiK** | niskie (świadomie unikane) | **bardzo wysoki** — kara, utrata zaufania | jakikolwiek `line-through` albo „-%" w kodzie cen | domyślnie **nie pokazujemy** (D2 wariant 1); dane potwierdzają brak podstawy: `initialPrice == total` na 400/400 |
| R-09 | Nowe pliki `*.test.ts` **nigdy się nie uruchamiają** (jawna lista w `package.json`) | **wysokie** | średni — fałszywe poczucie pokrycia | test przechodzi „za szybko"; brak nazwy pliku w wyjściu | każdy nowy test od razu dopisywany do listy; sprawdzenie liczby plików w wyjściu `pnpm test` |
| R-10 | Uszkodzony `.next` po ubitym serwerze → API zwraca HTML 404, diagnoza w złą stronę | **wysokie** (zdarzyło się w tej sesji) | niski, ale kosztuje czas | `ENOENT … pages-manifest.json` w logach | `rm -rf .next` i restart **zanim** zacznie się szukać błędu w kodzie |
| R-11 | Praca wielosesyjna gubi kontekst → następna sesja przepisuje to samo albo psuje decyzje | średnie | średni | rozbieżność `06-progress-log.md` z `git log` | dziennik postępu aktualizowany **na koniec każdej sesji**, z hashem commita |
| R-12 | Limit sesji ucina pracę w połowie etapu (zdarzyło się: 7 agentów, ~956 tys. tokenów, zero wyniku) | **wysokie** | średni | komunikat o limicie | małe commity per etap; brak zależności między etapami w jednej sesji; kosztowną analizę robić raz i **zapisywać do repo** (stąd `scripts/probe-hotel-contract.ts`) |
| R-13 | Zmiana `prefetch`/linkowania przywraca falę SSR-ów checkoutu (26,7 tys. w 2 dni) | niskie | wysoki — koszt i limity LiteAPI | skok liczby żądań `/hotele/rezerwacja` w logach Vercela | `prefetch={false}` zachowane; kontrakt linku zamrożony (R12) |
| R-14 | Regresja obsady (`adults` = suma osób vs `guests[]` = pokoje) — trzy incydenty w historii | średnie | 🔴 zła rezerwacja | rozjazd liczby gości między listą, hotelem a checkoutem | **nie dotykać** `lib/booking/guests.ts`; UI tylko przekazuje parametry dalej |
| R-15 | Treści AI dostawcy (`sentiment_analysis`) brane za fakty o obiekcie | średnie | średni — wprowadzenie w błąd | tekst wyróżnienia bez adnotacji o źródle | jawne oznaczenie + `sentiment_updated_at`; brak tłumaczenia maszynowego (R11) |

## Zdarzenia, które już się zmaterializowały w tej sesji

- **R-10** — uszkodzony `.next` (ENOENT `pages-manifest.json`), naprawiony przez `rm -rf .next`
- **R-12** — audyt wielo-agentowy padł na limicie sesji; audyt powstał jednoosobowo, o węższym zakresie (patrz `01-current-state-audit.md` §5)
- **R-05** — brak punktu odniesienia jest **stanem faktycznym**; Etap 0 jest pierwszym zadaniem następnej sesji
