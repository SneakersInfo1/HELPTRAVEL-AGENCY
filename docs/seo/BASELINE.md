# Stan wyjściowy (Etap 0) i porównanie po zmianach

Punkt odniesienia dla każdej późniejszej oceny efektu. Wszystkie liczby da się odtworzyć poleceniami z repozytorium. Surowe eksporty GSC i crawle leżą poza repo (`seo-private/`), bo repozytorium jest publiczne.

## 1. Zakres i daty

| Co | Wartość |
|---|---|
| Gałąź bazowa | `main` `06cf1aa` |
| Gałąź zmian | `claude/helptravel-seo-modernizacja-6f1b7c` |
| Dane GSC | 11.08–10.11.2026 (92 dni), eksport CSV z interfejsu |
| Crawl produkcji | 13.11.2026, `pnpm seo:crawl` |
| Crawl buildu gałęzi | 14.11.2026, build lokalny bez kluczy dostawców |
| Lighthouse | 14.11.2026, telefon, mediana z 3 przebiegów, build gałęzi na przemian z buildem `main` |

## 2. Search Console

Liczby z Search Console (sumy usługi, okna 28 dni, marka, urządzenia, segmenty adresów) leżą poza repozytorium, w `seo-private/`, bo repo jest publiczne.

Wnioski:

- Wyświetlenia wyraźnie wzrosły, a kliknięcia spadły. Nowe wyświetlenia pochodzą głównie ze stron miesięcy, gdzie Google pokazuje własny widżet pogody. To zmiana składu zapytań, a nie załamanie ruchu.
- Większość kliknięć daje nazwa marki, a większość ruchu pochodzi z telefonów.
- Ruch spoza marki jest dziś mały. Każda prognoza wzrostu byłaby zgadywaniem, więc ten projekt żadnej nie podaje.
- Porównania są jedynym segmentem treści z sensownym CTR, dlatego dostały najwięcej pracy.
- Eksport nie ma wymiaru strona × zapytanie. Nie da się więc stwierdzić, na jakie zapytania wyświetla się konkretny adres.

Pełny raport tworzy `pnpm seo:weekly -- --gsc-dir <katalog>`.

## 3. Crawl produkcji (13.11.2026)

| Miara | Wynik |
|---|---|
| Adresy w mapie witryny | 1401, wszystkie 200, żaden z `noindex` |
| Pobrane adresy | 2484, błędów pobierania 0 |
| Pominięte celowo (trasy dostawców: wyszukiwarka, karty hoteli, loty) | 2162 |
| Strony HTML 200 | 2473 |
| Strony 404 | 4, wszystkie z listy adresów GSC: trzy literówki (`/porównanie/…`, `/porunanie/…`) i jedna nieistniejąca para |
| Przekierowania / łańcuchy przekierowań | 15 / 0 |
| Braki: `lang`, tytuł, H1, canonical, opis | 0 |
| Błędy JSON-LD | 0 |
| Niedziałające linki wewnętrzne | 0 |
| Strony wolniejsze niż 3 s | 48 |

Crawl produkcji dostał dodatkowo listę adresów z eksportu GSC. Stąd w wynikach stare adresy z przekierowaniami oraz 567 stron miesięcy bez indeksu, do których nie prowadzi żaden link wewnętrzny (47 kierunków w całości i 3 pojedyncze strony). Te strony były osierocone już wcześniej, a gałąź tego nie zmienia. Decyzja o ich losie należy do właściciela (`OWNER_ACTIONS.md`, pkt 7).

## 4. Przed i po: 1898 stron obecnych w obu crawlach

Źródło: `docs/seo/INVENTORY.csv` (`pnpm seo:inventory`).

