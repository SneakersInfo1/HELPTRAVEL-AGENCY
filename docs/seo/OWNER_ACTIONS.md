# Działania właściciela

Lista rzeczy, których nie da się dokończyć bez Ciebie: decyzje, konta, klucze. Wszystko inne jest zrobione albo opisane jako ograniczenie w `RESULTS.md`.

## Skrót

| # | Działanie | Kiedy | Czas |
|---|---|---|---|
| 1 | Przeczytać cztery teksty porównań | przed scaleniem PR | 20 min |
| 2 | Obejrzeć Preview na telefonie i przyjąć skalę zmian | przed scaleniem PR | 15 min |
| 3 | Zdecydować o liczbach GSC w publicznym repo | przed scaleniem PR | 2 min |
| 4 | Zarejestrować trzy wymiary w GA4 | po scaleniu | 5 min |
| 5 | (opcjonalnie) Dostęp tylko do odczytu do GA4; GSC wystarczy eksport CSV | gdy chcesz lejka w raportach | 5 min |
| 6 | Uruchomić raport po 28 dniach | 28 dni po wdrożeniu | 5 min |
| 7 | Zdecydować o planie indeksu stron miesięcy | bez pośpiechu | — |
| 8 | Zdecydować o dwóch drobnych sprawach technicznych | bez pośpiechu | — |
| 9–12 | Narzędzia (opcjonalne) | kiedykolwiek | — |
| 13 | Dzienna praca SEO: otworzyć projekt i wysłać `/seo-daily` | codziennie albo co 2 dni | 1 min |
| 14 | Odświeżyć godziny otwarcia w jednym dokumencie | przed 11.02.2027 | 10 min |
| 15 | Włączyć ochronę gałęzi `main` | przed włączeniem automatu | 5 min |
| 16 | Zdecydować o 158 stronach miesięcy bez danych (wariant gotowy, nieaktywny) | przed albo po scaleniu | 5 min |
| 17 | ~~Przycisk lotów bez kierunku~~ — zrobione 17.11.2026 | — | — |
| 18 | ~~Fonty w repozytorium~~ — zrobione 17.11.2026 | — | — |

## Przed scaleniem PR

### 1. Przeczytaj cztery teksty

Dokumenty mają status `approved` z dopiskiem „właściciel serwisu — akceptacja przez merge PR”. **Scalenie PR jest Twoją zgodą na publikację tych tekstów.**

| Strona | Plik |
|---|---|
| `/porownanie/athens-greece-vs-rome-italy` | `content/seo/comparisons/athens-greece-vs-rome-italy.json` |
| `/porownanie/barcelona-spain-vs-valencia-spain` | `content/seo/comparisons/barcelona-spain-vs-valencia-spain.json` |
| `/porownanie/malaga-spain-vs-valencia-spain` | `content/seo/comparisons/malaga-spain-vs-valencia-spain.json` |
| `/porownanie/funchal-portugal-vs-santa-cruz-de-tenerife-spain` | `content/seo/comparisons/funchal-portugal-vs-santa-cruz-de-tenerife-spain.json` |

Najwygodniej czytać je na Preview. Każdy fakt ma źródło na dole strony. Jeśli tekst Ci nie odpowiada, usuń jego plik. Strona zostanie wtedy na nowym szablonie, tylko bez tego tekstu.

### 2. Obejrzyj Preview na telefonie

Otwórz na telefonie trzy strony: porównanie Ateny–Rzym, „Barcelona w styczniu” i hub city break. Zdjęcia i blok statystyk hoteli sprawdziłem na Preview automatycznie (zrzuty i test dymny 263/263), ale ocena wyglądu na prawdziwym telefonie należy do Ciebie.

Scalenie zmienia H1 na 1592 stronach i tytuł na 338. Adresy, canonicale, mapa witryny i dyrektywy robots zostają bez zmian. Wycofanie to revert jednego PR. Szczegóły: `BASELINE.md`, pkt 4, oraz ryzyko R-01.

### 3. Liczby GSC w publicznym repozytorium: przeniesione poza repo (19.11.2026)

Liczby z Search Console (backlog 20 adresów, sumy i segmenty z `BASELINE.md`, wiersze z eksportu w testach) leżą teraz w `seo-private/`, poza repozytorium. W repo zostały wnioski bez liczb i syntetyczne dane testowe. Historia gita gałęzi PR nadal zawiera dawne wersje plików.

## Po scaleniu

### 4. Wymiary niestandardowe w GA4

W GA4 otwórz Administracja → Wyświetlanie danych → Definicje niestandardowe → Utwórz wymiar niestandardowy. Dodaj trzy wymiary o zakresie „Zdarzenie”:

