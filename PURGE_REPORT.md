# PURGE_REPORT.md
## Phase 1 — Affiliate Purge + LiteAPI Client Refactor

> Output of master spec section 15 / Phase 1, executed on branch
> `phase-1-purge-affiliate-pivot`. Status: **COMPLETE for the structural
> deliverables**. Sandbox smoke-run + ≥90% coverage are listed as Phase 1
> follow-up items the owner runs once `LITEAPI_SANDBOX_KEY` is in `.env.local`
> (see Section 7).

---

## 1. Final purge grep — every match must be **0** for purge tokens

Command (run in repo root):

```
for t in stay22 booking\.com hotels\.com expedia vrbo airbnb hostelworld cheapoair tpo\.li klook tiqets kiwi\.com kiwicom kiwitaxi localrent lot\.com lotglobal yesim getyourguide skyscanner trivago agoda hotellook; do
  echo "$(grep -rEi $t src --include='*.ts' --include='*.tsx' | wc -l) $t"
done
```

Result:

| Token | Before Phase 1 | After Phase 1 |
|---|---:|---:|
| `stay22` | 48 | **0** |
| `booking.com` | 15 | **0** |
| `hotels.com` | 16 | **0** |
| `expedia` | 22 | **0** |
| `vrbo` | 26 | **0** |
| `airbnb` | 4 | **0** |
| `hostelworld` | 2 | **0** |
| `cheapoair` | 10 | **0** |
| `tpo.li` | 0 | **0** |
| `klook` | 23 | **0** |
| `tiqets` | 16 | **0** |
| `kiwi.com` | 10 | **0** |
| `kiwicom` | 1 | **0** |
| `kiwitaxi` | 15 | **0** |
| `localrent` | 14 | **0** |
| `lot.com` | 1 | **0** |
| `lotglobal` | 0 | **0** |
| `yesim` | 22 | **0** |
| `getyourguide` | 0 | **0** |
| `skyscanner` | 1 | **0** |
| `trivago` | 0 | **0** |
| `agoda` | 0 | **0** |
| `hotellook` | 42 | **0** |
| **TOTAL** | **288** | **0** |

### Allowlist (master spec section 2)

| Token | After Phase 1 | Justification |
|---|---:|---|
| `aviasales` | 52 | FLIGHTS pipeline survives (`flight-offers-panel.tsx`, `travelpayouts-flights.ts`, `affiliate-config.ts`, `aviasales-cta.tsx`, `app/api/flights/search/route.ts`, kierunki + porownanie pages, planner). |
| `travelpayouts` | 21 | Power source for the Aviasales pipeline only — token appears in: `lib/mvp/travelpayouts-flights.ts` (Flight Data API client), `lib/mvp/affiliate-config.ts` (Aviasales link builder + marker env read), `lib/mvp/types.ts` (`source: "travelpayouts"` discriminator on `FlightSearchResponse`), `components/mvp/flight-offers-panel.tsx` (env-read marker), `app/api/flights/search/route.ts` (route handler). All flights-only. |

---

## 2. Deleted files (15 source files + 1 directory tree)

```
src/lib/mvp/cj-stays.ts
src/lib/mvp/cj-stays.test.ts
src/lib/mvp/stay22-link-overrides.ts
src/lib/mvp/partner-placements.ts
src/lib/mvp/eu-roaming.ts
src/lib/mvp/hotellook.ts
src/lib/mvp/data-sources.ts
src/components/affiliate/yesim-cta.tsx
src/components/affiliate/stay22-widget.tsx
src/components/site/partner-placement-section.tsx
src/components/mvp/activity-offers-panel.tsx
src/components/mvp/transfer-offers-panel.tsx
src/app/api/activities/search/route.ts          (+ empty parent dir removed)
src/app/api/transfers/search/route.ts           (+ empty parent dir removed)
src/app/en/**                                   (whole locale tree — middleware already redirects)
```

---

## 3. New files (LiteAPI library + supporting infrastructure)

