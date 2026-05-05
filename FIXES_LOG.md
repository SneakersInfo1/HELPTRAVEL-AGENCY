# FIXES_LOG.md

Hotfixes applied on top of Phase 1. NOT regressions — these patch bad
inheritances from the original `.env.local` guide.

## 2026-05-02 — Phase 1 hotfix: LiteAPI base URL consolidation

**Root cause.** `api.sandbox.liteapi.travel` does not exist as a hostname.
LiteAPI uses a single set of hosts (`api.liteapi.travel` for read endpoints,
`book.liteapi.travel` for booking endpoints) for BOTH sandbox and production —
the environment is selected by the API key prefix (`sand_` vs `prod_`).
Reference: https://docs.liteapi.travel/reference/authentication

The bad subdomain came from the owner's original `.env.local` guide and was
copied into both `.env.example` and `src/lib/liteapi/client.ts`. Phase 1
contract tests against the documented schema passed because they mock the
network — the URL never resolved until the smoke test.

**Changes**

- `src/lib/liteapi/client.ts`
  - Removed hardcoded `https://api.sandbox.liteapi.travel/v3.0`.
  - New `LITEAPI_BASE_URL` (default `https://api.liteapi.travel/v3.0`) +
    `LITEAPI_BOOK_BASE_URL` (default `https://book.liteapi.travel/v3.0`).
  - Private-key calls (prebook/book/cancel/retrieve) now route to
    `bookBase`; public-key calls stay on `apiBase`.
  - `getEnv()` derives `mode` from key prefix (`sand_` → sandbox,
    `prod_` → production). `LITEAPI_ENV` only acts as a tie-breaker when
    both key sets are present.
  - Startup assertion: throws `LiteApiUnknownError` if either base URL
    contains the bogus `api.sandbox.` / `sandbox.api.` host, with a clear
    explanation pointing to the docs.
  - `getEnv` is now exported for unit testing.

- `.env.example`
  - Added `LITEAPI_BASE_URL` and `LITEAPI_BOOK_BASE_URL` with documentation
    explaining the single-host model.
  - Reworded `LITEAPI_ENV` comment — it is no longer the source of truth.
  - (No legacy `LITEAPI_SANDBOX_BASE_URL` / `LITEAPI_PROD_BASE_URL` /
    `LITEAPI_BOOK_PROD_BASE_URL` were ever present — confirmed via grep.)

- `src/lib/liteapi/client.test.ts`
  - `getEnv throws when LITEAPI_BASE_URL points at non-existent sandbox subdomain`
  - `getEnv defaults to documented hosts when env vars are absent`
  - `getEnv mode is driven by API key prefix`

- `scripts/smoke-liteapi.ts`
  - On error, prints internal code + redacted body so HTTP 400/422 surface
    actionable detail instead of bare `HTTP 400`.

**Verification**

- `node --import tsx --test src/lib/liteapi/client.test.ts` → 14/14 pass.
- `pnpm smoke:liteapi` against sandbox `sand_` key:
  - ✅ `search /data/hotels` — 5 hotels (proves `api.liteapi.travel` reachable
    with `sand_` key).
  - ✅ `rates /hotels/rates` — rateId returned (proves rates endpoint).
  - ❌ `prebook usePaymentSdk:true` — HTTP 400, body
    `{"error":{"code":4002,"description":"Key: 'PreBookRequest.OfferID' Error:Field validation for 'OfferID' failed on the 'required' tag", ...}}`.

**Status.** URL fix complete and verified — sandbox base hosts respond
correctly with the `sand_` key.

## 2026-05-02 — Phase 1 hotfix #2: LiteAPI request-payload field-name audit

**Root cause.** LiteAPI's request payloads use field names that drift from
their own response payloads. Our Phase 1 client was passing fields under
the response-side names, which the request validator rejected with HTTP 400.

Two distinct drifts found:

1. **`/rates/prebook`** — request body wants `offerId`, but our `prebook.ts`
   was sending `rateId` (the name LiteAPI uses in the `/hotels/rates`
   response). LiteAPI returned:
   `4002 Key: 'PreBookRequest.OfferID' Error:Field validation for 'OfferID' failed on the 'required' tag`.

   Compounding bug: even after the rename, the smoke test was reading
   `roomType.rates[].rateId` and passing that as `offerId`. The real
   prebook key lives one level up at `roomType.offerId`. Sandbox
   responded `4002 invalid offerId` until the smoke test was corrected.

2. **`/rates/book`** — request body wants `guests` (array), but our
   `book.ts` was sending `guestInfo`. Caught by the new contract test;
   would have surfaced in Phase 4 sandbox book step.

**Changes**

- `src/lib/liteapi/prebook.ts` — rename request field `rateId` → `offerId`
  at the boundary; internal `PrebookInput.rateId` parameter name kept
  per spec. JSDoc explains the drift.
- `src/lib/liteapi/book.ts` — rename request field `guestInfo` → `guests`.
  JSDoc lists the documented body keys 1:1 with LiteAPI's reference.
- `scripts/smoke-liteapi.ts` — pick `roomTypes[].offerId` (room-type
  level) instead of `roomTypes[].rates[].rateId` (rate-level) when
  preparing the prebook input.
- `src/lib/liteapi/hotel.ts` — audited, no changes (`GET /data/hotel?hotelId=…`
  matches docs).
- `src/lib/liteapi/retrieve.ts` — audited, no changes (`GET /bookings/{id}`).
- `src/lib/liteapi/cancel.ts` — audited, no changes (`DELETE /bookings/{id}`).
- `src/lib/liteapi/search.ts` — audited, no changes (`countryCode` /
  `cityName` / `limit` query keys match docs).
- `src/lib/liteapi/rates.ts` — audited, no changes (`hotelIds` /
  `occupancies` / `checkin` / `checkout` / `currency` /
  `guestNationality` / `limit` body keys match docs).

**New contract-test pattern.** `client.test.ts` gains a final block of
seven boundary contract tests — one per public endpoint
(`searchHotels`, `getRates`, `getHotelDetail`, `prebook`, `book`,
`getBooking`, `cancelBooking`). Each test stubs `globalThis.fetch`,
captures the outgoing request, and asserts:

- target host (api vs book) and method,
- exact request-body JSON keys against LiteAPI docs,
- correct API key (public vs private) on the `X-API-Key` header.

The prebook test specifically asserts `body.offerId === input` AND
`body.rateId === undefined`, locking the boundary contract so future
refactors cannot reintroduce the drift. The book test asserts
`Array.isArray(body.guests)` AND `body.guestInfo === undefined`.

**Verification**

- `node --import tsx --test src/lib/liteapi/client.test.ts` → 21/21 pass
  (14 prior + 7 new contract tests).
- `pnpm smoke:liteapi` against sandbox `sand_` key:
  - ✅ `search /data/hotels` — 5 hotels.
  - ✅ `rates /hotels/rates` — `offerId` picked.
  - ✅ `prebook usePaymentSdk:true` — `prebookId` + `transactionId` +
    `secretKey` returned (proves Payments product activated).
  - · `book` / `retrieve` / `cancel` — Phase 4 (intentional skips,
    require front-end SDK-completed payment).
