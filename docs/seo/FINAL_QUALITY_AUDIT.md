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

**CI.** Zadanie `templates-e2e` padło raz, bo build nie pobrał fontu Google („next/font/google queries have exactly one entry” w Turbopacku). Ten sam błąd wystąpił w tym samym czasie lokalnie. Rozwiązane trwale 17.11.2026: fonty są w repozytorium (sekcja 8).

## 7. Problemy, które zostają

1. Proza stron miesięcy jest szablonem. Wartość daje dane, nie tekst.
2. 158 indeksowalnych stron bez danych o miesiącu. Wariant `noindex` jest gotowy i przetestowany, ale nieaktywny do Twojej decyzji (sekcja 8).
3. Normy różnych krajów pochodzą z różnych okresów, a dla 28 kierunków źródło okresu nie podaje. Porównujemy je teraz tylko przy porównywalnych okresach (sekcja 8), więc część stron straciła porównanie z Warszawą.
4. Wzór budżetu został w `src/lib/mvp/scoring.ts`, bo korzysta z niego stary planer. Nie jest pokazywany na stronach treści.
5. Treść ze źródeł mają 4 z 54 porównań.
6. Gałąź `main` nie ma reguły ochrony.
7. Tytuły przewodników zapisują czas lotu z kropką („lot 3.4 h”). Tak jest też na `main`, więc nie zmieniałem 235 tytułów w tej rundzie.

## 8. Ostatnia runda przed produkcją (17.11.2026)

### Porównywalność okresów norm WMO

**Problem.** `month-context.ts` i model porównań odejmowały od siebie normy z różnych okresów (od 1961–1990 do 1991–2020, a 28 bez okresu), jakby były w pełni porównywalne. Dotyczyło to porównania z Warszawą, pozycji „na tle innych kierunków”, listy „gdzie cieplej”, lipca w porównaniach i rankingu sezonowego.

**Reguła** (`src/lib/mvp/climate-periods.ts`). Normy z różnych 30-leci różnią się systematycznie: zmienia się klimat i stacje. Różnica z dokładnością do 0,1°C między takimi normami byłaby fałszywą precyzją. Z kolei wyrzucenie każdego porównania między okresami zabrałoby je prawie dwóm trzecim stron. Dlatego:

| Relacja okresów | Kiedy | Co pokazujemy |
|---|---|---|
| ten sam | identyczne lata | różnica z dokładnością 0,1°C |
| sąsiedni | oba okresy mają co najmniej 20 lat, a ich środki dzieli najwyżej 10 lat (np. 1971–2000 i 1981–2010) | różnica w pełnych stopniach z „ok.”, oba okresy i dopisek „porównanie orientacyjne”; kierunek („więcej”, „wyższa”) tylko przy różnicy co najmniej 1,5°C, poniżej „podobnie” |
| różny | środki dalej niż 10 lat albo okres krótszy niż 20 lat | brak porównania |
| nieznany | źródło nie podaje okresu | brak porównania |

**Gdzie i z jakim skutkiem** (2244 strony miesięcy z normą WMO):

| Element | Zmiana | Liczby |
|---|---|---|
| Porównanie z Warszawą (norma 1981–2010) w leadzie i wierszu „Na tle Warszawy” | według reguły; dni z opadem tylko przy tym samym okresie | dokładne na 660 stronach (55 kierunków), orientacyjne na 768 (64), brak na 804 (67: 39 z innym okresem, 28 bez okresu) |
| „Na tle innych kierunków” | liczone tylko wśród kierunków z normą z tych samych lat, gdy jest ich co najmniej 10; zdanie podaje okres | na 1704 stronach (142 kierunki) |
| „Gdzie {w miesiącu} jest cieplej” | bez kierunków z innym albo nieznanym okresem; przy sąsiednim okresie „ok. +N°C” | 3121 linków orientacyjnych |
| Porównania: lipiec w FAQ i szybkiej odpowiedzi | dokładnie, orientacyjnie albo wcale | tabela pokazuje wiersz „Okres normy WMO” i notę, gdy okresy się różnią |
| `/najlepsze-kierunki/[sezon]` | ranking ze wskaźnikiem kosztów i dostępności zastąpiony listą alfabetyczną kierunków ze średnią 22–28°C w dzień; nagłówek bez słów „ranking” i „najlepsze” | wiosna 29, lato 65, jesień 53, zima 19 kierunków; adres bez zmian |

Testy: relacje ten sam, sąsiedni, różny i nieznany (także `null` po jednej i po obu stronach), zaokrąglenia i próg na danych syntetycznych oraz na prawdziwych normach (Barcelona–Walencja: ten sam okres, Barcelona–Rzym: sąsiedni, Barcelona–Lizbona: różny, Bangkok i Amman: bez porównania z Warszawą).

### Twierdzenia o relatywnych kosztach

Usunięte wszystkie widoczne oceny wyprowadzane z ręcznie wpisanego wskaźnika kosztów albo napisane bez pomiaru: werdykt i FAQ „Taniej zwykle” w porównaniach, tag „napiętego budżetu”, pasmo „budżet” na kartach kierunków, notatki budżetowe 23 przewodników, zdania typu „rzadko bywa najtańsza”, „opłacalny”, wersja angielska przewodników, superlatywy na hubie `/wyjazdy/budzet` i opisy listy porównań. Hub budżetowy zostaje przy swoim temacie, ale opiera go wyłącznie na zmierzonych cenach z datą.

