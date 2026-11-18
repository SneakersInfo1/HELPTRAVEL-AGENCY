# Standard jakości redakcyjnej (bramka treści)

Nie istnieje narzędzie, które gwarantuje „zero AI-slopu”, i ten standard niczego takiego nie obiecuje. Daje za to bramkę o jawnych regułach: każde odrzucenie wskazuje regułę, cytat i powód. Zasady redakcyjne opisuje `EDITORIAL_POLICY.md`, a sposób pracy recenzenta skill `helptravel-editorial-quality`.

## 1. Gdzie to jest w kodzie

| Element | Plik |
|---|---|
| Schemat dokumentu treści i klasy ryzyka | `src/lib/content-engine/schema.ts` |
| Bramka jakości (38 reguł) | `src/lib/content-quality/gate.ts` |
| Testy bramki (43 przypadki) | `src/lib/content-quality/gate.test.ts` |
| Porównanie liczb w tekście i w dowodzie | `src/lib/content-engine/numbers.ts` |
| Dozwolone źródła i pobieranie | `src/lib/content-engine/sources.ts`, `source-registry.ts` |
| Decyzja, co trafia na stronę | `src/lib/content-engine/site-content.ts` |
| Dokumenty treści | `content/seo/**` |

## 2. Werdykty

| Werdykt | Kiedy | Skutek |
|---|---|---|
| `PASS` | Brak zastrzeżeń | W trybie domyślnym nadal czeka na człowieka. Automatyczna publikacja jest możliwa tylko dla klasy `EVERGREEN` w trybie `AUTO_EVERGREEN`. |
| `NEEDS_REVISION` | Wada redakcyjna: wypełniacze, duplikat, zły link, daty, długość | Odrzucone w każdym trybie. |
| `BLOCKED_FACTS` | Twierdzenie bez dowodu, po terminie ważności albo liczba bez źródła | Odrzucone w każdym trybie. |
| `REVIEW_REQUIRED` | Klasa `DYNAMIC` albo `HIGH_RISK`, temat wysokiego ryzyka, cena | Tylko człowiek. Nigdy automat. |
| `SKIPPED_QUALITY_GATE` | Nie ma zweryfikowanego materiału | Nic się nie publikuje. Harmonogram nie musi niczego wydać. |

Na stronę trafia wyłącznie dokument ze statusem `approved`. Jeżeli choć jedna sekcja zależy od twierdzenia niezweryfikowanego albo przeterminowanego, strona wraca w całości do wersji bez dokumentu. Nie pokazujemy połowy tekstu.

## 3. Reguły

**Fakty (blokują jako `BLOCKED_FACTS`):**

- `claim_unverified`, `claim_expired`: twierdzenie użyte w tekście nie ma potwierdzenia w źródle albo minął termin ważności jego klasy danych.
- `claim_number_not_in_evidence`: liczby z twierdzenia nie występują w dosłownym cytacie ze źródła. Porównanie jest po wartości, więc „3,718 m” z angielskiego źródła pokrywa „3718 m”, ale „9 h” nie jest pokryte rokiem 1987.
- `number_without_claim`: liczba z jednostką (stopnie, kilometry, godziny, procenty, lata, waluty, także słownie) bez twierdzenia.
- `price_without_source`, `future_year_without_source`, `high_risk_without_source`, `section_without_claims`, `source_not_https`.

**Ryzyko (kierują do człowieka jako `REVIEW_REQUIRED`):**

- `high_risk_topic`: wizy, paszport i dowód, MSZ, szczepienia, bezpieczeństwo, ubezpieczenia. Reguła rozróżnia odmianę („wiza”, „bezwizowy”) od słów podobnych („wizyta”).
- `price_requires_review`, `risk_class_requires_review`.

**Redakcja (odsyłają do poprawy jako `NEEDS_REVISION`):**

- `fake_experience`: zmyślone doświadczenie autora („byliśmy”, „sprawdziliśmy na miejscu”).
- `fake_urgency`: fałszywa presja („ostatnie miejsca”, „tylko dziś”). Opis w rodzaju „jedno z ostatnich miejsc na wybrzeżu” nie jest presją.
- `filler_phrases`, `lead_starts_with_filler`, `superlatives`, `repeated_sentence`, `internal_repetition`, `no_unique_value`.
- `lead_misses_intent`: lead nie odpowiada na intencję zapytania.
- `duplicate_title`, `duplicate_intro`, `url_collision`: kanibalizacja istniejących stron serwisu.
- `cta_invalid`, `related_link_invalid`, `internal_links_plan`, `enrichment_target_missing`: CTA do nieistniejącej trasy albo do kroku zakupu, linki donikąd.
- `date_integrity`, `date_modified_without_change`, `published_date_changed`, `stale_year_as_current`: daty z przyszłości, zmiana daty modyfikacji bez zmiany treści.
- `image_alt_missing`, `too_short_for_type`, `schema_invalid`.

