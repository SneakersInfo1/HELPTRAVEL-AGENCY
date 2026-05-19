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

## B5 — Widget Stripe `IntegrationError` (cached-script race) + Permissions-Policy blocked payment

**Severity:** was CRITICAL (payment form never mounts on 2nd+ attempt) · **Status:** ✅ RESOLVED 2026-05-19
**Raised:** Phase 4 production validation (B4 re-test on Vercel preview) · **Resolved:** commits `55d1db9` (race) / `6da8fc1` (Permissions-Policy)

Detected after the B4 fix deployed with `NEXT_PUBLIC_LITEAPI_ENV=production`.
Good signal first: `payment-wrapper.liteapi.travel/config` no longer 400s
(B4 `publicKey:"live"` confirmed correct), prebook succeeded (Upstash session
+ valid `pi_…` secretKey), Stripe widget began loading. Two separate bugs:

**Issue 1 — cached-script race (`IntegrationError`).** `reservation-form.tsx`
initialized the widget inside `onSubmit`: `setStep("paying")` →
`await loadWidgetScript()` → `new LiteAPIPayment().handlePayment()`. When the
SDK script was already browser-cached (2nd/3rd attempt), `loadWidgetScript()`
resolved in a microtask **before** React committed the `"paying"` branch, so
the `#payment-element` div did not exist when Stripe tried to mount →
`IntegrationError: elements should have a mounted Payment Element`. (Exactly
the latent race flagged at the end of the B4 report.) **Fix (`55d1db9`):**
widget init moved into a `useEffect` keyed on the prebook result; it awaits
the script, then rAF-polls for `#payment-element` (bounded, 10 frames) before
constructing `LiteAPIPayment`, with a cleanup flag cancelling on
unmount/re-render. On failure it restores the form with the existing message.
Side change in the same file: making the component compiler-analyzable
activated `react-hooks/purity` on the **pre-existing** `idemKey` `useRef`
initializer (`Math.random()`/`Date.now()` during render); minimal behavior-
preserving fix — generate the key via a module-scope `freshIdemKey()` called
from the handler, not during render. Idempotency semantics unchanged.

**Issue 2 — Permissions-Policy blocked payment.** `next.config.ts`
`permissionsPolicy` had `payment=()`; the browser enforced "payment is not
allowed in this document", blocking the Stripe Payment Element iframe
(api.stripe.com → HTTP 400). **This supersedes the B3 "Accepted constraint"
note above** ("`payment=()` … intentionally left unchanged"): live testing
proved Stripe Elements — not just Apple/Google Pay — needs the `payment`
permission for its cross-origin iframe. **Fix (`6da8fc1`, minimal additive —
only the `payment` token changed; the other 8 directives untouched):**
`payment=(self "https://payment-wrapper.liteapi.travel" "https://js.stripe.com" "https://hooks.stripe.com")`.
CSP `frame-src` already allowed `js.stripe.com`/`hooks.stripe.com`
(Phase 3) — verified, unchanged.

Backend (prebook/book/session) untouched — Upstash showed a valid session +
`pi_…` secret throughout. `widget-env.ts` (B4) untouched. The unrelated
`/api/hotels/rates/batch` 429 is out of scope (noted, ignored).

---

## B6 — Stripe `/v1/elements` HTTP 400: widget env vs prebook env drift

**Severity:** CRITICAL (payment cannot complete) · **Status:** ✅ CODE FIXED 2026-05-19 · ⚠️ needs operator env-check + LiteAPI confirmation before re-test
**Raised:** Phase 4 production validation (B5 re-test on Vercel preview) · **Code fix:** commit `454c4c5`

After B5, the widget initializes (race gone) and Stripe **starts** loading, but:
`api.stripe.com/v1/elements?...type=payment_intent` → **HTTP 400** (×2), then
`IntegrationError: elements should have a mounted Payment Element` — the
Payment Element never mounts because Stripe rejected the
(publishable key, client secret) pair. Prebook itself is healthy (Upstash:
session + valid `pi_…_secret_…`).

**Root cause — two independent environment sources that can disagree:**
- Server `prebook` (`client.ts getEnv()`): Stripe **PaymentIntent** mode is set
  by the resolved LiteAPI **key prefix** (`prod_`/`sand_`), influenced by
  server **`LITEAPI_ENV`**.
- Widget (`page.tsx` → `getLiteApiWidgetEnv()`): previously read the **separate
  client var `NEXT_PUBLIC_LITEAPI_ENV`**, which decides which Stripe
  **publishable key** LiteAPI `/config` returns.

