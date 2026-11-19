# Standard jakości projektowej stron treści

Dotyczy trzech szablonów: porównania kierunków (`/porownanie/[para]`), przewodnika miesięcznego (`/kierunki/[slug]/[miesiac]`) i huba (`/wyjazdy/[typ]`). Strona główna jest poza zakresem i nie została zmieniona.

Zasady tożsamości (charakter, element charakterystyczny, wzorce zakazane) są w skillu `helptravel-design-identity` (`docs/seo/skills/helptravel-design-identity/SKILL.md`). Ten dokument opisuje, jak wybrano kierunek, co zmierzono i jakie progi obowiązują.

## 1. Trzy kierunki art direction

Wszystkie trzy warianty dostają ten sam model danych i te same bloki, a różnią się kompozycją. Są dostępne pod `/lab/porownanie/[wariant]/[para]`. Trasa działa tylko z `SEO_LAB=1`, ma `noindex`, a bez flagi zwraca 404 (sprawdza to test dymny).

| | A „Werdykt” | B „Pojedynek” | C „Karta decyzji” |
|---|---|---|---|
| Pomysł | Kolumna redakcyjna: odpowiedź przed zdjęciem, jedna szpalta, sekcje dzielone liniami | Dwa tory od góry do dołu: zdjęcia jak plakat, werdykt w dwóch kolumnach także na telefonie, liczby na „taśmie” | Panel produktu: ciemny blok z odpowiedzią i CTA, dalej treść w ramkach |
| Kolejność na telefonie | H1 → odpowiedź → para CTA → zdjęcia → werdykt | H1 → zdjęcia → para CTA → odpowiedź → werdykt | ciemny panel (H1, odpowiedź, CTA) → zdjęcia → ramki |
| Szerokość szpalty | 46 rem | 52 rem | 60 rem |

### Pomiar w laboratorium (para Ateny–Rzym, `pnpm seo:shots`)

| Wariant | Wysokość strony 390 px | Góra pierwszego CTA: 390 / 768 / 1440 px | Przepełnienie poziome | Błędy konsoli |
|---|---|---|---|---|
| A „Werdykt” | 8521 px | 542 / 420 / 431 | brak | 0 |
| B „Pojedynek” | 8097 px | 413 / 527 / 538 | brak | 0 |
| C „Karta decyzji” | 9064 px | 441 / 423 / 402 | brak | 0 |

We wszystkich wariantach pierwsze CTA mieści się w pierwszym ekranie i żaden nie woła przy wczytaniu wyszukiwarki, rezerwacji ani lotów.

### Dlaczego wybrano A

- **Odpowiedź jest pierwszą rzeczą pod nagłówkiem.** W wariancie B odpowiedź zaczyna się pod zdjęciami i przyciskami, około 480 px od góry. Przy pierwszej wizycie baner cookies zakrywa ekran mniej więcej od 400 px, więc nowy czytelnik widziałby zdjęcia i baner, a nie odpowiedź na swoje pytanie. W wariancie A odpowiedź zaczyna się około 190 px od góry i jest widoczna nad banerem.
- **Czytelność na 390 px.** B wyśrodkowuje ośmiowierszowy akapit i ściska werdykt do dwóch kolumn po około 165 px. A prowadzi tekst jedną szpaltą wyrównaną do lewej.
- **Zgodność z marką bez decyzji właściciela.** C wprowadza ciemny panel w `brand-strong` i zamyka całą treść w ramkach. Wygląda to jak narzędzie albo reklama, a nie redakcja, i jest zmianą charakteru marki, której nikt nie zatwierdził. C jest też najdłuższy na telefonie (o 543 px dłuższy niż A).
- **Koszt.** A korzysta wyłącznie z istniejących tokenów i fontów. Nie dodaje nowych kolorów ani zasobów.

Wybór opiera się na zrzutach, pomiarach układu i testach automatycznych. Nie ma za nim badań z użytkownikami ani danych o konwersji, bo GA4 nie jest podłączone. Warianty B i C zostają w laboratorium i można do nich wrócić w teście A/B, gdy pomiar będzie działał.

### Wariant D „Magazyn” — domyślny od 18.11.2026