Zostają tylko ceny zmierzone (migawki „od X zł/noc” i ceny lotów z datą pomiaru). Strażnik w testach (`relative-cost-claims.test.ts` i testy przewodników) sprawdza modele porównań, stron miesięcy i przewodników PL i EN, artykuły, kategorie i huby. Tytuł porównania Malaga–Walencja zachowuje słowo „ceny”, bo to para flagowa ze zmierzonymi cenami hoteli. Stary planer (`scoring.ts`) i niepubliczny moduł raportów (`/raporty` przekierowuje na stronę główną) nie były zmieniane.

### Przekazanie kierunku i terminu do wyszukiwarki lotów

„Szukaj lotów” na stronie miesiąca prowadzi na `/?tab=loty#destination=BCN&destLabel=Barcelona&country=Spain&depart=…&return=…`. Zakładka lotów otwiera się z wpisanym celem i tym samym terminem co hotele. Porównanie ma osobny link dla każdego z dwóch kierunków, a przewodnik przekazuje sam cel. Wyszukiwanie nie startuje samo, bo lotnisko wylotu wybiera człowiek, a dostawca ma twardy limit tempa.

- Dane są we fragmencie adresu, więc dla wyszukiwarek to nadal jeden adres `/?tab=loty`, a nie tysiące wariantów strony głównej. GA4 składa adres strony bez fragmentu, a ścieżka celu w zdarzeniu `seo_cta_click` odcina go (poprawka w `page-path.ts` z testem).
- Wejście z adresu jest traktowane jako niezaufane: kod IATA musi mieć trzy litery, tekst ma limit długości i nie może zawierać znaków sterujących, a daty z przeszłości, zbyt odległe albo w złej kolejności są pomijane.
- Test e2e dla trzech wejść: formularz ma cel (i termin), do dostawcy nie idzie żadne zapytanie, a po wpisaniu lotniska wylotu adres wyników ma ten sam cel i termin co link. Kontrola negatywna: na buildzie sprzed zmiany test pada.

### Fonty bez pobierania przy buildzie

Pliki Manrope i Cormorant Garamond leżą w `public/fonts/` z licencjami SIL OFL 1.1. Są bajt w bajt tymi samymi plikami, których używał `next/font/google`, z tymi samymi regułami `@font-face`, fallbackami i preloadem. Porównanie dwóch buildów (5 stron, 390 i 1440 px): te same kroje, te same metryki tekstu i 0 różnych pikseli na 10 zrzutach. Kontrola negatywna tym samym narzędziem: 1 028 032 różnych pikseli przy dwóch różnych stronach. Opis i procedura odświeżenia: `FONTS.md`.

### Wariant `noindex` dla 158 stron bez danych

Gotowy, przetestowany i nieaktywny (`OWNER_ACTIONS.md`, punkt 16). Wariant odejmuje od bazy 1039 stron dokładnie 158 stron 25 kierunków bez normy WMO, czyli te, których model nie pokazuje żadnej pogody. Nie dodaje żadnej strony. Kontrola negatywna: po tymczasowym przełączeniu sitemapa ma 881 stron miesięcy i pada pięć testów-strażników.

### Wykonanie i przegląd

Okresy norm i koszty napisał Codex według specyfikacji. Przerwał go limit konta przed uruchomieniem pełnych testów i bez podsumowania, więc diff został przeczytany w całości, a testy uruchomione od nowa. Poprawiono:

| Znalezisko | Poprawka |
|---|---|
| Tytuł porównania Malaga–Walencja stracił słowo „ceny”, choć to para flagowa ze zmierzonymi cenami hoteli | Tytuł przywrócony (bez zmiany adresu i bez ryzyka dla dobrze działającej strony) |
| „W kohorcie 56 kierunków…” — żargon statystyczny w zdaniu dla czytelnika | „Spośród 56 kierunków z normą z tych samych lat (1981–2010)…” |
| Nagłówek „Kierunki na lato ze średnią 22–28°C” nie mówił, czego to średnia | „Kierunki na lato: w dzień średnio 22–28°C” |
| Pytanie FAQ zmienione na „spokojny weekend”, a odpowiedź nadal zaczynała się od „Może się udać” | „Tak, jeśli wybierzesz kilka dzielnic…” |
| „Bardzo dobry stosunek ceny do jakości” w wyróżnikach Walencji, poza zakresem przeszukania | Zastąpione „plaża i miasto w jednym planie” |
| Literówka „od mają do” w dwóch przewodnikach | „od maja do” |

### Kontrole końcowe

| Kontrola | Wynik |
|---|---|
| `pnpm test` | 1722 + 186 zaliczonych |
| `tsc --noEmit`, `eslint` | czyste |
| Build produkcyjny | udany w 100 s, bez żadnego zapytania do Google Fonts |
| Test dymny (`seo:smoke`) | 268/268. Próg słów dla porównania Malaga–Walencja obniżony z 900 do 800, bo po usunięciu werdyktu i FAQ o kosztach strona ma 897 słów. Progu nie dobijamy tekstem. |
| Playwright z axe | 16/16 (13 dotychczasowych i 3 nowe dla lotów) |
| Nagłówki fontów | `immutable` tylko dla plików woff2; README i licencje bez długiego cache |
| Powtarzalność 1039 stron indeksowalnych, tryb ostry | 803 → 845 wariantów tekstu, strony w grupach ≥ 10: 86 (bez zmian), największa grupa 36 (bez zmian), udział zdań szablonowych 0,70 → 0,59. Spadek wynika z gałęzi zależnych od okresu normy (porównanie dokładne, orientacyjne albo żadne, okres i liczba kierunków w zdaniu), a nie z nowego tekstu. |

Wyniki GitHub Actions i kontrola Preview dla końcowego commita są w opisie PR #154.
