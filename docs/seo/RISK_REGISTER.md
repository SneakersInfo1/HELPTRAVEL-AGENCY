# Rejestr ryzyk

Stan na 14.11.2026. Skala: prawdopodobieństwo i skutek jako niskie (N), średnie (Ś) albo wysokie (W). „Otwarte” oznacza, że ryzyko wymaga decyzji albo obserwacji po wdrożeniu.

## Ryzyka zmian w tej gałęzi

| ID | Ryzyko | P | S | Zabezpieczenie | Stan |
|---|---|---|---|---|---|
| R-01 | PR zmienia H1 na 1592 stronach i tytuł na 338. Pozycje i CTR mogą się przesunąć w obie strony. | Ś | Ś | Polityka indeksu bez zmian (0 zmian robots). Adresy, canonicale i mapa witryny bez zmian. Wszystko w jednym PR, więc wycofanie to jeden revert. Pomiar raportem tygodniowym po 28 dniach. | Otwarte: decyzja właściciela przez scalenie |
| R-02 | Strony miesięcy nie zyskają kliknięć mimo nowego szablonu, bo Google pokazuje własny widżet pogody (CTR 0,38%). | W | N | Brak obietnicy wzrostu. Szablon poprawia odpowiedź i CTA dla tych, którzy już weszli. Większe decyzje (scalanie, noindex) zostają u właściciela. | Przyjęte |
| R-03 | Fakt w dokumencie treści przestanie być prawdziwy. | Ś | Ś | Termin ważności per klasa danych, `pnpm content:freshness`, strona wraca w całości do wersji bez dokumentu. Najbliższy termin: 11.02.2027 (godziny otwarcia, Funchal–Santa Cruz). | Otwarte: kontrola przed 11.02.2027 |
| R-04 | Źródła blokują zapytania automatyczne (`spain.info`, `whc.unesco.org`), więc faktów nie da się odświeżyć bez człowieka. | W | N | Zabezpieczeń nie obchodzimy. Weryfikacja na migawkach z zapisanym skrótem SHA-256. Przy odświeżaniu człowiek zapisuje stronę ręcznie i uruchamia `content:verify --snapshots`. | Przyjęte |
| R-05 | Cztery dokumenty treści mają status `approved` z dopiskiem „akceptacja przez merge PR”. Scalenie bez przeczytania oznacza publikację bez przeglądu. | Ś | Ś | Opisane w PR i w `OWNER_ACTIONS.md`. Usunięcie pliku dokumentu przywraca stronę bez wzbogacenia. | Otwarte |
| R-06 | Przekierowania literówek (`/porównanie/…`, `/porunanie/…`) złapią niewłaściwy adres. | N | N | Wzorzec wyklucza poprawne `/porownanie`. Cel to istniejąca para albo hub porównań, nigdy strona główna. Testy jednostkowe i test dymny. | Zamknięte |
| R-07 | Bloki zależne od dostawców (statystyki hoteli, zdjęcia Pexels) nie były widoczne w buildzie lokalnym. | Ś | N | Sprawdzone na Preview 14.11.2026: zdjęcia Pexels i blok statystyk hoteli renderują się poprawnie, test dymny 263/263. Bloki mają bramki danych i przy braku danych znikają. | Zamknięte |
| R-08 | Linki pomocnicze na telefonie są niższe niż 40 px (lista źródeł, nazwy miast w hubie). | Ś | N | Główne CTA mają 48 px. Zgodne z WCAG 2.2 AA przez wyjątki. Powiększenie zapisane jako następna iteracja. | Przyjęte |

## Ryzyka automatyzacji treści