If `NEXT_PUBLIC_LITEAPI_ENV=production` (widget → "live" → live publishable key)
but the server resolves a `sand_` key (test-mode PaymentIntent) — e.g. because
**B1 (`LITEAPI_ENV=production`) was never marked RESOLVED / not set in Vercel**
— Stripe gets a **live pk + test client secret** → `/v1/elements` 400. This is
the exact symptom.

**Code fix (commit `454c4c5`):** `getLiteApiWidgetEnv()` no longer reads
`NEXT_PUBLIC_LITEAPI_ENV`. It now derives the widget flag from the **same**
source the prebook uses — `getEnv().mode` (`prod_`/`sand_` key prefix). Widget
env and prebook env are now structurally locked together; `"unknown"` →
`"sandbox"` (fail-safe). `page.tsx` unchanged. No backend/widget-component
change. After this, a sandbox-keyed server yields a sandbox widget (test cards
work) and a `prod_`-keyed server yields a `"live"` widget (real cards) — never
mixed.

## Operator action required before next preview redeploy

For a **real-card production** test, in Vercel (Production + Preview + Development):
- `LITEAPI_ENV=production`  ← **this resolves B1; without it prebook uses the
  `sand_` key and the PaymentIntent is test-mode**
- `LITEAPI_PROD_KEY` (or `LITEAPI_PROD_PRIVATE_KEY`) = the LiteAPI **production
  Private API Key** (`prod_…`)
- `NEXT_PUBLIC_LITEAPI_ENV` is **no longer used by the widget** — can be left or
  removed; it can no longer cause this drift.
Then redeploy the preview branch. (For a *test-card* dry run instead: set
`LITEAPI_ENV=sandbox`/unset + sandbox keys — the widget will auto-match.)

> Open question for LiteAPI (send before real-card retest) — see the
> "B6 — questions for LiteAPI" note delivered with this fix: confirm that for a
> **production** prebook the `/config` `publicKey:"live"` returns a Stripe
> publishable key on the **same Stripe account** that owns the prebook
> PaymentIntent (no Stripe Connect `stripeAccount` parameter required from our
> side), since we cannot inspect the cross-origin Stripe 400 body.

### B6 update — LiteAPI confirmation + authoritative env binding (commit `fdccd43`)

LiteAPI support (docs *Implementing a Payment Method → User Payment*) confirmed:
`publicKey` is literally **`"live"`**/**`"sandbox"`** (✓ our B4/B6); `secretKey`
is the prebook Stripe client secret (✓); **no Stripe Connect / `stripeAccount`**
and **no extra required config** beyond `publicKey`,`secretKey`,`targetElement`,
`returnUrl` (✓ our config matches). They also asked the key diagnostic
question: *"in the prebook response, is `sandbox` flagged `false`?"*

We discovered our Zod prebook schema was **silently stripping** any `sandbox`
field LiteAPI returns, so the widget env was only ever a key-prefix *heuristic*.
Fix (commit `fdccd43`), strictly additive:
- `LiteApiPrebookResponseSchema`: capture optional `sandbox` (at `data.*` and
  top-level).
- `prebookHotel`: thread `sandbox` through; **log**
  `[liteapi][booking][prebook] keyMode=<…> sandbox=<true|false|unreported>` —
  this lets the operator confirm from **Vercel logs** whether a prebook truly
  ran in production (answers LiteAPI's diagnostic + B1 uncertainty directly).
- `/api/booking/prebook` now returns `widgetEnv`: LiteAPI's per-prebook
  `sandbox` flag wins (`false`→`"live"`, `true`→`"sandbox"`); if unreported it
  falls back to the commit-`454c4c5` key-mode heuristic.
- `reservation-form.tsx`: the widget `publicKey` is taken from that
  `widgetEnv` (same response as `secretKey`) — they now originate from one
  prebook call and **cannot be different Stripe modes**.

**Operator: after redeploy, before paying, check the Vercel function log for
the prebook line.** `keyMode=production sandbox=false` → real-card ready.
`keyMode=production sandbox=true` (or `sandbox=unreported` + still 400) → the
production LiteAPI account is returning a test PaymentIntent → send the
remaining LiteAPI questions + the **Stripe `/v1/elements` 400 response body**
(DevTools → Network → that request → Response tab; we cannot read it from code
— it's a cross-origin opaque response).

---

_No other open blockers. Q2 (prebook TTL) handled by decision #3 (fixed 1800s)._
