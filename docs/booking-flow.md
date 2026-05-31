# Hotel Booking Flow (LiteAPI Payments)

How online hotel booking with card payment works on helptravel.pl, how to
operate it, and how to recover a paid-but-unbooked reservation.

Branch of record: `phase-1-purge-affiliate-pivot`. Provider: **LiteAPI**
(booking host `book.liteapi.travel`) with **Stripe** as the payment processor
behind LiteAPI's Payment SDK. We are **never** merchant of record and **never**
touch card data (PCI scope = SAQ-A).

---

## 1. Architecture (end to end)

```
/hotele/[hotelId]  (server; reads BOOKING_FLOW_MODE)
  rooms CTA:
    flag=disabled → inert <span> "Wkrótce dostępne"   (no API, no 401)
    flag=live     → <Link> "Zarezerwuj" → /hotele/rezerwacja?offerId&hotelId&checkin&checkout&price&cur&board
        │
        ▼
/hotele/rezerwacja  (server; re-checks flag; getHotelDetail for name)
  └─ ReservationForm (client): holder + guests, Idempotency-Key (UUID)
        │  POST /api/booking/prebook  {offerId, hotel, rate, holder, guests}
        │       • rate-limit booking-prebook (10/min/IP)
        │       • prebookHotel() → LiteAPI POST book.liteapi.travel/v3.0/rates/prebook (usePaymentSdk:true)
        │       • Upstash SET booking:v1:session:<sid>  (holder/guests/transactionId/secretKey…)  TTL 1800s
        │       • returns { sessionId, secretKey, expiresAt, hotelSummary, rateSummary }
        │         (transactionId is NEVER sent to the browser)
        ▼
  LiteAPIPayment widget (payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1)
    new LiteAPIPayment({ publicKey: NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY,
                         secretKey, returnUrl: <site>/hotele/rezerwacja/return?sid=<sid>,
                         targetElement:'#payment-element', amount, currency }).handlePayment()
        │  user enters card in Stripe-hosted fields → LiteAPI REDIRECTS browser
        ▼
/hotele/rezerwacja/return?sid=<sid>  (server; loading.tsx skeleton while it runs)
  └─ POST /api/booking/book  { sessionId: sid }   header Idempotency-Key: sid
        • loads booking:v1:session:<sid> → holder/guests/transactionId
        • 410 if missing/expired → "Sesja wygasła, spróbuj ponownie"
        • bookHotel() → LiteAPI POST /rates/book {prebookId, payment:{TRANSACTION_ID}, …}
        • SUCCESS → Upstash SET booking:v1:completed:<bookingId> (90d); DEL session
                    → render "Rezerwacja potwierdzona" + bookingId + confirmationCode
        • FAILURE → Upstash SET booking:v1:failed:<sid> (90d); [CRITICAL] log
                    → render "Rezerwacja wymaga potwierdzenia" + recoveryId(sid) + mailto
```

Idempotency: the form generates a UUID `Idempotency-Key` (regenerated only on a
retry after error). The return page uses `sid` itself as the `Idempotency-Key`
on `/api/booking/book`, so a reload or a double redirect returns the cached
result — **LiteAPI `/rates/book` is never called twice for one payment**.

Why guest data is in the session: the redirect return URL only carries `sid`
(LiteAPI confirmed it does not append params and exposes no JS callback —
BOOKING_AUDIT.md §8). Holder/guests are collected before payment and stored in
the session so the return page can finalize with `sid` alone.

---

## 2. Feature flag — enable / disable

`BOOKING_FLOW_MODE` (env), read by `src/lib/config/featureFlags.ts`
(`getBookingFlowMode()` / `isBookingLive()`). Values: `disabled` (default) | `live`.