Minimalna długość zależy od typu: artykuł 450 słów, wzbogacenie porównania 220, huba 180, miesiąca 150. To dolna granica sensu, a nie cel. Bramka nie nagradza długości.

`no_verified_material` daje `SKIPPED_QUALITY_GATE`.

## 4. Przypadki testowe i fałszywe alarmy

Zestaw ma 43 przypadki (wymagane było co najmniej 12): pozytywne, negatywne i pułapki na fałszywe alarmy. Poniższy podział opisuje pierwsze 36. Siedem kolejnych doszło po krytycznym przeglądzie i opisuje je punkt 8.

- **Korpus pozytywny (2 testy)** to cztery prawdziwe dokumenty z `content/seo/comparisons/` (1925 słów, 48 twierdzeń). Wynik: 0 zastrzeżeń blokujących, czyli 0 fałszywych alarmów na 4 dokumentach. Trzy mają werdykt `PASS`, a jeden `REVIEW_REQUIRED`, bo zawiera godziny otwarcia (klasa `DYNAMIC`). To wynik zamierzony.
- **Przypadki negatywne (25 testów)**, każdy z oczekiwanym werdyktem: liczba bez twierdzenia, twierdzenie bez dowodu, twierdzenie po terminie, pozorowana cena, wiza bez źródła urzędowego, rok z przyszłości, tabela bez twierdzeń, brak zweryfikowanego materiału, zmyślone doświadczenie, fałszywa presja, wypełniacze, lead obok intencji, powtórzone zdanie, skopiowany tytuł, lead przepisany z huba, za krótki tekst, CTA donikąd lub do kroku zakupu, zły link, kolizja adresu, zmieniona data bez zmiany treści, daty z przyszłości, błąd schematu, liczba niepokryta wartością w cytacie, jednostki słowne i obce waluty, twierdzenie „zweryfikowane” bez swoich liczb w cytacie.
- **Pułapki na fałszywe alarmy (5 testów)**, czyli teksty, które bramka musi przepuścić: naturalny tekst z liczebnikami bez jednostek, krótki okres planu („3 albo 4 dni”), zapis tysięcy z angielskiego źródła, „wizyta” obok „wizy”, „jedno z ostatnich miejsc na wybrzeżu”.
- **Decyzja publikacji (3 testy):** automat tylko dla `PASS` + `EVERGREEN` w trybie `AUTO_EVERGREEN`; `DYNAMIC` i `HIGH_RISK` nigdy automatycznie; odrzucenie w każdym trybie.
- **Spójność listy fraz (1 test).**

Fałszywe alarmy wykryte w trakcie budowy i naprawione, każdy z testem regresji:

1. „3 albo 4 dni” było brane za fakt liczbowy. Jednostka „dni” wymaga teraz źródła dopiero od 15.
2. „wizyta” uruchamiała regułę wizową. Reguła używa teraz granic słów dla polskich liter.
3. „jedno z ostatnich miejsc” uruchamiało regułę presji. Wzorzec został zawężony.
4. „3,718 m” w źródle nie pokrywało „3718 m” w tekście. Liczby są porównywane po wartości, z obsługą zapisu polskiego i angielskiego.

Bramka nie korzysta z „detektorów AI”. Takie narzędzia nie mówią, co jest nie tak z tekstem, i mylą się w obie strony.

## 5. Czego automat nie oceni

Bramka nie wie, czy werdykt „co wybrać” jest trafny, czy porównanie daje czytelnikowi coś nowego i czy zdanie brzmi naturalnie. To ocenia człowiek przy przeglądzie PR, z pomocą skilla `helptravel-editorial-quality`. Dokument dostaje status `approved` dopiero poleceniem:

```bash
pnpm content:verify -- --approve <id> --by "Imię Nazwisko" --write
```

Cztery dokumenty z tej gałęzi mają wpis `reviewedBy: „właściciel serwisu — akceptacja przez merge PR”`. Oznacza to, że ich zatwierdzeniem jest scalenie tego PR przez właściciela. Jeśli właściciel nie akceptuje któregoś tekstu, usuwa plik dokumentu, a strona wraca do wersji bez niego.