Właściciel ocenił A na desktopie jako zbyt wąski (szpalta 46 rem na ekranie 1440 px, puste boki), zbyt długi i ubogi w zdjęcia. D zachowuje to, co rozstrzygnęło o wyborze A — odpowiedź i parę CTA nad zgięciem na 390 px, werdykt jako element charakterystyczny, tylko tokeny marki — i zmienia kompozycję:

- szerokość kontenera serwisu (`max-w-page`, 75 rem); hero w dwóch kolumnach (tekst + duże zdjęcia obu miast); śródtytuły sekcji w lewej kolumnie, tekst w prawej (bez zbyt długich wierszy);
- „Najważniejsze różnice w skrócie”: wartości obu kierunków obok siebie, przy ocenach 0–100 pasek — dane z bramki faktów, nie ozdobne kafle;
- werdykt jako dwa panele „{miasto} — wybierz, jeśli” ze zdjęciem; blok „{A} i {B} w zdjęciach” w treści;
- jedna tabela faktów (wiersze dokumentu treści + liczby + najcieplejsze/najchłodniejsze miesiące) zamiast dwóch tabel i zdublowanej sekcji „Normy klimatyczne”; źródła klimatu raz;
- sekcje na przemian na tle `surface` i `surface-sunken`, większe śródtytuły; loty jako link pomocniczy w panelu CTA, nie trzeci przycisk.

Zasada dla zdjęć: prawdziwe zdjęcie miejsca albo żadne.

- **Najważniejsze kierunki** (strona główna, huby, porównania, strony „Hotele w …”) mają zdjęcia z rejestru `src/lib/media/verified-photos.ts`, obejrzane ręcznie i opisane po polsku. Test pilnuje, żeby każdy nowy kierunek z tych miejsc dostał wpis.
- **Pozostałe kierunki** biorą zdjęcia z wyszukiwania Pexels tylko na produkcji i tylko wtedy, gdy opis zdjęcia wymienia to miasto i jego kraj. Zdjęć zastępczych z `commercial-assets` już nie ma: przypisywały miastom cudze ikony (19.11.2026 na produkcji: Barcelona — wieża Eiffla, Ateny — czerwona fasada). Bez wiarygodnego zdjęcia strona pokazuje układ bez zdjęcia (`PhotoPlaceholder`), a dane strukturalne nie mają pola `image`.
- **Zdjęcia zawsze w parze:** jedno miasto ze zdjęciem, a drugie bez, wyglądałoby na faworyzowanie.

| Ateny–Rzym | A „Werdykt” | D „Magazyn” |
|---|---|---|
| Słowa w `<main>` (build lokalny) | 973 | 730 (−25%) |
| Wysokość strony na Preview, 1440 / 768 / 390 px | 6321 / 6685 / 8724 | 5796 / 7063 / 8830 |
| Zdjęcia | 2 | 8 |

Na desktopie strona jest niższa o 8%. Na tablecie jest wyższa o 6%, a na telefonie o 1%, bo doszło sześć zdjęć: oszczędność na tekście zjadają zdjęcia.

Przy przeglądzie innych par wyszły dwa błędy generatora porównań bez dokumentu treści:

- **Plaża dla miast bez morza:** 8 z 54 par wskazywało „na plażę” miasto bez plaży, np. „Na plażę i wypoczynek nad morzem: Budapeszt” przy ocenie 15/100 wobec 8/100. Teraz odpowiedź, FAQ i werdykty mówią o plaży tylko wtedy, gdy któryś kierunek ma profil plażowy co najmniej 70/100, czyli ten sam próg co odbiorcy „plaży”.
- **Identyczne listy:** 14 z 39 par bez dokumentu miało po obu stronach te same listy „wybierz, jeśli”. Zostają tylko cechy, które różnią kierunki. Gdy którejś stronie nic nie zostaje, zamiast list stoi sekcja „O obu kierunkach” z opisami z przewodników.

