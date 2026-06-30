# Loty — Faza A: Szybkość (design)

**Data:** 2026-06-28
**Status:** zaakceptowany (design), przed planem wdrożenia
**Część większej inicjatywy** „usprawnienie lotów" (4 fazy, po kolei):
A. Szybkość ← **ta faza**, B. Niezawodność / wygasłe oferty, C. Konwersja / UX wyników, D. Pokrycie tras.

## Problem (zmierzony na żywo, prod LiteAPI Flights)

Wyszukiwanie lotów jest wolne i nie ma ŻADNEGO cache — bliźniacza klasa problemu co stawki hoteli przed naprawą.

| Zapytanie | Czas | Payload | Oferty |
|---|---|---|---|
| WAW→BCN tam-powrót (zimno) | 6363 ms | 4,01–4,69 MB | 259–293 |
| ten sam (powtórka) | 1485 ms | 4 MB | 259 |
| WAW→BCN w jedną | 5243 ms | 1,33 MB | 112 |

- `searchFlightRates` bez nextCache, route `force-dynamic`, brak Redis → każde wyszukiwanie = żywy ~5–6 s call GDS (logi prod: same `cache=MISS`). Powtórka 1,5 s to cache po stronie LiteAPI, nie nasz.
- Payload 4–4,7 MB leci surowy do przeglądarki i tam jest normalizowany; przekracza 2 MB cap Next Data Cache.
- Fan-out „wszystkie lotniska" odpytuje też martwe trasy (WMI/RDO→BCN = 0 ofert), za każdym razem.
- Wyniki czekają aż WSZYSTKIE lotniska odpowiedzą (brak progresji).
- Slim `DisplayOffer[]` = 887 KB / 293 oferty (5,2× mniej); top-150 ≈ 450 KB; 1 oferta ~2,8 KB.

## Cele i nie-cele

**Cele:** powtórne i cofnięte wyszukiwania ~instant; mniejszy payload do przeglądarki; szybsze pierwsze wyniki przy „wszystkich lotniskach" (progresja); koniec marnowania calli na martwe trasy.

**Nie-cele:** obniżenie ~5–6 s podłogi GDS na ZIMNYM pierwszym wyszukiwaniu (nieosiągalne bez cache); twarda obsługa wygasłych offerId (Faza B); zmiany UX kart/konwersji (Faza C); rozszerzanie tras (Faza D).

## Architektura

### 1. `src/lib/flights/rates-cache.ts` (NOWY)
Best-effort cache ofert lotów w Upstash Redis. Wzorzec jak `src/lib/hotels/rate-cache.ts`: każdy błąd/brak env → traktowane jak miss; cache MOŻE tylko pomóc, nigdy nie wywala wyszukiwania.

- `flightRatesCacheKey(input)` — deterministyczny klucz z `legs[]` (origin/destination/date każdego odcinka, w kolejności) + `adults`/`children`/`infants` + `cabinClass` + `currency`. To pokrywa zarówno one-way (1 leg) jak i round-trip (2 legi). Wersjonowany prefiks (`flrt:v1:`) do globalnej inwalidacji.
- `getCachedFlightOffers(key): Promise<DisplayOffer[] | null>` — `null` = miss.
- `setCachedFlightOffers(key, offers): Promise<void>` — best-effort; TTL `TTL_OFFERS=180 s` gdy `offers.length>0`, `TTL_EMPTY=600 s` gdy pusto (negatywny cache martwych tras).
- Seam testowy `__setFlightRatesRedisForTests` / `__reset…` (jak `session.ts`).
- Rozmiar wartości trzymany <0,5 MB przez cap w route (poniżej).

