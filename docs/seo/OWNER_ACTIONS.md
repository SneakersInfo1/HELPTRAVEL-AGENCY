# Działania właściciela

Lista rzeczy, których nie da się dokończyć bez Ciebie: decyzje, konta, klucze. Wszystko inne jest zrobione albo opisane jako ograniczenie w `RESULTS.md`.

## Skrót

| # | Działanie | Kiedy | Czas |
|---|---|---|---|
| 1 | Przeczytać cztery teksty porównań | przed scaleniem PR | 20 min |
| 2 | Obejrzeć Preview na telefonie i przyjąć skalę zmian | przed scaleniem PR | 15 min |
| 3 | Zdecydować o liczbach GSC w publicznym repo | przed scaleniem PR | 2 min |
| 4 | Zarejestrować trzy wymiary w GA4 | po scaleniu | 5 min |
| 5 | Dać automatowi dostęp do danych (GSC, GA4) | gdy chcesz raportów i automatu | 20 min |
| 6 | Uruchomić raport po 28 dniach | 28 dni po wdrożeniu | 5 min |
| 7 | Zdecydować o planie indeksu stron miesięcy | bez pośpiechu | — |
| 8 | Zdecydować o dwóch drobnych sprawach technicznych | bez pośpiechu | — |
| 9–12 | Narzędzia (opcjonalne) | kiedykolwiek | — |
| 13 | Włączyć dzienny automat | gdy zechcesz | 30 min |
| 14 | Odświeżyć godziny otwarcia w jednym dokumencie | przed 11.02.2027 | 10 min |
| 15 | Włączyć ochronę gałęzi `main` | przed włączeniem automatu | 5 min |
| 16 | Zdecydować o 158 stronach miesięcy bez danych | przed albo po scaleniu | 5 min |
| 17 | Zdecydować o przycisku lotów bez kierunku | bez pośpiechu | 2 min |

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

### 3. Liczby GSC w publicznym repozytorium

`BASELINE.md` i `OPPORTUNITY_BACKLOG.csv` zawierają zagregowane kliknięcia i wyświetlenia (cała usługa, segmenty, 20 adresów). Nie ma w nich zapytań. Jeśli nie chcesz ich publicznie, usuń te liczby przed scaleniem albo powiedz, a przeniosę je poza repo.

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

- **Search Console.** Konto usługi z uprawnieniem ograniczonym. Kroki są w `AUTOMATION_RUNBOOK.md`, pkt 3, krok 2. To odblokowuje raport z wymiarem strona × zapytanie i dzienny automat.
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

### 13. Włączenie

Pełna instrukcja jest w `AUTOMATION_RUNBOOK.md`, pkt 3. W skrócie:

1. Sekret `SEO_ENGINE_ANTHROPIC_API_KEY` (osobny klucz z limitem wydatków).
2. Sekret `SEO_GSC_SERVICE_ACCOUNT_JSON` i zmienna `SEO_GSC_SITE_URL`.
3. Ręczny przebieg próbny, potem ręczny przebieg w trybie roboczym i przegląd pierwszego PR.
4. Zmienne `SEO_ENGINE_MODE=draft-and-pr` i `SEO_ENGINE_SCHEDULE_ENABLED=true`.

Koszt: twardy limit 1,50 USD na przebieg, czyli najwyżej 45 USD miesięcznie przy pracy codziennej. Do tej pory automat nie wydał nic, bo działał tylko na modelu testowym.

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

Dla 25 kierunków (m.in. Kos, Zakynthos, Mykonos, Santorini, Tirana, Djerba, Bodrum) WMO nie ma jednoznacznie dopasowanej stacji. Ich strony miesięcy nie pokazują żadnej informacji o miesiącu, a 158 z nich jest w indeksie. W 92 dni zebrały 13 kliknięć i 1060 wyświetleń.

Zalecam wyłączenie ich z indeksu (`noindex, follow`, adresy zostają) do czasu znalezienia wiarygodnych danych. Niczego nie zmieniłem. Po Twojej zgodzie to zmiana w jednym pliku (`src/lib/mvp/month-index-policy.ts`) z testem.

Osobna sprawa: 1363 strony mają teraz dane WMO, ale są poza indeksem. Nie zalecam włączania ich przed oceną wyników po 28 dniach.

### 17. Przycisk „Szukaj lotów”

Prowadzi do `/?tab=loty`, czyli na stronę główną bez kierunku i terminu. Żeby przekazywał kierunek, formularz lotów na stronie głównej musi przyjmować go z adresu. To zmiana w komponentach strony głównej, więc potrzebuję Twojej zgody.
