# Booking Flow — Progress Log

Branch: `phase-1-purge-affiliate-pivot` (deployed `/hotele` architecture).
Append-only. One section per phase. STOP after each phase for `proceed phase N`.

---

## Phase 0 — Discovery & Audit ✅ (2026-05-18)

Deliverable: `BOOKING_AUDIT.md` (14 sections). Commit `d638d23`, pushed
(`887e466..d638d23`). Tests 66/66. No production code. Headline: booking flow
is *missing*, not broken; LiteAPI server layer fully built+tested but unwired;
"401" is an env-config gap (verified live: prod private key → prebook 200).

User decisions after Phase 0: (1) approve, build-mode, reuse server layer;
(2) fix env config before P1 + document; (3) Upstash for sessions, fixed 1800s
TTL; (4) Q1 → LiteAPI support, P3 on hold, P1/P2 proceed; (5) answer Q3/Q4/Q7
briefly + safe defaults, stop only if a decision is needed.

---

## Phase 1 — Server Booking Client ✅ (2026-05-18)

### Summary
Thin, tested server facade over the **existing** `prebook()`/`book()` wrappers
(no HTTP reimplementation), plus booking-domain error mapping, the first
feature flag, a real prebook smoke script, and the env-config fix. Zero UI.
No user-facing behavior changed (`BOOKING_FLOW_MODE` defaults `disabled`).

### Commits
- `feat(booking): BOOKING_FLOW_MODE feature flag`
- `feat(booking): liteapi booking client + domain error mapping`
- `test(booking): booking client unit tests + test runner registration`
- `chore(booking): real prebook smoke script (no /rates/book)`
- `chore(booking): document booking env + B1 blocker`
- `docs(booking): phase 1 progress log`
(hashes appended at push)

### Files created (7)
- `src/lib/config/featureFlags.ts` — `getBookingFlowMode()` / `isBookingLive()`, default `disabled`.
- `src/lib/liteapi/booking-errors.ts` — `BookingError`, `BookFailedAfterPaymentError`, `toBookingError()`, `BookingErrorCode`. Reuses `errors.ts`; does **not** redefine its taxonomy.
- `src/lib/liteapi/booking.ts` — `prebookHotel()` / `bookHotel()` facade; structured `[liteapi][booking]` logging; `[CRITICAL]` post-payment guarantee.
- `src/lib/liteapi/booking.test.ts` — 6 tests (fetch-mocked).
- `scripts/booking-smoke.ts` — live prebook smoke, never books.
- `BOOKING_BLOCKERS.md` — B1 (Vercel `LITEAPI_ENV`), B2 (Q1 P3 hold).
- `BOOKING_PROGRESS_LOG.md` — this file.