### 2. `src/app/api/flights/rates/route.ts` (MODYFIKACJA)
Po walidacji `FlightSearchInputSchema`:
1. `key = flightRatesCacheKey(parsed.data)`.
2. `cached = getCachedFlightOffers(key)` → jeśli nie-null: zwróć `{ offers: cached, count: cached.length, cached: true }` (instant).
3. Miss: `searchFlightRates` (raw) → `normalizeRatesResponse` (SERWEROWO) → sort rosnąco po `total` (null na koniec) → `slice(0, FLIGHT_OFFERS_CAP=150)` → `setCachedFlightOffers(key, slim)` → zwróć `{ offers: slim, count: slim.length, cached: false }`.
4. Błędy live mapowane jak dziś (`toFlightApiError`), z tym samym logiem.

Sort po cenie przed capem gwarantuje, że najtańsze oferty zawsze zostają; klient i tak re-sortuje wg wyboru użytkownika.

### 3. `src/app/loty/wyniki/_components/flight-results.tsx` (MODYFIKACJA)
- **Konsumpcja slim:** zamiast `normalizeRatesResponse(json)` czyta `json.offers as DisplayOffer[]` (już znormalizowane serwerowo). `normalizeRatesResponse` zostaje w `display.ts` (testy + ewentualni inni konsumenci), ale lista jej nie woła.
- **Progresja:** zamiast `Promise.all(...).then(setOffers)` — każdy fan-out fetch po rozwiązaniu scala swoje oferty do akumulowanego stanu (dedup po `offerId`) i odświeża listę. Licznik „szukam w N lotniskach…" do czasu aż wszystkie się rozstrzygną. Dla pojedynczego lotniska (najczęstszy przypadek) zachowanie bez zmian.
- Wybór oferty (`selectOffer` → `saveFlightFlow` → `/loty/dodatki`) bez zmian — `DisplayOffer` niesie offerId + fares + total, czego potrzebuje flow.

## Przepływ danych
Klient (fan-out per lotnisko) → `/api/flights/rates` (cache-hit albo live→normalize→cap→cache) → chude oferty → scalanie+dedup w miarę napływu → render. Wybór → `saveFlightFlow(offer)` → `/loty/dodatki` (verify tam, bez zmian).

## Obsługa błędów
- Cache: best-effort, miss przy braku env / błędzie Redis / przekroczeniu rozmiaru.
- Route: błędy LiteAPI → `toFlightApiError` (bez zmian).
- Klient: wszystkie lotniska padły → komunikat błędu; część OK → pokaż częściowe.
- Wygasły offerId (cache do 3 min): obsługiwany dziś przy wyborze (verify na `/loty/dodatki` → „cena się zmieniła"/„oferta niedostępna"). Twarde domknięcie w Fazie B.

## Testy
- `src/lib/flights/rates-cache.test.ts` (NOWY, rejestr w `package.json`):
  - klucz deterministyczny i stabilny; różne wejścia → różne klucze; brak `ret` vs z `ret` rozróżnione.
  - brak Redis (injected null) → `get` zwraca null, `set` nie rzuca.
  - round-trip z mock Redis: set→get zwraca te same oferty; pusta lista → zapis z TTL negatywnym; błąd klienta → miss.
- Normalizacja: pokryta w `flights.test.ts` (bez zmian logiki).
- Build + pełny zestaw testów.
- Live probe po deployu: warm→hit (drugi identyczny search = szybki), rozmiar payloadu ~0,45 MB, fan-out nie odpytuje martwych tras drugi raz.

## Świadome trade-offy
- **Cap 150** (sort po cenie) — ucina długi ogon ofert; najtańsze zawsze zostają; mniej do renderu i do cache.
- **TTL 3 min** — drobna nieświeżość cen; offerId re-weryfikowany przy wyborze.
- **Progresja** — realny zysk tylko dla grup „wszystkie lotniska"; pojedyncze lotnisko bez zmian.
- **Brak prewarm crona** (w odróżnieniu od hoteli) — kombinacje origin×dest×daty są zbyt liczne; cache napełnia się organicznie. Ewentualny prewarm top-tras = osobna decyzja później.
