# Booking Flow Audit
_Date: 2026-05-18_
_Branch: `phase-1-purge-affiliate-pivot` (deployed `/hotele` architecture)_
_Phase 0 — discovery only. No production code was written or modified for this audit._

> **Headline:** The booking flow does **not exist as a reachable destination**. Every
> rate-row CTA links to `/hotele/rezerwacja`, but **no route, page, API endpoint, guest
> form, or payment component exists there**. The `src/lib/liteapi/*` server layer
> (prebook / book / payments / webhook / retrieve / cancel) is **fully implemented and
> unit-tested**, but **nothing in `src/app` wires it to a UI or an API route**. The
> reported "401" is **not an active runtime bug** — it is a *latent* config gap that
> will produce a 401 the moment a booking route is added, unless env wiring is fixed
> first. Several "confirmed facts" in `BOOKING_FLOW_PROMPT.md` are **contradicted by
> verified evidence** (widget script URL, public-key role, prebook `expiresAt`, the
> existence of a JS success callback). These are documented in §8 and §13.

---

## 1. Current "Zarezerwuj pokój" Flow (file:line)

The chain is **severed at hop 2** — it never reaches a handler, API route, or server fn.

1. `src/app/hotele/[hotelId]/page.tsx` → renders `RoomsSection`.
2. `src/app/hotele/[hotelId]/_components/rooms-section.tsx:181-184` builds
   `reservationHref = /hotele/rezerwacja?<searchQuery>&hotelId=<id>&offerId=<roomType.offerId>`
   (passes **`offerId`**, not `rateId` — per the prebook hotfix note at `rooms-section.tsx:3-5`).
3. `rooms-section.tsx:218-223` — the CTA is a Next `<Link href={reservationHref}>` labelled
   **"Wybierz"** (not "Zarezerwuj pokój").
4. Sticky widget `src/app/hotele/[hotelId]/_components/booking-widget.tsx`: "Wybierz pokój"
   (`:128-134` desktop, `:160-166` mobile) only calls `scrollToRooms()` (`:48-50`);
   "Sprawdź dostępność" (`:121-127`) calls `refresh()` (`:37-46`) → re-navigates the same
   hotel page. **No widget button initiates booking.**
5. **`/hotele/rezerwacja` → no `page.tsx`, no route, no component anywhere.** The string
   "Zarezerwuj pokój" does not occur in any interactive component. Clicking "Wybierz"
   navigates to a **non-existent route** (Next 404 in prod / error overlay in dev).

There is no click-handler → API route → server-function chain to trace. It does not exist yet.

## 2. Exact Source of the 401

**There is no active 401 today** (the route that would emit it is missing). Enumerated all
`401` / "Unauthorized" in `src`:

| Location | Emits | Relevant? |
|---|---|---|
| `src/middleware.ts:9` (`config.matcher=["/admin/:path*"]`, `:3-5`) | 401 | No — guards `/admin/*` only |
| root `middleware.ts:48-50` (matcher `/en`, `/planner`) | 308 redirect | No |
| `src/lib/rate-limit.ts` | 429 | No — not 401, keys are search-only |
| **`src/lib/liteapi/errors.ts:107`** | `LiteApiAuthError` | **Yes — the latent one** |

`errors.ts:107`: `if (status === 401 || status === 403) return new LiteApiAuthError(...)`
(`internalCode="LITEAPI_AUTH"`, `userMessagePl="Wewnętrzny błąd autoryzacji dostawcy."`).
It is thrown from `client.ts:236` (`throw liteApiErrorFromResponse(res.status, redactPii(body))`)
when LiteAPI returns 401 for a booking-host call.

**Classification: (a) LiteAPI rejecting our key — a config gap, not a code bug.**
`client.ts:96-115` resolves the key. With the current `.env.local` (verified, §6):
`LITEAPI_ENV` **unset** ⇒ `preferProd=false` (`client.ts:109-110`) ⇒
`privateKey = sandboxPrivate ?? prodPrivate`; `LITEAPI_SANDBOX_PRIVATE_KEY` is **unset** so
`sandboxPrivate` falls back to `sandboxPublic = LITEAPI_SANDBOX_KEY`. Booking calls use
`keyMode:"private"` → `client.ts:184-186` sends the **sandbox** key to
`book.liteapi.travel` → LiteAPI 401 → `errors.ts:107`. This is the "silent 401-loop" the
`client.ts:90-95` comment warns about.