Skrócenie treści: zdublowana sekcja klimatu i podwójne źródła (szablon), zdania-zapowiedzi i powtórzenia werdyktu w dokumencie Ateny–Rzym (sekcja „Morze i okolice” powtarzała fakty z werdyktu i tabeli). Twierdzenia i źródła bez zmian; cytaty potwierdzone na kopiach stron z 13.11.2026 (UNESCO blokuje automaty).

### Rola narzędzi inspiracji

| Narzędzie | Co wzięto | Co odrzucono |
|---|---|---|
| Frontend Design | Zasady: góra strony jako teza, jeden element charakterystyczny, struktura ma mówić prawdę o treści, autokrytyka przed oddaniem | Nic. Skill nie narzuca stylu. |
| UI UX Pro Max (specyfikacja wygenerowana dla HelpTravel) | Checklistę: brak emoji jako ikon, kontrast 4,5:1, widoczny fokus, `prefers-reduced-motion`, punkty łamania. Wytyczną dla tabel: układ blokowy na telefonie. | Paletę `#0EA5E9` + `#EA580C`, styl „Aurora UI” z gradientami i animacjami 8–12 s, wzorzec „Scroll-Triggered Storytelling”, fonty Newsreader + Roboto. Powód: sprzeczne z tokenami marki, a dodatkowe fonty kosztują LCP. |
| 21st.dev | Nic. Narzędzie wymaga klucza (`BLOCKED_AUTH`). | — |

## 2. Co się zmieniło na stronach (telefon 390 px)

Porównanie produkcji z 14.11 z buildem tej gałęzi, ten sam skrypt i ta sama szerokość.

| Strona | Góra H1: przed → po | Góra pierwszego CTA: przed → po | CTA w pierwszym ekranie |
|---|---|---|---|
| `/porownanie/athens-greece-vs-rome-italy` | 272 → 127 px | 4876 → 478 px | nie → tak |
| `/kierunki/barcelona-spain/styczen` | 144 → 127 px | 2881 → 388 px | nie → tak |
| `/wyjazdy/city-break` | 171 → 171 px | 645 → 645 px | tak → tak |

Na wszystkich trzech stronach, przed i po: brak przepełnienia poziomego, 0 błędów konsoli, 0 zakazanych żądań przy wczytaniu.

Zrzuty „przed” i „po” dla 390 px są w `docs/seo/screenshots/`. Pełne zestawy (trzy szerokości, kadr nad zgięciem i cała strona, warianty laboratoryjne) leżą poza repozytorium i odtwarza je polecenie z punktu 4.

## 3. Progi jakości

Każdy próg ma test. Zmiana szablonu, która któregoś nie spełnia, nie jest gotowa.

| # | Próg | Jak sprawdzane |
|---|---|---|
| 1 | Na 390 px: H1, a bezpośrednio pod nim odpowiedź na intencję | `e2e/seo-templates.spec.ts`, raport `seo:shots` |
| 2 | Pierwsze CTA w pierwszym ekranie na 390, 768 i 1440 px | raport `seo:shots` (`firstCtaAboveFold`) |
| 3 | Brak przepełnienia poziomego na 390, 768 i 1440 px | e2e i raport `seo:shots` |
| 4 | Główne CTA mają co najmniej 44 px wysokości (zmierzone 48 px) | e2e |
| 5 | axe: 0 naruszeń na trzech szablonach w trzech szerokościach | e2e (`@axe-core/playwright`) |
| 6 | Fokus z klawiatury jest widoczny i trafia w CTA | e2e |
| 7 | Kliknięcie CTA prowadzi do wyszukiwarki z kierunkiem i wysyła `seo_cta_click` | e2e z przechwyconym `/hotele/szukaj` |
| 8 | Przy wczytaniu strony treści nie ma żądań do API wyszukiwarki, rezerwacji i lotów, a linki CTA nie pobierają wstępnie tras transakcyjnych | raport `seo:shots` (`forbiddenRequestsOnLoad`), test `cta-prefetch.test.ts` |
| 9 | Lighthouse (telefon): dostępność 100, CLS 0, LCP bez regresji względem `main` | `pnpm lighthouse -- --routes=…`, mediana z 3 przebiegów |
| 10 | Tabela na telefonie jest układem blokowym z zachowanymi rolami ARIA | e2e i axe |
| 11 | Zdjęcia są prawdziwymi zdjęciami miejsca z podpisem autora, mają `alt` i poprawne `sizes` | przegląd kodu, bramka treści (alt) |

