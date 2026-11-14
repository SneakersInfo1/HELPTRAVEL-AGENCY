# Etap 0 — stan wyjściowy: wyniki

Etap −1 (narzędzia) ma własny dokument: `TOOLING_AUDIT.md`.

## Co powstało

| Element | Gdzie |
|---|---|
| Crawler technicznego SEO i audyt HTML | `scripts/seo/crawl.ts`, `src/lib/seo-ops/html-audit.ts` (`pnpm seo:crawl`) |
| Zrzuty w trzech szerokościach z raportem konsoli i żądań | `scripts/seo/shots.ts` (`pnpm seo:shots`) |
| Punkt odniesienia | `BASELINE.md` |
| Inwentarz 2465 adresów z wartościami przed i po | `INVENTORY.csv` (`pnpm seo:inventory`) |
| Rejestr ryzyk | `RISK_REGISTER.md` |
| Zrzuty „przed” | `screenshots/przed__*` (390 px), pełne zestawy poza repo |

## Najważniejsze ustalenia

- Technicznie serwis był w dobrym stanie po wcześniejszych pracach: 1401 adresów w mapie witryny, wszystkie 200 i bez `noindex`, 0 błędów JSON-LD, 0 niedziałających linków, 0 łańcuchów przekierowań.
- Słabe miejsca: 1008 z 1533 stron miesięcy miało mniej niż 150 słów, 55 stron nie miało `og:image`, tytuły porównań i miesięcy były przeładowane („pogoda, budżet i dolot”), a H1 porównań miał doklejony slogan.
- Na telefonie pierwsze CTA na porównaniu było 4876 px od góry strony, a na stronie miesiąca 2881 px.
- 71% kliknięć z Google to zapytania o markę. Ruch spoza marki jest mały, więc priorytetem jest jakość odpowiedzi na stronach, które już mają wyświetlenia.

## Bezpieczeństwo pomiaru

Crawler wykonuje wyłącznie żądania GET stron treści, z uczciwym User-Agentem i współbieżnością do 4. Trasy zasilane przez dostawców (wyszukiwarka, karty hoteli, loty, kroki zakupu) są pomijane ze statusem `SKIPPED_PROVIDER_*`. W crawlu produkcji pominięto w ten sposób 2162 adresy.

## Czego nie zrobiono

- Nie ma danych Core Web Vitals z prawdziwych urządzeń (raport CWV w GSC i CrUX wymagają dostępu). Zastępczo wykonano pomiar laboratoryjny Lighthouse.
- Produkcja nie była modyfikowana.