**Verified by live probe (2026-05-18):** using `LITEAPI_PROD_PRIVATE_KEY` *directly*
(bypassing `getEnv`), `POST https://book.liteapi.travel/v3.0/rates/prebook` with
`usePaymentSdk:true` returned **HTTP 200** with `prebookId`+`transactionId`+`secretKey`.
**The prod private key is valid for booking.** The fix is env wiring (set `LITEAPI_ENV` or
`LITEAPI_PROD_KEY`), **no code change** — see §6 / §13.

> **Conflict with prompt:** `BOOKING_FLOW_PROMPT.md:46-49` states the booking key is
> `LITEAPI_PROD_PRIVATE_KEY` (✅ correct, verified) but `:47` also implies
> `LITEAPI_PROD_PUBLIC_KEY` is a REST key needing a `NEXT_PUBLIC_` alias for `X-API-Key`.
> `client.ts:90-95` + the widget JS (§8) show it is the **payment-widget publishable
> key**, consumed by the widget's own `/config` endpoint — **never** `X-API-Key` (that
> 401s). Both statements are reconcilable but the prompt's framing is misleading; see §8.

## 3. LiteAPI Integration Inventory (with reuse plan per file)

App code imports only from `@/lib/liteapi` (barrel `index.ts`). **Reuse 100% — do not
duplicate.** All booking primitives already exist:

| File | Role / exports | Reuse plan |
|---|---|---|
| `client.ts` | `liteApiRequest` (retry/backoff, timeout, PII-redacted logging, zod-validate, error mapping), `getEnv`. `keyMode:"private"`→`book.liteapi.travel`. Retryable: 408,425,429,5xx (`:177`). | **REUSE verbatim.** All booking routes call through this. Do not add a new HTTP client. |
| `errors.ts` | Error hierarchy + `liteApiErrorFromResponse` (status→class map). Classes: `LiteApiAuthError`(401/403), `LiteApiTimeoutError`(408), `LiteApiRateExpiredError`(409), `LiteApiSoldOutError`(410), `LiteApiValidationError`(422), `LiteApiRateLimitError`(429), `LiteApiNetworkError`(≥500), `LiteApiUnknownError`(other), `LiteApiPaymentDeclinedError` (manual), `LiteApiWebhookSignatureError`. Each has `userMessagePl`+`internalCode`. | **REUSE.** Map prompt's domain errors onto these (no new error file needed — see §13 Q5). |
| `types.ts` | All zod schemas. `LiteApiPrebookResponse`: `data.{prebookId(req), transactionId?, secretKey?, hotelId?, rateId?, price?, currency?, cancellationPolicies?, expiresAt?}`. `LiteApiBookResponse`=`{data:LiteApiBooking}`; `LiteApiBooking.{bookingId(req),status(req),hotelConfirmationCode?,checkin,checkout,hotel,...}`. `LiteApiGuest`, `LiteApiHolder` (holder email+phone required). | **REUSE.** Note schema is non-strict (extra keys dropped). Real prebook returns more keys than typed (§8) — extend types only if a route needs them. |
| `search.ts` | `fetchHotelsList`/`searchHotels`/`resolveCountryCode` (public key, 24h cache). | Reuse for hotel summary in confirmation if needed. |
| `rates.ts` | `getRates` (public key, 15min cache). | Reuse to re-fetch rate context if a session needs refresh. |
| `hotel.ts` | `getHotelDetail`. | Reuse for hotel summary on confirmation page. |
| `places.ts` | **Phase-1 stub, returns `[]`.** | Irrelevant to booking. |
| `prebook.ts` | `prebook({rateId, clientReference})` → POST `/rates/prebook`, private, body `{offerId:rateId, clientReference, usePaymentSdk:true}`, 60s, retries:1. | **REUSE as-is.** Matches verified live contract. |
| `book.ts` | `book({prebookId, transactionId, clientReference, guests, holder})` → POST `/rates/book`, private, body `{holder, payment:{method:"TRANSACTION_ID",transactionId}, prebookId, guests, clientReference}`, 60s, retries:1. | **REUSE as-is.** |
| `payments.ts` | `getPaymentSdkConfig()`→`{scriptUrl, publishableEnv}`; types `UserPaymentSdkConfig`, `ClientSdkInitInput` (designs `returnUrl=/rezerwacja/oczekiwanie?session=…`, `cancelUrl=/hotele/rezerwacja?step=2&…`). | **REUSE the design**, but `scriptUrl` at `:24` is **404** — must be corrected (§12). |
| `webhook.ts` | `verifyWebhookSignature` (HMAC-SHA256, fail-closed, `timingSafeEqual`, secret `LITEAPI_WEBHOOK_SECRET`). | Reuse if a payment webhook is added (optional, post-MVP). |
| `retrieve.ts` | `getBooking(bookingId)` → GET `/bookings/{id}` private. | **REUSE** as the confirmation-page data source instead of a bespoke store read. |
| `cancel.ts` | `cancelBooking(bookingId)` → DELETE, private. | Out of scope (Phase 5) — document only. |
| `index.ts` | Public barrel. | Add new exports here if any new `liteapi` file is justified (none expected). |
| `client.test.ts` | 438-line fetch-mock contract suite. | Keep green; extend, don't rewrite. |