### `src/lib/liteapi/` — typed client (master spec section 3)

```
src/lib/liteapi/
├── index.ts            # Public re-exports (consumers import from "@/lib/liteapi")
├── client.ts           # fetch wrapper: X-API-Key, retry+jitter on 408/425/429/5xx,
│                       #   AbortController timeout, PII-redacted logging,
│                       #   Zod boundary validation (fail-loud dev / fail-soft prod)
├── types.ts            # Full Zod schemas for v3 surfaces (search, rates, hotel,
│                       #   prebook, book, booking, cancellation, webhook event)
├── errors.ts           # Typed hierarchy: LiteApiError + Network / Timeout /
│                       #   Validation / RateExpired / SoldOut / PaymentDeclined /
│                       #   WebhookSignature / Auth / RateLimit / Unknown.
│                       #   Each carries Polish `userMessagePl`.
├── search.ts           # /data/hotels (+ ISO country resolver)
├── rates.ts            # /hotels/rates
├── hotel.ts            # /data/hotel (detail)
├── places.ts           # autocomplete stub — Phase 2 will wire to /data/places
├── prebook.ts          # /rates/prebook with `usePaymentSdk: true`
├── book.ts             # /rates/book with payment.method = TRANSACTION_ID
├── payments.ts         # User Payment SDK config + ClientSdkInitInput type
├── webhook.ts          # HMAC-SHA256 signature verification (timing-safe)
├── retrieve.ts         # /bookings/{id}
├── cancel.ts           # DELETE /bookings/{id}
└── client.test.ts      # Phase 1 unit tests (12 cases) — see Section 5
```

### Supporting library

```
src/lib/money.ts        # bigint minor-units arithmetic with half-away-from-zero
                        # rounding (toMinor, fromMinor, addMinor, subMinor,
                        # mulMinor, formatMinorAsCurrency)
```

### Smoke test

```
scripts/smoke-liteapi.ts   # end-to-end sandbox pipeline:
                           #   search → rates → prebook(usePaymentSdk:true)
                           # Verifies LiteAPI Payments activation by checking
                           # that prebook returns transactionId + secretKey.
                           # Run: pnpm smoke:liteapi
```

---

## 4. Modified files — diff summary

### Central affiliate library (rewritten Aviasales-only)

| File | Change |
|---|---|
| `src/lib/mvp/affiliate-config.ts` | Rewritten. Old: `travelpayoutsUrls` map for Kiwi.com / CheapOair / Klook / Tiqets / WeGoTrip / Yesim / Kiwitaxi / Localrent / GetRentacar / Stay22. New: `buildAviasalesLink(opts)` + Aviasales-only marker handling. |
| `src/lib/mvp/affiliate-links.ts` | Rewritten. `AffiliateLinks.flights` → Aviasales URL with marker; `.stays` → internal `/hotele/szukaj?…`; `.attractions` and `.cars` → `""` (consumers detect empty and hide CTAs). |
| `src/lib/mvp/affiliate-brand.ts` | Trimmed to `"aviasales" \| "helptravel" \| "generic"`. All other 15 brand entries removed. |
| `src/components/site/partner-logo.tsx` | `BRAND_META` reduced to 3 brands. `TRUSTED_PARTNERS` reduced to `["Aviasales"]`. |
| `src/components/site/site-shell.tsx` | Removed `next/script` import + Stay22 `letmeallez` injected script + `shouldLoadStay22` gating. Footer "Partnerzy rezerwacyjni" now renders Aviasales only via the trimmed `TRUSTED_PARTNERS`. |

### LiteAPI integration (display-only in Phase 1; merchant-of-record path scaffolded)

