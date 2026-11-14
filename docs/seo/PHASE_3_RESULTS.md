# Etap 3 — szablony stron treści: wyniki

Uzasadnienie wyboru kierunku, pomiary i progi jakości są w `DESIGN_QUALITY_STANDARD.md`.

## Co powstało

| Szablon | Co się zmieniło | Kod | Commit |
|---|---|---|---|
| Porównanie `/porownanie/[para]` | Krótki H1 („Ateny czy Rzym?”), odpowiedź pod nagłówkiem, para CTA, zdjęcia, werdykt „wybierz, jeśli / odpuść, jeśli” z jawną podstawą, tabela faktów (blokowa na telefonie), sekcje redakcyjne, źródła z datą i ujawnieniem AI, powiązane porównania | `src/components/editorial/comparison-template.tsx`, `comparison-blocks.tsx`, `src/lib/seo/comparison-view.ts` | `017ea92` |
| Przewodnik miesięczny `/kierunki/[slug]/[miesiac]` | Odpowiedź pod H1, CTA w pierwszym ekranie, sekcja „na co ten termin / kiedy odpuścić”, lista liczb z zaznaczonym pochodzeniem, siatka miesięcy z celami 44 px, widoczne FAQ zgodne z `FAQPage` | `src/components/editorial/month-template.tsx`, `src/lib/seo/month-page-model.ts` | `041cb35` |
| Hub `/wyjazdy/[typ]` | Tabela faktów z bramki danych, linki do porównań, `ItemList` tylko z przewodników, obraz społecznościowy | `src/components/publisher/mood-landing.tsx`, `src/lib/seo/mood-hub-model.ts` | `c676c7e` |

Trzy kierunki art direction („Werdykt”, „Pojedynek”, „Karta decyzji”) są dostępne na trasie laboratoryjnej `/lab/porownanie/[wariant]/[para]` (tylko z `SEO_LAB=1`, `noindex`). Na produkcję idzie jeden: „Werdykt”.

## Dowody (telefon 390 px)

| Strona | Góra pierwszego CTA: przed → po |
|---|---|
| Porównanie Ateny–Rzym | 4876 → 478 px |
| Barcelona w styczniu | 2881 → 388 px |
| Hub city break | 645 → 645 px |

- Playwright z axe: 13/13 (trzy szablony w trzech szerokościach, fokus z klawiatury, kliknięcie CTA).
- Lighthouse, dostępność: 96 → 100 na porównaniu i stronie miesiąca. CLS 0. LCP bez regresji.
- Brak przepełnienia poziomego i 0 błędów konsoli na 390, 768 i 1440 px.

## Zasady, których szablony pilnują

- Twierdzenia jakościowe („dobre na plażę”) pojawiają się tylko dla profili kuratorowanych. Gdy danych nie ma, zdania nie ma. Sekcję dopasowania terminu ma 276 stron miesięcy, a nie wszystkie.
- Liczby z modelu regionalnego są podpisane jako średnie wieloletnie, a nie prognoza.
- Żadnych cen bez pomiaru z datą i żadnej fałszywej presji.

## Ograniczenia

- Wybór kierunku opiera się na zrzutach i pomiarach układu. Nie było testów z użytkownikami.
- Zdjęcia i statystyki hoteli na żywo trzeba obejrzeć na Preview, bo build lokalny nie ma kluczy dostawców.
- Wzbogacenie treścią ze źródeł mają dziś 4 z 54 porównań. Pozostałe korzystają z nowego szablonu z danymi bazowymi.