**Half-built attempt status:** the server layer is *complete and tested*, not half-built.
What is missing is exclusively the **app wiring** (routes + UI + persistence + flag).

## 4. Existing API Route Conventions to Copy

House style (verified): `export const runtime = "nodejs"`; top-of-file inline `zod`
schema; rate-limit guard as first statement; `LiteApiError` `instanceof` discrimination
mapping `internalCode`/`userMessagePl`/`status`; bracket-tag log prefixes (`[liteapi]`,
`[rate-limit]`, `[rate-cache]`).

- **`src/app/api/hotels/search/route.ts`** — `GET`; zod `QuerySchema`(`:18-28`);
  `enforceRateLimit(request,"stays-search")`(`:31-32`); response `{offers,meta}`(`:82-94`)
  with `Cache-Control: public,s-maxage=60,stale-while-revalidate=300`; **proper error
  discrimination** — `LiteApiError`→`{error:internalCode,message:userMessagePl}` at
  `err.status`(`:102-107`), else `{error:"search_failed"}` 500. **← COPY THIS PATTERN.**
- **`src/app/api/hotels/rates/route.ts`** — `POST`; zod `BodySchema`(`:15-24`);
  `{error:"invalid_body",issues}` 400 on zod fail; same `LiteApiError` mapping.
- **Anti-pattern (do NOT copy):** `src/app/api/stays/search/route.ts:48-50` and
  `flights/search/route.ts:42-44` use a blanket `catch {}` → `{error:"…"} 400`,
  swallowing all error types. Payment paths must surface
  `LiteApiRateExpiredError`/`LiteApiSoldOutError`/auth distinctly — use the **hotels/search**
  discrimination, never the stays/flights blanket catch.

Rate-limit util: `src/lib/rate-limit.ts` `enforceRateLimit(request, key)` — sliding window
20/min, Upstash, prefix `helptravel:ratelimit:${key}`; **fails open** if Upstash env unset
(keep that behavior). New booking keys (e.g. `booking-prebook`, `booking-book`) just pass a
new `key` string — no new infra.

## 5. Existing UI / Form / Validation Patterns to Reuse

- **Form library: none.** All current forms are plain React `useState` + uncontrolled
  native inputs (`booking-widget.tsx:32-35,81-119`). No react-hook-form / Formik anywhere.
  The guest-data form is **net-new**. `react-hook-form` is pre-approved by the prompt
  (`:92`) — recommend introducing it **only** in the booking subtree, not retrofitting.
- **Validation:** zod, **server-side only**, at route + LiteAPI boundary. No client-side
  schema today. Reuse zod for the new route bodies; share a schema module client↔server.
- **Toasts:** no app-wide toast lib in the booking path (`conversion-toasts.tsx` is
  homepage social-proof, unrelated). Use **inline error states**, not a toast system
  (matches house style; avoids net-new dependency).
- **Loading/skeleton:** per-section server components under
  `src/app/hotele/szukaj/_components/` (`results-skeleton.tsx`, `skeleton.tsx`,
  `results-error.tsx`). Mirror this convention for booking steps.
