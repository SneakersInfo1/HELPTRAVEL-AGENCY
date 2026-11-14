# Przekazanie

Stan na 14.11.2026. Dla osoby albo sesji, która przejmuje pracę.

## Gdzie jesteśmy

- Gałąź `claude/helptravel-seo-modernizacja-6f1b7c`, szkic PR [#154](https://github.com/SneakersInfo1/HELPTRAVEL-AGENCY/pull/154), baza `main` `06cf1aa`.
- Wszystkie etapy misji są zamknięte w kodzie i dokumentach. Wyniki: `RESULTS.md`.
- Otwarte są tylko działania właściciela (`OWNER_ACTIONS.md`) i kontrola Preview.

## Jak sprawdzić, że wszystko działa

```bash
pnpm install
```

```bash
pnpm test
```

```bash
pnpm build
```

```bash
pnpm start
```

```bash
pnpm seo:smoke -- --base http://localhost:3000
```

```bash
pnpm exec playwright test e2e/seo-templates.spec.ts
```

Oczekiwane: testy 1672 + 155, test dymny 263/263, Playwright 13/13.

## Pułapki, które już kosztowały czas

- **Git Bash zamienia argumenty zaczynające się od `/` na ścieżki Windows.** Skrypty `seo:*` przyjmują ścieżki bez początkowego ukośnika. Nie ustawiaj `MSYS_NO_PATHCONV=1` razem z pnpm, bo psuje jego nakładkę.
- **`pnpm <skrypt> -- --opcja` przekazuje `--` do skryptu.** Wszystkie skrypty to znoszą, `content:run` od commita `afa4f59`.
- **Build lokalny nie ma kluczy dostawców.** Zdjęcia są zastępcze, a blok statystyk hoteli nie istnieje. Różnice w liczbie słów na stronach hoteli w mieście wynikają z tego, nie z kodu.
- **`spain.info` i `whc.unesco.org` blokują automaty.** Weryfikacja dokumentów działa na migawkach (`content:verify --snapshots`). Nie obchodzimy blokad.
- **Next łączy `openGraph` płytko.** Strona, która ustawia własne `openGraph`, musi przejść przez `completeSocial`, inaczej zgubi obraz.
- **Moduły z `server-only` nie dają się importować w testach.** Czysta logika widoku jest w `comparison-view-data.ts`.
- **Codex potrafi zostawić bajty NUL w wyrażeniach regularnych** i ma dzienny limit konta. Jego wynik zawsze trzeba przeczytać.
- **Przebieg `content:run` importuje moduł z `main()` na końcu.** Nie da się go zaimportować w teście bez uruchomienia.
- **Preview na Vercelu używa zmiennych produkcyjnych.** Na Preview tylko odczyt stron treści, żadnych testów rezerwacji.
- **Token `_vercel_share` trzeba wymienić na ciasteczko.** Żądanie z tokenem w adresie zwraca 307, więc test z tokenem w każdym żądaniu sprawdza przekierowanie Vercela, a nie stronę. `seo:smoke` i `seo:shots` robią tę wymianę same (`--share <token>`). Token traci ważność po każdym wdrożeniu.
- **CTA w pierwszym ekranie uruchamia prefetch `next/link`.** Dla tras transakcyjnych jest wyłączony w `src/lib/analytics/cta-prefetch.ts`. Nowy link do wyszukiwarki poza `SeoCtaLink` trzeba sprawdzić skryptem z `seo-private/tooling/prefetch-probe.mjs` albo w zakładce sieci.
- **Build Preview potrafi paść na pobieraniu fontów Google** po kilkunastu sekundach. Ponowny build przechodzi.

## Dane prywatne

Katalog `seo-private/` (ignorowany przez git) zawiera eksporty GSC, crawle, zrzuty, migawki źródeł, raporty i wyniki ewaluacji skilli. Żyje tylko w katalogu roboczym tej gałęzi. Przed jego usunięciem skopiuj to, co chcesz zachować.

## Co dalej, w kolejności wartości

1. Scalenie PR po przeglądzie właściciela, potem rejestracja wymiarów GA4 tego samego dnia.
2. Dokumenty treści dla porównań z kolejki (`OPPORTUNITY_BACKLOG.csv`, wiersze 12–19), najlepiej przez automat w trybie roboczym.
3. Raport po 28 dniach i decyzja, czy rozszerzać wzbogacenia na strony miesięcy i huby (schemat już to przewiduje, brakuje szablonu).
4. Decyzja o planie indeksu stron miesięcy.
5. Drobne: większe cele dotykowe listy źródeł, wpis w rejestrze błędów przy awarii API GSC, limit czasu odczytu odpowiedzi w kliencie GSC.
