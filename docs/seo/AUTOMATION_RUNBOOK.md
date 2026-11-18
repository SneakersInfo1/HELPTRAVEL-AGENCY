# Runbook: dzienny automat treści

Automat raz dziennie wybiera jeden temat (odświeżenie istniejącej strony albo nową treść), zbiera fakty z dozwolonych źródeł, pisze szkic, sprawdza go bramką jakości i otwiera PR z propozycją. Niczego nie publikuje sam. Na `main` treść trafia wyłącznie przez scalenie PR przez człowieka.

**Stan domyślny: wyłączony.** Samo scalenie kodu niczego nie uruchamia.

## 1. Etapy przebiegu

| Etap | Co robi | Czy woła model |
|---|---|---|
| `collect` | Czyta dane GSC i inwentarz stron | nie |
| `select` | Wybiera jedno zadanie według rankingu szans i pomija tematy z otwartą propozycją (14 dni) | nie |
| `research` | Pobiera zarejestrowane źródła i buduje twierdzenia z dosłownym cytatem | tak |
| `draft` | Pisze tekst wyłącznie z potwierdzonych twierdzeń | tak |
| `verify` | Uruchamia bramkę jakości i podejmuje decyzję publikacji | nie |

Kod: `src/lib/content-engine/pipeline.ts`. Uruchomienie: `scripts/content-engine/run.ts` (`pnpm content:run`). Harmonogram: `.github/workflows/seo-content-daily.yml`, codziennie o 04:17 UTC.

## 2. Tryby

| Tryb | Co zapisuje | Kiedy używać |
|---|---|---|
| `dry-run` (domyślny) | Nic. Powstaje tylko raport. | Pierwsze uruchomienia i diagnoza |
| `draft-and-pr` | Dokument ze statusem `in_review` i PR | Praca codzienna |
| `auto-evergreen` | Jak wyżej, ale dokument z wynikiem `PASS` i klasą `EVERGREEN` dostaje status `approved` bez człowieka. PR nadal scala człowiek. | Dopiero po serii poprawnych szkiców. Niezalecane na start. |

Treści klasy `DYNAMIC` i `HIGH_RISK` wymagają człowieka w każdym trybie.

## 3. Uruchomienie krok po kroku

Kroki 1–3 wykonuje właściciel, bo wymagają kont i kluczy. Polecenia `gh` działają z katalogu repozytorium. Każde zapyta o wartość, więc klucz nie trafia do historii poleceń.

**Krok 1. Klucz API modelu.** Załóż w konsoli Anthropic osobny klucz dla tego automatu, najlepiej z miesięcznym limitem wydatków. Zapisz go jako sekret:

```bash
gh secret set SEO_ENGINE_ANTHROPIC_API_KEY
```

**Krok 2. Źródło danych Search Console.** Repozytorium jest publiczne, więc eksportu GSC nie wolno do niego commitować. Automat pobiera dane przez API i trzyma je tylko w pamięci przebiegu.

1. W Google Cloud utwórz projekt, włącz „Google Search Console API” i utwórz konto usługi z kluczem JSON.
2. W Search Console (Ustawienia → Użytkownicy i uprawnienia) dodaj adres e-mail konta usługi z uprawnieniem ograniczonym. Automat tylko czyta.
3. Zapisz klucz i adres usługi:

```bash
gh secret set SEO_GSC_SERVICE_ACCOUNT_JSON < klucz-konta-uslugi.json
```

```bash
gh variable set SEO_GSC_SITE_URL --body "sc-domain:helptravel.pl"
```

Po zapisaniu sekretu usuń plik klucza z dysku.

**Krok 3. Przebieg próbny.** Uruchom ręcznie w trybie `dry-run` i obejrzyj raport w artefaktach przebiegu:

```bash
gh workflow run seo-content-daily.yml -f mode=dry-run
```

```bash
gh run list --workflow seo-content-daily.yml --limit 3
```

Sprawdź w raporcie pola `outcome`, `gateReport` i `usage` (liczba żądań i koszt). Jeśli log zawiera wiersz `BLOCKED`, brakuje klucza albo źródła GSC i przebieg poszedł na danych testowych.

**Krok 4. Pierwsza propozycja.** Uruchom ręcznie w trybie roboczym:

```bash
gh workflow run seo-content-daily.yml -f mode=draft-and-pr
```

Powstanie PR „Treść SEO: … (data)”. Przejrzyj go według punktu 4.

**Krok 5. Włączenie harmonogramu.** Dopiero gdy kilka ręcznych przebiegów dało sensowne propozycje:

```bash
gh variable set SEO_ENGINE_MODE --body "draft-and-pr"
```

```bash
gh variable set SEO_ENGINE_SCHEDULE_ENABLED --body "true"
```

Od tej chwili automat działa codziennie o 04:17 UTC.

### Alternatywa: uruchomienie lokalne