| ID | Ryzyko | P | S | Zabezpieczenie | Stan |
|---|---|---|---|---|---|
| R-09 | Automat opublikuje słaby albo nieprawdziwy tekst. | Ś | W | Harmonogram domyślnie wyłączony. Tryb domyślny to przebieg próbny. Tryb roboczy tylko otwiera PR. Bramka 36 reguł. Treści `DYNAMIC` i `HIGH_RISK` zawsze do człowieka. Kontrola CI nie przepuści dokumentu bez statusu `approved`. | Zamknięte w kodzie, otwarte operacyjnie |
| R-10 | Koszt API wymknie się spod kontroli. | N | Ś | Limit 1,50 USD, 24 żądań i 60 tys. tokenów wyjściowych na przebieg, rezerwacja najgorszego przypadku przed każdym wywołaniem, nieznany model liczony po najwyższej cenie, wyłącznik awaryjny. | Zamknięte |
| R-11 | Ten sam temat zostanie zaproponowany wiele razy. | N | N | Klucz idempotencji na dzień, blokada przebiegu, rejestr oczekujących propozycji przez 14 dni. Test: dwa przebiegi tego samego dnia dają `DUPLICATE_SKIPPED` bez wywołań modelu. | Zamknięte |
| R-12 | Dane GSC trafią do publicznego repozytorium albo artefaktu. | Ś | Ś | Raport publiczny jest redagowany w kodzie (test). Gałąź stanu przechowuje tylko rejestr. Pełny raport nie opuszcza maszyny przebiegu. | Zamknięte dla automatu |
| R-13 | `docs/seo/OPPORTUNITY_BACKLOG.csv` i `BASELINE.md` zawierają zagregowane liczby GSC (usługa, segmenty, 20 adresów). Nie ma w nich zapytań, ale repo jest publiczne. | W | N | Świadoma decyzja zgodna z wymaganiem misji. Właściciel może usunąć kolumny albo pliki przed scaleniem. | Otwarte: decyzja właściciela |
| R-14 | Sekret trafi do logów albo do kroków instalacji. | N | W | `persist-credentials: false`. Sekrety są przekazywane tylko do kroku silnika i kroków wypychania. Klucz czytany wyłącznie ze zmiennej środowiskowej. | Zamknięte |
| R-15 | Robot treści albo crawler wywoła wyszukiwarkę, rezerwację lub API dostawcy. | N | W | Twarda blokada hostów dostawców i tras zakupowych w `sources.ts`. Crawler pomija trasy dostawców. Test e2e przechwytuje `/hotele/szukaj`. Linki CTA nie pobierają wstępnie tras transakcyjnych. | Zamknięte |
| R-16 | Nazwy modeli albo ceny API się zmienią. | Ś | N | Jedno miejsce konfiguracji (`models.ts`). Błąd modelu kończy przebieg bez publikacji i trafia do rejestru błędów. | Przyjęte |
| R-25 | Gałąź `main` nie ma reguły ochrony, a workflow automatu działa z tokenem z prawem zapisu. Skrypt wypycha tylko gałąź stanu i gałęzie propozycji, ale nic poza nim tego nie wymusza. | N | W | Akcje przypięte do pełnych SHA. Reguła „wymagany PR” na `main` to ustawienie repozytorium. | Otwarte: działanie właściciela |
| R-17 | Klient API Search Console nie był uruchomiony na prawdziwym koncie. | Ś | N | Testy na podstawionych odpowiedziach. Pierwsze uruchomienie w trybie próbnym. Import CSV zostaje jako ścieżka zapasowa. | Otwarte do pierwszego uruchomienia |

## Ryzyka istniejące wcześniej (bez zmian w tej gałęzi)

