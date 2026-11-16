# Końcowa kontrola jakości przed wdrożeniem (15–16.11.2026)

Dodatkowa kontrola zlecona przed scaleniem PR #154. Dotyczyła trzech rzeczy: wiarygodności liczb, powtarzalności 2820 stron miesięcy oraz jakości szablonów i CTA.

## 1. Liczby bez wiarygodnej podstawy

| Co było | Problem | Co jest teraz |
|---|---|---|
| Temperatury powietrza dla 23 kierunków | Wpisane ręcznie, bez źródła, podpisane jako „średnia”. W rzeczywistości odpowiadały średniemu maksimum w dzień i odbiegały od norm średnio o 1,0°C, najwięcej o 4,2°C (Antalya, listopad). | Normy WMO dla 187 kierunków. Ręczne wartości nie są już pokazywane na żadnej stronie SEO. |
| Temperatura morza na 168 stronach | Liczona z temperatury powietrza, bez źródła pomiarowego (np. 29°C dla Agadiru w sierpniu). | Usunięta wszędzie: model, tekst, FAQ, JSON-LD. |
| Budżet wyjazdu w zł na 276 stronach miesięcy oraz w przewodnikach i porównaniach | Wzór ze stałymi wymyślonymi w kodzie (380 zł + 70 zł za godzinę lotu, 170 zł dziennie razy wskaźnik kosztów). | Kwoty usunięte. Strona odsyła do wyszukiwarki, która pokazuje prawdziwe ceny. |

Na stronach nie ma dziś żadnej liczby pogodowej, która nie pochodzi z norm WMO, i żadnej kwoty ze wzoru. Pilnują tego testy.

### Źródło i licencja

- **Źródło:** WMO World Weather Information Service (`worldweather.wmo.int`). Dane przekazują krajowe służby meteorologiczne (np. AEMET, IPMA, DWD, IMGW).
- **Co pobrano:** dla każdego miesiąca średnia temperatura maksymalna i minimalna, liczba dni z opadem, suma opadu, a do tego nazwa stacji, współrzędne, nazwa służby i okres normy.
- **Warunki użycia** (`/en/dataguide.html`): podać WWIS jako źródło i odtwarzać informacje wiernie. Dlatego wartości są pokazywane z jednym miejscem po przecinku, bez zaokrągleń do pełnych stopni, a linia źródła stoi przy każdym bloku liczb.
- **Odtworzenie:** `pnpm seo:climate` zapisuje `src/lib/mvp/climate-normals.generated.json`. Skrypt wysyła jedno żądanie naraz z przerwą.

### Dopasowanie miast do stacji

| Wynik | Kierunki |
|---|---|
| Z normą WMO | 187 z 235 |
| Bez normy (brak jednoznacznego odpowiednika albo niepełne dane) | 48 |

- 141 kierunków dopasowało się automatycznie po dokładnej nazwie miasta w tym samym kraju. 46 ma ręczne przypisanie tam, gdzie WMO używa innej nazwy (np. Lisboa, Sevilla, Rome (ROMA)) albo stacji lotniskowej tego samego miasta.
- Kontrola niezależna po współrzędnych: z 125 kierunków, które dało się porównać, 108 leży do 10 km od stacji, 15 w odległości 10–30 km, a 2 dalej (lotniska: Monachium 31 km, Malmö 33 km). Pozostałe 62 nie mają u nas współrzędnych.
- **Kierunki bez dopasowania nie dostały żadnych danych zastępczych.** Dotyczy to m.in. wysp greckich (Kos, Zakynthos, Mykonos, Santorini), Albanii, kurortów Tunezji i Turcji.

Okresy norm różnią się między krajami: 1981–2010 (56 kierunków), 1971–2000 (43), 1961–1990 (25), 1991–2020 (18), inne (17), a 28 nie ma podanego okresu. Strona pokazuje okres przy danych, a gdy go brak, mówi to wprost.

## 2. Powtarzalność stron miesięcy

Pomiar: `pnpm seo:month-diversity`. Bierzemy tekst treści głównej każdej strony i maskujemy w nim nazwy, miesiące i wszystkie liczby. Strony, które po zamaskowaniu mają ten sam tekst, różnią się wyłącznie podstawionymi wartościami.

Są dwa tryby maskowania:

- **podstawowy** maskuje tylko nazwę własnego kierunku;
- **ostry** (`--strict`) maskuje wszystkie nazwy własne z danych serwisu: kierunki, kraje, miasta i stacje WMO oraz służby meteorologiczne.

