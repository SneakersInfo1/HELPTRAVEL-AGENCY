# Booking Flow — Blockers & Required Human Actions

Append-only log of things that block progress or require a human (env, infra,
LiteAPI support). Phases STOP on a blocker until the human resolves it.

---

## B1 — `LITEAPI_ENV=production` must be set in Vercel before any deploy

**Severity:** HIGH (booking returns 401 without it) · **Status:** OPEN (human action)
**Raised:** Phase 1 (2026-05-18)

`src/lib/liteapi/client.ts` `getEnv()` resolves the booking (`keyMode:"private"`)
key. When `LITEAPI_ENV` is **unset**, `preferProd=false` and the private key
falls back to the **sandbox** key — sent to `book.liteapi.travel` it returns
**401** (BOOKING_AUDIT.md §2, verified live). The prod private key itself is
valid (Phase 0 live prebook = HTTP 200).

**Fixed locally:** `LITEAPI_ENV="production"` appended to local `.env.local`
(gitignored) so `pnpm booking:smoke` and dev work. `.env.example` updated to
document `LITEAPI_ENV="production"` as the booking requirement.

**ACTION REQUIRED BY HUMAN (kuba):** in **Vercel → Project Settings →
Environment Variables**, for **Production _and_ Preview**, before deploying any
booking phase:
1. `LITEAPI_ENV=production` — else every booking call 401s (search/rates also
   switch to the prod key — verified Phase 0, no regression expected).
2. `NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY=<same value as LITEAPI_PROD_PUBLIC_KEY>`
   (Phase 3) — the browser Payment SDK widget needs it; without it the widget
   throws "no public key" and payment cannot start.
Both are mirrored locally in `.env.local` (gitignored) so dev/smoke work.

> This does not block Phase 1/2 code work locally. It blocks **deploy**.

---

## B2 — Q1: LiteAPI Payment SDK has no JS success/failure callback

**Severity:** was HIGH for Phase 3 · **Status:** ✅ RESOLVED 2026-05-19 (LiteAPI support)
**Raised:** Phase 0 · **Resolved:** Phase 3 kickoff

LiteAPI support confirmed the widget is **redirect-only**: `handlePayment()` →
card entry → LiteAPI redirects the browser to our `returnUrl`. No JS callbacks;
LiteAPI does **not** append query params, so we smuggle `sid=<sessionId>` into
the `returnUrl` ourselves. Provider underneath = **Stripe**. Architecture:
prebook → widget(`returnUrl=<site>/hotele/rezerwacja/return?sid=…`) → return
page server-side calls `/api/booking/book`. Implemented in Phase 3. See
BOOKING_AUDIT.md §8 (updated). **No longer blocks Phase 3.**

---

## B3 — CSP extension for Stripe + LiteAPI payment hosts

**Severity:** MED · **Status:** ✅ RESOLVED 2026-05-19 (minimal extension, no new infra)
**Raised:** Phase 3

A strict CSP **already exists** in `next.config.ts` (an array joined into the
`Content-Security-Policy` header). Per the rule "if CSP exists — extend
minimally, don't rewrite", Phase 3 makes the **minimal additive** change only:
- `script-src` += `https://js.stripe.com https://payment-wrapper.liteapi.travel`
- `connect-src` += `https://api.stripe.com https://payment-wrapper.liteapi.travel https://book.liteapi.travel`
- `frame-src` += `https://js.stripe.com https://hooks.stripe.com` (Stripe 3DS;
  `payment-wrapper.liteapi.travel` was already present)

No other directive touched. No new infrastructure — this is an existing header.

**Accepted constraint (no action needed):** `Permissions-Policy` keeps
`payment=()`. This disables the W3C Payment Request API (Apple/Google Pay
wallet buttons) but **not** Stripe card entry (Stripe Elements/PaymentIntent).
MVP is **card-only** (prompt: BLIK/wallets out of scope), so this is correct
and intentionally left unchanged.

---

## B4 — Widget `publicKey` was the API key, not the env flag

**Severity:** was CRITICAL (widget never initialized) · **Status:** ✅ RESOLVED 2026-05-19 (LiteAPI support)
**Raised:** Phase 4 production validation · **Resolved:** commit `a578c73`

Phase 3 passed `process.env.NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY` (a `prod_pu…`
LiteAPI **API** public key) as the widget's `config.publicKey`. Per LiteAPI
support (19 May 2026), `publicKey` is an **environment flag** — the literal
string `"live"` (production) or `"sandbox"` — **not** an API key. The API
public key is server-side only and is never sent to the widget. Passing the
`prod_pu…` key made `handlePayment()` POST it to
`https://payment-wrapper.liteapi.travel/config`, which rejected it as an
invalid environment flag → **HTTP 400**; the widget never initialized and the
booking page showed skeleton placeholders instead of the Stripe form.

**Fix (commit `a578c73`):** new `src/lib/liteapi/widget-env.ts`
`getLiteApiWidgetEnv()` returns `"live"` only when `NEXT_PUBLIC_LITEAPI_ENV`
=== `"production"`, else `"sandbox"` (fail-safe). `page.tsx` now passes that
to the widget. `appearance:{theme:"flat"}` + `options:{business:{name:
"helptravel.pl"}}` added per LiteAPI's verified example. `targetElement`
(`#payment-element`) and its container already existed — unchanged. Server
prebook/book untouched. `NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY` kept (still
used server-side). See BOOKING_AUDIT.md §8 (CORRECTION block).

---

## Operator action required before next preview redeploy

- Add Vercel env var: `NEXT_PUBLIC_LITEAPI_ENV=production`
  (Environments: **Production + Preview + Development**)
- Then trigger a redeploy of the preview branch.

> Note: B1's `NEXT_PUBLIC_LITEAPI_PROD_PUBLIC_KEY` is **no longer required by
> the widget** (it was never the right value). It is retained only for any
> server-side use; the widget needs `NEXT_PUBLIC_LITEAPI_ENV` instead.

---

_No other open blockers. Q2 (prebook TTL) handled by decision #3 (fixed 1800s)._