| Nazwa wymiaru | Parametr zdarzenia |
|---|---|
| Content ID | `content_id` |
| Content version | `content_version` |
| Topic cluster | `topic_cluster` |

Parametry są wysyłane ze zdarzeniem `seo_cta_click`. GA4 zaczyna je pokazywać dopiero od chwili rejestracji, więc warto to zrobić w dniu wdrożenia.

### 5. Dostęp do danych

- **Search Console.** Nie jest potrzebne konto usługi: sesja `/seo-daily` czyta eksport CSV z interfejsu GSC zostawiony w folderze Pobrane (`docs/seo/daily/README.md`). Konto usługi zostaje opcją dla raportu z wymiarem strona × zapytanie.
- **GA4.** Wystarczy eksport stron wejścia z ruchu organicznego albo dostęp tylko do odczytu. Bez tego raport tygodniowy pokazuje `NOT_CONNECTED` i nie liczy lejka.

### 6. Raport po 28 dniach

Z eksportem CSV:

```bash
pnpm seo:weekly -- --gsc-dir seo-private/gsc/<data-eksportu>
```

Z kontem usługi (pełne okno 56 dni wymaga 112 dni danych):

```bash
pnpm seo:weekly -- --source api --days 112
```

Patrz przede wszystkim na CTR porównań w tych samych przedziałach pozycji i na kliknięcia CTA per dokument w GA4. Nie oczekuj dużej zmiany na stronach miesięcy.

## Decyzje SEO bez pośpiechu

### 7. Plan indeksu stron miesięcy

567 stron miesięcy bez indeksu nie ma żadnego linku wewnętrznego (47 kierunków w całości). Wcześniejsza analiza (Faza 2.1) proponowała podział 145 stron do utrzymania, 416 do scalenia i 478 do wyłączenia z indeksu. Ta misja niczego tu nie zmieniła, bo masowe zmiany indeksu wymagają Twojej decyzji. Nowy szablon działa na wszystkich stronach miesięcy niezależnie od tego, co postanowisz.

### 8. Dwie drobne sprawy techniczne

- `robots.txt` blokuje `/hotele/rezerwacja`, przez co Google nie widzi znacznika `noindex` tych stron. Do rozstrzygnięcia po danych z GSC.
- 184 tytuły (głównie przewodniki po kierunkach) przekraczają 60 znaków przez dopisek „ | HelpTravel”. Można skrócić szablon albo zostawić.

## Narzędzia (opcjonalne)

### 9. Klucz 21st.dev

Plugin jest zainstalowany, ale bez klucza nie działa. Jeśli chcesz z niego korzystać, załóż klucz w portalu 21st.dev i ustaw go jako zmienną środowiskową `API_KEY_21ST` w systemie. Nie wpisuj klucza do żadnego pliku w repo. Plan może być płatny.

### 10. Skille projektu

Nic nie trzeba robić. `helptravel-design-identity` i `helptravel-editorial-quality` są w `.claude/skills` projektu i działają od nowej sesji. Kopia z przypadkami testowymi jest w `docs/seo/skills/`.

### 11. Chrome DevTools MCP

Serwer jest wpisany lokalnie dla katalogu roboczego tej gałęzi i używa najnowszej wersji pakietu. Jeśli chcesz mieć go na stałe, dodaj go w głównym katalogu projektu z przypiętą wersją:

```bash
claude mcp add chrome-devtools --scope local -- npx -y chrome-devtools-mcp@1.13.0 --isolated --headless
```

### 12. Lighthouse w CI na Preview

Ochrona wdrożeń Vercela blokuje automaty. Żeby mierzyć Preview w CI, trzeba utworzyć w Vercelu sekret obejścia ochrony (Protection Bypass for Automation) i dodać go do sekretów repozytorium. Do tego czasu pomiar wykonuje się lokalnie poleceniem `pnpm lighthouse`.

## Dzienny automat

### 13. Dzienna praca SEO

Od 17.11.2026 nie ma automatu z harmonogramem ani płatnego API. Otwierasz projekt w Claude Code i wysyłasz `/seo-daily`; resztę robi sesja w ramach abonamentu. Instrukcja: `docs/seo/daily/README.md`. Dawny automat (`AUTOMATION_RUNBOOK.md`) zostaje jako wyłączona alternatywa.

Naturalne pierwsze zadania to porównania z kolejki w `OPPORTUNITY_BACKLOG.csv` (Budapeszt–Praga, Antalya–Palma, Barcelona–Malaga).

## Terminy

### 14. Godziny otwarcia: 11.02.2027

