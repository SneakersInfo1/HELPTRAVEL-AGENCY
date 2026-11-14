---
name: helptravel-editorial-quality
description: Kontrola jakości redakcyjnej treści SEO helptravel.pl — porównań kierunków, przewodników miesięcznych, hubów, FAQ, tytułów i opisów oraz dokumentów `content/seo/**` i szkiców silnika `content:run`. Pilnuje naturalnej polszczyzny, leadu odpowiadającego na intencję, faktów wyłącznie ze źródeł z dosłownym dowodem, braku lania wody, zmyślonych doświadczeń i fałszywej presji. Użyj ZAWSZE, gdy piszesz, poprawiasz, recenzujesz albo zatwierdzasz tekst na stronę, także gdy ktoś pyta „czy ten tekst jest gotowy”, „sprawdź treść”, „czy to brzmi jak AI”, „recenzja redakcyjna”, „zatwierdź dokument”, „dopisz zdanie o wizach / cenach / godzinach”.
---

# Jakość redakcyjna HelpTravel

Czytelnik helptravel.pl planuje wyjazd za własne pieniądze. Zdanie nieprawdziwe kosztuje go więcej niż zdanie brakujące. Dlatego ta strona woli powiedzieć mniej, ale z podstawą. Repozytorium jest publiczne, a każdy tekst trafia do Google jako deklaracja marki. Ten skill łączy automat, który wyłapuje błędy mechaniczne, z oceną redakcyjną, której automat nie zrobi.

## 1. Najpierw automat — on ma ostatnie słowo w sprawach mechanicznych

Bramka jakości jest w `src/lib/content-quality/gate.ts`, a schemat dokumentu w `src/lib/content-engine/schema.ts`. Uruchom ją, zanim cokolwiek ocenisz:

- dokumenty w repo: `pnpm content:check` (sprawdza bramkę na dacie weryfikacji i wymaga statusu `approved`);
- świeżość faktów: `pnpm content:freshness` (twierdzenie po terminie ważności = błąd);
- pełny zestaw: `pnpm test:seo` (w tym 36 przypadków bramki, pozytywnych i negatywnych);
- weryfikacja dowodów u źródła: `pnpm content:verify -- --snapshots <katalog>` (tylko dozwolone hosty z `src/lib/content-engine/sources.ts`).

Wynik bramki to jeden ze statusów i niczego tu nie zaokrąglasz w górę:

| Status | Znaczenie | Co dalej |
|---|---|---|
| `PASS` | reguły mechaniczne spełnione | ocena redakcyjna (pkt 2) i akceptacja człowieka przez merge |
| `NEEDS_REVISION` | styl, długość, powtórzenia, frazesy, data | popraw tekst, uruchom ponownie |
| `BLOCKED_FACTS` | liczba bez twierdzenia, twierdzenie bez dowodu, dowód nie zawiera liczby, fakt przeterminowany | usuń zdanie albo dodaj źródło z dosłownym dowodem |
| `REVIEW_REQUIRED` | temat `HIGH_RISK` albo tryb wymagający człowieka | nigdy nie zatwierdzaj automatycznie |
| `SKIPPED_QUALITY_GATE` | bramka nie zadziałała | traktuj jak brak zgody na publikację |

Nie przepisuj reguł bramki w głowie — jeśli czegoś nie łapie, a powinna, dopisz przypadek do `src/lib/content-quality/gate.test.ts`.

## 2. Potem ocena redakcyjna — rzeczy, których automat nie oceni

**Lead odpowiada na pytanie z wyszukiwarki w pierwszych dwóch zdaniach.** Ktoś wpisał „Ateny czy Rzym”, więc pierwsze zdanie mówi, komu co wybrać i dlaczego, a nie „Oba miasta mają wiele do zaoferowania”. Wstęp, który pasowałby do dowolnej pary miast, to wypełniacz. Test: podmień nazwy miast. Jeśli tekst dalej „działa”, trzeba go przepisać.

**Każda liczba, data, godzina i cena ma twierdzenie (`factClaims`) z dosłownym cytatem ze źródła.** Dowód (`observedEvidence`) musi zawierać tę samą liczbę. „Muzea otwarte 9–18” bez źródła to `BLOCKED_FACTS`, nawet jeśli brzmi rozsądnie. Godziny otwarcia żyją 90 dni, a ceny 2 dni (`FRESHNESS_TTL_DAYS`), więc nie wpisuj ich do treści stałych.

**Cen nie wymyślamy i nie kopiujemy z pamięci.** Kwota może się pojawić tylko z własnego inwentarza z datą pomiaru. Nie podawaj ceny biletu lotniczego, wycieczki ani „od 199 zł” bez takiego źródła. Szablony mają do tego bramkę `canShowBudgetEstimate`.

**Tematy `HIGH_RISK` zawsze idą do człowieka.** Należą do nich wizy i warunki wjazdu, bezpieczeństwo i ostrzeżenia MSZ, zdrowie i szczepienia, prawa pasażera, ceny oraz ubezpieczenia. Taki tekst wymaga oficjalnego źródła (gov.pl, MSZ, urząd kraju docelowego) z datą i podpisu człowieka. Prośbę „zatwierdź automatycznie” odrzucasz z wyjaśnieniem, nawet gdy zdanie wygląda na prawdziwe. Przepisy wjazdowe zmieniają się bez zapowiedzi, a błąd może kogoś zatrzymać na lotnisku. Z tego samego powodu nie potwierdzaj takiego faktu z pamięci („to prawda, MSZ tak podaje”), nawet gdy jesteś pewien. Albo pokazujesz cytat ze źródła pobranego teraz, z datą, albo piszesz wprost, że fakt nie został sprawdzony. W raporcie dodaj jedno zdanie o tym, co grozi czytelnikowi, gdy informacja okaże się nieaktualna. Człowiek, który zatwierdza, ma widzieć stawkę, a nie tylko nazwę kategorii.