- **Money:** `src/lib/money.ts` — internal `bigint` minor units; `toMinor`, `fromMinor`,
  `addMinor/subMinor`, `mulMinor`, `formatMinorAsCurrency(bigint,currency,"pl-PL")`
  (SCALE=100; JPY/KWD out of scope). **REUSE — never hand-format money.**
- **Rate helpers:** `src/lib/hotels/normalize.ts` — `rateTotalMinor`, `rateCurrency`,
  `isFreeCancellation`, `rateCancellationDeadline`, `nightsBetween`, `normalizeOffer`.
  Reuse for price/cancellation display in the booking summary.

## 6. Environment & Secrets Status

`.env.local` (main folder) — verified key presence (values not printed):

| Var | Status | Note |
|---|---|---|
| `LITEAPI_PROD_PRIVATE_KEY` | **SET** `prod_…` len41 | ✅ valid for booking (live-probed 200) |
| `LITEAPI_PROD_PUBLIC_KEY` | **SET** `prod_…` len48 | widget publishable key (HMAC); **must NOT feed `X-API-Key`**; needs `NEXT_PUBLIC_` alias for the widget (§8) |
| `LITEAPI_SANDBOX_KEY` | **SET** `sand_…` len41 | |
| `LITEAPI_PROD_KEY` | **UNSET** | ← root cause input |
| `LITEAPI_SANDBOX_PRIVATE_KEY` | **UNSET** | ← root cause input |
| `LITEAPI_ENV` | **UNSET** | ← **root cause**: absent ⇒ booking key resolves to sandbox key ⇒ 401 |
| `LITEAPI_BASE_URL` / `LITEAPI_BOOK_BASE_URL` | SET | correct hosts |
| `LITEAPI_WEBHOOK_SECRET` | SET | |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | SET | persistence available |
| `PII_ENCRYPTION_KEY` | **UNSET** (in `.env.example:67-69`) | needed before persisting guest PII |
| `BOOKING_FLOW_MODE` / any `FEATURE_*` | **does not exist** | first feature flag to be introduced |

**Required env actions (no code; human/Vercel):**
1. **Fix the 401 root cause** — set **`LITEAPI_ENV="production"`** *or* set
   **`LITEAPI_PROD_KEY=<the prod private key value>`** locally **and** in Vercel. This
   makes `getEnv` route the prod private key to `book.liteapi.travel`. (Recommended:
   `LITEAPI_ENV="production"` — single switch, leverages the already-present
   `LITEAPI_PROD_PRIVATE_KEY`.)
2. Add **`NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY`** (= the publishable key) for the widget
   (browser-exposed) — to be added to `.env.example` + Vercel **in Phase 3**, not now.
3. Add **`BOOKING_FLOW_MODE`** (default `disabled`) — Phase 1.
4. Set **`PII_ENCRYPTION_KEY`** only if Phase-4 Postgres PII persistence is chosen
   (the Redis-only design in §7 avoids this).

Env booking var set (existing + new): `LITEAPI_PROD_PRIVATE_KEY`, `LITEAPI_ENV`,
`LITEAPI_BOOK_BASE_URL`, `LITEAPI_WEBHOOK_SECRET`, `UPSTASH_REDIS_REST_URL/_TOKEN`
(existing); `NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY`, `BOOKING_FLOW_MODE` (new).

## 7. Persistence Layer Decision & Key Schema

**Available:** Prisma/Postgres (`prisma/schema.prisma`, models are session-centric:
`AnonymousSession`, `TripRequest`, `Destination`, `DestinationScore`, `ItineraryResult`,
`SavedTrip`, `AffiliateClick`, `Event` — **no `Booking`/`Payment`/`Guest` model**) and
Upstash Redis (used today only by `rate-limit.ts` and `hotels/rate-cache.ts`,
fail-soft, key prefixes `helptravel:ratelimit:` / `htr:v1:`). No `booking:` keys anywhere.

**Decision: Upstash Redis for booking session + records (no new infra, no Prisma
migration, no `PII_ENCRYPTION_KEY` dependency for MVP).** Reuse the Upstash client
construction pattern from `src/lib/hotels/rate-cache.ts` (do not add a new Redis client).