Tryb podstawowy zawyża wynik po zmianach, bo linki „gdzie jest cieplej” i nazwy służb różnicują tekst, choć to też podstawione wartości. Miarodajny jest tryb ostry. Obie wersje zmierzono na buildach produkcyjnych: przed zmianami WMO (`c4ba605`) i końcowym.

| Miara (1039 stron indeksowalnych) | Przed | Po (tryb ostry) | Po (tryb podstawowy) |
|---|---|---|---|
| Różne warianty tekstu | 271 | 803 | 903 |
| Strony dzielące tekst z co najmniej 10 innymi | 649 | 86 | 86 |
| Największa grupa identycznych stron | 178 | 36 | 36 |
| Mediana udziału zdań szablonowych na stronie | 0,63 | **0,70** | 0,67 |
| Strony z danymi pogodowymi ze źródła | 220 (ręczne) | 881 (WMO) | 881 (WMO) |
| Mediana liczby słów | 179 | 533 | 533 |

Wartości „przed” w trybie podstawowym (274, 644, 178) zmierzono wcześniej na tym samym buildzie.

Dla wszystkich 2820 stron w trybie ostrym: 334 → 1863 wariantów, największa grupa 444 → 84.

### Jak to czytać

- **Strony przestały być kopiami.** Przed zmianą 178 indeksowalnych stron miało dosłownie ten sam tekst po zamaskowaniu, a 649 należało do grup co najmniej 10 identycznych stron. Teraz jest to 36 i 86.
- **Proza nie stała się bardziej unikalna, tylko bardziej szablonowa.** Udział zdań szablonowych na stronie wzrósł z 0,63 do 0,70, bo nowe sekcje (normy, porównanie z Warszawą, długość dnia) dokładają stałe zdania z podstawionymi wartościami. Strony różnią się gałęziami szablonu sterowanymi danymi: które wskazania się pojawiają, czy miesiąc jest najcieplejszy, czy w Warszawie pada częściej czy rzadziej, ile jest cieplejszych alternatyw.
- **Wartość strony to dane, nie tekst.** To uczciwy opis: strony miesięcy są stronami programowymi z prawdziwymi, źródłowymi danymi dla konkretnego miejsca i miesiąca, a nie artykułami redakcyjnymi. Różne temperatury same w sobie nie są tu liczone jako unikalność, bo liczby są maskowane.

### Co strona miesiąca daje dziś czytelnikowi

Dla kierunku z normą WMO:

- średnie maksimum i minimum, dni z opadem i suma opadu dla tego miesiąca;
- długość dnia w połowie miesiąca (obliczenie astronomiczne z szerokości geograficznej stacji);
- porównanie z Warszawą w tym samym miesiącu;
- miejsce miesiąca w roku i miejsce kierunku wśród 187 kierunków z danymi;
- linki do najbliższych cieplejszych kierunków w tym samym miesiącu, tylko do stron indeksowalnych;
- wskazania „na co ten termin, a kiedy odpuścić” z jawną podstawą;
- CTA do hoteli z kierunkiem i terminem w tym miesiącu.

Czego nadal brakuje, żeby strona była pełną odpowiedzią na „czy warto lecieć w tym miesiącu”: informacji o sezonie i tłumach, wydarzeniach, cenach z własnych pomiarów oraz temperaturze morza z prawdziwego źródła. Żadnej z tych rzeczy nie da się dziś podać uczciwie.

## 3. Strony o niskiej wartości i strategia

| Grupa | Stron | W GSC (92 dni) | Ocena |
|---|---|---|---|
| Indeksowalne z normą WMO | 881 | 50 kliknięć, 15 860 wyświetleń | Mają dane i kontekst. Zostają. |
| **Indeksowalne bez normy** | **158** (25 kierunków) | **13 kliknięć, 1060 wyświetleń** | **Niska wartość: brak jakiejkolwiek informacji o miesiącu.** |
| Bez indeksu, z normą WMO | 1363 | 2 kliknięcia, 516 wyświetleń | Mają teraz dane, ale są poza indeksem. |
| Bez indeksu, bez normy | 418 | 1 kliknięcie, 119 wyświetleń | Bez zmian. |

**Polityka indeksu nie została zmieniona.** Zbiór 1039 indeksowalnych stron jest taki sam jak przed kontrolą (test).

