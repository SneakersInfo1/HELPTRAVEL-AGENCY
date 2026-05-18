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

**ACTION REQUIRED BY HUMAN (kuba):** add `LITEAPI_ENV=production` to **Vercel →
Project Settings → Environment Variables** for **Production _and_ Preview**
environments **before** deploying any booking phase. Without it, every booking
call in production/preview will 401. (Search/rates also switch to the prod key —
verified working in Phase 0, no regression expected.)

> This does not block Phase 1/2 code work locally. It blocks **deploy**.

---

## B2 — Q1: LiteAPI Payment SDK has no JS success/failure callback (Phase 3 blocker)

**Severity:** HIGH for Phase 3 · **Status:** OPEN (awaiting LiteAPI support — user is asking)
**Raised:** Phase 0, re-confirmed Phase 1

The shipped widget (`liteAPIPayment.js?v=a1`, decoded in BOOKING_AUDIT.md §8) is
**redirect-only via `returnUrl`**; `handleReturn()` is an empty stub and errors
are swallowed (`catch(e){}`). The prompt's "wire success callback → POST
`/api/booking/book`" model does not match the artifact.

Per decision #4: **Phase 3 is on hold until LiteAPI confirms** the integration
contract (redirect-to-returnUrl vs. a callback build). **Phases 1 and 2 are
independent of this and proceed.**

---

_No other open blockers. Q2 (prebook TTL) handled by decision #3 (fixed 1800s)._