**Key schema:**
```
booking:session:<sessionId>    -> { prebookId, transactionId, offerId, hotelSummary,
                                     rateSummary, priceMinor, currency, createdAt }
                                  TTL = 1800s (see ⚠ below — prebook has NO expiresAt)
booking:completed:<bookingId>  -> full LiteApiBooking + holder/guests   TTL = 90 days
booking:failed:<sessionId>     -> recovery record (prebookId, transactionId, attempted
                                   holder/guests, error code, ts)        TTL = 90 days
booking:idem:<idempotencyKey>  -> cached route response                  TTL = 300s
```
> ⚠ **`expiresAt` does NOT exist in the real prebook response** (live-verified §8). The
> prompt's "TTL = prebook expiresAt" is **unimplementable as written**. Decision: fixed
> conservative session TTL **1800s** (LiteAPI documents prebook validity ~15–30 min).
> Confirm exact TTL with LiteAPI support — §13 Q2.

`transactionId` is **server-only** (kept in `booking:session`, never returned to client).

## 8. LiteAPI Widget JS API (verified, not guessed)

> **CONFIRMED BY LITEAPI SUPPORT — 2026-05-19 (Q1 RESOLVED):**
> The widget is **redirect-only**. Pattern: `new LiteAPIPayment(config)` →
> `handlePayment()` → user enters card → **LiteAPI redirects the browser to our
> `returnUrl`**. There are **no JS success/failure callbacks** and `handleReturn()`
> is a no-op (as decoded). **LiteAPI does NOT append query params** to `returnUrl`
> automatically — we must smuggle our own `sessionId` into the `returnUrl` we
> pass in. Provider underneath is **Stripe** (prebook `secretKey` = `pi_…`
> PaymentIntent client secret; confirmed Phase 1 smoke). Integration contract
> therefore: server prebook → client widget with
> `returnUrl=<site>/hotele/rezerwacja/return?sid=<sessionId>` → on redirect, our
> return page server-side calls `/api/booking/book`. This supersedes the
> prompt's "wire success callback" wording. Q1 is closed; Phase 3 unblocked.

