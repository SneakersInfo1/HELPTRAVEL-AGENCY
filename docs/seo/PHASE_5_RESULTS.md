# Etap 5 — dzienny potok treści: wyniki

Obsługę opisuje `AUTOMATION_RUNBOOK.md`.

## Co powstało

| Element | Gdzie |
|---|---|
| Potok: zbieranie danych, wybór zadania, fakty, szkic, bramka, decyzja | `src/lib/content-engine/pipeline.ts` |
| Rejestr: idempotencja, blokada, oczekujące propozycje, nieudane przebiegi | `src/lib/content-engine/ledger.ts` |
| Budżet z rezerwacją najgorszego przypadku | `src/lib/content-engine/budget.ts` |
| Klient modelu (oficjalny SDK) i model testowy | `anthropic-llm.ts`, `llm.ts`, `models.ts` |
| Magazyn dokumentów z zapisem atomowym i wycofaniem | `src/lib/content-engine/store.ts` |
| Uruchomienie z wiersza poleceń | `scripts/content-engine/run.ts` (`pnpm content:run`) |
| Harmonogram | `.github/workflows/seo-content-daily.yml` |
| Kontrola treści w PR | `.github/workflows/seo-content-check.yml` |

Potok zbudował Codex według specyfikacji. Kod został potem zweryfikowany i poprawiony (między innymi bajty NUL w wyrażeniach regularnych, rezerwacja budżetu, rejestr oczekujących propozycji i redakcja raportu).

## Wymagania misji i ich spełnienie

| Wymaganie | Stan | Dowód |
|---|---|---|
| Domyślnie szkic i PR, nigdy `main` | spełnione | Workflow otwiera PR. Harmonogram wymaga zmiennej `SEO_ENGINE_SCHEDULE_ENABLED`. |
| Idempotencja | spełnione | Drugi przebieg tego samego dnia: `DUPLICATE_SKIPPED`, 0 wywołań modelu |
| Blokada równoległych przebiegów | spełnione | Blokada w rejestrze i `concurrency` w workflow |
| Wyłącznik awaryjny | spełnione | `SEO_ENGINE_KILL_SWITCH=1` daje `KILLED` przed pierwszym wywołaniem |
| Budżet | spełnione | Limity kosztu, żądań, tokenów i czasu. Koszt liczony także przy błędzie. |
| Przebieg próbny bez klucza | spełnione | Trzy scenariusze offline na modelu testowym |
| Podwójne uruchomienie nie publikuje dwa razy | spełnione | Rejestr oczekujących propozycji (14 dni) i kontrola istniejącej gałęzi PR |
| Sekrety poza repo i logami | spełnione | Klucz tylko ze zmiennej środowiskowej. Raport publiczny redagowany. |
| Robot nie dotyka wyszukiwarki, rezerwacji i dostawców | spełnione | Twarda blokada hostów i tras w `sources.ts` |

## Trzy scenariusze demonstracyjne

| Scenariusz | Bramka | Wynik |
|---|---|---|
| Odświeżenie istniejącej strony | `REVIEW_REQUIRED` | `REVIEW_REQUIRED` |
| Nowa treść stała | `PASS` | `REVIEW_REQUIRED` (tryb próbny nie publikuje) |
| Szkic z niepotwierdzonym faktem | `BLOCKED_FACTS` | `REJECTED` |

Dodatkowo sprawdzono: tryb roboczy zapisuje dokument, a dzień później pomija ten sam temat jako oczekujący. 26 testów integracyjnych pokrywa te ścieżki.

## Czego nie zrobiono

- **Żadnego przebiegu na prawdziwym modelu.** Nie ma klucza API, a misja zabrania wydatków bez zgody. Ścieżka `AnthropicLlm` ma stan `INSTALLED_NOT_TESTED`.
- **Żadnej publikacji przez automat.** Cztery dokumenty w repo powstały w tej misji ręcznie, z tą samą weryfikacją źródeł.
- **Harmonogram nie jest włączony.** Kroki uruchomienia są w runbooku, pkt 3.
- Workflow nie uruchomił się jeszcze ani razu na GitHubie, bo plik musi najpierw trafić na gałąź domyślną. Składnia YAML została sprawdzona lokalnie.