Propozycja do Twojej decyzji:

1. **158 indeksowalnych stron bez danych: wyłączyć z indeksu** (`noindex, follow`, adresy zostają). To strony typu „Kos w czerwcu: hotele i loty” bez żadnej informacji o miesiącu. Najwyższy możliwy koszt to 13 kliknięć na 92 dni. Alternatywa: zostawić je do czasu znalezienia danych w krajowych służbach meteorologicznych dla tych 25 kierunków.
2. **1363 strony z danymi poza indeksem: na razie nie włączać.** Zamrożony indeks powstał na danych, które okazały się niewiarygodne, więc warto go kiedyś wyznaczyć od nowa. Najpierw jednak trzeba zobaczyć po 28 dniach, czy 881 stron z prawdziwymi danymi w ogóle zyskuje kliknięcia. Segment miesięcy miał CTR 0,38%, bo Google pokazuje własny widżet pogody.
3. **567 osieroconych stron** (bez linków wewnętrznych): część dostała teraz linki z sekcji „gdzie jest cieplej”, ale tylko strony indeksowalne. Reszta czeka na decyzję z punktu 2.

## 4. Design i konwersja

Kontrola sześciu stron w szerokościach 390, 768 i 1440 px (`pnpm seo:shots`), lokalnie i na Preview Vercela (z prawdziwymi zdjęciami i danymi dostawców): status 200, brak przepełnienia poziomego, 0 błędów konsoli, 0 żądań do API dostawców przy wczytaniu, pierwsze CTA w pierwszym ekranie na każdej stronie. Na Preview sprawdzono też stronę kierunku bez nazwy stacji w WWIS (Aleksandria): linia źródła pokazuje służbę i punkt WWIS.

| Sprawdzenie | Wynik |
|---|---|
| CTA hoteli na stronie miesiąca | Kierunek i termin w tym miesiącu (np. Barcelona, 10–14.01.2027) |
| CTA hoteli na porównaniu | Dwa przyciski, każdy z własnym kierunkiem |
| Prefetch wyszukiwarki bez kliknięcia | 0 żądań na porównaniu, stronie miesiąca i przewodniku |
| Playwright z axe (3 szablony × 3 szerokości, fokus, kliknięcie CTA) | 13/13 |
| Linia źródła przy liczbach | Widoczna pod odpowiedzią i pod tabelą liczb |

Znalezione i poprawione: przydługi, urzędowy lead strony miesiąca, błąd odmiany („różnica wobec Barcelona”) i niejasne „12. miejsce”.

Znalezione i **niepoprawione**:

- **Przycisk „Szukaj lotów” prowadzi do `/?tab=loty`**, czyli na stronę główną bez kierunku i terminu. Formularz lotów nie przyjmuje kierunku z adresu, a jego zmiana wymaga dotknięcia komponentów strony głównej, czego nie wolno mi robić bez zgody. To realna strata w lejku lotów.
- Pierwsze CTA na stronie miesiąca jest na telefonie 544 px od góry na Preview (wcześniej 388 px), bo odpowiedź ma teraz więcej treści i linię źródła. Mieści się w pierwszym ekranie, ale przy pierwszej wizycie zasłania je baner cookies.
- Linki pomocnicze niższe niż 40 px (okruszki, źródła, podpis autora) zostały bez zmian.

Ocena wyglądu: spokojny, redakcyjny, spójny z marką, bez gradientów, emoji i fałszywej presji. Nie jest to projekt „wyróżniający się” w sensie wizualnym. Jego siłą jest czytelność i widoczne źródła. Nie było testów z użytkownikami.

## 5. Audyt końcowy

| Kontrola | Wynik |
|---|---|
| `pnpm test` | 1690 + 186 zaliczonych |
| `tsc --noEmit`, `eslint` | czyste |
| Build produkcyjny | udany |
| Test dymny (`seo:smoke`) | 268/268 lokalnie i 268/268 na Preview (`9681df4`) |
| Playwright z axe | 13/13 |
| GitHub Actions na PR (`9681df4`) | `content-check` i `templates-e2e` zaliczone, wdrożenie Preview na Vercelu gotowe |
| Crawl buildu (1955 stron) | 0 błędów, 0 błędów JSON-LD, 0 złych linków, 0 stron bez `og:image`, 1402 indeksowalne (bez zmian), mapa witryny 1401 adresów, wszystkie 200 |
| Scenariusze silnika treści | próbny, powtórka (`DUPLICATE_SKIPPED`), odrzucenie niepotwierdzonego faktu, wyłącznik awaryjny: zgodne z oczekiwaniem |
| Koszt automatu | 0 USD. Działał wyłącznie na modelu testowym. |

