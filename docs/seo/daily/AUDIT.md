# Audyt: silnik treści SEO bez płatnego API modelu (17.11.2026)

Cel: praca SEO w sesji Claude Code uruchamianej ręcznie (abonament), bez harmonogramu i bez wywołań Anthropic API z kodu. Audyt obejmuje silnik `src/lib/content-engine`, bramkę `src/lib/content-quality`, analizę GSC `src/lib/seo-ops`, skrypty i workflow.

## Działa bez zmian (bez modelu)

| Element | Gdzie | Rola w sesji |
|---|---|---|
| Wybór tematów i ranking możliwości | `pipeline.ts` (`collect`, `select`), `seo-ops/gsc/analysis.ts` (`rankOpportunities`) | `seo:daily plan`, `prepare` |
| Rejestr źródeł i lista dozwolonych domen | `source-registry.ts`, `sources.ts` (`SOURCE_ALLOWLIST`) | źródła w zleceniu, kontrola domen |
| Mechaniczna weryfikacja cytatów | `pipeline.ts` (`verifyCandidateClaims`: dosłowny cytat, liczby w cytacie, domena) | `seo:daily verify-claims` |
| Budowa dokumentu i bramka jakości | `buildDocument`, `verify`, `content-quality/gate.ts` | `seo:daily finalize` |
| Schematy dokumentów JSON | `schema.ts`, `content/seo/**` | bez zmian |
| Rejestr zadań (duplikaty, oczekujące, blokady) | `ledger.ts` | `prepare`, `finalize`, `publish` |
| Magazyn treści i kill switch | `store.ts` | bez zmian |
| Kontrola dokumentów | `pnpm content:verify`, `pnpm content:check` | testy sesji i CI |
| Testy SEO, smoke, Playwright, CI „SEO content check” | `src/lib/seo/*.test.ts`, `scripts/seo/smoke.ts`, `e2e/seo-templates.spec.ts` | krok 6 procedury |

## Wymagało dostosowania

| Element | Było | Jest |
|---|---|---|
| Research i redakcja | `AnthropicLlm` przez płatne API (`SEO_ENGINE_ANTHROPIC_API_KEY`) | sesja Claude Code czyta `work-order.json` i źródła, pisze `candidates.json` i `draft-body.json`; te same instrukcje (`researcherInstructions`, `writerInstructions`) i te same mechaniczne kontrole |
| Uruchamianie | harmonogram GitHub Actions (cron 04:17 UTC) | ręcznie: `/seo-daily`; workflow bez `schedule` i bez klucza, tylko scenariusz offline |
| Dane GSC | API (konto usługi) albo `data/gsc` | eksport CSV z interfejsu GSC (ZIP lub folder, PL/EN, tryb porównania) z oceną świeżości danych; API zostaje opcją |
| Pamięć między przebiegami | tylko rejestr zadań | plus kolejka tematów i dziennik w gałęzi stanu (`daily/`), synchronizacja ze stanem PR |
| Wybór zadań | ranking GSC | plan łączący świeżość faktów, popyt GSC (waga wieku danych i dostępności źródeł) i kolejkę; wybór celu `prepare --target` |
| PR | `gh pr create` w workflow, tylko `content/seo` | `seo:daily publish`: PR przez REST; kod tylko z `--with-code`/`--code-only`; kontrola całej gałęzi względem bazy (pliki chronione, zmiany indeksowania) |
| Tryb na żywo `pnpm content:run` | klucz w środowisku wystarczał | wymaga klucza i jawnej flagi `--allow-paid-api` (wyłączona alternatywa) |

## Zabezpieczenia przed płatnym API (sprawdzane testami)

- `seo:daily`: blokada żądań do hostów modeli (Anthropic, OpenRouter, OpenAI, Google AI, Bedrock, Azure OpenAI, host z `ANTHROPIC_BASE_URL`) i błąd przy kluczu silnika w środowisku — `session/guard.test.ts`, `session/no-paid-api.test.ts`.
- Graf importów `seo:daily` nie zawiera klienta Anthropic ani SDK — `session/import-graph.test.ts`.
- Żaden workflow nie dostaje klucza API modelu, workflow treści SEO nie mają harmonogramu — `session/no-paid-api.test.ts`.
- `content:run` bez `--allow-paid-api` odmawia trybu na żywo nawet z kluczem — `session/no-paid-api.test.ts`.

## Ograniczenia

- Renderowany typ dokumentu to dziś tylko wzbogacenie porównań (`comparison_enrichment`). Dokumenty „artykuł” i wzbogacenia miesięcy/hubów wymagają szablonów (zadanie techniczne w kolejce, decyzja właściciela przy nowych trasach).
- Blokada `.claude/settings.json` dotyczy poleceń sesji Claude, nie skryptów. Twardą granicą jest ochrona gałęzi `main` na GitHubie.
