# Etap 4 — silnik treści „najpierw dowód”: wyniki

Zasady są w `EDITORIAL_POLICY.md`, a reguły bramki w `EDITORIAL_QUALITY_STANDARD.md`.

## Jak to działa

1. Każdy fakt jest osobnym twierdzeniem (`factClaims`) z adresem źródła, dosłownym cytatem (`observedEvidence`), datą odczytu i klasą danych.
2. Weryfikacja jest mechaniczna: cytat musi wystąpić w treści źródła, a liczby z twierdzenia muszą wystąpić w cytacie.
3. Sekcja tekstu wskazuje twierdzenia, na których stoi. Sekcja bez twierdzeń nie przechodzi bramki.
4. Na stronę trafia tylko dokument zatwierdzony przez człowieka. Jeśli którekolwiek twierdzenie jest niezweryfikowane albo przeterminowane, strona wraca w całości do wersji bez dokumentu.

## Co powstało

| Element | Gdzie |
|---|---|
| Schemat dokumentu, klasy danych i terminy ważności | `src/lib/content-engine/schema.ts` |
| Porównywanie liczb (zapis polski i angielski) | `src/lib/content-engine/numbers.ts` |
| Lista dozwolonych źródeł i bezpieczne pobieranie | `src/lib/content-engine/sources.ts` |
| Rejestr źródeł per kierunek | `src/lib/content-engine/source-registry.ts` |
| Bramka jakości: 38 reguł, 43 testy | `src/lib/content-quality/gate.ts` |
| Weryfikacja i zatwierdzanie dokumentów | `scripts/content-engine/verify-docs.ts` (`content:verify`, `content:check`, `content:freshness`) |
| Podłączenie do stron | `src/lib/content-engine/site-content.ts` |
| Cztery dokumenty treści | `content/seo/comparisons/*.json` |

## Cztery dokumenty

| Porównanie | Twierdzenia | Słowa | Klasa | Bramka |
|---|---|---|---|---|
| Ateny–Rzym | 7/7 | 551 | `EVERGREEN` | `PASS` |
| Barcelona–Walencja | 14/14 | 391 | `EVERGREEN` | `PASS` |
| Malaga–Walencja | 16/16 | 461 | `EVERGREEN` | `PASS` |
| Funchal–Santa Cruz de Tenerife | 11/11 | 522 | `DYNAMIC` (godziny otwarcia) | `REVIEW_REQUIRED` |

Razem 48 twierdzeń, każde z cytatem potwierdzonym w migawce źródła z 13.11.2026. Źródła to oficjalne portale turystyczne i lista UNESCO.

## Ograniczenia

- Dokumenty napisała redakcja wspierana przez AI w tej misji. Czekają na akceptację właściciela przez scalenie PR.
- Renderowany jest dziś tylko typ `comparison_enrichment`. Schemat przewiduje też wzbogacenie stron miesięcy, hubów i artykuły, ale nie są one podłączone do stron.
- Część źródeł blokuje zapytania automatyczne, więc odświeżenie faktów wymaga ręcznego zapisania strony źródła.
- Terminy ważności są rozsądnym założeniem, a nie normą. Można je zmienić w jednym miejscu.