Wyniki Lighthouse przed i po są w `BASELINE.md`. W skrócie: dostępność 96 → 100 na porównaniu i przewodniku miesięcznym, CLS 0, różnice LCP w granicach szumu pomiaru.

## 4. Jak powtórzyć kontrolę

```bash
pnpm build
```

```bash
pnpm start
```

```bash
pnpm seo:shots -- --base http://localhost:3000 --label po --paths porownanie/athens-greece-vs-rome-italy,kierunki/barcelona-spain/styczen,wyjazdy/city-break
```

```bash
pnpm exec playwright test e2e/seo-templates.spec.ts
```

```bash
pnpm lighthouse -- --routes=/porownanie/athens-greece-vs-rome-italy,/kierunki/barcelona-spain/styczen,/wyjazdy/city-break
```

W Git Bash ścieżki zaczynające się od `/` są zamieniane na ścieżki Windows, dlatego skrypty `seo:*` przyjmują je też bez początkowego ukośnika.

## 5. Znane ograniczenia

- **Zdjęcia w buildzie lokalnym.** Build lokalny nie ma klucza Pexels, więc pokazuje zdjęcia zastępcze z puli w repo. Dlatego zrzuty „po” w repozytorium pochodzą z Preview na Vercelu (14.11.2026), gdzie widać prawdziwe zdjęcia miejsc i blok statystyk hoteli.
- **Baner cookies przy pierwszej wizycie** zakrywa dolną część pierwszego ekranu, w tym parę CTA (478 px od góry). Odpowiedź pod H1 jest widoczna nad banerem. Baner jest elementem zgody i nie był zmieniany.
- **Linki pomocnicze niższe niż 40 px.** Okruszki, podpis autora, linki w zdaniach, lista źródeł i nazwy miast w tabeli huba mają 17–24 px wysokości: 9 na porównaniu (przed: 4), 7 na przewodniku miesięcznym (przed: 18), 7 na hubie (przed: 3). Spełniają WCAG 2.2 AA dzięki wyjątkom dla linków w tekście i dla odstępów, ale to nie są wygodne cele dla kciuka. Główne CTA mają 48 px. Powiększenie listy źródeł to mała zmiana do kolejnej iteracji.
- **Brak testów z użytkownikami i danych o konwersji.** Wybór kierunku jest decyzją projektową popartą pomiarami układu.
- **Uwaga z konsoli Chrome** o leniwie ładowanym logo bez wymiarów dotyczy wspólnej powłoki serwisu (R-23 w `RISK_REGISTER.md`).

## 6. Ewaluacja skilla `helptravel-design-identity`

Trzy przypadki testowe (`docs/seo/skills/helptravel-design-identity/evals/`): odrzucenie góry strony w stylu generatora AI, tabela pięciokolumnowa na telefonie i ocena specyfikacji z UI UX Pro Max. Każdy przypadek wykonano ze skillem i bez niego (Codex, tryb tylko do odczytu), a odpowiedzi oceniono 14 asercjami.

| Przebieg | Spełnione asercje | Zużyte tokeny |
|---|---|---|
| Bez skilla | 13/14 | 43 727 |
| Ze skillem, iteracja 1 | 13/14 | 14 963 |
| Ze skillem, iteracja 2 | 14/14 | 26 423 |

Wnioski:

- Wersja bez skilla wypada prawie tak samo dobrze, bo model czyta reguły z kodu i komentarzy w repo. Skill głównie skraca tę drogę i wymusza stały format odpowiedzi z poleceniami QA.
- Pierwsza iteracja wykazała błąd w samym skillu. Szkic mówił „jedno główne CTA”, a szablon porównania ma parę równorzędnych przycisków, po jednym na miasto. Przebieg bez skilla opisał to poprawnie na podstawie kodu. Skill i asercja zostały poprawione.
- To mała próba: 3 przypadki, po jednym przebiegu, a oceniał autor skilla. Wynik pokazuje kierunek i nie jest dowodem statystycznym.