| ID | Ryzyko | Stan |
|---|---|---|
| R-18 | 567 stron miesięcy bez indeksu nie ma żadnego linku wewnętrznego (47 kierunków w całości). | Decyzja właściciela: plan indeksu z Fazy 2.1 |
| R-19 | `Disallow` dla `/hotele/rezerwacja` w `robots.txt` ukrywa przed Google znacznik `noindex` tych stron. | Decyzja właściciela po danych GSC |
| R-20 | 184 tytuły przekraczają 60 znaków przez dopisek „ \| HelpTravel” (głównie przewodniki po kierunkach). Google może je obcinać. | Decyzja właściciela: skrócić szablon albo zostawić |
| R-21 | Preview na Vercelu używa zmiennych produkcyjnych. Test rezerwacji na Preview dotknąłby prawdziwych usług. | W tej misji na Preview wykonywano tylko odczyt stron treści |
| R-22 | GA4 nie jest podłączone do raportów, a nowe parametry zdarzenia `seo_cta_click` nie są jeszcze zarejestrowane jako wymiary. Bez tego nie widać efektu w konwersji. | Działanie właściciela |
| R-23 | Konsola Chrome zgłasza leniwie ładowane logo bez wymiarów we wspólnej powłoce (`site-shell.tsx`). Zmierzony CLS wynosi 0. Komponent jest wspólny ze stroną główną, więc nie był zmieniany. | Do rozważenia przy pracy nad powłoką |
| R-24 | 48 stron na produkcji odpowiadało dłużej niż 3 s w crawlu z 13.11. | Do obserwacji w `/api/vitals` |

## Ryzyka po końcowej kontroli jakości

| ID | Ryzyko | Stan |
|---|---|---|
| R-26 | 158 indeksowalnych stron miesięcy (25 kierunków) nie ma żadnych danych o miesiącu, bo WMO nie ma jednoznacznie dopasowanej stacji. | Wariant `noindex` gotowy i nieaktywny; decyzja właściciela (`OWNER_ACTIONS.md`, pkt 16) |
| R-27 | Okresy norm WMO różnią się między krajami (od 1961–1990 do 1991–2020), a dla 28 kierunków źródło ich nie podaje. | Ograniczone 17.11.2026: porównania tylko przy tym samym albo sąsiednim okresie (`climate-periods.ts`); 804 strony bez porównania z Warszawą |
| R-28 | Przycisk „Szukaj lotów” prowadził na stronę główną bez kierunku i terminu. | Rozwiązane 17.11.2026: cel i termin we fragmencie adresu, test e2e |
| R-29 | Proza stron miesięcy jest szablonem; mediana 67% zdań po zamaskowaniu powtarza się na ponad połowie stron. Google może je nadal oceniać jako treść o niskiej unikalności. | Otwarte: ocena po 28 dniach w GSC |
| R-30 | Normy WMO są pobrane jednorazowo (16.11.2026). Służby aktualizują je rzadko, ale plik nie odświeża się sam. | Przyjęte: `pnpm seo:climate` raz w roku |
| R-31 | Fonty są kopiami z 17.11.2026. Google może wydać nową wersję krojów, a serwis zostanie przy starej. | Przyjęte: wygląd się nie zmienia; procedura odświeżenia w `FONTS.md` |
| R-32 | Wypełnienie formularza lotów z linku działa w przeglądarce. Bez JavaScriptu zakładka lotów otwiera się pusta, jak przed zmianą. | Przyjęte: formularz i tak wymaga JavaScriptu |
| R-33 | Pozycja „na tle innych kierunków” jest liczona w grupie kierunków z normą z tych samych lat. Skład tej grupy wynika z praktyki krajowych służb, nie z geografii. | Przyjęte: zdanie podaje okres i liczbę kierunków w grupie |

## Czego celowo nie zrobiono

- Żadnych masowych przekierowań, zmian `noindex` ani usunięć stron. Wariant `noindex` dla 158 stron jest przygotowany, ale nieaktywny.
- Strona główna i wspólna powłoka zmienione tylko na Twoje polecenie z 17.11.2026: odczyt celu i terminu w zakładce lotów oraz fonty z własnego hostingu (wygląd identyczny).
- Żadnego wdrożenia na produkcję i żadnego wypchnięcia na `main`.
- Żadnych wydatków.