| Miara | Przed (produkcja) | Po (build gałęzi) |
|---|---|---|
| Strony miesięcy poniżej 150 słów (z 1533) | 1008 | 0 |
| Indeksowalne strony poniżej 150 słów (z 1402) | 605 | 0 |
| Strony bez `og:image` | 55 | 0 |
| Tytuły dłuższe niż 60 znaków, licząc z „ \| HelpTravel” | 516 | 184 |
| Tytuły dłuższe niż 60 znaków bez nazwy marki | 3 | 0 |
| Zmiany dyrektywy robots (indeks ↔ noindex) | — | 0 |
| Niedziałające linki wewnętrzne | 0 | 0 |
| Grupy zduplikowanych tytułów (bez artefaktów przekierowań) | 1 | 1 |
| Adresy z literówką w „porównanie” (z listy GSC) | 3 × 404 | 3 × 301 do właściwej strony |

Jedyny duplikat tytułu to `/` i `/?tab=loty`, czyli ta sama strona główna, której ta misja nie zmienia. Pozostałe grupy z raportu crawla to stare adresy, które przekierowują na właściwą stronę i dlatego mają jej tytuł. Pozostałe 184 długie tytuły przekraczają 60 znaków wyłącznie przez dopisek marki. To głównie przewodniki po kierunkach, których szablon tytułu nie był zmieniany.

**Mediana liczby słów w treści głównej:**

| Segment | Stron | Przed → po | Uwaga |
|---|---|---|---|
| Strony miesięcy | 1533 | 146 → 179 | Nowy szablon: odpowiedź, dopasowanie terminu, widoczne FAQ |
| Huby „wyjazdy” | 6 | 482 → 600 | Tabela faktów i linki do porównań |
| Porównania | 54 | 644 → 587 | Usunięte powtarzalne akapity. Lokalnie nie ma też bloku statystyk hoteli na żywo. |
| Porównania z dokumentem treści | 4 | 705–747 → 867–1019 | Treść ze źródłami |
| Strony hoteli w mieście | 31 | 510 → 447 | Różnica wynika z braku danych dostawcy w buildzie lokalnym. Szablon treści nie był zmieniany. |
| Przewodniki, artykuły, strony informacyjne | 258 | bez zmian | — |

**Skala zmian widocznych dla Google** (to trzeba wiedzieć przed scaleniem):

| Zmiana | Liczba stron | W tym indeksowalnych |
|---|---|---|
| Zmieniony H1 | 1592 (1533 miesiące, 54 porównania, 5 artykułów) | 1098 |
| Zmieniony tytuł | 338 (273 miesiące, 54 porównania, 6 hubów, 5 artykułów) | 285 |

W pięciu artykułach zmiana polega na przywróceniu polskich znaków („Gdzie poleciec” → „Gdzie polecieć”).

## 5. Dziesięć adresów priorytetowych

| Adres | Tytuł przed → po | Słowa przed → po |
|---|---|---|
| `/porownanie/malaga-spain-vs-valencia-spain` | „Malaga czy Walencja? Porównanie (plaża, ceny, pogoda)” → „Malaga czy Walencja? Porównanie: plaże, miasto, pogoda” | 705 → 929 |
| `/porownanie/funchal-portugal-vs-santa-cruz-de-tenerife-spain` | „Madera czy Teneryfa? Porównanie: pogoda, budżet i dolot” → „Madera czy Teneryfa? Porównanie: szlaki, plaże, pogoda” | 734 → 1005 |
| `/porownanie/athens-greece-vs-rome-italy` | „Ateny czy Rzym? Porównanie: pogoda, budżet i dolot” → „Ateny czy Rzym? Co wybrać na city break — porównanie” | 747 → 1019 |
| `/porownanie/barcelona-spain-vs-valencia-spain` | „Barcelona czy Walencja? Porównanie: pogoda, budżet i dolot” → „Barcelona czy Walencja? Porównanie na city break” | 655 → 867 |
| `/kierunki/barcelona-spain/styczen` | „Barcelona w styczniu: pogoda 13°C, hotele i kiedy lecieć” → „Barcelona w styczniu: pogoda i temperatura 13°C” | 262 → 385 |
| `/kierunki/barcelona-spain/listopad` | „Barcelona w listopadzie: pogoda 17°C, hotele i kiedy lecieć” → „Barcelona w listopadzie: pogoda 17°C” | 260 → 386 |
| `/kierunki/malaga-spain/luty` | „Malaga w lutym: pogoda 16°C, hotele i kiedy lecieć” → „Malaga w lutym: pogoda i temperatura 16°C” | 262 → 382 |
| `/kierunki/marrakesh-morocco/styczen` | „Marrakesz w styczniu: pogoda 18°C, hotele i kiedy lecieć” → „Marrakesz w styczniu: pogoda i temperatura 18°C” | 237 → 351 |
| `/wyjazdy/city-break` | „City break — najlepsze miasta na weekend i 3–5 dni” → „City break z Polski — miasta na weekend i 3–5 dni” | 458 → 574 |
| `/wyjazdy/budzet` | bez zmiany tytułu (60 znaków) | 466 → 582 |

