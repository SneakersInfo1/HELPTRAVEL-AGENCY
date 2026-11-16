# Fonty: hosting lokalny

Od 17.11.2026 serwis nie pobiera fontów z Google Fonts w czasie builda. Reguły `@font-face` są w `src/app/fonts.css`, a pliki w `public/fonts/`.

## Dlaczego

`next/font/google` pobierał przy każdym buildzie CSS i pliki z `fonts.googleapis.com` i `fonts.gstatic.com`. Gdy to pobieranie zawiodło, build padał błędem Turbopacka „next/font/google queries have exactly one entry”. Stało się to 15.11.2026 w CI, lokalnie i wcześniej raz na Vercelu.

## Co jest identyczne z wcześniejszym stanem

- **Pliki.** 11 plików woff2 (Manrope v23: 6 podzbiorów, Cormorant Garamond v21: 5 podzbiorów) jest bajt w bajt takich samych jak te, które pobierał `next/font`. Sumy SHA-256 i adresy źródłowe są w `public/fonts/README.md`.
- **Reguły `@font-face`.** 40 reguł z tymi samymi rodzinami, grubościami (Manrope 400–800, Cormorant 600 i 700), zakresami `unicode-range` i `font-display: swap`.
- **Fallbacki z korektą metryk.** Wartości `size-adjust`, `ascent-override`, `descent-override` i `line-gap-override` są skopiowane z CSS wygenerowanego przez `next/font`.
- **Zmienne `--font-ui` i `--font-display`.** Mają te same wartości i ustawia je klasa na `<html>` poza warstwami CSS, tak jak wcześniej.
- **Preload.** Te same 4 pliki co wcześniej: łaciński i rozszerzony łaciński obu krojów.

## Jak sprawdzono, że wygląd się nie zmienił

17.11.2026 porównano dwa buildy produkcyjne: z `next/font/google` (stan przed zmianą) i z fontami lokalnymi. Strony: główna, porównanie Ateny–Rzym, Barcelona w styczniu, przewodnik po Barcelonie i hub city break, w szerokościach 390 px (DPR 2) i 1440 px. Dla każdej strony po `document.fonts.ready`:

| Kontrola | Wynik |
|---|---|
| Wczytane kroje (`document.fonts`, rodzina, grubość, zakres znaków) | te same na 10 z 10 par |
| Krój, grubość, rozmiar i wymiary nagłówka, akapitu, linków i `body` | identyczne na 10 z 10 par |
| Zrzut pierwszego ekranu, piksel po pikselu | 0 różnych pikseli na 10 z 10 par |
| Kontrola negatywna: dwie różne strony tym samym narzędziem | 1 028 032 różnych pikseli z 1 316 640 |

Preload obejmuje w obu buildach 4 pliki o tych samych podzbiorach, z `crossorigin` i `type="font/woff2"`. Narzędzie: `seo-private/tooling/font-parity.mjs` (lokalne, poza repozytorium).

## Licencja

Oba kroje są na licencji SIL Open Font License 1.1 i nie mają zastrzeżonych nazw (Reserved Font Name). Teksty licencji leżą obok plików (`public/fonts/*-OFL.txt`). Licencja pozwala osadzać i rozpowszechniać fonty z oprogramowaniem, pod warunkiem dołączenia licencji. Nie wolno ich sprzedawać samodzielnie.

## Jak odświeżyć fonty

1. Pobierz CSS z Google Fonts z tym samym nagłówkiem `User-Agent`, którego używa `next/font` (`node_modules/next/dist/compiled/@next/font/dist/google/fetch-resource.js`):
   - `https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap`
   - `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap`
2. Pobierz pliki z adresów `fonts.gstatic.com` z tych CSS.
3. Zapisz je jako `public/fonts/<krój>-<wersja>-<podzbiór>.woff2`. Nowa wersja oznacza nową nazwę, a nagłówek `Cache-Control: immutable` dla `/fonts/*.woff2` tego wymaga.
4. Zaktualizuj adresy w `src/app/fonts.css` i preload w `src/app/layout.tsx`, potem sumy w `public/fonts/README.md`.
5. Porównaj zrzuty ekranu przed i po.

Nagłówek `User-Agent` ma znaczenie: dla innych przeglądarek, np. Chrome na Windows, Google oddaje inne pliki (z innym hintingiem).