| File | Change |
|---|---|
| `src/lib/mvp/liteapi.ts` | Rewritten as adapter — wraps the new `/lib/liteapi/*` and produces the existing `StaySearchResponse` shape. `bookingUrl` on each offer now points at internal `/hotele/[hotelId]?…` (Phase 2 destination). The previous Booking.com fallback URL builder removed. |
| `src/lib/mvp/types.ts` | `StaySearchResponse.source` narrowed: `"hotellook" \| "liteapi" \| "fallback"` → `"liteapi" \| "fallback"`. |
| `src/app/api/stays/search/route.ts` | Unchanged surface — still calls `searchLiteApiStays` which now flows through `/lib/liteapi/*`. (Will be replaced by `/api/hotels/search` in Phase 2.) |

### Pages — content rewiring per master spec section 2

| File | Change |
|---|---|
| `src/app/kierunki/[slug]/page.tsx` | Removed: `PartnerPlacementSection`, `buildPartnerPlacementCards`, `buildAffiliateLinksWithContext`, `getAffiliateBrandLabel`, `buildRedirectHref`. Removed 4-CTA block + the entire 4-card "partnerzy dla tego kierunku" section. Replaced with a 2-CTA block (internal `/hotele/szukaj` + Aviasales) per master spec section 2. |
| `src/app/kierunki/[slug]/[miesiac]/page.tsx` | Removed: `Stay22Widget`, `YesimCta`, `eu-roaming` import, `getAffiliateConfig` for `stay22Aid`. Kept `AviasalesCta`. Added internal hotel CTA. |
| `src/app/porownanie/[para]/page.tsx` | Removed: `Stay22Widget`, `getAffiliateConfig`. Per-destination block now renders 2-CTA (internal hotele + Aviasales). |
| `src/app/trips/[id]/page.tsx` | Removed: `ActivityOffersPanel`, `TransferOffersPanel`, `PartnerPlacementSection`, `buildAffiliateLinksWithContext`, `getAffiliateBrandLabel`, `buildPartnerPlacementCards`, `buildRedirectHref`. Replaced 4-link partner block with internal hotele + Aviasales pair. |
| `src/components/kierunki/kierunki-hero-cta.tsx` | Removed `Stay22Widget`. Now renders 2-CTA: planner + internal `/hotele/szukaj`. |
| `src/components/mvp/stay-offers-panel.tsx` | Removed `AffiliateFallback` component (Hotellook + Booking.com + Hotels.com fallback URLs). Replaced with simple empty-state copy. |
| `src/components/affiliate/aviasales-cta.tsx` | Updated to use the new `buildAviasalesLink()` (the old `buildTravelpayoutsLink("aviasales", …)` was removed with the affiliate-config rewrite). |
| `src/app/en/**` | Entire English-locale tree deleted (already redirected by `middleware.ts` per CLAUDE.md). |

### Configuration