## 6. Polecenia

```bash
pnpm content:check
```

```bash
pnpm content:freshness
```

```bash
pnpm test:seo
```

`content:check` działa w CI na każdym PR dotykającym treści (`.github/workflows/seo-content-check.yml`) i w `pnpm test`. `content:freshness` kończy się błędem, gdy któreś twierdzenie jest po terminie. Najbliższy termin to 11.02.2027 (godziny otwarcia w dokumencie Funchal–Santa Cruz).

## 7. Ewaluacja skilla `helptravel-editorial-quality`

Trzy przypadki testowe (`docs/seo/skills/helptravel-editorial-quality/evals/`): akapit ze zmyślonymi faktami i wypełniaczami, zdanie o wizie z prośbą o automatyczne zatwierdzenie oraz poprawny lead ze źródłami, który ma przejść bez fałszywego alarmu. Każdy wykonano ze skillem i bez niego (Codex, tryb tylko do odczytu), a odpowiedzi oceniono 15 asercjami.

| Przebieg | Spełnione asercje | Zużyte tokeny |
|---|---|---|
| Bez skilla | 12/15 | 42 744 |
| Ze skillem, iteracja 1 | 14/15 | 20 914 |
| Ze skillem, iteracja 2 | 15/15 | 35 357 |

Wnioski:

- Najważniejsza różnica dotyczy zdania o wizie. Model bez skilla nie zatwierdził dokumentu, ale sam potwierdził z pamięci, że zdanie „jest zgodne z aktualną informacją MSZ”, i podał link, którego w tej sesji nie pobrał. Tak właśnie nieaktualny fakt wysokiego ryzyka trafia do tekstu. Ze skillem model napisał wprost, że nie potwierdza prawdziwości z pamięci, i zażądał cytatu z datą.
- Model bez skilla nie podał jednoznacznego werdyktu („`NEEDS_REVISION` albo `BLOCKED_FACTS`”, „tak, gotowy”). Ze skillem każda odpowiedź ma stały format.
- Po pierwszej iteracji skill dostał dwa uzupełnienia: zakaz potwierdzania faktów wysokiego ryzyka z pamięci i obowiązek napisania jednym zdaniem, co grozi czytelnikowi.
- Asercja o niepotwierdzaniu z pamięci została dopisana po obejrzeniu wyników pierwszej iteracji. Próba jest mała: 3 przypadki, po jednym przebiegu, a oceniał autor skilla.

## 8. Zmiany po krytycznym przeglądzie (15.11.2026)

Przegląd całej gałęzi wykazał luki w samej bramce. Każda poprawka ma test regresji.

| Luka | Poprawka |
|---|---|
| Dokument ze źródłem spoza listy dozwolonych przechodził kontrolę offline | Nowa reguła `source_not_allowed`. Lista jest sprawdzana zawsze, bez sieci. |
| Liczbę w leadzie mogło „pokryć” twierdzenie niezweryfikowane | Liczby pokrywają tylko twierdzenia zweryfikowane i nieprzeterminowane. |
| Sekcja tekstu bez twierdzeń przechodziła bramkę | Sekcja jest faktograficzna (wymaga twierdzenia) albo jawnie oznaczona jako opinia (`opinion: true`). Opinia nie może zawierać liczb z jednostką. |
| „3 km” w twierdzeniu było pokryte przez „3 hours” w cytacie | Porównanie uwzględnia wymiar jednostki (długość, czas, temperatura, procent, rok, waluta). |
| Cytat „3,5 hours” pokrywał wartość 3 | Zapis angielski i polski liczb nie są już mieszane. |
| Twierdzenie o „PR1 i PR6” przechodziło z cytatem zawierającym tylko PR6 | Nowa reguła `claim_identifier_not_in_evidence`: identyfikatory typu PR1 czy A380 muszą wystąpić w cytacie dosłownie. |
| Tekst mógł zawierać znaczniki HTML | Nowa reguła `html_markup_in_text`. Dodatkowo JSON-LD jest zapisywany z ucieczką znaków `<`, `>` i `&`. |
| Rozjazd skrótu treści nie zatrzymywał kontroli | `content:check` kończy się błędem i podaje, jak przeliczyć skrót. |

Czego bramka nadal nie sprawdzi mechanicznie: czy cytat pokrywa każdą nazwę własną z twierdzenia. Dwa takie przypadki (Barcelona, Madera) wykrył przegląd i poprawiono je ręcznie. Dlatego twierdzenia powinny być atomowe, a recenzent porównuje nazwy z cytatem.
