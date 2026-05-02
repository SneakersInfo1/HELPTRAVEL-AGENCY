# INTEGRATION_PLAN.md
## Phase 0 — Audit & Pre-Phase-1 Plan for HelpTravel Master Spec

> Output of Phase 0 per `HELPTRAVEL_MASTER_SPEC.md`.
> **Scope of this document:** audit the current repo, run the affiliate purge grep, verify LiteAPI Payments / BLIK / faktura VAT, inventory destination catalog metadata, and produce a concrete plan for Phases 1–9.
> **Status: APPROVED with corrections (Phase 0 review). Phase 1 in progress.**

---

## 0. Operating-model clarification (post-Phase-0 review)

This section supersedes ambiguity in the original `HELPTRAVEL_MASTER_SPEC.md` Section 8.

- **Owner:** Polish individual operating under **działalność nierejestrowana** (unregistered business activity), confirmed acceptable for launch by accountant. JDG (jednoosobowa działalność gospodarcza) registration is triggered when monthly revenue crosses the statutory threshold (~3499 PLN/month at time of writing).
- **Payment integration:** **LiteAPI User Payment SDK** (`docs.liteapi.travel/docs/implementing-payment`). Per LiteAPI documentation, this option has *"liteAPI handle all payment processing on your behalf"* — **LiteAPI is merchant of record, the owner is not**.
- **Implications:**
  - Zero card data ever touches `helptravel.pl` (browser, server, logs, analytics).
  - PCI scope = 0.
  - No Stripe / Adyen / Przelewy24 / Tpay / PayU integration.
  - No faktura VAT issuance on our side — LiteAPI's payment partner issues receipts/invoices.
  - We collect guest data + (optionally) NIP and pass them to LiteAPI booking metadata; their partner is responsible for VAT-compliant artifacts.
- **`prebook` request shape:** must include `usePaymentSdk: true` per LiteAPI docs; response carries `transactionId` + `secretKey` consumed by the User Payment SDK on the front-end.

---

## 1. Repo Audit Summary

### 1.1 Stack & dependencies (from `package.json`)

