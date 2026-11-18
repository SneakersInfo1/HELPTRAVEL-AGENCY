# Etap 1 — dane Search Console i backlog szans: wyniki

Liczby wyjściowe są w `BASELINE.md`.

## Co powstało

| Element | Gdzie |
|---|---|
| Parser eksportów CSV (także pól z cudzysłowami i znakami nowej linii) | `src/lib/seo-ops/gsc/csv.ts` |
| Klasyfikacja adresów i zapytań (segmenty, marka, intencje wysokiego ryzyka) | `src/lib/seo-ops/gsc/segments.ts` |
| Analizy: marka, porównanie okresów, CTR odniesienia, anomalie, ranking szans | `src/lib/seo-ops/gsc/analysis.ts` |
| Klient API Search Console (tylko odczyt, konto usługi) | `src/lib/seo-ops/gsc/api-client.ts` |
| Backlog 20 adresów | `seo-private/OPPORTUNITY_BACKLOG.csv`, poza repozytorium (`pnpm seo:inventory`) |

Testy sprawdzają parser na trudnych przypadkach, a gdy na dysku jest prywatny eksport, także sumy z prawdziwych plików. Oczekiwane liczby leżą razem z eksportem w `seo-private/`, nie w kodzie.

## Jak liczony jest ranking szans

Wynik adresu to luka CTR przemnożona przez wagę segmentu.

- **Luka CTR** to liczba wyświetleń × (CTR odniesienia dla pozycji − CTR faktyczny). Krzywa odniesienia jest orientacyjna i służy wyłącznie do ustalenia kolejności. Nigdy nie jest prognozą kliknięć.
- **Bliskość pierwszej dziesiątki**: adresy z pozycji 11–20 dostają dodatek 1% wyświetleń.
- **Waga segmentu** odpowiada temu, czy kliknięcie ma szansę wejść do lejka: porównania 1,0, huby i strony hoteli w mieście 0,9, przewodniki 0,7, artykuły 0,6, strony miesięcy 0,35 (widżet pogody Google zabiera kliknięcia). Strona główna i strony informacyjne mają 0, bo żyją z zapytań o markę.

## Backlog

20 adresów: 10 wskazanych w misji i 10 następnych według rankingu.

| Stan | Liczba | Adresy |
|---|---|---|
| Zrobione w gałęzi | 12 | 4 porównania z dokumentem treści, 5 stron miesięcy i 3 huby na nowych szablonach |
| Następne w kolejce | 8 | hub `/porownanie` oraz porównania: Budapeszt–Praga, Antalya–Palma, Barcelona–Malaga, Agadir–Marrakesz, Dublin–Londyn, Neapol–Rzym, Lizbona–Malaga |

Porównania z kolejki mają już nowy szablon. Brakuje im dokumentu treści ze źródłami i to jest naturalne pierwsze zadanie dla automatu.

Backlog zawiera kliknięcia, wyświetlenia, CTR i pozycję na poziomie adresu, więc od 19.11.2026 leży poza repozytorium, w `seo-private/OPPORTUNITY_BACKLOG.csv` (repo jest publiczne).

## Klient API Search Console

Eksport CSV z interfejsu nie ma wymiaru strona × zapytanie i nie może leżeć w publicznym repozytorium. Klient API rozwiązuje oba problemy: pobiera strony, zapytania, dni oraz pary strona × zapytanie, a dane żyją tylko w pamięci przebiegu.

- Uwierzytelnienie kontem usługi, zakres `webmasters.readonly`.
- Bez dodatkowych zależności. Limit czasu, ponowienia przy 429 i 5xx, czytelny błąd `BLOCKED_AUTH` przy braku dostępu.
- Podłączony do automatu (`--gsc-source api`) i do raportu tygodniowego (`--source api`).

**Stan: `INSTALLED_NOT_TESTED`.** Klient ma testy na podstawionych odpowiedziach, ale nie był uruchomiony na prawdziwym koncie, bo dostępu nie ma. Kroki dla właściciela opisuje `AUTOMATION_RUNBOOK.md`, pkt 3.

## Ograniczenia danych

- Brak wymiaru strona × zapytanie w eksporcie CSV. „Dowód z zapytań” w backlogu to liczba wariantów klastra, a nie przypisanie zapytań do adresu.
- Brak podziału na urządzenia i brak trendu na poziomie adresu.
- Zapytania anonimizowane nie trafiają do eksportu, więc udział marki jest dolnym ograniczeniem.