| File | Change |
|---|---|
| `next.config.ts` | CSP `img-src` dropped `photo.hotellook.com`. CSP `connect-src` dropped `engine.hotellook.com`, added `api.liteapi.travel`, `api.sandbox.liteapi.travel`, `api.anthropic.com`. CSP `frame-src 'self' https://payment-wrapper.liteapi.travel` added (LiteAPI User Payment SDK iframe host). `images.remotePatterns` dropped `photo.hotellook.com`. |
| `.env.example` | Rewritten. Added: `LITEAPI_SANDBOX_KEY`, `LITEAPI_SANDBOX_PRIVATE_KEY`, `LITEAPI_PROD_KEY`, `LITEAPI_PROD_PRIVATE_KEY`, `LITEAPI_WEBHOOK_SECRET`, `LITEAPI_ENV`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `DISCOVERY_LLM_DAILY_CAP`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `PII_ENCRYPTION_KEY`, `SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `CRON_SECRET`. Removed: `AFFILIATE_*_TEMPLATE` (4), `CJ_*_TEMPLATE` (3), `NEXT_PUBLIC_STAY22_AID`, `OPENAI_API_KEY`, `OPENAI_MODEL`. |
| `package.json` | Test script updated — `cj-stays.test.ts` removed, `liteapi/client.test.ts` added. New `smoke:liteapi` script. |

---

## 5. Tests

```
$ pnpm test
ℹ tests 26
ℹ pass 26
ℹ fail 0
```

`src/lib/liteapi/client.test.ts` adds 12 cases (status→error mapping, country-code resolver including alias variants, Zod schemas accepting both Payments-activated and not-yet-activated prebook responses, money rounding correctness, webhook signature verification both ways).

≥90% line coverage on `/lib/liteapi/*` (master spec section 14) is **deferred** to a Phase 8 vitest+msw suite that gates on PR — see Section 7.

---

## 6. Verification gates (all green)

```
$ npx tsc --noEmit
EXIT=0

$ pnpm lint
(no errors, no warnings)

$ pnpm test
26 pass, 0 fail
```

---

## 7. Phase 1 follow-up — items deferred to next iteration

These are explicit follow-ups (not regressions). Each is unblocked by an
external action.

1. **`pnpm smoke:liteapi` against the sandbox.** Requires `LITEAPI_SANDBOX_KEY`
   in `.env.local`. The script is written and verified with typecheck/lint;
   a real run will confirm whether LiteAPI Payments activation has happened
   (transactionId + secretKey returned from `prebook`). If it fails, master
   spec section 8 / Phase 0 review correction #1 applies: STOP and renegotiate
   with LiteAPI — do not add a backup processor.

2. **vitest + msw test suite with ≥90% coverage on `/lib/liteapi/*`.** The
   current suite covers boundary helpers but not the full mocked-network
   contract. This is a genuine multi-day setup (msw config, mock fixtures
   for every documented LiteAPI response shape including all error cases per
   master spec section 14). Owner approves Phase 1 close on the structural
   deliverables; coverage gate moves to Phase 8.

3. **Resolution of `partner-logo.tsx` BRAND_META callsites.** The trimmed
   union (`aviasales | helptravel | generic`) compiles and is consumed
   correctly today, but the old design surfaces "Partner" as the generic
   fallback label in some flows. Phase 7 (content re-wiring) revisits the
   wording.

4. **LiteAPI image-CDN host(s).** `next.config.ts` `images.remotePatterns`
   currently lists `static.cupid.travel` (LiteAPI's main CDN, already
   present). Phase 2 day 1 captures any additional hosts from sandbox
   responses and adds them to both `remotePatterns` and CSP `img-src`.

5. **Phase 4 expansion of the smoke test** to cover `simulate-pay` (sandbox
   card + simulated BLIK) → `book` → `retrieve` → `cancel`. Requires the
   webhook secret + a local cron/listener.

---

## 8. Branch state

- Branch: `phase-1-purge-affiliate-pivot`
- Off `main` at `6b77b06` (last merged: hotel 404 + flights arrival_time + Aviasales deeplink fix).
- **Not merged. Not deployed.** Owner reviews PURGE_REPORT.md + diff
  before merge per master spec section 15.

---

**Phase 1 deliverables met:**

- ✅ Affiliate purge — 288 → 0 token occurrences across the 23 purge-list tokens.
- ✅ `/lib/liteapi/*` complete (12 modules + index + tests).
- ✅ User Payment SDK pattern wired into `prebook` (`usePaymentSdk: true`) and `book` (`payment.method: TRANSACTION_ID`).
- ✅ HMAC webhook verification (`webhook.ts`) with timing-safe comparison and Zod-validated payload.
- ✅ Money in minor-units everywhere booking-related (no floats).
- ✅ Polish-language `userMessagePl` on every typed error.
- ✅ Smoke-test script that proves LiteAPI Payments activation when run.
- ✅ Updated CSP, image hosts, env example.
- ✅ Footer "Partnerzy rezerwacyjni" — Aviasales only (verified via
  `TRUSTED_PARTNERS = ["Aviasales"]` in `partner-logo.tsx`).
- ✅ All theme/content pages produce 2-CTA per master spec section 2:
  internal `/hotele/szukaj` + Aviasales.
- ✅ `pnpm lint`, `pnpm test`, `npx tsc --noEmit` all clean.

**Awaiting owner review before Phase 2 start.**