> **CORRECTION — `publicKey` contract (LiteAPI support, 19 May 2026, B4):**
> The widget `config.publicKey` is an **ENVIRONMENT FLAG**, not an API key.
> Valid values: the literal string **`"live"`** (production) or **`"sandbox"`**
> (testing). Our LiteAPI API public key (`prod_pu…`) is used **only**
> server-side (HMAC, `/config`/auth) and is **NEVER** passed to the widget.
> Our earlier interpretation in this section (treating `publicKey` as the
> `prod_` publishable key, e.g. line "LiteAPI publishable key") was **WRONG**:
> passing the `prod_pu…` key made `handlePayment()` POST it to
> `https://payment-wrapper.liteapi.travel/config`, which rejected it as an
> invalid environment flag → **HTTP 400**, widget never initialized (skeleton
> placeholders rendered instead of the Stripe form). The widget also requires
> **`targetElement`** (CSS selector of the mount container) — already present
> in our component as `#payment-element`. **Fixed in commit `a578c73`**
> (`page.tsx` now passes `getLiteApiWidgetEnv()` → `"live"|"sandbox"`).
>
> Corrected production config (LiteAPI's own example, 19 May 2026):
> ```js
> const liteAPIConfig = {
>   publicKey: "live",                 // env flag — "live" | "sandbox"
>   targetElement: "#payment-element", // mount container (widget replaces it)
>   secretKey: "pi_..._secret_...",    // prebook PaymentIntent client secret
>   returnUrl: "https://<site>/hotele/rezerwacja/return?sid=<sessionId>",
>   appearance: { theme: "flat" },
>   options: { business: { name: "helptravel.pl" } },
> };
> new LiteAPIPayment(liteAPIConfig).handlePayment();
> ```

Fetched **`https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1`** →
**HTTP 200**, 2322 B, `application/javascript`. (The URL in `payments.ts:24`,
`…/dist/liteapi-payment.js`, returns **HTTP 404** — broken, must be corrected, §12.)

**Decoded API surface (exact, from the minified source):**
- Global: **`window.LiteAPIPayment`** — a class.
- Construct: **`new LiteAPIPayment(config)`**, `config` shape (defaults):
  ```js
  { publicKey: "",            // ENV FLAG "live"|"sandbox" (NOT the prod_ key — see CORRECTION above, B4)
    secretKey: "",            // prebook.secretKey — if set, skips amount→key fetch
    options: {},
    targetElement: "#payment-element",
    returnUrl: "",            // browser is redirected here by the provider
    amount: 0, currency: "",
    submitButton: { text: "Pay" } }
  ```
- Methods: **`handlePayment()`** (async) — POSTs `{publicKey}` to
  `https://payment-wrapper.liteapi.travel/config` to get
  `{publicKey, provider:{origin,name,className,cssFile,jsFile}}`; if `secretKey===""`
  it POSTs to `https://payment-wrapper.liteapi.travel/payment-key`; then injects the
  provider css/js and runs `new window[provider.className](publicKey, config).handlePayment()`.
  **`handleReturn()`** — async, **EMPTY no-op in this build.**
- `getConfig()` throws `"no public key"` if `config.publicKey` is empty.
- **Error handling: `handlePayment` wraps everything in `try{…}catch(e){}` — errors are
  silently swallowed. There is NO `onSuccess`/`onError`/`onComplete` callback in this
  build.**

**Critical implication:** the SDK is a **redirect-based (Stripe-style) flow** keyed on
`returnUrl` — **not** the callback model the prompt's "Pattern A" describes
(`BOOKING_FLOW_PROMPT.md:62` "after the widget success callback"). Success must be
detected by our **`returnUrl` landing page** (`/rezerwacja/oczekiwanie?session=…`,
already anticipated by `payments.ts:37`), which then calls our book endpoint — not by a
JS callback. **CSP impact:** `next.config.ts` must allow `connect-src`/`script-src` for
`payment-wrapper.liteapi.travel` **and** the dynamically-loaded provider host (e.g.
Stripe). This is unknowable until we see `provider.jsFile` at runtime → §13 Q1/Q3.

## 9. Target UX Flow

Aligned with the existing `payments.ts` URL design (redirect model, §8):

```
[/hotele/[hotelId]] "Wybierz" (existing <Link>)
        │  ?hotelId&offerId&<searchQuery>
        ▼
[/hotele/rezerwacja]  (NEW — single page, 2 steps via ?step)
  step 1: guest form (holder: firstName,lastName,email,phone[req];
          guest[] firstName/lastName per occupancy; nationality default PL)
        │  submit → POST /api/booking/prebook  (Idempotency-Key UUID)
        │   • disabled-mode → 503 {error:'booking_disabled'} → render "Wkrótce dostępne"
        │   • ok → { sessionId, secretKey, hotelSummary, rateSummary }
        ▼
  step 2: payment — render <Script> liteAPIPayment.js (afterInteractive),
          new LiteAPIPayment({publicKey:NEXT_PUBLIC_…, secretKey, amount,
          currency, returnUrl:/rezerwacja/oczekiwanie?session=<id>,
          targetElement:'#payment-element'}).handlePayment()
        │  provider redirects browser → returnUrl
        ▼
[/rezerwacja/oczekiwanie?session=<id>]  (NEW — return landing)
        │  POST /api/booking/book { sessionId } (server reads txnId from session)
        │   success → 303 → /rezerwacja/<bookingId>
        │   book-failed-after-pay → /rezerwacja/<id>/blad-krytyczny
        ▼
[/rezerwacja/<bookingId>]  (NEW — confirmation; data via GET /api/booking/<id>
                            → liteapi getBooking())
```
Error classes → Polish inline messages (mapping table lives in code, Phase 3). Disabled
mode (default) short-circuits at step 1 with a friendly "Wkrótce dostępne" — **this alone
fixes the visible bad UX**.

## 10. Risk Register

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| R1 | Payment succeeds, `/rates/book` fails | **HIGH** | `[liteapi][booking][CRITICAL]` log + `booking:failed:` Redis (90d) + user message that does NOT claim success + `recoveryId`. Never silent. |
| R2 | Double-submit → double prebook → double charge | **HIGH** | `Idempotency-Key` (UUID per form mount) cached in `booking:idem:` 300s; disable submit while in-flight; one prebook per session. |
| R3 | **No prebook `expiresAt`** in real response | **HIGH** | Cannot TTL on provider value. Fixed 1800s session TTL; on `book` LiteAPI returns 409 `LiteApiRateExpiredError` → user re-prebooks. Confirm true TTL w/ LiteAPI (§13 Q2). |
| R4 | **Widget has no JS success callback** (redirect-only, `handleReturn` no-op) | **HIGH** | Drive completion from `returnUrl` landing page, not a callback. Confirm contract w/ LiteAPI (§13 Q1). |
| R5 | Prebook expires between widget render and book | MED | R3 mitigation; surface 409 clearly; offer re-prebook. |
| R6 | User abandons after prebook (held inventory cost) | MED | Session auto-expires (Redis TTL); no compensating call available — document, accept for MVP. |
| R7 | RODO/GDPR — guest data storage/retention/lawful basis | MED | Redis-only, 90d TTL, lawful basis = contract performance; document in `docs/booking-flow.md` (Phase 4). No PII in logs (`client.ts` already redacts). |
| R8 | IP/UA capture accuracy on Vercel | LOW | `x-forwarded-for` / `x-vercel-ip-country` / `user-agent`; best-effort, non-blocking. |
| R9 | No email confirmation in MVP | MED | Confirmation = on-screen `/rezerwacja/<id>` page + "skontaktuj się z nami" mailto. Document who informs the user. (§13 Q4) |
| R10 | CSP blocks payment-wrapper / provider host | MED | Update `next.config.ts` CSP in Phase 3 once `provider.jsFile` host is known. |
| R11 | New `react-hook-form` dependency | LOW | Pre-approved (`prompt:92`); confined to booking subtree. |

## 11. Files I Plan to Create (with justification per file)

> Every file answers: "why doesn't an existing pattern cover this?" Server LiteAPI layer
> is fully reused (§3); these are exclusively the missing app wiring.

| Path | Justification (Phase) |
|---|---|
| `src/lib/config/featureFlags.ts` | No feature-flag infra exists (§6). `getBookingFlowMode()` (`disabled`\|`live`, default `disabled`). Single net-new module. (P1) |
| `src/lib/booking/session.ts` | Upstash session/record helpers + key builders (§7). Reuses the `rate-cache.ts` Redis client pattern; no new client. (P2) |
| `src/lib/booking/errors-map.ts` *(only if needed)* | Map `LiteApiError` subclasses → user Polish strings/HTTP. Prefer reusing `errors.ts.userMessagePl` directly; create only if route mapping is non-trivial. (P1, conditional) |
| `src/app/api/booking/prebook/route.ts` | No booking route exists. Copies `hotels/search` conventions. (P2) |
| `src/app/api/booking/book/route.ts` | Critical endpoint; reuses `book()`+session. (P2) |
| `src/app/api/booking/[bookingId]/route.ts` | Confirmation data; thin wrapper over `getBooking()` (`retrieve.ts`). (P2) |
| `src/app/hotele/rezerwacja/page.tsx` (+ `_components/*`) | The missing destination + guest form + widget mount. (P3) |
| `src/app/rezerwacja/oczekiwanie/page.tsx` | `returnUrl` landing that triggers `/api/booking/book` (redirect model, §8). (P3) |
| `src/app/rezerwacja/[bookingId]/page.tsx` | Confirmation screen. (P3) |
| `src/app/rezerwacja/[bookingId]/blad-krytyczny/page.tsx` *(or query state)* | R1 paid-but-book-failed page. (P3) |
| `src/components/booking/payment-sdk.tsx` | Client component: `<Script>` + `new LiteAPIPayment(...)`. (P3) |
| `scripts/booking-smoke.ts` | Real prebook smoke (no `/rates/book`); `pnpm booking:smoke`. (P1) |
| `src/lib/booking/*.test.ts`, route/client tests | Coverage; appended to `package.json` test list. (P1–P3) |

> Route prefix note: prompt Phase 2 specifies `/api/booking/*`; house style is
> `/api/hotels/*`. Following the **prompt's explicit** `/api/booking/*` — flagged as a
> minor deviation from the house `/api/hotels/*` prefix (§13 Q6).

## 12. Files I Plan to Modify (with justification + minimal diff sketch)

| Path | Why | Minimal diff sketch |
|---|---|---|
| `src/lib/liteapi/payments.ts` | `scriptUrl` `:24` is **404**; correct to the verified working URL; align config shape with the decoded widget API (§8). | `- scriptUrl:"…/dist/liteapi-payment.js"` → `+ scriptUrl:"https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1"` |
| `next.config.ts` | CSP must allow `payment-wrapper.liteapi.travel` + provider host for the widget (R10). | add hosts to `script-src`/`connect-src`/`frame-src` (Phase 3, once provider host known) |
| `package.json` | Append new `*.test.ts` to the non-globbed `test` script; add `booking:smoke` script. | `+ src/lib/booking/session.test.ts …`; `+ "booking:smoke":"node --env-file=.env.local --import tsx scripts/booking-smoke.ts"` |
| `.env.example` | Document `NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY`, `BOOKING_FLOW_MODE`, and the `LITEAPI_ENV=production` requirement for booking. | add documented keys w/ comments (Phase 1/3) |
| `src/lib/liteapi/index.ts` | Only if a justified new `liteapi` file is added (none expected). | conditional |

**Not modified:** `rooms-section.tsx` (its `/hotele/rezerwacja` link is already correct —
the route just needs to exist); `searchLiteApiStays`/`/hotele` search/price-store;
homepage; `hotellook.ts`; any passing test. Per prompt rule 5.

## 13. Open Questions

- **Q1 (BLOCKER-class):** The shipped widget (`liteAPIPayment.js?v=a1`) exposes **no
  success/failure JS callback** and `handleReturn()` is a no-op — it is **redirect-only
  via `returnUrl`**. The prompt's Pattern A ("wire success callback → POST
  `/api/booking/book`", `:62`) does not match the shipped artifact. **Confirm with
  LiteAPI:** is the integration contract (a) redirect to `returnUrl` then we call
  `/rates/book` server-side, or (b) is there a callback build / a different script
  version? Phase 3 cannot be finalized without this.
- **Q2:** Real prebook response has **no `expiresAt`** (verified). What is the actual
  prebook validity window, and is TTL ever returned (header? `termsAndConditions`?)?
  Needed to set `booking:session` TTL precisely (§7, R3).
- **Q3:** What payment provider/host does `…/config` return for our prod account
  (`provider.jsFile`/`cssFile` origin)? Determines exact CSP entries (R10).
- **Q4:** MVP has no email (RESEND is Phase 5). Is on-screen confirmation +
  `recoveryId` + support mailto an acceptable "we tell the user"? (R9)
- **Q5:** Prompt §Phase1.3 lists domain error codes (`PREBOOK_EXPIRED`,
  `BOOK_FAILED_AFTER_PAYMENT`, …). `errors.ts` already has an equivalent taxonomy.
  Approve **reusing `errors.ts` codes** instead of a parallel `booking-errors.ts`?
- **Q6:** Confirm route prefix: prompt says `/api/booking/*`, house style is
  `/api/hotels/*`. Keep `/api/booking/*` (prompt-explicit) — confirm acceptable.
- **Q7:** `LITEAPI_ENV` is unset, so even fixing booking risks switching *search* to a
  prod key. Confirm desired final env: `LITEAPI_ENV="production"` for the whole app, or a
  booking-only key override? (Recommend whole-app `production`.)
- **Q8:** Cancellation/refund explicitly out of scope (Phase 5) — confirm "email support
  → human contacts LiteAPI" is the accepted interim.

## 14. Estimated Effort per Phase

| Phase | Scope | Est. |
|---|---|---|
| **0** | This audit | ✅ done |
| **1** | `featureFlags.ts`, reuse-map booking errors, `BOOKING_FLOW_MODE`, `booking-smoke.ts`, unit tests (server layer already exists+tested → light) | ~0.5 day |
| **2** | 3 API routes (prebook/book/[bookingId]) + `booking/session.ts` + idempotency + rate-limit keys + route tests | ~1.5 days |
| **3** | `/hotele/rezerwacja` + guest form (new `react-hook-form`) + payment-sdk component + return/confirmation/critical pages + CSP + PL error map + tests. **Gated on Q1.** | ~2.5–3 days |
| **4** | `docs/booking-flow.md`, real end-to-end test (human, real card), prod enable, benchmark | ~0.5 day + human test |

**Phase 3 is the long pole and is blocked on Q1 (widget contract).** Phases 1–2 are
safe to proceed and do not depend on the open questions except Q5–Q7 (env/error
naming — low risk).

---

_End of Phase 0 audit. No production code written. Awaiting `proceed phase 1`._