Na porównaniach H1 zmienił się z „Ateny czy Rzym ? Porównanie pod realną decyzję wyjazdową.” na „Ateny czy Rzym?”. Na stronach miesięcy z „Barcelona w styczniu — pogoda 13°C, hotele i kiedy lecieć” na „Barcelona w styczniu: pogoda i temperatura”. Oba huby dostały `og:image`, którego wcześniej nie miały.

## 6. Lighthouse (laboratorium, telefon, mediana z 3)

| Strona | Wersja | Wydajność | Dostępność | Dobre praktyki | SEO | LCP | CLS | TBT |
|---|---|---|---|---|---|---|---|---|
| `/porownanie/athens-greece-vs-rome-italy` | przed | 89 | 96 | 100 | 100 | 3817 ms | 0 | 31 ms |
| | po | 89 | 100 | 100 | 100 | 3733 ms | 0 | 30 ms |
| `/kierunki/barcelona-spain/styczen` | przed | 89 | 96 | 100 | 100 | 3720 ms | 0 | 28 ms |
| | po | 88 | 100 | 100 | 100 | 3883 ms | 0 | 29 ms |
| `/wyjazdy/city-break` | przed | 89 | 100 | 100 | 100 | 3806 ms | 0 | 30 ms |
| | po | 88 | 100 | 100 | 100 | 3825 ms | 0 | 35 ms |

Jak to czytać:

- Różnice LCP (−84, +163 i +19 ms) mieszczą się w rozrzucie pomiaru na jednej maszynie. Nie ma podstaw, by mówić o poprawie ani o pogorszeniu.
- Dostępność wzrosła z 96 do 100 na dwóch szablonach. Poprawiono między innymi kontrast podpisu autora (4,4:1).
- To pomiar na localhost bez sieci CDN i bez danych dostawców. INP nie da się zmierzyć w laboratorium, a TBT jest tylko przybliżeniem. Dane z prawdziwych urządzeń zbiera na produkcji `/api/vitals`.

## 7. Zrzuty ekranu

- W repo: `docs/seo/screenshots/przed__*` i `po__*` (trzy szablony, 390 px).
- Poza repo: pełne zestawy (390, 768 i 1440 px, kadr nad zgięciem i cała strona, trzy warianty laboratoryjne) z raportami konsoli.
- Odtworzenie: `pnpm seo:shots -- --base <adres> --label <etykieta> --paths <ścieżki>`.

## 8. Ograniczenia tego punktu odniesienia

- GSC pokazuje stan sprzed zmian. Efekt będzie widać najwcześniej po 28 dniach od wdrożenia, a i wtedy będzie to korelacja: sezon, ruch z TikToka i wygląd wyników też się zmieniają.
- GA4 nie jest podłączone, więc nie ma punktu odniesienia dla kliknięć CTA ani rezerwacji z ruchu organicznego.
- Build lokalny nie ma kluczy dostawców (LiteAPI, Pexels). Bloki zależne od nich, czyli statystyki hoteli i zdjęcia, sprawdzono osobno na Preview (`PHASE_7_RESULTS.md`).