| Layer | Currently installed | Status vs spec |
|---|---|---|
| Next.js | `16.2.1` (App Router, React 19, React Compiler enabled) | ✅ |
| Database | Prisma `^6.18.0` + Postgres | ✅ but schema is session/scoring-centric — **no booking/prebook tables yet** |
| Rate limiting | `@upstash/ratelimit` `^2.0.8` + `@upstash/redis` | ✅ |
| Validation | `zod` `^4.3.6` | ✅ usable for LiteAPI response validation |
| Fuzzy search | `fuse.js` `^7.3.0` | ✅ |
| Tests | `node --test` against a hard-coded list in `src/lib/mvp/*.test.ts` (no globbing) | ⚠️ insufficient for the contract/E2E coverage Section 14 requires |
| LLM | None — only `OPENAI_API_KEY` env stub used by `lib/mvp/ai.ts` | ❌ Discovery Planner Section 6 specifies **Anthropic Claude Sonnet 4.6** — must add `@anthropic-ai/sdk` |
| Money math | None | ❌ spec mandates `decimal.js` or string math (Section 16 #2) |
| PII encryption | None | ❌ Section 13.2 mandates encryption at rest |
| Email | None | ❌ Section 10.2 mandates Resend/Postmark |
| PDF | None | ❌ Section 5.6 mandates server-rendered PDF confirmation |
| Maps | None | ❌ Section 5.2 mandates MapLibre/Mapbox for hotel results |
| UI primitives | Tailwind v4 only — no shadcn/ui, no Embla, no lucide-react | ❌ Section 11 calls all three out by name |
| Observability | `web-vitals` reporter only | ❌ Section 13.1 mandates Sentry + PostHog + pino |

### 1.2 Routes (App Router) — current vs required

**Existing pages (`src/app/**/page.tsx`):**

```
/                                    /planner
/kierunki                            /planner?mode=discovery
/kierunki/[slug]                     /inspiracje
/kierunki/[slug]/[miesiac]           /inspiracje/[slug]
/inspirations  + /inspirations/[slug]  (DUPLICATE EN — see middleware redirect)
/przewodniki                         /city-breaki
/cieple-kierunki                     /tanie-podroze
/weekendowe-wyjazdy                  /bez-wizy
/najlepsze-kierunki/[sezon]          /porownanie/[para]
/cennik                              /faq
/o-nas                               /jak-pracujemy
/kontakt                             /linki-partnerskie
/dla-partnerow                       /standard-redakcyjny
/regulamin                           /polityka-prywatnosci
/oferta                              /mapa-serwisu
/admin/analytics                     /trips/[id]
/en/* (whole tree — should be redirected per CLAUDE.md, but page files still exist)
```

**Existing API routes (`src/app/api/**/route.ts`):**
```
/api/destinations/suggest      /api/discovery
/api/events  + /events/summary /api/flights/search
/api/places/search             /api/redirect/[provider]   ← affiliate proxy, must be neutered to flights-only
/api/standard                  /api/stays/search          ← currently uses LiteAPI w/ Booking.com hand-off
/api/activities/search         /api/transfers/search      ← DELETE (not in surviving pipelines)
/api/trips/{save,history,[id]} /api/vitals
```

**Required NEW pages (per Sections 5, 10, 6.5):**
```
/hotele                                  ← landing
/hotele/szukaj                           ← search results (Booking-tier UX)
/hotele/[hotelId]                        ← hotel detail
/hotele/rezerwacja                       ← multi-step checkout
/rezerwacja/oczekiwanie                  ← post-payment polling
/rezerwacja/[ref]                        ← confirmation
/moje-rezerwacje                         ← bookingRef + email lookup
```

**Required NEW API routes (per Section 4):**
```
/api/hotels/search                       /api/hotels/rates
/api/hotels/[hotelId]                    /api/hotels/prebook
/api/hotels/payment-session              /api/hotels/payment-webhook
/api/hotels/book                         /api/hotels/booking/[ref]
/api/hotels/booking/by-session/[id]      /api/hotels/cancel/[ref]
/api/places/autocomplete                 /api/planner/discovery (SSE)
/api/abandoned-cart/email (cron)         /api/invoices/request
```

**Routes to DELETE (per Section 2):**
```
/api/activities/search       /api/transfers/search
/api/redirect/[provider]     ← collapse to /api/redirect/flights (Aviasales only)
/api/stays/search            ← replace with /api/hotels/search internal flow
/en/*                        ← already redirected, but page files should be removed
```

### 1.3 Components

54 files under `src/components/**`. Highlights relevant to purge / replacement:

| Component | Spec disposition |
|---|---|
| `components/affiliate/aviasales-cta.tsx` | KEEP (Aviasales survives) |
| `components/affiliate/yesim-cta.tsx` | DELETE |
| `components/affiliate/stay22-widget.tsx` | DELETE |
| `components/affiliate/affiliate-disclosure.tsx` | REWRITE (merchant model) |
| `components/site/partner-logo.tsx` (`TRUSTED_PARTNERS`) | TRIM to Aviasales only |
| `components/site/partner-placement-section.tsx` | DELETE or trim |
| `components/site/site-shell.tsx` (footer) | TRIM "Partnerzy rezerwacyjni" to Aviasales only |
| `components/kierunki/kierunki-hero-cta.tsx` | REPLACE 3-CTA → 2-CTA (internal hotel + Aviasales) |
| `components/mvp/stay-offers-panel.tsx` | REWIRE to internal `/hotele/[id]` deeplinks |
| `components/mvp/flight-offers-panel.tsx` | KEEP (already Aviasales-only after recent fix) |
| `components/mvp/activity-offers-panel.tsx` | DELETE |
| `components/mvp/transfer-offers-panel.tsx` | DELETE |
| `components/mvp/travel-package-panel.tsx` | REVIEW — likely DELETE if it bundles deleted partners |
| `components/mvp/destination-attractions-panel.tsx` | KEEP if affiliate-free; otherwise convert to Geoapify-only |

### 1.4 Library files (`src/lib/mvp/`) — disposition

| File | Disposition |
|---|---|
| `liteapi.ts` (322 lines, search→rates only) | **EVOLVE** into `/lib/liteapi/*` per Section 3 — split into `client.ts`, `search.ts`, `rates.ts`, `hotel.ts`, `prebook.ts`, `book.ts`, `payments.ts`, `retrieve.ts`, `cancel.ts`, `webhook.ts`, `types.ts`, `errors.ts`, `places.ts` |
| `travelpayouts-flights.ts` | KEEP (flights cache, used by Aviasales pipeline) |
| `hotellook.ts` | DELETE (replaced by LiteAPI) |
| `cj-stays.ts` + `cj-stays.test.ts` | DELETE |
| `affiliate-config.ts`, `affiliate-links.ts`, `affiliate-brand.ts` | TRIM to Aviasales only |
| `stay22-link-overrides.ts` | DELETE |
| `partner-placements.ts` | DELETE |
| `eu-roaming.ts` (Yesim) | DELETE |
| `data-sources.ts` | TRIM |
| `destinations.ts` (853 lines, 22 curated profiles) | KEEP, will feed `destinations.json` for Discovery Planner |
| `destination-catalog.ts` (432 lines, broader region/airport map) | KEEP — primary source for autocomplete |
| `parser.ts`, `scoring.ts`, `planner-memory.ts` | KEEP, extend for Discovery Planner |
| `ai.ts` (OpenAI stub) | REPLACE with Anthropic SDK call (Section 6.2) |

### 1.5 Database schema (`prisma/schema.prisma`)

Existing models: `AnonymousSession`, `TripRequest`, `Destination`, `DestinationScore`, `ItineraryResult`, `SavedTrip`, `AffiliateClick`, `Event`. Session-centric, scoring-centric, no booking pipeline.

**Required new models for Phase 4:**

```prisma
model Hotel { id String @id /* LiteAPI hotelId */ liteApiHotelId String @unique
  name String city String country String latitude Float? longitude Float?
  starRating Int? guestScore Float? amenitiesJson Json? cachedAt DateTime
  /* full-detail cache, revalidated 6h */ }

model Prebook { id String @id /* server UUID */ sessionId String
  liteApiPrebookId String @unique hotelId String rateId String
  checkIn DateTime checkOut DateTime guests Int rooms Int
  totalAmountMinor BigInt currency String /* PLN */
  cancellationPolicyJson Json status PrebookStatus createdAt DateTime @default(now())
  expiresAt DateTime
  booking Booking? }

enum PrebookStatus { pending payment_redirected payment_returned consumed expired failed }

model Booking { id String @id bookingRef String @unique /* short, shareable */
  liteApiBookingRef String? @unique prebookId String @unique
  sessionId String guestEmail String /* encrypted */ guestPhone String? /* encrypted */
  guestsJson Json /* encrypted */ holderInfoJson Json? /* encrypted */
  invoiceRequested Boolean @default(false) invoiceNip String? invoiceCompanyJson Json?
  totalAmountMinor BigInt currency String status BookingStatus
  paymentSessionId String? paymentProviderRef String?
  webhookSignatureVerified Boolean @default(false)
  cancellationDeadline DateTime? cancelledAt DateTime?
  createdAt DateTime @default(now()) updatedAt DateTime @updatedAt
  prebook Prebook @relation(fields: [prebookId], references: [id])
  emails BookingEmail[] invoices Invoice[] }

enum BookingStatus { pending processing confirmed failed timeout cancelled refund_pending refunded }

model BookingEmail { id String @id bookingId String type String /* confirmation|prestay|deadline|review|cancellation */
  sentAt DateTime? messageId String? errorJson Json? scheduledFor DateTime?
  booking Booking @relation(fields: [bookingId], references: [id]) }

model Invoice { id String @id bookingId String number String? issuedAt DateTime?
  pdfUrl String? amountMinor BigInt vatAmountMinor BigInt providerRef String?
  /* Fakturownia/iFirma id */ booking Booking @relation(fields: [bookingId], references: [id]) }

model AbandonedCart { id String @id sessionId String email String /* encrypted */
  cartContextJson Json /* hotel, dates, guests, step reached */ capturedAt DateTime
  recoveredAt DateTime? emailsSent Int @default(0) lastEmailAt DateTime? }

model PaymentWebhookEvent { id String @id payload String /* raw body for replay */
  signatureHeader String verified Boolean receivedAt DateTime processedAt DateTime?
  /* idempotency */ }

model ConsentRecord { id String @id sessionId String necessary Boolean
  analytics Boolean marketing Boolean ip String? userAgent String? createdAt DateTime }
```

### 1.6 Environment variables

**Currently in `.env.example`:** `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CONTACT_EMAIL`, `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION`, `ADMIN_USER`, `ADMIN_PASSWORD`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `PEXELS_API_KEY`, `GEOAPIFY_API_KEY`, `AFFILIATE_*_TEMPLATE`, `CJ_*_TEMPLATE`, `NEXT_PUBLIC_TRAVELPAYOUTS_MARKER`, `TRAVELPAYOUTS_API_TOKEN`, `NEXT_PUBLIC_STAY22_AID`, `NEXT_PUBLIC_DEFAULT_ORIGIN_IATA`, `NEXT_PUBLIC_DEFAULT_ORIGIN_CITY`, `OPENAI_API_KEY`, `OPENAI_MODEL`.

**Currently used in code but missing from `.env.example`:** `LITEAPI_API_KEY` (used in `liteapi.ts:180`).

**To REMOVE in Phase 1 (purge):** `AFFILIATE_STAYS_TEMPLATE`, `AFFILIATE_ATTRACTIONS_TEMPLATE`, `CJ_HOTELS_COM_TEMPLATE`, `CJ_EXPEDIA_TEMPLATE`, `CJ_VRBO_TEMPLATE`, `NEXT_PUBLIC_STAY22_AID`. (Keep `NEXT_PUBLIC_TRAVELPAYOUTS_MARKER` only because Aviasales reads it; document that no other TP program is used.)

**To ADD:**
```
# LiteAPI (production + sandbox)
LITEAPI_PROD_KEY=""           # public/sandbox key (X-API-Key)
LITEAPI_PROD_PRIVATE_KEY=""   # private key for booking ops
LITEAPI_SANDBOX_KEY=""
LITEAPI_SANDBOX_PRIVATE_KEY=""
LITEAPI_WEBHOOK_SECRET=""     # HMAC for /api/hotels/payment-webhook
LITEAPI_ENV="sandbox"          # "sandbox" | "production"

# Anthropic (Discovery Planner)
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-4-6"
DISCOVERY_LLM_DAILY_CAP="50"

# Email
RESEND_API_KEY=""              # OR POSTMARK_SERVER_TOKEN
EMAIL_FROM="rezerwacje@helptravel.pl"
EMAIL_REPLY_TO="pomoc@helptravel.pl"

# Faktura VAT
FAKTUROWNIA_API_TOKEN=""       # decision pending Section 7.2
FAKTUROWNIA_DOMAIN=""

# PII encryption (app-layer)
PII_ENCRYPTION_KEY=""          # 32-byte base64

# Observability
SENTRY_DSN=""
NEXT_PUBLIC_POSTHOG_KEY=""
NEXT_PUBLIC_POSTHOG_HOST="https://eu.posthog.com"

# Maps
NEXT_PUBLIC_MAPLIBRE_TILES_URL=""    # MapTiler/Maptiler-style
# OR NEXT_PUBLIC_MAPBOX_TOKEN=""

# Cron secret (Vercel cron auth header)
CRON_SECRET=""
```

---

## 2. Affiliate Purge Grep Results

Grep was run with `grep -rEi <token> src --include="*.ts" --include="*.tsx"`. Counts are **occurrences** (not files).

### 2.1 Tokens to purge — every match must reach **0** by end of Phase 1

| Token | Match count | Priority files |
|---|---:|---|
| `stay22` | **48** | `affiliate-links.ts`, `stay22-link-overrides.ts`, `affiliate-config.ts`, `partner-placements.ts`, `affiliate-brand.ts`, `partner-logo.tsx`, `stay22-widget.tsx`, `kierunki-hero-cta.tsx`, `kierunki/[slug]/page.tsx`, `kierunki/[slug]/[miesiac]/page.tsx`, `porownanie/[para]/page.tsx`, `en/kierunki/[slug]/page.tsx` |
| `expedia` | **22** | `cj-stays.ts`, `cj-stays.test.ts`, `affiliate-links.ts`, `affiliate-brand.ts`, `partner-logo.tsx`, `partner-placements.ts`, `kierunki/[slug]/page.tsx`, `porownanie/[para]/page.tsx` |
| `vrbo` | **26** | same set as expedia |
| `klook` | **23** | `affiliate-config.ts`, `affiliate-links.ts`, `partner-placements.ts`, `partner-logo.tsx`, `activities/search/route.ts`, `kierunki/*` |
| `tiqets` | **16** | same set as klook |
| `hotels.com` / `hotels-com` | **16** | `cj-stays.ts`, `affiliate-links.ts`, `affiliate-brand.ts`, `partner-logo.tsx`, `kierunki/*` |
| `booking.com` | **15** | `liteapi.ts:144` (line in `buildBookingUrl` — must be removed when LiteAPI booking flow lands), `affiliate-links.ts`, `partner-placements.ts`, `affiliate-config.ts:77` (Stay22 fallback), `stay-offers-panel.tsx` |
| `cheapoair` | **10** | `affiliate-config.ts`, `affiliate-links.ts`, `partner-placements.ts`, `partner-logo.tsx`, `kierunki-hero-cta.tsx`, `transfers/search/route.ts` |
| `kiwi.com` | **10** | `affiliate-config.ts` (`kiwicom`), `affiliate-links.ts`, `partner-placements.ts`, `partner-logo.tsx`, `kierunki/*` |
| `kiwitaxi` | **15** | `affiliate-config.ts`, `affiliate-links.ts`, `partner-placements.ts`, `partner-logo.tsx`, `transfers/search/route.ts` |
| `localrent` | **14** | same set as kiwitaxi (transfers area) |
| `yesim` | **22** | `affiliate-config.ts`, `affiliate-links.ts`, `eu-roaming.ts`, `yesim-cta.tsx`, `partner-logo.tsx`, `kierunki/*` |
| `airbnb` | **4** | `affiliate-links.ts`, `affiliate-brand.ts` (badge enums), `partner-placements.ts`, `kierunki-hero-cta.tsx` |
| `hostelworld` | **2** | `affiliate-brand.ts`, `partner-placements.ts` |
| `kiwicom` | **1** | `affiliate-config.ts` |
| `lot.com` | **1** | review and purge (was in copy / partner list) |
| `skyscanner` | **1** | review |
| `tpo.li` | 0 | — |
| `lotglobal` / `lot-global` | 0 | — |
| `getyourguide` | 0 | — |
| `trivago` | 0 | — |
| `agoda` | 0 | — |

**Total occurrences across purge tokens: ~246.**

### 2.2 Tokens that SURVIVE

| Token | Match count | Notes |
|---|---:|---|
| `aviasales` | **36** | Flight pipeline. KEEP. Spec mandates `marker=...` continues to function. |
| `travelpayouts` | **71** | Most matches are in `affiliate-config.ts` (broad TP program portfolio), `travelpayouts-flights.ts` (Flight Data API used by `flight-offers-panel.tsx`). The portfolio config must be **trimmed to Aviasales only** in Phase 1 — `kiwicom`, `cheapoair`, `klook`, `tiqets`, `wegotrip`, `yesim`, `kiwitaxi`, `localrent`, `getrentacar` are all to be removed from the `travelpayoutsUrls` map. The flights API client at `lib/mvp/travelpayouts-flights.ts` is retained because it powers Aviasales price-cache CTAs. |
| `hotellook` | **42** | `lib/mvp/hotellook.ts` is a competing hotel meta-search now superseded by LiteAPI. **DELETE entirely.** Some matches are also in CSP / image hosts — those need re-evaluation when LiteAPI image hosts land. |

### 2.3 Files referencing purge tokens (24 total)

```
src/lib/mvp/travelpayouts-flights.ts        src/lib/mvp/liteapi.ts
src/components/mvp/stay-offers-panel.tsx    src/lib/mvp/data-sources.ts
src/lib/mvp/hotellook.ts                    src/app/api/activities/search/route.ts
src/app/api/transfers/search/route.ts       src/components/site/site-shell.tsx
src/app/kierunki/[slug]/page.tsx            src/lib/mvp/stay22-link-overrides.ts
src/lib/mvp/partner-placements.ts           src/lib/mvp/cj-stays.ts
src/lib/mvp/affiliate-links.ts              src/lib/mvp/affiliate-brand.ts
src/components/site/partner-logo.tsx        src/app/en/kierunki/[slug]/page.tsx
src/lib/mvp/eu-roaming.ts                   src/lib/mvp/affiliate-config.ts
src/components/kierunki/kierunki-hero-cta.tsx
src/components/affiliate/yesim-cta.tsx      src/components/affiliate/stay22-widget.tsx
src/app/porownanie/[para]/page.tsx          src/app/kierunki/[slug]/[miesiac]/page.tsx
src/lib/mvp/cj-stays.test.ts
```

### 2.4 Side-effect of purge

- `next.config.ts` `images.remotePatterns` currently allows `photo.hotellook.com` and `static.cupid.travel`. Once Hotellook is removed and LiteAPI image CDN is identified, swap the host. **Action item for Phase 1: identify LiteAPI image CDN host(s) from sandbox `data/hotels` responses and update CSP `img-src` + `remotePatterns`.**
- CSP currently allows `engine.hotellook.com` and `api.travelpayouts.com` in `connect-src`. After purge: keep `api.travelpayouts.com` (Aviasales Flight Data API), drop `engine.hotellook.com`, ADD `api.liteapi.travel`, ADD LiteAPI payment-host domain (TBD per Section 8 verification), ADD `eu.posthog.com`, ADD Sentry ingest, ADD Anthropic if browser fallback ever needed (otherwise server-side only).

---

## 3. LiteAPI / BLIK / Faktura VAT — Phase 0 Verification

> **Claude Code cannot independently verify activation status of an external SaaS account or what BLIK methods a hosted-payment page exposes for our specific merchant.** The items below are flagged as **OWNER-VERIFY BLOCKERS** — Phase 1 cannot start until each is answered Yes/No in writing by the owner.

### 3.1 LiteAPI Payments product activation — **BLOCKER**

- **Codebase status:** `lib/mvp/liteapi.ts` calls `data/hotels` and (presumably) `hotels/rates`. There is **no** `payments/sessions`, no `prebook`, no `book`, no webhook handler. Section 8 hard-rule (LiteAPI hosted only, zero card fields on helptravel.pl) means Phase 4 cannot ship without LiteAPI Payments turned on.
- **Required answers from owner before Phase 1:**
  1. Is the **LiteAPI Payments product** activated on the merchant account that owns `LITEAPI_API_KEY`? Or is the current key search-only?
  2. Is the merchant of record on LiteAPI's side configured as **HelpTravel** (or a Polish entity owned by you)? If yes, please share the legal entity name + KRS/NIP.
  3. Is a **webhook signing secret** (`LITEAPI_WEBHOOK_SECRET`) provisioned? Where?
  4. What is the LiteAPI **payment-redirect host** (so we can whitelist it in CSP `frame-src` / `form-action`)?
- **If answer to (1) is "no" or "unknown":** Phase 1 still proceeds (purge + client refactor + sandbox smoke), but Phase 4 (checkout + payments) is blocked until activation is confirmed in writing.

### 3.2 BLIK support for PLN — **COMMERCIAL BLOCKER if absent**

- BLIK ≈ 50% of Polish online payments. Spec Section 7.1 calls absence a $500k/year decision.
- **Required from owner / LiteAPI:**
  1. Confirm BLIK is enabled on LiteAPI's hosted payment page for **PLN** transactions originating from Polish IPs.
  2. If yes — sandbox documentation for simulating BLIK payments (e.g. test BLIK code) so we can include it in `scripts/smoke-liteapi.ts` and Playwright E2E.
  3. If no — owner decision required between Section 7.1 options (a) renegotiate with LiteAPI, (b) hybrid model with Przelewy24/PayU for BLIK only, (c) accept addressable-market reduction. **Plan recommendation: option (a) first; if blocked, option (b) requires an additional ~3 weeks of engineering and substantially more PCI-adjacent compliance burden.**

### 3.3 Faktura VAT mechanism — **DECISION BLOCKER**

- ~25% of Polish business travelers require faktura VAT.
- **Two paths exist; both need owner sign-off before Phase 4:**
  - **Path A — LiteAPI issues:** does LiteAPI generate Polish-compliant VAT invoices (with our merchant data, NIP, prawidłowy 8% VAT na usługi hotelowe per polskie przepisy)? If yes, simplest. If yes — confirm exposure in their API.
  - **Path B — We issue via Fakturownia/iFirma:** integrate `https://fakturownia.pl/api/` to issue invoices server-side from booking data. Adds ~1 week of engineering. Accountant must confirm 8% VAT rate is correct for usługi turystyczne under polskie przepisy (this is **not** universal — VAT marża may apply).
- **Current code:** zero invoicing logic exists. `/api/invoices/request` endpoint is new in the spec.
- **Plan default: assume Path B unless LiteAPI confirms Path A within 5 business days.** Allocate Phase 4 budget accordingly. **Owner must consult an accountant** on whether HelpTravel is the merchant of record (Path B) or LiteAPI is (Path A) — this also feeds the regulamin / polityka rewrite (Section 13.3 legal review).

### 3.4 Contractual / merchant-of-record model — **LEGAL BLOCKER**

Spec Section 13.3 explicitly flags this. Owner consults a Polish lawyer specializing in usługi turystyczne. Items to clarify:

1. HelpTravel as **merchant** vs **agent** of LiteAPI for hotels — resolved: **LiteAPI is merchant of record** (User Payment SDK; see Section 0).
2. Disclosure obligations under **Ustawa o usługach hotelarskich** and **Ustawa o imprezach turystycznych i powiązanych usługach turystycznych (2017)**.
3. RODO data-controller vs processor relationship with LiteAPI — DPA required.
4. **No bundling** — architectural commitment (see new item 11) keeps us out of impreza-turystyczna territory; lawyer should confirm.
5. Right of withdrawal limitations (art. 38 pkt 12 ustawy o prawach konsumenta — time-bound travel services).
6. VAT regime — moot on our side because LiteAPI is merchant; LiteAPI's payment partner issues receipts. Confirm we do not have residual VAT obligations as the introducing party.
7. Pre-contractual information disclosure (total price upfront, cancellation deadline before payment).
8. Ustawa o świadczeniu usług drogą elektroniczną — regulamin obligations.
9. Linki afiliacyjne — UOKiK guidance on rekomendacje płatne (Aviasales redirect disclosure).
10. **Polish business entity status** — currently działalność nierejestrowana with JDG trigger plan at the statutory revenue threshold. Lawyer/accountant confirm transition timing and any LiteAPI-merchant-of-record implications across the threshold.
11. **Tour operator financial guarantee (Ustawa o imprezach turystycznych)** — **architectural commitment**: hotels and flights are NEVER bundled as a package on helptravel.pl. Each hotel transaction is an independent purchase via LiteAPI; flights are a separate Aviasales affiliate redirect. UI copy must make the separation visible to the customer. This commitment keeps us out of TFG/UFG obligations.
12. **CEIE registration (rejestr przedsiębiorców turystycznych)** — deferred until JDG registration. Documented as a Phase 9 prerequisite, not a Phase 1–8 blocker, since LiteAPI is merchant of record.

**Recommendation: spend the first ~5 business days of Phase 1 on these blockers in parallel with the affiliate purge work, which is independent.**

---

## 4. Destination Catalog Inventory — `destinations.json` seed proposal

### 4.1 Existing sources in repo

- **`src/lib/mvp/destinations.ts`** — 22 `DestinationProfile` entries, fully scored and metadata-rich (`avgTempByMonth[12]`, `costIndex`, `beachScore`, `cityScore`, `sightseeingScore`, `nightlifeScore`, `natureScore`, `safetyScore`, `accessScore`, `typicalFlightHoursFromPL`, `visaForPL`).
- **`src/lib/mvp/destination-catalog.ts`** — 432-line broader catalog with `slug`, `city`, `country`, `region`, `airportCode`, `aliases[]`. This is the **autocomplete source**. Roughly 100+ entries.
- **`src/lib/mvp/destination-content.ts`, `destination-localization.ts`, `destination-fallback.ts`, `destination-suggestions.ts`** — content and copy layer.

### 4.2 What the spec needs (Section 6.2 Step 2)

Per destination, the Discovery Planner pre-filter requires:

```ts
{
  slug: string;
  city: string;
  country: string;
  iata: string;          // primary airport
  lat: number; lng: number;
  monthlyAvgTempC: [Jan..Dec];          // 12 numbers
  flightTimeFromPLHubs: { WAW: number; KRK: number; GDN: number; WRO: number; KTW: number; POZ: number; RZE: number; LUZ: number; SZZ: number; BZG: number; LCJ: number };
  typicalBudget4Night2Pax: { tier: 'budget'|'mid'|'premium'; avgPlnPerNight: number };
  vibeTags: ('beach'|'city'|'romantic'|'foodie'|'nature'|'party'|'culture'|'family')[];
  visaForPL: boolean;
  heroImage: string;
}
```

### 4.3 Gap vs current data

| Field | In `destinations.ts`? | In `destination-catalog.ts`? | Action |
|---|:---:|:---:|---|
| `slug`, `city`, `country` | ✅ | ✅ | Merge by slug |
| `iata` | partial (only via `destination-catalog.ts:airportCode`) | ✅ | Use catalog as source of truth |
| `lat`, `lng` | ❌ | ❌ | **GAP** — fetch from Geoapify (already integrated) and bake into seed |
| `monthlyAvgTempC[12]` | ✅ (`avgTempByMonth`) | ❌ | Use destinations.ts |
| `flightTimeFromPLHubs` | ❌ (only `typicalFlightHoursFromPL` from PL aggregate) | ❌ | **GAP** — derive heuristically (great-circle × 1.15 ÷ avg cruise, or use a static lookup we own); tolerable approximation for pre-filtering |
| `typicalBudget4Night2Pax` | indirect (`costIndex`) | ❌ | Map costIndex → budget tier (`<1.0`=budget, `1.0–1.4`=mid, `>1.4`=premium); refine with first 1000 LiteAPI sandbox queries |
| `vibeTags` | derivable from beach/city/sightseeing/nightlife/nature scores | ❌ | Compute: `beach` if beachScore>=0.7, `city` if cityScore>=0.8, etc. |
| `visaForPL` | ✅ | ❌ | Use destinations.ts |
| `heroImage` | ✅ via `pexels-media.ts` | ❌ | Use existing pexels resolution |

### 4.4 Proposed seed pipeline

`scripts/build-destinations-seed.ts` (new, run once + CI on catalog change):

1. Read `destinations.ts` (22 scored profiles) ∪ `destination-catalog.ts` (~100 entries by airport).
2. For each entry: enrich with Geoapify lat/lng (cache in repo to avoid runtime calls), derive `flightTimeFromPLHubs` from great-circle, compute `vibeTags`, map `costIndex → typicalBudget4Night2Pax.tier`, resolve `heroImage` via `pexels-media.ts`.
3. Emit `data/destinations.json` (~100 entries, ~80 KB minified). Checked into the repo.
4. Discovery Planner reads this file at request time (no DB hit, no API call for pre-filter).

### 4.5 Decision: file vs DB

The spec offers either. **Recommendation: ship as `data/destinations.json` first.** Rationale: stateless, edge-friendly, version-controlled, trivial to diff in PR. Promote to `Destination` Prisma model only if/when admin needs to edit live (Phase 8+).

---

## 5. Files to Create / Modify / Delete (master diff plan)

### 5.1 Create (new files)

```
src/lib/liteapi/
  client.ts            search.ts            rates.ts             hotel.ts
  prebook.ts           book.ts              payments.ts          retrieve.ts
  cancel.ts            webhook.ts           places.ts            types.ts
  errors.ts            __tests__/*.ts (msw mocks of every documented response)

src/lib/money.ts                    # Decimal helpers, grosze ↔ display
src/lib/encryption.ts               # AES-GCM at app layer for PII
src/lib/anthropic.ts                # Claude SDK wrapper
src/lib/email/
  client.ts            templates/booking-confirmation.tsx (react-email)
  templates/prestay.tsx templates/cancel-deadline.tsx
  templates/post-stay-review.tsx templates/abandoned-cart.tsx
src/lib/pdf/booking-confirmation.tsx     # @react-pdf/renderer
src/lib/invoices/fakturownia.ts          # if Path B
src/lib/observability/sentry.ts          src/lib/observability/posthog.ts
src/lib/observability/logger.ts          # pino

src/app/hotele/page.tsx                          src/app/hotele/szukaj/page.tsx
src/app/hotele/[hotelId]/page.tsx                src/app/hotele/rezerwacja/page.tsx
src/app/rezerwacja/oczekiwanie/page.tsx          src/app/rezerwacja/[ref]/page.tsx
src/app/moje-rezerwacje/page.tsx

src/app/api/hotels/search/route.ts               src/app/api/hotels/rates/route.ts
src/app/api/hotels/[hotelId]/route.ts            src/app/api/hotels/prebook/route.ts
src/app/api/hotels/payment-session/route.ts      src/app/api/hotels/payment-webhook/route.ts
src/app/api/hotels/book/route.ts                 src/app/api/hotels/booking/[ref]/route.ts
src/app/api/hotels/booking/by-session/[id]/route.ts
src/app/api/hotels/cancel/[ref]/route.ts
src/app/api/places/autocomplete/route.ts
src/app/api/planner/discovery/route.ts (SSE)
src/app/api/abandoned-cart/email/route.ts (cron)
src/app/api/invoices/request/route.ts
src/app/api/redirect/flights/route.ts            # neutered redirect proxy

src/components/hotele/                           # search, filter, map, card, gallery, room table, checkout steps, summary rail
src/components/checkout/                         # multi-step state machine
src/components/discovery/                        # SSE streaming UI
src/components/ui/                               # shadcn/ui-style primitives

prisma/migrations/<ts>_add_booking_pipeline/migration.sql
data/destinations.json                           # Section 4 seed
scripts/build-destinations-seed.ts               scripts/smoke-liteapi.ts
PURGE_REPORT.md                                  # end of Phase 1
```

### 5.2 Modify (existing files — substantive rewrites)

```
next.config.ts                       # CSP, remotePatterns, frame-src for LiteAPI host
prisma/schema.prisma                 # add Hotel/Prebook/Booking/Invoice/etc. (Section 1.5)
src/lib/mvp/liteapi.ts               # split into /lib/liteapi/* — this file is deleted last, after callers migrate
src/lib/mvp/affiliate-config.ts      # trim travelpayoutsUrls to {aviasales} only; remove Stay22 helper
src/lib/mvp/affiliate-links.ts       # purge non-Aviasales builders
src/lib/mvp/affiliate-brand.ts       # purge non-Aviasales brand metadata
src/lib/mvp/data-sources.ts          # purge non-Aviasales/LiteAPI sources
src/lib/mvp/ai.ts                    # OpenAI → Anthropic
src/components/site/site-shell.tsx   # footer "Partnerzy rezerwacyjni" → Aviasales only
src/components/site/partner-logo.tsx # TRUSTED_PARTNERS → Aviasales only
src/components/kierunki/kierunki-hero-cta.tsx  # 3-CTA → 2-CTA
src/components/mvp/stay-offers-panel.tsx       # rewire to /hotele/[hotelId] internal
src/components/mvp/planner-client.tsx          # standard-mode results page rewiring
src/app/kierunki/[slug]/page.tsx               # 2-CTA model
src/app/kierunki/[slug]/[miesiac]/page.tsx     # delete Stay22 iframe, native preview
src/app/porownanie/[para]/page.tsx             # 2 internal hotel CTAs + 2 Aviasales flight CTAs
src/app/inspiracje/**, /city-breaki, /cieple-kierunki, /tanie-podroze,
  /weekendowe-wyjazdy, /bez-wizy, /przewodniki, /najlepsze-kierunki/[sezon]
                                     # all destination CTAs → internal hotel search
src/app/o-nas, /jak-pracujemy, /regulamin, /polityka-prywatnosci,
  /linki-partnerskie, /dla-partnerow, /standard-redakcyjny, /cennik, /faq
                                     # rewrite — merchant model framing (legal-review-gated)
src/app/page.tsx + src/components/home/*  # add second hero entry "Nie wiem dokąd lecieć" → Discovery
                                     # NB: respects the "homepage nietykalna" memory rule —
                                     # any homepage edits MUST get explicit owner sign-off in Phase 7
.env.example                         # add new vars, remove dead ones
package.json                         # add deps (Section 5.4); update test script
```

### 5.3 Delete (entire files)

```
src/lib/mvp/cj-stays.ts              src/lib/mvp/cj-stays.test.ts
src/lib/mvp/stay22-link-overrides.ts src/lib/mvp/partner-placements.ts
src/lib/mvp/eu-roaming.ts            src/lib/mvp/hotellook.ts
src/components/affiliate/yesim-cta.tsx
src/components/affiliate/stay22-widget.tsx
src/components/mvp/activity-offers-panel.tsx
src/components/mvp/transfer-offers-panel.tsx
src/components/site/partner-placement-section.tsx (review — likely delete)
src/app/api/activities/search/route.ts
src/app/api/transfers/search/route.ts
src/app/api/stays/search/route.ts (replaced by /api/hotels/search)
src/app/api/redirect/[provider]/route.ts (replaced by /api/redirect/flights)
src/app/en/**/page.tsx (already redirected by middleware; remove dead routes)
```

### 5.4 Dependencies to install

```
# Core booking pipeline
@anthropic-ai/sdk          decimal.js                 react-email @react-email/components
@react-pdf/renderer        resend                     @sentry/nextjs
posthog-js posthog-node    pino                       date-fns date-fns-tz
maplibre-gl react-map-gl   @vis.gl/react-maplibre

# UI primitives (shadcn-style)
class-variance-authority   clsx tailwind-merge        lucide-react
@radix-ui/react-dialog     @radix-ui/react-tabs       @radix-ui/react-accordion
@radix-ui/react-popover    @radix-ui/react-select     @radix-ui/react-slot
@radix-ui/react-toast      embla-carousel-react       cmdk

# Forms
react-hook-form            @hookform/resolvers        # zod resolver

# Testing
@playwright/test           msw                        @axe-core/playwright   k6 (devops)
vitest                     # to replace the hard-coded node:test list
```

### 5.5 Dependencies to remove

None unconditionally — all current deps stay needed. Remove **only** if a purge step kills their last importer:
- check `fuse.js` after destination-suggestions audit (likely keep)
- nothing else qualifies

---

## 6. Legal Review Section (for owner's lawyer)

The owner consults a Polish lawyer before regulamin / polityka publication. Hand the lawyer this list:

1. **Merchant of record for hotel sales** — HelpTravel vs LiteAPI. Implications: invoice issuer, RODO controller/processor, complaint handling, refund obligations.
2. **Ustawa o imprezach turystycznych i powiązanych usługach turystycznych (2017)** — does selling a single hotel night classify as a powiązana usługa turystyczna or is it outside scope (since flights are pure affiliate redirect, not bundled)? Confirm we are NOT a tour operator and TFG/UFG obligations do not attach.
3. **Ustawa o prawach konsumenta art. 38 pkt 12** — right-of-withdrawal carve-out for time-bound travel services. Confirm wording on the checkout page.
4. **RODO** — data flow: helptravel.pl collects guest data → LiteAPI processes payment → LiteAPI shares booking with hotel. Confirm DPA exists with LiteAPI; cookie banner consent categories sufficient.
5. **VAT regime for hotel resale in PL** — 8% VAT na usługi hotelowe vs. **VAT marża** (special travel-services scheme, 23% on margin). Accountant decision dictates Faktura Path A vs B (Section 3.3).
6. **Faktura VAT compliance** — required fields per ustawa o VAT (NIP nabywcy, data sprzedaży, stawka, kwota brutto).
7. **Pre-contractual information disclosure** — total price upfront, cancellation policy before payment, identity of merchant, complaint process, ODR link.
8. **Ustawa o świadczeniu usług drogą elektroniczną** — regulamin obligations.
9. **Linki afiliacyjne / oznaczenie reklamy** — Aviasales redirect must be disclosed per UOKiK guidance on rekomendacje płatne.

This is a flag list. **Claude does not give legal advice.**

---

## 7. Risks Identified

| Risk | Impact | Mitigation |
|---|---|---|
| BLIK absent from LiteAPI hosted page | Up to 50% revenue cap | Confirm Phase 0; if absent, escalate to owner per Section 7.1 options |
| LiteAPI Payments (User Payment SDK) not activated on owner's account | Phase 4 blocker | Owner contacts LiteAPI in parallel with Phase 1. **If activation cannot be obtained within 30 days of Phase 4 start, STOP the project and renegotiate with LiteAPI. Do NOT add a second payment processor (Stripe Connect, Adyen, etc.) under any circumstances.** Master spec Section 8 is final: LiteAPI hosted is the only payment path. |
| VAT regime ambiguity (8% vs marża) | Wrong invoices issued = audit risk | Accountant decision before Phase 4 starts |
| Polish travel-law classification | Could re-classify HelpTravel as tour operator → TFG obligations | Lawyer confirms single-hotel-night ≠ impreza turystyczna; we never bundle |
| LiteAPI image CDN host unknown | CSP / next/image misconfig blocks images | Capture host(s) from sandbox responses in Phase 1 day 1 |
| `frame-src` host for LiteAPI payment redirect unknown | Payment redirect blocked by CSP | Same as above |
| Memory rule "homepage nietykalna" | Conflicts with Section 5.1 second-tab "Nie wiem dokąd lecieć" hero entry | Phase 7 only; explicit owner sign-off required before any homepage edit; respect rule |
| Memory rule "Planer = tylko Travelpayouts" | Master spec OVERRIDES this | Memory should be updated post-approval; confirm with owner on approval |
| 246+ purge occurrences | Easy to miss in copy / SEO content / structured data | PURGE_REPORT.md final grep gate at end of Phase 1 (zero matches) |
| Polish corporate entity / KRS / NIP unknown | Footer trust signals incomplete | Owner provides legal entity data before Phase 8 |
| LiteAPI rate-list vs prebook drift > 1% | UX regression / cart abandonment | Section 5.4 force-reconfirm modal; logged for tuning |
| Discovery LLM cost runaway | Margin erosion | Per-IP daily cap (`DISCOVERY_LLM_DAILY_CAP=50`), 30-min hash cache, weekly prompt-drift audit |
| `react-compiler: true` + new third-party libs | Build/runtime regressions | Validate each new dep boots cleanly in `pnpm dev` and `pnpm build` |
| Existing tests are a hard-coded list, not a runner | Coverage rot risk | Migrate to vitest in Phase 1; add coverage gates by Phase 8 |
| `/en` page tree still exists despite middleware redirect | SEO duplicate / dead code | Remove in Phase 7 cleanup pass |
| `liteapi.ts:144` builds Booking.com URL even though new fix removed TP wrapper | Still leaks Booking branding once Phase 4 lands | Replaced by internal `/hotele/[hotelId]` deeplink in Phase 2 |

---

## 8. Phase 1 Entry Conditions — APPROVED

Phase 1 = affiliate purge + LiteAPI client refactor + sandbox smoke test (no production payment code yet).

Owner-confirmed at Phase 0 review:

1. ✅ **Phase 1 approved** with deliverables in Sections 5.1–5.5 above.
2. ✅ **LiteAPI sandbox key** present in `.env.local` (real value supplied).
3. ✅ **Anthropic API key** present in `.env.local` (real value supplied).
4. ⚠️ **`LITEAPI_WEBHOOK_SECRET`** — placeholder for now; real value at Phase 4 kickoff (when LiteAPI Payments activation completes).
5. ⚠️ **`SENTRY_DSN`** — placeholder for Phase 8 (observability pass).
6. ⚠️ **`NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST`** — placeholder for Phase 8.
7. ⚠️ **`RESEND_API_KEY`** — placeholder for Phase 5 (email sequences). Email provider chosen: **Resend**.
8. ✅ **Geocoding** — **Nominatim (OpenStreetMap)**, no API key required. Used for `destinations.json` enrichment in `scripts/build-destinations-seed.ts`.
9. ✅ **BLIK / Faktura / merchant-of-record** — resolved by Section 0 above (LiteAPI is merchant of record; their payment partner issues receipts; BLIK availability is LiteAPI's responsibility, not ours).
10. ✅ **Memory-rule override acknowledged**: "Planer = tylko Travelpayouts" is overridden by master spec. Travelpayouts exits the hotel pipeline entirely. **Aviasales (a Travelpayouts brand) survives for FLIGHTS ONLY.** `lib/mvp/hotellook.ts` is full delete target (program closed 2025-10-20).
11. ✅ **Homepage second-tab CTA** ("Nie wiem dokąd lecieć") deferred to Phase 7 with explicit owner sign-off then. Memory rule "homepage nietykalna" respected through Phases 1–6.

### Phase ordering — confirmed against master spec

Reverts to `HELPTRAVEL_MASTER_SPEC.md` Section 15 verbatim:

- **Phase 1** — purge + LiteAPI client + sandbox smoke (THIS PHASE).
- **Phase 2** — `/hotele`, `/hotele/szukaj`, planner-results hotel section rewire.
- **Phase 3** — `/hotele/[hotelId]` detail.
- **Phase 4** — checkout + LiteAPI hosted payment + booking persistence.
- **Phase 5** — confirmation, booking management, retention emails.
- **Phase 6** — Discovery Planner (the strategic moat). LLM cost mitigated by `DISCOVERY_LLM_DAILY_CAP=50/IP/day` per master spec Section 6.4.
- **Phase 7** — re-wiring all content pages; homepage second-tab.
- **Phase 8** — observability, SEO, A11y, perf, compliance pass.
- **Phase 9** — sandbox → production switch.

---

## 9. STOP

Phase 0 deliverables are complete:

- ✅ Repo audit (Section 1)
- ✅ Affiliate purge grep with file list and per-token counts (Section 2)
- ✅ LiteAPI Payments / BLIK / Faktura VAT verification — flagged as owner-verify blockers with concrete questions (Section 3)
- ✅ Destination metadata inventory and `destinations.json` seed proposal (Section 4)
- ✅ Files to create / modify / delete (Section 5)
- ✅ Env vars to add (Section 1.6 + 5.4)
- ✅ Dependencies to install (Section 5.4)
- ✅ Legal review section (Section 6)
- ✅ Risks identified (Section 7)

**Awaiting explicit owner approval before starting Phase 1.**