- **disabled** (default everywhere until go-live): rooms CTA shows "Wkrótce
  dostępne"; `/hotele/rezerwacja` shows a friendly panel; `POST
  /api/booking/{prebook,book}` return `503 {error:'booking_disabled'}`. No
  LiteAPI calls, no 401. This is the safe, shippable default.
- **live**: full flow runs.

### To enable in production (run AFTER a successful preview e2e)

Prerequisites in **Vercel → Environment Variables** (Production **and**
Preview) — see BOOKING_BLOCKERS.md **B1**:

1. `LITEAPI_ENV=production` — without it the private key resolves to the
   sandbox key against `book.liteapi.travel` → **401**.
2. `NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY` = same value as
   `LITEAPI_PROD_PUBLIC_KEY` (browser-exposed; the widget throws "no public
   key" without it).
3. `LITEAPI_PROD_PRIVATE_KEY`, `UPSTASH_REDIS_REST_URL`/`_TOKEN` (already set).

Then set `BOOKING_FLOW_MODE=live` (Production) and redeploy. To roll back:
set `BOOKING_FLOW_MODE=disabled` and redeploy — instant, no code change.

---

## 3. Upstash key schema

| Key | Contents | TTL |
| --- | --- | --- |
| `booking:v1:session:<sessionId>` | prebookId, **transactionId** (server-only), secretKey, offerId, price/currency, hotelSummary, rateSummary, **holder**, **guests**, createdAt | 1800 s |
| `booking:v1:completed:<bookingId>` | bookingId, confirmationCode, status, hotelSummary, rateSummary, price/currency, createdAt | 90 days |
| `booking:v1:failed:<sessionId>` | sessionId, prebookId, transactionId, holder, guests, errorCode, message, createdAt | 90 days |
| `booking:v1:idem:<key>` | `{ status, body }` cached route response | 300 s |

Session TTL is a **fixed 1800 s** — LiteAPI confirmed they publish no formal
prebook TTL (Q2). Bump the `v1` prefix in `src/lib/booking/session.ts` to
invalidate all booking keys at once.

---

## 4. `book_failed` recovery runbook (paid but not booked)

This is rare but real: the card was charged (Stripe/LiteAPI) but `/rates/book`
failed afterwards. The user sees an honest "rezerwacja wymaga potwierdzenia"
page with a `recoveryId` — **we never claim success**.

### 4.1 Detect
- **Logs** (Vercel → Runtime Logs): grep for
  `[liteapi][booking][CRITICAL] book_failed_after_payment` — includes
  `prebookId=`, `transactionId=`, `underlying_code=`. A second
  `[CRITICAL] recovery_record_persist_failed` line means even the Upstash
  recovery write failed (escalate immediately).
- **User contact**: they will quote the `recoveryId` (= the `sessionId`).

### 4.2 Pull the recovery record
In the Upstash console (the production DB) `GET`:

```
booking:v1:failed:<recoveryId>
```

Fields: `prebookId`, `transactionId`, `holder`, `guests`, `errorCode`,
`message`, `createdAt`. (If absent, the failure predated persistence — use the
`[CRITICAL]` log line's `prebookId`/`transactionId` instead.)

### 4.3 Resolve with LiteAPI support
Contact LiteAPI support with **`prebookId`** and **`transactionId`**. Two
outcomes:
- They can **finalize** the booking from the existing transaction → confirm to
  the guest, then create `booking:v1:completed:<bookingId>` manually (optional,
  for CS lookup) and delete `booking:v1:failed:<recoveryId>`.
- They **cannot** finalize → request a **refund** of that `transactionId`,
  confirm the refund to the guest, then delete the failed record.

Never re-run the flow for the same `transactionId` (double charge). A safe
retry requires a brand-new prebook (new session).

---

## 5. Find a booking (customer service)

- **By bookingId**: `GET /api/booking/<bookingId>` (returns client-safe fields
  only — no transactionId/secretKey), or Upstash `GET
  booking:v1:completed:<bookingId>`.
- **By the user's recoveryId / session**: Upstash `GET
  booking:v1:session:<sid>` (only within 30 min) or
  `booking:v1:failed:<sid>`.
- **Recommended optional tooling** (not yet built — safe Phase 5 follow-up): a
  `pnpm booking:tail` script that scans recent Upstash `booking:v1:failed:*`
  keys / greps logs for `[CRITICAL]`. Out of scope for this phase (docs only).

---

## 6. RODO / GDPR

- **What is stored & where**: guest data lives **only in Upstash Redis** —
  `holder` (firstName, lastName, email, phone) and `guests` (firstName,
  lastName) inside `booking:v1:session:*` and, after booking, inside
  `booking:v1:completed:*` / `booking:v1:failed:*`. **No Postgres row, no
  `Booking` model** — so no `PII_ENCRYPTION_KEY` is required (BOOKING_AUDIT §7).
- **No card data ever**: card details are entered in Stripe-hosted fields via
  LiteAPI's Payment SDK. helptravel.pl never receives PAN/CVV (PCI SAQ-A).
- **Retention**: session 30 min, completed/failed 90 days — all enforced by
  Redis TTL (auto-deletion, no manual purge job).
- **Lawful basis**: performance of a contract — GDPR Art. 6(1)(b) (processing a
  reservation the user requested).
- **Logs**: PII-redacted at the LiteAPI client boundary
  (`src/lib/liteapi/client.ts` `redactPii`: email/phone/card masked). Booking
  logs only emit ids (`prebookId`, `transactionId`, `bookingId`) — never
  holder/guest names.
- **Data-subject requests**: locate the keys above and `DEL` them in Upstash;
  TTL otherwise removes the data within 90 days.

---

## 7. Refund / cancellation (gap — out of scope)

There is **no self-service cancel/refund** in this MVP. A typed
`cancelBooking()` wrapper exists in `src/lib/liteapi/cancel.ts` but is **not**
wired to any route or UI.

Interim process: the guest emails support; a human contacts LiteAPI support to
cancel/refund using the `bookingId`. A future **Phase 5** would add
`POST /api/booking/[bookingId]/cancel` + UI + email confirmations (RESEND,
already env-stubbed) and the `pnpm booking:tail` monitor.

---

## 8. Benchmarks & known limitations

| Metric | Target (prompt) | Observed | Note |
| --- | --- | --- | --- |
| Prebook latency | <2 s | **~22 s** (Phase 1 smoke) | LiteAPI-side limit, not ours. Mitigated by the form's "To może potrwać do 30 sekund" copy + disabled submit. Documented limitation. |
| Widget load | <1 s | not yet measured | Phase-4 human e2e to confirm. |
| Book latency | — | variable | 60 s client timeout (Phase 1 deviation #2; safer than the prompt's 30 s for slow OTA booking). |
| Click → confirmation | <60 s incl. typing | n/a | Human e2e. |

Other known limitations: redirect-only widget (no JS callback — return-URL
flow); wallets (Apple/Google Pay) disabled by `Permissions-Policy: payment=()`
— intentional, card-only MVP.

**Email confirmation (live as of 2026-05-31):** on a confirmed booking the
`/api/booking/book` route now awaits `sendBookingConfirmation` (Resend) and
returns `emailSent` + `emailTo` in the response body; the return page shows the
full booking details and an honest "Potwierdzenie wysłaliśmy na …" line.
Awaited (not fire-and-forget) so the page can report status truthfully — the
booking is persisted to `completed` BEFORE the send, so a slow/failed email
never risks a paid-but-unbooked record (RULE 6). **Requires `RESEND_API_KEY` in
Vercel** (Production + Preview); without it the send is skipped and the page
falls back to the "zachowaj numer rezerwacji" message — it never falsely claims
a mail was sent. Optional `EMAIL_FROM` (branded sender, once the domain is
verified in Resend), `EMAIL_REPLY_TO`, `EMAIL_BCC`. See `.env.example`.

---

## 9. Manual end-to-end test (human — Phase 4 acceptance)

Performed by a human, not automated (real card, real money):

1. In Vercel **Preview**, set B1 env vars + `BOOKING_FLOW_MODE=live`; deploy.
2. Pick a cheap real hotel + a date you can use or will immediately refund.
3. Complete the full flow with a real card.
4. Verify: LiteAPI dashboard shows the booking; Upstash has
   `booking:v1:completed:<bookingId>`; the return page showed confirmation.
5. Record the result (with screenshots) in `BOOKING_PROGRESS_LOG.md`.
6. Only then set `BOOKING_FLOW_MODE=live` in **Production** and watch logs for
   `[CRITICAL]` for 24 h.

If anything fails after payment, follow §4 (recovery runbook).

---

## 10. Required env (booking)

`LITEAPI_PROD_PRIVATE_KEY`, `LITEAPI_ENV=production`,
`NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY`, `LITEAPI_BOOK_BASE_URL`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
`BOOKING_FLOW_MODE` (default `disabled`), optional
`NEXT_PUBLIC_CONTACT_EMAIL` (recovery/confirmation mailto). See `.env.example`
and BOOKING_BLOCKERS.md **B1**.