Dokument Funchal–Santa Cruz de Tenerife zawiera godziny otwarcia, które tracą ważność 11.02.2027. Po tej dacie kontrola `content:freshness` zgłosi błąd, a strona wróci do wersji bez tekstu. Wystarczy wtedy potwierdzić godziny u źródła i zweryfikować dokument ponownie albo usunąć z niego zdania o godzinach.

## Bezpieczeństwo repozytorium

### 15. Ochrona gałęzi `main`

Gałąź `main` nie ma dziś żadnej reguły ochrony. Workflow dziennego automatu działa z tokenem, który ma prawo zapisu do repozytorium. Skrypt wypycha tylko gałąź stanu i gałęzie propozycji, ale nic poza nim nie broni `main`.

Przed włączeniem automatu ustaw w GitHubie (Settings → Rules → Rulesets) regułę dla `main`: wymagany pull request, bez wyjątku dla GitHub Actions. Warto też oznaczyć kontrole `content-check` i `templates-e2e` jako wymagane.

## Decyzje po końcowej kontroli jakości

Szczegóły i liczby: `FINAL_QUALITY_AUDIT.md`.

### 16. 158 indeksowalnych stron miesięcy bez danych

Dla 25 kierunków (m.in. Kos, Zakynthos, Mykonos, Santorini, Tirana, Djerba, Bodrum) WMO nie ma jednoznacznie dopasowanej stacji. Ich strony miesięcy nie pokazują żadnej informacji o miesiącu, a 158 z nich jest w indeksie. W 92 dni zebrały śladowy ruch z GSC.

Zalecam wyłączenie ich z indeksu (`noindex, follow`, adresy zostają) do czasu znalezienia wiarygodnych danych.

**Wariant jest przygotowany i przetestowany, ale NIEAKTYWNY.** Indeks i sitemapa się nie zmieniają, dopóki go nie włączysz.

- Kod: `src/lib/mvp/month-index-policy.ts`, wariant `baseline-without-climate-gap`. Odejmuje od bazy 1039 stron dokładnie te 158, których kierunek nie ma normy WMO. Niczego nie dodaje.
- Podgląd bez włączania: `pnpm seo:index-variant` (podsumowanie 25 kierunków) albo `pnpm seo:index-variant -- --list` (wszystkie 158 adresów).
- Testy pilnują, że wariant to podzbiór bazy (881 stron) i że odejmuje dokładnie strony bez danych o miesiącu. Strażnik w testach blokuje przypadkowe włączenie.

Jak włączyć po Twojej zgodzie (osobny PR):

1. W `month-index-policy.ts` ustaw `ACTIVE_MONTH_INDEX_POLICY = "baseline-without-climate-gap"`.
2. Świadomie zaktualizuj testy, które wtedy padną: strażnika i test „dziś dokładnie bazę 1039” w `month-index-policy.test.ts` oraz trzy testy porównujące indeks z bazą w `month-index-baseline.test.ts`. Sprawdzone: po przełączeniu pada dokładnie pięć testów, a sitemapa ma 881 stron miesięcy.
3. Na Preview sprawdź, że strona bez danych (np. `/kierunki/kos-greece/lipiec`) ma `noindex, follow`, a sitemapa nie zawiera żadnego z 158 adresów.
4. Po wdrożeniu obserwuj w GSC, jak te adresy wypadają z indeksu. Cofnięcie to powrót stałej do `baseline-1039`.

Osobna sprawa: 1363 strony mają teraz dane WMO, ale są poza indeksem. Nie zalecam włączania ich przed oceną wyników po 28 dniach.

### 17. Przycisk „Szukaj lotów” — zrobione 17.11.2026

Przycisk na stronach miesięcy, porównaniach i przewodnikach otwiera zakładkę lotów na stronie głównej z wpisanym celem. Na stronie miesiąca wpisuje też termin, ten sam co przy hotelach. Wyszukiwania nie uruchamia, bo lotnisko wylotu wybiera użytkownik.

Cel i termin są we fragmencie adresu (`/?tab=loty#destination=…`), więc dla Google to nadal jeden adres `/?tab=loty`. Szczegóły: `src/lib/flights/prefill-link.ts`.

### 18. Fonty w repozytorium — zrobione 17.11.2026

Build nie pobiera już fontów z Google Fonts. Pliki leżą w `public/fonts/` i są bajt w bajt tymi samymi plikami, których używał dotąd `next/font/google`. Obok leżą licencje SIL OFL 1.1. Porównanie dwóch buildów dało 0 różnych pikseli na 10 zrzutach.

Opis, dowody i procedura odświeżenia: `docs/seo/FONTS.md`.