### Files modified (outside the new booking surface)
- `src/lib/liteapi/index.ts` — additive re-exports of the new booking facade + error map (barrel pattern; no behavior change to existing exports).
- `package.json` — registered `booking.test.ts` in the (non-globbed) `test` script; added `booking:smoke`.
- `.env.example` — documented `LITEAPI_ENV="production"` as the booking requirement, `LITEAPI_PROD_PUBLIC_KEY` as HMAC/widget key (NOT `X-API-Key`), `BOOKING_FLOW_MODE`.
- `.env.local` (gitignored, local only) — appended `LITEAPI_ENV="production"` + `BOOKING_FLOW_MODE="disabled"` (env-config fix, decision #2 / B1).

### Pre-existing behavior changed
None. `prebook.ts`/`book.ts`/`client.ts`/search/`/hotele`/homepage/`hotellook.ts` untouched. No pre-existing test modified.

### Tests
`pnpm test` → **72 passed, 0 failed** (66 pre-existing all green + 6 new booking).
`tsc --noEmit`: no errors in any booking file (pre-existing `tmp/repro-*.ts`
scratch errors are untracked, out of scope, **not committed**).
`eslint` on all new files: 0 problems.

### `pnpm booking:smoke` — live, sanitized
```
Barcelona / 2026-06-17 → 2026-06-20 / 2 adults
hotels: 8 ; offerId: 948-char opaque token
PREBOOK OK:
  prebookId:     vqa6xSjF… (9 chars)
  transactionId: PRESENT  tr_ct_… (27 chars)
  secretKey:     PRESENT  pi_3…   (60 chars)   ← Stripe PaymentIntent secret
  expiresAt:     (none — not returned by LiteAPI; Q2)
  price:         2878.92 PLN
DONE — no reservation created, nothing charged.
```

### Deviations from the prompt (with rationale)
1. **No new `booking.ts` HTTP client; reused `prebook.ts`/`book.ts` as-is.** The
   prompt's Phase 1 task 1 describes building `prebookHotel`/`bookHotel`; the
   audit (and decision #1) established these already exist as `prebook()`/
   `book()`. Per the "reuse 200%" rule, `booking.ts` is a **thin facade** that
   delegates, not a duplicate client.
2. **Timeouts kept at the existing 60s** (prompt suggested 10s prebook / 30s
   book). Changing the battle-tested wrappers would risk the `client.test.ts`
   contract and 60s is safer for slow OTA booking (the live prebook took ~22s —
   a 10s timeout would have failed it). Accepted deviation; reuse-as-is per
   decision #1. (The 22s latency itself is flagged for Phase 4 benchmarking.)
3. **`getPrebookStatus()` omitted.** Prompt marks it "optional … for
   completeness"; no existing `GET /prebooks/{id}` wrapper, endpoint unverified
   (NON-NEGOTIABLE RULE 7 — no guessing). Not needed by Phase 2/3. Will add iff
   a later phase requires it.
4. **`booking-errors.ts` defines its own domain enum** rather than extending
   `errors.ts`'s closed `LiteApiErrorCode` union — avoids modifying the shared
   error file (don't-refactor rule). Prompt explicitly permitted a minimal
   error file (Q5 resolved: reuse + translate).

### Open questions — brief answers + safe defaults (decision #5)
- **Q2 (prebook TTL):** confirmed *absent* from the live response again. Safe
  default per decision #3: fixed **1800s** session TTL. Awaiting LiteAPI.
- **Q3 (payment provider / CSP host):** smoke shows `secretKey` = `pi_…` →
  **provider is Stripe**. Phase-3 CSP will need `js.stripe.com` (script-src) and
  `api.stripe.com` + `payment-wrapper.liteapi.travel` (connect-src), plus
  Stripe frame hosts. No decision needed now; finalize in Phase 3.
- **Q4 (no email in MVP):** safe default — on-screen confirmation page +
  `recoveryId` + support `mailto:` is the user-notification mechanism for MVP.
  RESEND/email deferred (Phase 5). No blocker; revisit if you want email in MVP.
- **Q7 (LITEAPI_ENV scope):** resolved by decision #2 → whole-app
  `LITEAPI_ENV="production"`. Search/rates also use the prod private key —
  verified working in Phase 0 (hotels list + rates + prebook all 200), no
  regression. Documented in `.env.example` + B1.
- **Q1 (widget callback):** unchanged — Phase 3 on hold (B2), Phases 1–2 proceed.
- **Q5/Q6:** Q5 resolved (reuse `errors.ts` + translate). Q6 (route prefix
  `/api/booking/*` vs house `/api/hotels/*`) deferred to Phase 2 start.

### Blockers
- **B1 (HIGH, human):** add `LITEAPI_ENV=production` to **Vercel** (Production +
  Preview) before any deploy. Fixed locally; see `BOOKING_BLOCKERS.md`.
- **B2 (HIGH for P3):** Q1 awaiting LiteAPI support. Does not block P1/P2.

### Ready for Phase 2
**Yes.** Server client + flag + errors are in place and tested. Phase 2 (API
routes + Upstash session + idempotency) is independent of B1 (local) and B2.
Will confirm Q6 (route prefix) at Phase 2 start.

**STOP — awaiting `proceed phase 2`.** → received `proceed phase 2`.

---

## Phase 2 — API Routes ✅ (2026-05-19)

### Summary
Three `/api/booking/*` routes + Upstash session/record/idempotency store.
Conventions copied from `api/hotels/search` (runtime, zod, rate-limit-first,
typed-error discrimination). Flag-gated (`disabled`→503). Critical-path
(paid-but-book-failed) persists a recovery record + returns a non-success
message. No pre-existing route behavior changed.

### Commits
- `feat(booking): rate limiter — booking keys + 10/min override + test seam`
- `feat(booking): upstash booking session + idempotency store`
- `feat(booking): POST /api/booking/prebook (flag, zod, rate-limit, session)`
- `feat(booking): POST /api/booking/book critical-path + recovery record`
- `feat(booking): GET /api/booking/[bookingId] confirmation data`
- `test(booking): api route tests + runner registration`
- `docs(booking): phase 2 progress log`
(hashes appended at push)

### Files created (5)
- `src/lib/booking/session.ts` — `saveSession`/`getSession`/`deleteSession`,
  `saveCompleted`/`getCompleted`, `saveFailed`, `getIdempotent`/`setIdempotent`,
  `isSessionExpired`, key schema `booking:v1:{session|completed|failed|idem}:*`,
  test seam. Reuses the `rate-cache.ts` Redis-client pattern; **strict** error
  semantics on payment paths (idempotency stays best-effort).
- `src/app/api/booking/prebook/route.ts` — POST; flag→503, rate-limit
  `booking-prebook` (10/min), zod, `prebookHotel()`, persists session,
  idempotency. Returns `{sessionId, secretKey, expiresAt, hotelSummary,
  rateSummary}`. **`transactionId` never returned to client.**
- `src/app/api/booking/book/route.ts` — POST; critical path. 410 on
  missing/expired session; on book failure persists `booking:failed:` +
  returns `502 {error:'book_failed', recoveryId}` (never claims success).
- `src/app/api/booking/[bookingId]/route.ts` — GET; client-safe fields only;
  404 if absent; **not** flag-gated (confirmations stay viewable).
- `src/app/api/booking/booking-routes.test.ts` — 8 tests.

### Files modified (outside the new booking surface)
- `src/lib/rate-limit.ts` — **minimal additive** extension: added
  `booking-prebook`/`booking-book` to `LimiterKey`, a `LIMIT_OVERRIDES` map
  (booking = 10/min; **all existing keys unchanged at 20/min**), and a
  test-only seam. No existing logic restructured (not a refactor).
- `package.json` — registered `booking-routes.test.ts` in the test script.

### Pre-existing behavior changed
None. Verified by curl: `/api/hotels/search` still returns its normal `400
invalid_query` (not 500); existing limiter keys keep 20/min. Full suite green.

### Tests
`pnpm test` → **80 passed, 0 failed** (72 prior all green + 8 new route tests).
`tsc --noEmit`: zero errors in any booking/rate-limit file (pre-existing
`tmp/repro-*.ts` errors are untracked, out of scope, not committed).
`eslint` new/modified files: 0 problems.

### Curl acceptance (local dev, `BOOKING_FLOW_MODE=disabled`)
```
POST /api/booking/prebook  → 503 {"error":"booking_disabled","message":"Wkrótce dostępne"}
POST /api/booking/book     → 503
GET  /api/booking/unknown  → 404 {"error":"not_found"}   (route live, Upstash reachable)
GET  /api/hotels/search    → 400  (unchanged — existing endpoint unaffected)
```
Live happy-path (prebook→sessionId+secretKey→book) is proven by the 8 unit
tests + Phase-1 `pnpm booking:smoke`; per the prompt the flag is flipped to
`live` only at Phase 4, so a live curl/Upstash-dashboard check is deferred to
the Phase 4 end-to-end (B1 — Vercel env — also lands then).

### Decisions applied / deviations
- **Q6 resolved:** routes use `/api/booking/*` per the prompt's explicit Phase 2
  spec (documented minor deviation from the house `/api/hotels/*` prefix).
- **Rate limit 10/min** honored via the additive `LIMIT_OVERRIDES` rather than
  a duplicate limiter or a refactor of `rate-limit.ts` (reuse-first).
- **Idempotency** caches terminal responses (prebook 200; book 200 **and** the
  502 book_failed) so a double-submit never re-calls LiteAPI with the same
  transaction. Validation/expired (pre-LiteAPI, cheap) are not cached.
- **Stripe / CSP (decision #3):** Phase-1 smoke `secretKey` = Stripe `pi_…`.
  **Phase 3 CSP (`next.config.ts`) must allow `js.stripe.com` (script-src),
  `api.stripe.com` + `payment-wrapper.liteapi.travel` (connect-src), and
  Stripe frame hosts.** Recorded here for Phase 3; aligns with Q1 hypothesis
  that the LiteAPI widget wraps Stripe.
- **Email (decision #2):** no MVP email — `book_failed` message carries the
  support `mailto` + `recoveryId`; confirmation is the on-screen page (P3).
- **B1 (decision #1):** `LITEAPI_ENV=production` to be set in Vercel by you
  before the Phase 4 deploy (still OPEN in BOOKING_BLOCKERS.md).

### Blockers
- **B1 (HIGH, human, deploy-time):** Vercel `LITEAPI_ENV=production` — unchanged.
- **B2 (HIGH for P3):** Q1 widget contract — awaiting LiteAPI. **P3 stays on
  hold; P2 is complete and unaffected.**

### Ready for Phase 3
Server + API layer complete and tested. **Phase 3 is gated on B2 (Q1 — LiteAPI
widget contract).** Do not start Phase 3 until LiteAPI confirms the
redirect-vs-callback model.

**STOP — awaiting `proceed phase 3` (and B2/Q1 resolution).**