Bez GitHub Actions automat działa tak samo z komputera. Dane GSC mogą wtedy pochodzić z prywatnego katalogu z plikami `pages.csv`, `queries.csv` i `daily.csv`. Klucz ustaw w zmiennej środowiskowej `SEO_ENGINE_ANTHROPIC_API_KEY` tylko na czas sesji terminala.

```bash
pnpm content:run -- --mode draft-and-pr --gsc-dir seo-private/gsc/aktualny --state-dir .seo-engine-state --store-dir content/seo
```

Dokument trafi do `content/seo/`. Gałąź i PR tworzysz wtedy ręcznie.

## 4. Przegląd propozycji

1. Przeczytaj tekst w PR. Pomaga w tym skill `helptravel-editorial-quality`.
2. Otwórz kilka źródeł i porównaj cytaty.
3. Sprawdź wynik bramki w opisie PR.
4. Zatwierdź na gałęzi PR i wypchnij zmianę:

```bash
pnpm content:verify -- --approve <id-dokumentu> --by "Imię Nazwisko" --write
```

5. Scal PR. Kontrola „SEO content check” nie przepuści dokumentu ze statusem innym niż `approved`.

Odrzucenie: zamknij PR. Ten sam temat nie wróci przez 14 dni.

## 5. Limity i koszty

| Limit | Zmienna | Domyślnie |
|---|---|---|
| Koszt jednego przebiegu | `SEO_ENGINE_MAX_USD_PER_RUN` | 1,50 USD |
| Liczba żądań do modelu | `SEO_ENGINE_MAX_REQUESTS_PER_RUN` | 24 |
| Tokeny wyjściowe | `SEO_ENGINE_MAX_OUTPUT_TOKENS_PER_RUN` | 60 000 |
| Czas przebiegu | `SEO_ENGINE_MAX_RUNTIME_SECONDS` | 900 s |

Przed każdym wywołaniem automat rezerwuje najgorszy przypadek (pełny limit tokenów odpowiedzi po cenie danego modelu). Jeśli rezerwacja przekroczyłaby budżet, przebieg kończy się bez wywołania. Koszt jest liczony z rzeczywistego zużycia tokenów, także przy błędzie.

Workflow przekazuje dziś dwie pierwsze zmienne. Pozostałe mają wartości domyślne z kodu.

| Rola | Model | Cena wejścia / wyjścia za milion tokenów |
|---|---|---|
| Zbieranie faktów (`researcher`), pisanie (`writer`) | `claude-opus-5-5` | 4 / 20 USD |
| Role pomocnicze (`selector`, `verifier_assist`) | `claude-haiku-5-5` | 0,50 / 2,50 USD |

Model wołają dziś tylko dwa etapy: zbieranie faktów i pisanie. Wybór tematu i bramka są deterministyczne, a role pomocnicze są skonfigurowane na przyszłość. Model dla roli można zmienić zmienną `SEO_ENGINE_MODEL_<ROLA>` (workflow jej dziś nie przekazuje).

Ceny są zapisane w `src/lib/content-engine/models.ts` (stan na 03.11.2026). Przed włączeniem sprawdź aktualny cennik. Model nieznany w tabeli jest liczony po najwyższej cenie.

**Koszt miesięczny.** Twardy sufit to 30 przebiegów × 1,50 USD = 45 USD. Rzeczywisty koszt powinien być kilkukrotnie niższy, ale to szacunek: automat nie został jeszcze uruchomiony na prawdziwym modelu. Pierwsze przebiegi próbne pokażą faktyczne zużycie w polu `usage`.

W tej misji automat działał tylko na modelu testowym. Koszt wyniósł 0 USD.

## 6. Zatrzymanie

| Potrzeba | Jak |
|---|---|
| Natychmiast zatrzymać przebiegi | `gh variable set SEO_ENGINE_KILL_SWITCH --body "1"`. Przebieg kończy się wynikiem `KILLED` przed pierwszym wywołaniem modelu. |
| Wyłączyć harmonogram | `gh variable set SEO_ENGINE_SCHEDULE_ENABLED --body "false"` |
| Wycofać opublikowany tekst | Usuń plik dokumentu z `content/seo/` przez PR. Strona wróci do wersji bez wzbogacenia. |
| Odciąć dostęp | Unieważnij klucz w konsoli Anthropic i usuń konto usługi z Search Console. |

## 7. Wyniki przebiegu

| `outcome` | Znaczenie | Co zrobić |
|---|---|---|
| `DRAFT_CREATED` | Powstał szkic i PR | Przegląd według punktu 4 |
| `REVIEW_REQUIRED` | Wynik wymaga człowieka. W trybie próbnym nic nie zapisano. | Przeczytać raport |
| `PUBLISHED_AUTOMATION` | Tryb `auto-evergreen` zatwierdził dokument | Scalić PR po rzucie oka |
| `REJECTED` | Bramka odrzuciła szkic | Nic. Powód jest w raporcie. |
| `SKIPPED_QUALITY_GATE` | Brak zweryfikowanego materiału | Nic. Automat nie musi niczego wydać. |
| `DUPLICATE_SKIPPED` | Ten dzień był już obsłużony | Nic |
| `KILLED` | Zadziałał wyłącznik | Sprawdzić, kto go włączył |
| `FAILED` | Błąd przebiegu. Zadanie kończy się na czerwono. | Punkt 8 |

