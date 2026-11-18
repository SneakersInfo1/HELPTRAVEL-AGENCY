# Etap 6 — pomiar i raportowanie: wyniki

## Co powstało

| Element | Szczegóły | Commit |
|---|---|---|
| Kontekst treści w zdarzeniu `seo_cta_click` | Nowe parametry: `content_id`, `content_version`, `topic_cluster`. Istniejące: typ strony, typ CTA, kierunek. Każdy znacznik `SeoCtaLink` w szablonie porównania dostaje kontekst dokumentu, co sprawdza test kontraktu zdarzeń. | `ea80b28`, `54ddc40` |
| Raport tygodniowy | `pnpm seo:weekly`: okna 28 i 56 dni, segmenty adresów, CTR w przedziałach pozycji, dolne ograniczenie udziału marki, ranking szans, anomalie. Raport powtarza na górze zasady interpretacji. | `b4d9a22` |
| Adapter GA4 | Interfejs `Ga4Source` i implementacja `NotConnectedGa4`. Raport pisze wprost `NOT_CONNECTED` i nie udaje lejka. | `b4d9a22` |
| Dokumentacja zdarzeń | `docs/analytics-events.md` | `ea80b28` |

## Jak czytać raport

- Udział marki to dolne ograniczenie, bo zapytania anonimizowane nie trafiają do eksportu.
- CTR porównuje się w tych samych przedziałach pozycji. CTR „ogólny” zmienia się razem ze składem zapytań.
- Suma po adresach jest większa niż suma usługi.
- Kliknięcia z GSC i sesje z GA4 to różne jednostki i nie tworzą jednego lejka.
- Zmiana po wdrożeniu to korelacja, a nie dowód przyczyny.

## Co jest potrzebne, żeby pomiar działał

1. Zarejestrowanie w GA4 trzech wymiarów niestandardowych o zakresie zdarzenia: `content_id`, `content_version`, `topic_cluster`. Bez tego parametry są wysyłane, ale nie widać ich w raportach.
2. Dostęp do GA4 tylko do odczytu albo eksport stron wejścia z ruchu organicznego.
3. Źródło danych GSC dla raportu: eksport CSV albo konto usługi z dostępem do Search Console.

Szczegóły są w `OWNER_ACTIONS.md`, pkt 4 i 5.

## Ograniczenia

- Nie ma punktu odniesienia dla konwersji z ruchu organicznego. Pierwszy raport po 28 dniach pokaże kliknięcia CTA per dokument, ale bez porównania z okresem „przed”.
- Okno 56 dni wymaga 112 dni danych. Obecny eksport ma 92 dni.
- Raport zawiera dane GSC, więc zapisuje się poza repozytorium (`seo-private/reports/`).
