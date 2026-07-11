# Kontrakt LiteAPI Flights — empiryczny (dla warstwy Pakiety)

> Zastępuje planowany `LITEAPI_SANDBOX_RESULTS.md`. **Nie użyliśmy sandboxu** (decyzja właściciela:
> jedziemy z produkcją). Kontrakt NIE jest zgadywany — pochodzi z empiryki istniejącego, działającego
> na produkcji modułu lotów (`src/lib/flights/*`, PR #102, cron `warm-flights`). Daty w komentarzach kodu:
> rates/verify 2026-06-13, prebook + `servicesAttachable` 2026-06-14.
> Legenda: ✅ potwierdzone w kodzie/proddzie · ⚠️ różni się od spec · ❌ niemożliwe/brak · 🔒 TODO:VERIFY (Faza 2).

## Auth / hosty
- ✅ Wszystkie endpointy flights: `https://api.liteapi.travel/v3.0` (NIE `book.liteapi.travel` — to jest tylko
  dla hoteli prebook/book). Klucz `X-API-Key` wyłącznie server-side (`keyMode:"public"` w `liteApiRequest`).

## Test A — `POST /flights/rates` (search) ✅
- Body: `{ legs:[{origin,destination,date,direction}], adults, children, infants, cabinClass, currency, country }`.
- Response: `data[].journeys[]`; journey = `{ cheapestOffer, offers[], segments[], totalDuration, journeyKey, isCheapest }`.
- Offer = `{ offerId, expiration?, pricing.display.{ total, currency, base, taxes, fees }, baggage?, fare? }`.
- ✅ `currency:"PLN"` przyjmowane, ceny wyświetleniowo w PLN.
- ✅ `expiration` obecne (opcjonalne) → **źródło prawdy o ważności oferty**, nie sztywny TTL.
- Może być SSE streaming; obecny klient używa zwykłego POST z `timeoutMs: 30s`.

## Test B — `POST /flights/verify` (potwierdzenie ceny) ✅ ⚠️
- Body: `{ offerId }`. `retries:1` (bez retry — 5xx/52099 znaczy „ta oferta martwa", nie przejściowy błąd).
- Response: `data[].journey.pricing.display` + **`priceChanged: boolean`**.
- ⚠️ Spec mówi o polu `changes` — realnie jest to flaga `priceChanged` + świeży `pricing.display`. Deltę cenową
  liczymy porównując `display.total` z zapamiętanym z rates.
- Kody błędów mapowane domenowo (`src/lib/flights/client.ts:toFlightApiError`): 53010/52099 → `OFFER_UNAVAILABLE`
  (UI: „wróć po świeże wyniki"), 43001/4xx → `VALIDATION`, reszta → `PROVIDER_ERROR`.

## Test C — `POST /flights/prebooks` (hold + PaymentIntent) ✅
- Body: `{ offerId, usePaymentSdk:true, contact{firstName,lastName,email,phoneNumber,phoneCountryCode},
  passengers[<płaskie pola document*>] }`. `timeoutMs: 60s` (lock taryfy bywa wolny).
- Response `data[0]` = `{ prebookId, transactionId, secretKey, price, currency, paymentTypes[], sandbox:boolean,
  booking, servicesAttachable }`.
- ✅ `transactionId` + `secretKey` obecne → User Payment SDK **aktywny** na koncie merchant
  (gdyby był tylko `prebookId` → SDK nieaktywny → STOP). Potwierdzone przez `scripts/smoke-liteapi.ts`.
- ⚠️ Uwaga bezpieczeństwa: to tworzy realny hold u dostawcy (bez obciążenia). Na PROD odpalać tylko gdy konieczne.

## Test D — `POST /flights/prebooks/{id}/services` (attach ancillaries) 🔒
- Mapper gotowy (`src/lib/flights/ancillaries.ts`), ale kontrakt **niewpięty i niepotwierdzony realną rezerwacją**
  (dotyka ścieżki płatności). Oczekiwane: attach zwraca NOWY `transactionId`/`secretKey`, stary martwy.
- `servicesAttachable.groups[]`: `category:"seat"|"baggage"`, service z `pricing.display.{amount,currency}`,
  `passengerType`, `segmentKey`, `metadata.seat`. **Zaobserwowane: 478 miejsc (0–188 zł) + Extra Baggage 10/20/40/60 kg
  (178–639 zł).** Weryfikacja end-to-end: Faza 2.

## Test E — `GET /flights/bookings/{id}` (status) ✅
- Źródło prawdy o statusie rezerwacji (webhook = tylko trigger). Response lenient (kształt zależny od dostawcy);
  `extractBookingId` czyta `bookingId|id|bookingID`.

## Test F — Webhooki 🔒
- Zdefiniowane w spec: `flight.book.{pending.confirmation,confirmed,failed,expired}`. Endpoint istnieje
  (`src/app/api/liteapi/flights-webhook`), ale schemat/podpis do potwierdzenia realnym eventem prod (Faza 2).
- Env: `LITEAPI_FLIGHTS_WEBHOOK_AUTH_TOKEN`, `LITEAPI_WEBHOOK_SECRET`, `LITEAPI_WEBHOOK_AUTH_TOKEN` obecne.

## Test G — Transliteracja nazwiska ✅ (znane)
- API **nie** transliteruje. Normalizacja po naszej stronie: walidacja A–Z, inline podpowiedź „Michał → MICHAL".
  (Spójne z lekcją hotelową i pamięcią projektu.)

## ❌ Niemożliwe / poza dostawcą
- ❌ Ryanair / Wizz i inne LCC — LiteAPI (GDS Travelport) ich nie sprzedaje (empirycznie 2×). Testy ancillaries
  „per LCC" ze spec = bezprzedmiotowe.
- ❌ BLIK — niedostępny w Payment SDK (support Nuitee).
- ❌ Kalendarz cen lotów / cheapest-dates — brak endpointu (Price Index = tylko hotele).
- ❌ Wspólny PaymentIntent hotel+lot — dwie osobne transakcje.

## Reużycie w module packages
`src/modules/packages/services/flightsClient.ts` = cienki re-export `@/lib/flights/client`
(`searchFlightRates`, `verifyFlightOffer`, `prebookFlight`, `bookFlight`, `getFlightBooking`) + `mapServicesAttachable`
z `ancillaries.ts`. Zero duplikacji kontraktu.