## 8. Stan i awarie

Stan żyje na gałęzi `seo-engine-state`, w katalogu `.seo-engine-state/`:

| Katalog | Zawartość | Kiedy ruszać ręcznie |
|---|---|---|
| `idempotency/` | Klucz na dzień i klasę trybu (próbny albo publikujący) | Przebieg próbny nie blokuje właściwego. Nieudany przebieg można ponowić bez sprzątania. |
| `locks/` | Blokada przebiegu z czasem wygaśnięcia | Wygasa sama. Usuń tylko po przerwanym zadaniu, gdy blokuje kolejne. |
| `pending/` | Tematy z otwartą propozycją (14 dni) | `pnpm content:run -- --release-pending <runId>` zwalnia tematy danego przebiegu. Workflow robi to sam, gdy nie uda się utworzyć PR. |
| `dead-letter/` | Zapis nieudanych przebiegów | Tylko do diagnozy |

Gałąź stanu nie zawiera danych GSC ani treści raportów.

Typowe awarie:

- **Źródło odpowiada blokadą albo zmieniło treść.** Twierdzenie odpada, a przebieg zwykle kończy się `SKIPPED_QUALITY_GATE` albo `REJECTED`. Zabezpieczeń nie obchodzimy. Jeżeli źródło jest ważne, człowiek weryfikuje je ręcznie (`content:verify --snapshots`).
- **Błąd modelu** (przeciążenie, odmowa, ucięta odpowiedź). Błędy przejściowe są ponawiane. Po wyczerpaniu prób wynik to `FAILED`, a następny dzień startuje normalnie.
- **Przekroczony budżet.** Przebieg kończy się bez publikacji. Limit podnosi się zmienną, świadomie.
- **Błąd API Search Console** (kod `BLOCKED_AUTH`). Konto usługi straciło dostęp albo API jest wyłączone w projekcie Google Cloud.

## 9. Bezpieczeństwo

- Sekrety trafiają tylko do kroku silnika i kroków wypychania, nigdy do instalacji zależności. Token gita nie zostaje w konfiguracji (`persist-credentials: false`).
- Artefakt przebiegu to raport bez danych GSC. Redakcję wykonuje kod (`redactRunReport`) i pilnuje jej test.
- Automat nie wywołuje wyszukiwarki, rezerwacji, lotów ani API dostawców. Hosty dostawców są zablokowane na sztywno.
- Automat nie ma uprawnień do wdrożeń i nie pisze na `main`.

## 10. Sprawdzenie bez klucza

Trzy scenariusze działają całkowicie offline na modelu testowym:

```bash
pnpm content:run -- --mode dry-run --scenario refresh --state-dir seo-private/engine-demo/state-refresh --store-dir content/seo
```

```bash
pnpm content:run -- --mode dry-run --scenario new-evergreen --state-dir seo-private/engine-demo/state-new-evergreen --store-dir content/seo
```

```bash
pnpm content:run -- --mode dry-run --scenario reject-unverified --state-dir seo-private/engine-demo/state-reject-unverified --store-dir content/seo
```

Wyniki z tej misji:

| Scenariusz | Bramka | Wynik |
|---|---|---|
| `refresh` | `REVIEW_REQUIRED` | `REVIEW_REQUIRED` |
| `new-evergreen` | `PASS` | `REVIEW_REQUIRED` (tryb próbny nie publikuje) |
| `reject-unverified` | `BLOCKED_FACTS` | `REJECTED` |
| Ten sam dzień drugi raz | — | `DUPLICATE_SKIPPED`, 0 wywołań modelu |
| `draft-and-pr`, a potem następny dzień | — | Dokument zapisany. Dzień później ten sam temat pominięty jako oczekujący. |
| Wyłącznik awaryjny | — | `KILLED` |

Te same zachowania sprawdza 26 testów integracyjnych (`src/lib/content-engine/pipeline.integration.test.ts`).

## 11. Czego automat jeszcze nie umie

- Nie był uruchomiony na prawdziwym modelu ani na prawdziwym API Search Console. Obie ścieżki mają testy na podstawionych odpowiedziach. Pierwsze uruchomienie musi być próbne.
- Na żywo automat wybiera tylko wzbogacenia porównań, bo tylko ten typ treści ma szablon. Nowe artykuły oraz wzbogacenia stron miesięcy i hubów są pomijane z jawnym powodem w raporcie, dopóki nie powstaną dla nich strony.
- Nie scala PR i nie wdraża.