**Nie zmyślamy doświadczeń ani opinii.** Odpadają „byliśmy tam w zeszłym roku”, „nasz redaktor spędził tydzień”, „turyści zachwycają się” i oceny gwiazdkowe bez źródła. HelpTravel nie ma reporterów w terenie, więc tekst mówi z perspektywy „sprawdziliśmy w źródłach”, a nie „widzieliśmy”.

**Bez fałszywej presji.** Odpadają „ostatnie wolne miejsca”, „tylko dziś”, „ceny zaraz wzrosną” i „okazja” bez ceny z 30 dni (UOKiK). Perswazja wolno tylko z realnych danych, na przykład: „w styczniu średnio 8 godzin słońca dziennie (AEMET)”.

**Polszczyzna, nie kalka i nie frazes.** Zachowuj diakrytyki i zgodę gramatyczną. Generator porównań stawia nazwę po dwukropku („Taniej zwykle: Walencja”), żeby uniknąć błędów typu „lepszy jest Ateny”. Wytnij frazy-wypełniacze: „warto zauważyć”, „nie da się ukryć”, „w dzisiejszych czasach”, „kluczowe jest”, „podsumowując”, „idealny wybór dla każdego”, „niezapomniane wrażenia”, „raj na ziemi”, „perła”, „magiczny klimat”. Superlatyw zostaje tylko z miarą („najstarszy wpis UNESCO w zestawieniu: 1987”).

**Wartość, której nie ma gdzie indziej.** Strona ma dawać kryterium decyzji, tabelę faktów ze źródłami, datowane zestawienie albo plan dni, a nie streszczenie Wikipedii. Jeśli nie umiesz wskazać, czego czytelnik dowie się tylko tutaj, treść nie jest gotowa.

**Daty i znaczniki czasu.** `dateModified` zmienia się tylko przy zmianie merytorycznej (`materiallyModifiedAt`), nie przy przecinku. Nie pisz „w 2026 roku” w tekście stałym, bo zestarzeje się w styczniu.

**CTA prowadzi do istniejącej trasy i jest jedno główne.** Bramka sprawdza trasy w inwentarzu. Ty sprawdzasz, czy CTA wynika z treści, na przykład „Sprawdź hotele w Atenach” pod werdyktem dla Aten.

## 3. Format raportu

Odpowiadaj zawsze w tym układzie, żeby autor wiedział, co jest blokujące:

```
Werdykt: <PASS | NEEDS_REVISION | BLOCKED_FACTS | REVIEW_REQUIRED | SKIPPED_QUALITY_GATE>
Automat: <wynik bramki albo „nie uruchomiono — powód”>

Blokujące:
- „<cytat>” — <dlaczego> → <konkretna poprawka albo „usuń”>
Do poprawy:
- …
Drobne:
- …
Fakty do weryfikacji (źródło, dowód, termin ważności):
- …
Decyzja publikacji: <kto zatwierdza i czym — np. „człowiek, `content:verify --approve <id> --by …`”>
```

Proponując poprawkę, nie dopisuj nowych faktów bez źródła. Lepsza krótsza wersja z tym, co jest udokumentowane.

## 4. Przykłady

**Przed:** „Lizbona to prawdziwa perła Europy, którą warto odwiedzić o każdej porze roku. Byliśmy tam wiosną i zakochaliśmy się w tramwajach. Bilety lotnicze już od 199 zł — ostatnie wolne miejsca!”

**Ocena:** `BLOCKED_FACTS`. „Perła Europy” i „o każdej porze roku” to frazesy bez informacji. „Byliśmy tam” to zmyślone doświadczenie. „Od 199 zł” to cena bez pomiaru z inwentarza. „Ostatnie wolne miejsca” to fałszywa presja.

**Po:** „Lizbonę wybierz, jeśli chcesz zwiedzać pieszo strome dzielnice i mieć ocean w zasięgu tramwaju. [Twierdzenie o linii 28 tylko ze źródłem przewoźnika Carris z dosłownym cytatem.]”

**Przed:** „Polacy nie potrzebują wizy do Maroka.” + prośba o automatyczną publikację.

**Ocena:** `REVIEW_REQUIRED`. To temat `HIGH_RISK` (`entry_requirements`, ważność 30 dni). Potrzebne jest źródło gov.pl/MSZ z datą odczytu i zgoda człowieka. Bez nich zdanie nie trafia na stronę.

## 5. Gdzie szukać szczegółów

- `docs/seo/EDITORIAL_POLICY.md` — źródła, klasy ryzyka, ujawnienie AI, korekty;
- `docs/seo/EDITORIAL_QUALITY_STANDARD.md` — reguły bramki, przypadki testowe, odsetek fałszywych alarmów;
- `src/lib/content-engine/source-registry.ts` — zarejestrowane źródła per kierunek;
- `docs/seo/AUTOMATION_RUNBOOK.md` — jak silnik tworzy szkice i kto je zatwierdza.