**Lighthouse** (telefon, mediana z 3 przebiegów na przemian, build przed zmianami WMO kontra końcowy, localhost):

| Strona | Wydajność: przed → po | LCP: przed → po | Dostępność, dobre praktyki, SEO | CLS |
|---|---|---|---|---|
| Porównanie Ateny–Rzym | 89 → 89 | 3762 → 3763 ms | 100 / 100 / 100 | 0 |
| Barcelona w styczniu | 88 → 94 | 3848 → 3029 ms | 100 / 100 / 100 | 0 |
| Hub city break | 89 → 89 | 3802 → 3794 ms | 100 / 100 / 100 | 0 |

Skrypt `pnpm lighthouse` ma w projekcie próg wydajności 90 i kończy się błędem dla porównania i huba (89). Tak samo było na `main` (89 na wszystkich trzech szablonach), więc to nie regresja, ale progu nie spełniamy. Poprawa strony miesiąca jest zmierzona, a jej przyczyna nie została ustalona. To pomiar laboratoryjny bez sieci CDN.

Nie wykonano: przebiegu automatu na prawdziwym modelu i prawdziwym API Search Console.

## 6. Przegląd kodu przebudowy WMO

Przebudowę stron na normy WMO napisał Codex według specyfikacji. Diff został przeczytany w całości. Poprawiono:

| Znalezisko | Poprawka |
|---|---|
| Usunięty komentarz z zasadami integralności danych i zasadą „nazwa kierunku po dwukropku” w modelu porównania | Przywrócony i zaktualizowany |
| Odpowiedź FAQ „…jest w kierunku Ateny” (błąd przypadku, którego zasada miała unikać) | „Wyższą średnią maksymalną temperaturę w dzień ma w lipcu: Ateny (…)” |
| Ostatni wariant tytułu strony miesiąca pomijał nazwę miesiąca, co dałoby 12 identycznych tytułów | Miesiąc zostaje zawsze. Test: każdy kierunek ma 12 różnych tytułów ≤ 60 znaków. |
| Na każdej stronie przewodnika karta „Ceny hoteli — aktualne ceny pokazuje wyszukiwarka” bez żadnej informacji | Usunięta. Kolumna planowania znów pokazuje się tylko z danymi. |
| „Dla Barcelona…”, „W miesiącach styczeń, luty…” | Zdania przepisane bez błędów odmiany |
| 5 norm (4 w Egipcie, Trabzon) nie ma w WWIS nazwy stacji, przez co linia źródła pokazywałaby pusty dopisek „stacja” | Pokazujemy „punkt WWIS {miasto}”. Test pliku norm pilnuje kompletności, spójności (max ≥ min, zakresy), adresu źródła, współrzędnych i okresu. |

**CI.** Zadanie `templates-e2e` padło raz, bo build nie pobrał fontu Google („next/font/google queries have exactly one entry” w Turbopacku). Ten sam błąd wystąpił w tym samym czasie lokalnie, a chwilę później Google Fonts odpowiadało poprawnie. Build w CI ma teraz jedną powtórkę; drugi błąd zatrzymuje kontrolę. Trwałym rozwiązaniem byłoby trzymanie fontów w repozytorium (`next/font/local`), ale to zmiana wspólnego układu strony, w tym strony głównej, więc zostaje do Twojej decyzji.

## 7. Problemy, które zostają

1. Proza stron miesięcy jest szablonem. Wartość daje dane, nie tekst.
2. 158 indeksowalnych stron bez danych o miesiącu.
3. Przycisk lotów bez kierunku i terminu.
4. Okresy norm różnią się między krajami, a dla 28 kierunków źródło ich nie podaje.
5. Twierdzenia względne o kosztach („Taniej zwykle: X”) nadal opierają się na ręcznie wpisanym wskaźniku kosztów bez źródła. Nie podają kwot, ale to nadal ocena bez pomiaru.
6. Wzór budżetu został w `src/lib/mvp/scoring.ts`, bo korzysta z niego stary planer. Nie jest pokazywany na stronach treści.
7. Treść ze źródeł mają 4 z 54 porównań.
8. Gałąź `main` nie ma reguły ochrony.
