# HelpTravel.pl — Master Spec
## From Affiliate Hub to $1M ARR Polish OTA

> **Read this entire document before writing any code. Re-read the relevant section at the start of every phase. This is not a feature list — it is a commercial brief with technical execution requirements.**

---

## OWNER MINDSET (read this first)

You are not a contractor implementing tickets. You are the principal engineer of a business with a **12-month, $1M ARR target**. Every architectural decision, every UI element, every line of copy is a **conversion decision** or a **margin decision** — never a stylistic preference.

The math, so you internalize the weight:

- Target: **$1M ARR ≈ 4M PLN revenue**.
- LiteAPI hotel markups land 8–15% of GMV. At 12% blended, we need ~33M PLN GMV.
- Average Polish city-break booking: ~3000 PLN.
- That's ~11,000 paid bookings/year ≈ **~30 paid bookings/day**.
- A well-optimized OTA converts 2–4% of search sessions to bookings. Call it 3%.
- We therefore need ~1000 hotel-search sessions/day ≈ ~360k/year.
- HelpTravel's existing SEO content asset (catalog of `/kierunki/*`, `/inspiracje/*`, comparison pages, monthly destination pages) plausibly delivers 50–150k sessions/month already. **The traffic isn't the bottleneck. The booking flow is.**

**Currently, HelpTravel earns zero on hotels.** The screenshots from the planner (Malaga 14–18.05.2026, 10 hotels priced 2728–4539 zł, beautifully aggregated) confirm a working data and UX layer — but every hotel click redirects to Booking.com. HelpTravel does 100% of the work (SEO, content, aggregation, planning UX) and Booking takes 100% of the margin. **This is the bug worth $1M to fix.**

Therefore:

1. **Conversion rate is the lever.** Every UX decision is justified by its impact on funnel completion. Skeleton loaders aren't "best practice" — they recover ~1% conversion per 100ms of perceived speed. Map view isn't "nice to have" — map-using sessions convert ~2× higher. Transparent total pricing isn't optional — hidden taxes cause 25–40% cart abandonment.
2. **Polish-market specifics are revenue-critical.** BLIK is ~50% of Polish online payments. Faktura VAT is required by ~25% of business travelers. Polish-language confirmation emails are required by trust. These are not localization niceties — they are revenue gates.
3. **Repeat purchase compounds.** A booking earned once and never re-engaged is half a booking. Build saved plans, email follow-up, post-trip review prompts, and personalized re-targeting from day one. A user who books twice is worth ~3× a one-time user (CAC amortizes).

You will execute every section below at this standard. The owner has explicitly stated: **"I do not want to come back and ask for fixes."** Self-review against this brief at the end of every phase. Production-grade only — typed, tested, error-handled, observable.

---

## SECTION 0 — THE BUG WORTH $1M

### Current state (verified externally via the live site + screenshots)

- The planner at `/planner?mode=standard&destination=Malaga&origin=Warszawa&startDate=2026-05-14&endDate=2026-05-18&travelers=2&rooms=1` displays a section **"Konkretne oferty hoteli"** with 10 real hotels and PLN totals (SOL by Meliá Málaga Guadalmar 2728 zł, Holiday Inn Express Málaga Airport 3030 zł, Sercotel Rosaleda Málaga 3038 zł, Soho Boutique Las Vegas 3613 zł, Eurostars Málaga 3768 zł, Hotel MS Maestranza Málaga Centro 3799 zł, Petit Palace Plaza Málaga 3886 zł, ICON Malabar 3931 zł, Ilunion Málaga 4201 zł, Barceló Málaga Hotel 4539 zł).
- Each hotel card has copy: *"Ceny pobytu w PLN. Klik prowadzi do partnera, gdzie finalizujesz rezerwację."*
- **Clicking any hotel redirects the user to booking.com** (via the internal `/api/redirect/stays` proxy).
- The flights section (`Konkretne oferty lotów`) uses Travelpayouts cache (5 flights from 140 zł, with real schedule data 10:10→14:10 etc.) — **flights stay on Aviasales redirect, that's the affiliate income that survives**.
- Footer "Partnerzy rezerwacyjni" lists 13 partners: Aviasales, Hotels.com, Expedia, Vrbo, CheapOair, Klook, Tiqets, Kiwi.com, Kiwitaxi, Localrent, LOT Global, Yesim, plus Stay22 embedded in `/kierunki/[city]/[month]` pages.

### Required state (after this work)

- The same hotel cards exist, look as polished or better, and are **populated from LiteAPI** (production credentials available).
- Clicking any hotel opens **`/hotele/[hotelId]?checkin=...&checkout=...&travelers=...`** on helptravel.pl. No external redirect. Ever.
- The user views rooms, picks a rate, enters guest details, is redirected ONLY to LiteAPI's hosted payment page for card entry, returns to helptravel.pl, receives a Polish confirmation email with PDF, and can manage the booking at `/moje-rezerwacje`.
- All other affiliate partners are **deleted** from the codebase. Aviasales remains for flights. LiteAPI is the supplier (not surfaced as a partner brand). Footer "Partnerzy rezerwacyjni" shows Aviasales only.
- The Discovery Planner (`/planner?mode=discovery`) becomes a real AI Concierge that ranks destinations against actual LiteAPI availability — Booking.com cannot do this and will not in the foreseeable future. This is HelpTravel's moat.

---

## SECTION 1 — REVENUE MODEL (the only two pipelines that survive)

| Pipeline | Source | Mechanic | Margin | Annual target |
|---|---|---|---|---|
| **Hotels** | LiteAPI (production) | HelpTravel as merchant. User pays via LiteAPI hosted payment. We earn LiteAPI markup. | 8–15% of GMV | 80%+ of revenue |
| **Flights** | Aviasales affiliate | Deeplink redirect with `marker=713275`. User completes purchase on Aviasales. We earn affiliate commission. | ~2% of GMV | 15–20% of revenue |
| **Discovery Planner** | LiteAPI + LLM | Indirect — drives top-of-funnel SEO + brand differentiation + repeat. | (no direct revenue, but 2–3× LTV via retention) | strategic |

**Everything else dies.** Activities, transfers, car rentals, eSIMs — the affiliate revenue from these is a rounding error compared to focused hotel margin. We do not need 12 partners earning pennies. We need one pipeline earning meaningful margin.

---

## SECTION 2 — AFFILIATE PURGE (Phase 1, before any new code)

**Decision is final. Two pipelines survive. Everything else is deleted, not hidden, not commented-out.**

### Surviving integrations

1. **LiteAPI** — hotels, full booking pipeline, native on-domain.
2. **Aviasales** — flights, affiliate redirect, no API.

### Tokens to grep and remove (zero matches must remain in source)

```
stay22         booking.com    hotels.com     hotels-com
expedia        vrbo           airbnb         hostelworld
cheapoair      tpo.li         klook          tiqets
kiwi.com       kiwicom        kiwitaxi       localrent
lot.com        lotglobal      lot-global     yesim
getyourguide   skyscanner     trivago        agoda
travelpayouts  (only the brand string in copy/UI; tpapi for flights search may stay if used; verify)
```

`aviasales` and `marker=713275` MUST remain — those power flight CTAs.

### Files & areas to update

- **`/api/redirect/*` proxy** — collapse to a single `/api/redirect/flights` (Aviasales only). Delete `/stays`, `/cars`, `/activities`, `/transfers`, `/esim` handlers entirely. Hotel destinations now go to internal routes; no proxy needed.
- **Planner results page** (the page in the screenshots) — the hotel section cards must change their `href` from `/api/redirect/stays?url=booking.com/...` to `/hotele/[liteApiHotelId]?checkin=...&checkout=...&travelers=...&rooms=...`. The flight section cards keep their Aviasales redirect. The `<small>` copy *"Klik prowadzi do partnera, gdzie finalizujesz rezerwację"* changes for hotels to *"Cena finalna w PLN. Rezerwujesz bez wychodzenia ze strony."* and stays as-is for flights.
- **Footer "Partnerzy rezerwacyjni" component** — show Aviasales only.
- **`/kierunki/[city]` template** — replace 3-CTA block (Pobyt: Hotels.com / Loty: CheapOair / Mobilność: CheapOair) with 2-CTA block (Hotele [internal LiteAPI] / Loty [Aviasales]). Delete the cars CTA.
- **`/kierunki/[city]/[month]` template** — DELETE the Stay22 iframe. Replace with native preview + CTA to internal hotel search prefilled with mid-month + 4-night defaults.
- **`/porownanie/[a]-vs-[b]`** — replace partner CTAs with two internal hotel CTAs (one per city) and two Aviasales flight CTAs.
- **Theme pages**: `/inspiracje/*`, `/city-breaki`, `/cieple-kierunki`, `/tanie-podroze`, `/weekendowe-wyjazdy`, `/bez-wizy`, `/przewodniki` — every destination CTA opens internal hotel search. Flight CTAs go Aviasales. Delete all other partner CTAs.
- **Copy pages** (`/o-nas`, `/jak-pracujemy`, `/regulamin`, `/polityka-prywatnosci`, `/linki-partnerskie`, `/dla-partnerow`, `/standard-redakcyjny`, `/cennik`, `/faq`) — rewrite. Old framing: *"transparent affiliate aggregator linking to multiple booking partners"*. New framing: *"HelpTravel sells hotels directly via LiteAPI as merchant; flights are affiliate-linked via Aviasales."* This is a substantive change in legal status — flag in `INTEGRATION_PLAN.md` under "Legal review needed". The owner consults a lawyer.
- **`next.config.*`** — remove image domains for purged partners (booking.com CDN, hotels.com CDN, etc.). Add LiteAPI image domains.
- **`package.json`** — remove SDKs/widgets for purged partners.
- **`.env.example`** — remove keys for purged partners.

### Verification deliverable

At the end of Phase 1, produce `PURGE_REPORT.md` with: final grep results (must be zero except Aviasales), deleted file list, modified file diffs summary, updated footer screenshot.

---

## SECTION 3 — LiteAPI Integration Layer (`/lib/liteapi/`)

Components NEVER call LiteAPI directly. All access through this typed wrapper.

### Files

- `client.ts` — fetch wrapper. Reads `LITEAPI_PROD_KEY`, `LITEAPI_PROD_PRIVATE_KEY`, `LITEAPI_WEBHOOK_SECRET` from env. Exponential backoff (3 retries, jitter), AbortController, X-API-Key header, redacted PII logging, 30s default timeout, 60s for prebook/book.
- `search.ts` — `searchHotels({ destination, checkin, checkout, occupancies, currency='PLN', language='pl', radius?, lat?, lng? })`. Returns normalized `HotelSearchResult[]`.
- `rates.ts` — `getRates(hotelIds[], occupancies, dates, currency)` with cancellation, board basis, refundability, total inc. taxes per rate.
- `hotel.ts` — `getHotelDetails(hotelId)` — descriptions, photos, amenities, address, geo, policies, reviews if available.
- `prebook.ts` — `prebook(rateId)` returns `prebookId`, final price, cancellation snapshot.
- `book.ts` — `book({ prebookId, guests, holderInfo, paymentToken })` with server-generated UUID idempotency key persisted in DB.
- `payments.ts` — `createPaymentSession({ prebookId, returnUrl, cancelUrl, locale: 'pl', preferredMethods: ['blik','card'] })` LiteAPI hosted only. See Section 8.
- `retrieve.ts` — `getBooking(bookingId)`.
- `cancel.ts` — `cancelBooking(bookingId)` with refund eligibility.
- `webhook.ts` — `verifyWebhookSignature(rawBody, signatureHeader, secret)` HMAC.
- `places.ts` — destination autocomplete via LiteAPI locations endpoint, fallback documented.
- `types.ts` — full TS types mirroring LiteAPI v3. No `any`. Discriminated unions for rate variants.
- `errors.ts` — typed hierarchy: `LiteApiNetworkError`, `LiteApiRateExpiredError`, `LiteApiSoldOutError`, `LiteApiPaymentDeclinedError`, `LiteApiValidationError`, `LiteApiWebhookSignatureError`, `LiteApiUnknownError`. Each maps to Polish user-facing message + internal log code.

### Critical rules

- Add Zod schemas for every external response. Validate on the boundary. Fail loudly in dev, gracefully in prod (fallback + Sentry alert).
- All money in **minor units (grosze)**. Use `Decimal.js` or string math. Floats are forbidden.
- Currency: always store LiteAPI source currency on every record; display PLN. Convert via LiteAPI's published rates only — never made up.
- Never log card data, full email addresses without redaction, or full phone numbers in non-booking logs.

---

## SECTION 4 — Server Routes (`/app/api/...`)

LiteAPI keys NEVER exposed to browser. All calls via Server Actions or Route Handlers.

- `POST /api/hotels/search` — proxy. Cache 60s in Vercel KV/Upstash, key = hash(query).
- `POST /api/hotels/rates` — rates fetch.
- `GET  /api/hotels/:hotelId` — cache 1h, ISR for top 1000 IDs.
- `POST /api/hotels/prebook` — persist prebook record before LiteAPI call.
- `POST /api/hotels/payment-session` — calls LiteAPI payments, returns redirect URL. Signed session token persisted.
- `POST /api/hotels/payment-webhook` — verifies signature, finalizes booking, sends confirmation email + faktura VAT if requested.
- `POST /api/hotels/book` — internal finalizer post-payment.
- `GET  /api/hotels/booking/:ref` — signed-token lookup.
- `GET  /api/hotels/booking/by-session/:sessionId` — polling endpoint for return-URL UI.
- `POST /api/hotels/cancel/:ref` — cancellation.
- `GET  /api/places/autocomplete?q=...` — autocomplete proxy.
- `POST /api/planner/discovery` — AI Discovery Planner (Section 6).
- `POST /api/abandoned-cart/email` — internal cron-triggered for cart recovery (Section 10).
- `POST /api/invoices/request` — Polish faktura VAT request (Section 7).

### Rate limits via `@upstash/ratelimit`

- Search: 60 req/min/IP.
- Payment-session: 10 req/min/IP.
- Discovery: 20 req/min/IP, daily cap 50/IP/day.
- Book: 5 req/min/IP.

---

## SECTION 5 — Hotel Booking UX (Booking-tier, conversion-obsessed)

Tailwind + shadcn/ui patterns. Mobile-first (375px tested), tablet, desktop. Polish copy throughout, native voice (not translated). **Polish online travel users are >60% mobile.** Mobile UX is the priority canvas, not desktop.

### 5.1 `/hotele` — Search landing

- Hero: destination autocomplete (debounced 200ms, hits `/api/places/autocomplete`), date range picker (PL locale, 2 months visible desktop, 1 month mobile), guests/rooms popover (adults, children with ages, rooms).
- "Szukaj" — large, primary, sticky on mobile after scroll.
- Trust strip below hero: **"Płacisz w PLN", "Bezpłatna anulacja w wybranych hotelach", "Wsparcie w języku polskim", "Faktura VAT na życzenie"**. Each with an icon. Each is REAL — never bullshit copy.
- Recently viewed hotels (localStorage), recent searches.
- Popular destinations grid (curated, links to internal search).
- Second tab on hero: **"Nie wiem dokąd lecieć"** → Discovery Planner. This entry point is critical — it's the moat.

### 5.2 `/hotele/szukaj` — Search results — *the page that must feel like Booking*

This page exists already (in the planner) with decent design. Upgrade it to standalone search results with full filtering. Keep the visual DNA from the planner (white cards, PLN price emphasis, "NAJTAŃSZE" badge for the lowest).

- Sticky top bar with editable search params (drawer on mobile).
- **Filters** (left sidebar desktop, bottom-sheet mobile): price range, star rating, guest score, property type (hotel/apartment/aparthotel/hostel), neighborhoods, amenities (wifi, parking, breakfast, pool, AC, family-friendly, pets), distance from center, cancellation type (free / paid), bed type. All filters update URL — every results page is shareable.
- **Sort**: rekomendowane (default — score weighted by rating + price + cancellation flexibility + distance), cena rosnąco/malejąco, ocena gości, odległość od centrum.
- **Result card**: image carousel (Embla, swipe on mobile), name, star rating, neighborhood + walk-time to landmark if available, top 3 amenity icons, guest score pill (e.g. "8.7 Bardzo dobry"), 1-line review snippet if available, price block with: nights × guests breakdown line, total in PLN bold, **"wł. podatków i opłat"**, strike-through if discounted, "Bezpłatna anulacja do DD.MM" tag if applicable, CTA **"Zobacz pokoje"** primary.
- **"NAJTAŃSZE" / "NAJLEPSZA OCENA" / "BEZPŁATNA ANULACJA" badges** — keep the existing pattern from the current planner. These are conversion-positive.
- **Map toggle** (right side desktop, full-screen sheet mobile): MapLibre or Mapbox. Card↔pin hover sync. Map pans to result bounds. Pins show price labels. Mobile: full-screen map mode with bottom-sheet result list. **Map sessions convert ~2× higher** — make it discoverable, not buried.
- **Skeleton loaders** for the entire result list during fetch. Never spinners. Streaming SSR delivers first batch fast, hydrates more.
- **Pagination or infinite scroll** with "Załaduj więcej". Preserve scroll position on back-navigation (Next.js scroll restoration).
- **Empty state** with helpful suggestions: broaden dates, change area, raise budget, jump to Discovery Planner.

### 5.3 `/hotele/[hotelId]` — Hotel detail — *the conversion moment*

- **Photo gallery hero** with full-screen lightbox (Embla, lazy-loaded, 4:3 aspect ratio reserved to prevent CLS).
- **Sticky right-rail booking widget** (desktop) / sticky bottom CTA (mobile). Always shows: dates (editable inline), guests, lowest available rate total in PLN, **"Wybierz pokój"** primary button. Scroll-following.
- **Sections** anchored in tabs: Przegląd, Pokoje, Udogodnienia, Lokalizacja, Polityka, Opinie. Mobile: accordion.
- **Rooms section is the conversion point.** Responsive table: room type (with bed icons + "łóżko małżeńskie / 2 pojedyncze"), max guests, board basis ("ze śniadaniem / bez wyżywienia / all inclusive"), cancellation policy line ("Bezpłatna anulacja do DD.MM" or "Bezzwrotne — najtańsza opcja"), price per night, **total bold in PLN**, "Wybierz" button.
- Each rate row exposes a "Co obejmuje cena?" tooltip with taxes/fees breakdown. **Hidden taxes are the #1 cart-abandonment driver. Show all of them upfront.**
- **Map embed** pinned to hotel coords with 5–10 nearby POIs (top attractions, transit, food).
- **Reviews**: only if LiteAPI returns them. Never fabricate. If absent, hide the section — don't show "no reviews yet" (signals weakness).
- **"Co inni o tym myślą"** social proof block: if guest score ≥ 8, show it large with "Polecane przez X% gości"-style copy IF that data is real per LiteAPI. Otherwise omit.

### 5.4 `/hotele/rezerwacja` — Checkout (multi-step) — *the most carefully engineered page on the site*

Every checkout abandonment is a direct revenue loss. Polish e-commerce convention: 3 visible steps, progress bar at top.

- **Step 1 — Goście**: title (Pan/Pani/inne), first/last name (PL diacritics supported, max 40 chars each), email (validated), phone with PL prefix default `+48`, special requests free text 200 chars.
- **Step 2 — Dane do faktury (opcjonalnie)**: collapsed by default. *"Potrzebujesz faktury VAT? Rozwiń."* Polish company NIP field with checksum validation. Company name, address. We collect this and pass to faktura issuance flow (Section 7).
- **Step 3 — Płatność**: **LiteAPI hosted flow only** (Section 8). UI here is just a summary + CTA *"Przejdź do bezpiecznej płatności"*. Below CTA, payment method icons (BLIK, Visa, Mastercard, Apple Pay, Google Pay) — only the ones LiteAPI's hosted page actually supports. Confirmed in Phase 0.
- **Persistent right-rail order summary** (always visible, sticky on desktop, collapsible on mobile): hotel image, dates, room, cancellation cutoff with countdown, price breakdown (nocleg, podatki i opłaty, razem), and a "Co dostajesz" trust list (potwierdzenie mailem, faktura VAT na życzenie, polskie wsparcie).
- **Price drift handling**: call `prebook` when user finishes Step 1. If prebook total > rate-list total by >1%, BLOCK auto-continue with a friendly modal: *"Cena nieznacznie się zmieniła z X zł na Y zł, ponieważ dostawca zaktualizował stawkę. Czy kontynuujesz?"* with two buttons. Never silently change the price.
- **Loading state during payment redirect**: full-screen *"Przekierowujemy do bezpiecznej płatności…"* with the LiteAPI/payment provider logo if branding allows. `beforeunload` blocked.
- **Abandonment signal capture**: if user enters Step 1 with email and abandons before Step 3, store email + cart context for 7-day recovery email cron (Section 10).

### 5.5 `/rezerwacja/oczekiwanie?session=...` — Post-payment polling

- Polls `/api/hotels/booking/by-session/:sessionId` every 2s for up to 90s.
- Reassuring copy: *"Finalizujemy rezerwację — to potrwa kilka chwil. Nie zamykaj okna."*
- Loading animation that does NOT look like an error.
- On `confirmed` → redirect to `/rezerwacja/[ref]`.
- On `failed` → show clear failure message with next steps (try again / contact support).
- On 90s timeout → *"Płatność trwa dłużej niż zwykle. Sprawdzimy status i wyślemy potwierdzenie mailem w ciągu kilku minut. Możesz zamknąć tę kartę bezpiecznie."* The webhook handler completes the booking async.

### 5.6 `/rezerwacja/[ref]` — Confirmation

- Big green checkmark, booking ref large and copyable, hotel summary card, dates, guests, total paid in PLN.
- Cancellation deadline as countdown if applicable.
- **"Pobierz potwierdzenie PDF"** button — server-rendered PDF with LiteAPI reference + our own ref + hotel details + cancellation policy in Polish.
- **"Pobierz fakturę VAT"** button if user requested invoice and it's been issued.
- **"Anuluj rezerwację"** button if eligible per policy. Confirmation modal.
- **"Wyślij potwierdzenie ponownie na maila"** button.
- **Cross-sell strip** at bottom: *"Sprawdź loty na tę datę"* → Aviasales deeplink. This is the second pipeline activating naturally. Do not push activities or other deleted partners.
- **Auth-light**: page is accessible via signed link in email + via `/moje-rezerwacje` lookup with bookingRef + email combo.

### 5.7 `/moje-rezerwacje` — Lookup

- bookingRef + email → confirmation page.
- No accounts required (auth-light is the right tradeoff for this volume).

### 5.8 The planner-results page (the page in the screenshots)

This page already shows hotels and flights for a chosen destination. Update it surgically:

- **Hotel section**: data source switches from current cache to LiteAPI. Card layout preserved (it looks good already). The `href` on each card changes from `/api/redirect/stays?url=...` to `/hotele/[hotelId]?checkin=...&checkout=...&travelers=...&rooms=...`. Card copy under "HOTELE" header changes to: *"Ceny finalne w PLN. Rezerwujesz bez wychodzenia ze strony. Bezpłatna anulacja w wybranych hotelach."*
- **Flight section**: untouched. Aviasales deeplinks stay. Travelpayouts cache keeps working.
- **"Pokaż więcej hoteli"** button → links to full `/hotele/szukaj` with the same params.
- **Add a third section below flights** if budget context exists: *"Pasuje do Twojego budżetu"* — sub-filter of the same hotel list under a budget threshold.

---

## SECTION 6 — Discovery Planner (the moat)

Booking.com forces the user to pick a destination first. HelpTravel does not need to. This is the strategic differentiator.

### 6.1 Input UX (extend existing `/planner?mode=discovery`)

- Free-text brief (textarea, 280 chars max). Placeholder: *"Cieply kierunek na 5 dni z plażą i zwiedzaniem do 2000 zł, lecę z Krakowa"*.
- Chip presets above (one tap fills the textarea, user can edit): *"Ciepło, plaża, lekko"*, *"City break z dobrym jedzeniem"*, *"Romantyczny weekend"*, *"Tanio i blisko"*, *"Egzotyka na dłużej"*, *"Z dziećmi"*.
- Budget slider (PLN 1000–15000, step 500), default 3000.
- Min nights, Max nights (default 3–5).
- Origin city autocomplete: PL airports — WAW, KRK, GDN, WRO, KTW, POZ, RZE, LUZ, SZZ, BZG, BYD, LCJ.
- Date window: *"od kiedy"* + *"do kiedy"* (flexible — system picks best subwindow).
- Travelers, rooms.
- "Pokaż dopasowane kierunki" — primary CTA.
- Saved briefs sidebar persists to localStorage (existing behavior preserved + URL-shareable shortlinks added).

### 6.2 Backend pipeline (`POST /api/planner/discovery`) — streamed via SSE

**Step 1 — Brief parsing** (Anthropic API, **Claude Sonnet 4.6** for cost; A/B-able to Opus 4.7 via env flag):

System prompt extracts structured fields. Output Zod-validated:

```ts
{
  climate: 'hot' | 'mild' | 'cool' | 'any';
  vibe_tags: string[]; // ['beach','city','romantic','foodie','nature','party','culture','family']
  must_haves: string[];
  deal_breakers: string[];
  activity_pace: 'slow' | 'balanced' | 'busy';
  distance_preference: 'short_haul' | 'medium' | 'any';
  travel_style: 'budget' | 'mid' | 'premium';
  confidence: number; // 0..1
}
```

If confidence < 0.5 → fall back to category-only matching.

**Step 2 — Candidate pre-filtering** (cheap, no LLM, no API calls):

Source: HelpTravel destination catalog (existing `/kierunki/*` pages). Extract metadata into a `destinations.json` seed file or DB table during Phase 0. Required per destination: country, IATA, lat/lng, monthly avg temp (12 values), flight time from each PL hub, typical 4-night 2-pax budget tier, vibe tags, visa requirement.

Filter by: climate match for the user's date window, distance preference vs origin, rough budget feasibility (`typical_tier ≤ user_budget × 1.2`), visa compatibility. Cap at top 12 candidates.

**Step 3 — Real-price feasibility check** (LiteAPI, parallel):

For each candidate, query LiteAPI search for the user's date window + occupancy + currency=PLN. Take cheapest 3★+ rate and cheapest 4★+ rate. Drop candidates with no availability.

**Step 4 — Flight cost estimation** (heuristic, no API):

Static ranges from destination metadata (origin × destination → typical PLN range). Display as *"Loty od ~X PLN — sprawdź w Aviasales"*. Range, not quote.

**Step 5 — Total budget feasibility**:

`total_estimate = hotel_total + flight_estimate_low`. Drop candidates where `total_estimate > user_budget × 1.15`.

**Step 6 — LLM ranking & reasoning** (Claude):

Pass remaining 5–8 candidates with full metadata + real hotel total + flight estimate to Claude. System prompt: rank for the user's brief. For each ranked destination produce: `fit_score` (0–100), `why_it_fits` (2 sentences in Polish addressing user's specific brief points), `tradeoff` (1 honest sentence on weakness — honesty wins trust). Return top 5. **Stream via SSE** for perceived speed.

**Step 7 — Response payload**:

```ts
{
  brief: ParsedBrief,
  results: Array<{
    destination: { city, country, slug, hero_image_url, lat, lng },
    fit_score: number,
    why_it_fits: string,
    tradeoff: string,
    hotel_preview: {
      hotelId: string,
      name: string,
      rating: number,
      score: number,
      photo: string,
      total_pln: number,
      cancellation: string,
      deeplink: string  // /hotele/[hotelId]?checkin=...&checkout=...&travelers=...
    },
    flight_estimate_pln_range: [number, number],
    aviasales_deeplink: string,
    open_in_planner_link: string,
    save_plan_payload: { ... }
  }>
}
```

### 6.3 Frontend rendering (`/planner?mode=discovery&results=true`)

- Hero summary chip restating the parsed brief: *"Szukamy: ciepły kierunek, 5 dni, do 2000 zł, z Krakowa, plaża + zwiedzanie"*.
- Result cards (5 max): hero image, city + country, fit score badge (*"89/100 — bardzo dobre dopasowanie"*), *"Dlaczego pasuje"* 2-sentence reasoning, *"Słaba strona"* 1 sentence, real hotel preview tile (photo, name, rating, total PLN, cancellation, **"Zobacz hotel"** button → opens hotel detail with dates pre-filled, **one click to booking flow**), flight estimate range + *"Sprawdź loty"* → Aviasales, *"Otwórz w plannerze"* (standard mode pre-filled), *"Zapisz ten plan"* button.
- Loading state: skeleton 5 cards + small live status text streaming via SSE: *"Analizuję brief…"*, *"Szukam kierunków…"*, *"Sprawdzam dostępność hoteli…"*, *"Układam ranking…"*. Wait time becomes trust.
- Empty state: *"Twój budżet jest zbyt napięty dla tego okna terminowego. Spróbuj: poszerz daty / zwiększ budżet o 500 zł / odpuść jedno z must-have."*

### 6.4 Caching & cost control

- Cache by `hash(brief + budget + dates + origin + travelers)` for 30 min.
- LiteAPI search results cached 60s.
- LLM calls budget-capped per IP per day (`DISCOVERY_LLM_DAILY_CAP=50` default).
- Server-side observability: log every Discovery query with parsed brief + final results to audit prompt drift weekly.

### 6.5 Standard mode (`/planner?mode=standard`)

Existing UX preserved (origin, dest, dates, travelers, rooms). *"Pokaż noclegi i loty"* button now leads to the planner-results page (Section 5.8) with internal hotel cards + Aviasales flights. The current handoff to `/kierunki/[city]` for affiliate links is deleted.

---

## SECTION 7 — Polish-market commercial requirements

These are **revenue gates**, not localization niceties.

### 7.1 BLIK support (Phase 0 verification)

BLIK accounts for ~50% of Polish online payments. Without BLIK, conversion drops 30–50% on a Polish OTA.

- **Verify in Phase 0**: does LiteAPI's hosted payment page support BLIK for PLN transactions in Poland?
- If yes: ensure BLIK icon is shown on the checkout summary; confirm via test transaction in sandbox.
- If no: this is a **commercial blocker**. Document the gap. Options to consider with the owner: (a) negotiate with LiteAPI for BLIK enablement, (b) hybrid model where LiteAPI handles cards and a BLIK-capable layer (e.g. Przelewy24/PayU) handles BLIK with us holding funds in escrow until LiteAPI confirms, (c) accept the 50% addressable-market reduction. Do NOT silently ship without BLIK and hope for the best — this is a $500k/year decision.

### 7.2 Faktura VAT (Phase 0 decision)

~25% of Polish business travelers require VAT invoices. Many corporate cards demand them.

- **Phase 0 question**: does LiteAPI issue Polish-compliant faktura VAT, or do we issue them ourselves?
- If LiteAPI does: surface the option in checkout, pass NIP to LiteAPI via the booking metadata.
- If we issue: integrate with **Fakturownia** or **iFirma** API. Generate VAT invoice with our data as merchant. Email PDF post-booking. The VAT amount is calculated from the LiteAPI booking total at the applicable Polish rate (8% on hotel services in PL, but verify with accountant).
- The faktura-request flow lives in `/api/invoices/request` and runs after `confirmed` status.

### 7.3 Polish customer support stub (no live chat in MVP)

- Email-based support: `pomoc@helptravel.pl` linked from confirmation email and `/kontakt`.
- SLA copy: *"Odpowiadamy w ciągu 24h w dni robocze"*. Hold to it.
- FAQ page covers top 20 booking-related questions: zmiana terminu, anulacja, faktura VAT, brak potwierdzenia, problem z BLIK, dane do meldunku.
- Phone optional (consider weekly office hours number printed on confirmation if owner can staff it).

### 7.4 Trust signals (substituting for missing review base)

Booking has 90M+ verified reviews. We have zero. Trust must come from elsewhere.

- **Visible RODO compliance** — clear cookie banner, privacy policy linked from every page.
- **Visible regulamin** — clearly worded, not legalese.
- **Polish company data** — KRS/NIP/REGON in footer if owner has Polish entity. If not, this is a Phase 0 conversation with the owner.
- **Visible phone/email** in footer + confirmation.
- **Cancellation policy displayed before payment, not after.**
- **No fake urgency.** Don't write *"5 osób ogląda ten hotel"* unless it's true. Polish users smell fake urgency immediately and bounce.
- **Real testimonials when we have them.** Until then, omit the section.

### 7.5 Polish copy voice

Native Polish, not translated. Tone: warm-clear, like Booking.pl. Avoid stiff formal Polish (*"Państwo zechcą skorzystać"*). Avoid English loanwords when Polish exists naturally (*"rezerwacja"* not *"booking"*, *"anulacja"* not *"kanselowanie"*). Diacritics always correct.

---

## SECTION 8 — Payments (LiteAPI Hosted ONLY)

**Hard rule. Do not integrate Stripe, Adyen, Przelewy24, Tpay, PayU, or any other processor. Do not render card input fields anywhere on helptravel.pl. Zero card data ever touches our server, browser, logs, or analytics. The owner has explicitly chosen LiteAPI hosted to keep PCI scope at zero.**

### Flow

1. User completes Step 1 (guest details). Server calls `prebook`. Persists prebook record with status=`pending`.
2. If prebook total > rate-list by >1% → BLOCK and force re-confirm (Section 5.4).
3. Server calls LiteAPI `createPaymentSession` with: `prebookId`, amount, currency=PLN, `returnUrl=https://helptravel.pl/rezerwacja/oczekiwanie?session=...`, `cancelUrl=https://helptravel.pl/hotele/rezerwacja?step=2&session=...&cancelled=1`, `locale=pl`, `preferredMethods=['blik','card']`.
4. Returns redirect URL. Frontend redirects (`window.location`).
5. User pays on LiteAPI hosted page.
6. User returns to `/rezerwacja/oczekiwanie?session=...`. UI polls `/api/hotels/booking/by-session/:sessionId` every 2s.
7. LiteAPI fires webhook to `/api/hotels/payment-webhook`. Verify HMAC signature with `LITEAPI_WEBHOOK_SECRET`. On `payment_success`: call `book()` (idempotent), persist booking record `confirmed`, send confirmation email + faktura VAT request if requested, emit Sentry breadcrumb.
8. Polling endpoint flips to `confirmed`, frontend redirects to `/rezerwacja/[ref]`.
9. If webhook hasn't arrived in 30s — server-side fallback: poll LiteAPI `getBooking` every 5s up to 90s total.
10. After 90s with no resolution: UI shows the timeout copy. Webhook handler completes async.

### State machine (persisted in DB)

`pending` → `processing` → (`confirmed` | `failed` | `timeout` | `cancelled`).

All transitions idempotent. Same webhook delivered twice = same final state.

### Phase 0 verification (BLOCKER)

Before any payment code is written, verify:
- LiteAPI Payments product is activated on the owner's account.
- BLIK is enabled for PLN transactions (Section 7.1).
- Webhook signing secret is provisioned.
- The merchant of record on the LiteAPI side is correctly configured.

If any of these fail, STOP and report as Phase 0 blocker.

---

## SECTION 9 — Conversion optimization (cross-cutting)

Every page touches one of these levers. Treat the list as a reviewer's checklist.

- **Speed**: each 100ms of LCP improvement ≈ 1% conversion. LCP < 2.5s on 4G mandatory for `/hotele/szukaj` and `/hotele/[hotelId]`.
- **Mobile-first**: 60%+ of bookings are mobile. The mobile flow gets the most polish, not the least.
- **Skeleton not spinner**: every loading state is a skeleton matching the final layout.
- **Streaming SSR** on results pages — first batch visible in <800ms.
- **Optimistic UI** on filter changes — apply visually, fetch in background, reconcile.
- **Sticky CTAs** on hotel detail and checkout.
- **Total price upfront** with all taxes — never reveal fees in the last step.
- **Honest cancellation policy** before payment, with the deadline as a date and a relative countdown.
- **Form validation** inline as the user types, not on submit.
- **Auto-fill friendly** — `autocomplete` attributes on every form field per spec.
- **One thumb reachable** mobile CTAs — primary actions in bottom 1/3 of screen.
- **No modal traps** — every modal has visible close, back-button works.
- **Recovery on error** — if LiteAPI errors, the user gets a clear Polish message + retry button + alternative suggestions, never a stack trace.

---

## SECTION 10 — Repeat purchase & retention

A first booking earned and never re-engaged is half a booking.

### 10.1 Saved plans

Existing localStorage behavior preserved. Add: URL-shareable shortlinks; optional sync to the booking email if user supplies it (light auth via magic link).

### 10.2 Email sequence (transactional + recovery)

Use Resend or Postmark. All emails in Polish, native voice, plain readable HTML — not over-designed.

- **Booking confirmation**: immediately on `confirmed`. Includes ref, hotel, dates, cancellation deadline, PDF.
- **Pre-stay reminder**: 3 days before checkin. Practical: address, check-in time, "potrzebujesz transferu z lotniska?" cross-link to Aviasales if relevant.
- **Cancellation deadline reminder**: 24h before free cancellation expires (only if booking is still active and refundable).
- **Post-stay review request**: 2 days after checkout. *"Jak było? Twoja opinia pomoże innym"* — collect on our domain (start building our own review base — this becomes a moat after 6–12 months).
- **Abandoned cart recovery**: if user enters Step 1 with email and abandons, send a recovery email at +2h, +24h, +72h. *"Zostawiłeś rezerwację. Cena może się zmienić, sprawdź teraz."* Cron at `/api/abandoned-cart/email`. Suppress after booking completed or after 7 days.

### 10.3 Personalized re-engagement

- After 30 days idle: *"Nowe kierunki w Twoim budżecie"* email — recommendations from Discovery Planner using stored brief if available.
- After a booking: *"Następny wyjazd?"* prompt 60 days post-stay with seasonal recommendations.

### 10.4 Referral hook (post-MVP, but stub now)

Confirmation page footer: *"Polub HelpTravel — daj znajomemu 50 zł zniżki"*. Implement properly later; stub the UI now so it's not bolted on.

---

## SECTION 11 — Design system

Audit current Tailwind config. The planner-results page already has decent visual DNA (white cards, clean typography, PLN price emphasis, "NAJTAŃSZE" badge, green CTAs). **Preserve this — don't redesign from zero.** Extend it consistently across the new pages.

- Typography: existing font stack OR Inter if not defined. Tight headings (1.1–1.2 line-height), body 1.6.
- Color: keep brand greens (planner CTAs), add neutral grays, success/warning/error tokens. Consider a deep blue accent for trust (financial pages, confirmation).
- Components in `/components/ui` (build/extend): Button, Input, Select, DatePicker, Combobox, Dialog, Sheet, Tabs, Accordion, Badge, Card, Skeleton, Toast, Map, PriceBlock, RatePolicyTag, GuestPicker, StarRating, ScorePill, FitScoreBadge, BriefChip, TrustStrip, CountdownTag.
- Density: comfortable desktop, compact mobile. 8px grid.
- Microcopy: warm-clear Polish (Section 7.5).
- Icons: lucide-react.
- Photos: `next/image` always, AVIF/WebP, proper `sizes`, blur placeholder.

---

## SECTION 12 — Performance, SEO, Accessibility

- `/hotele/szukaj` LCP < 2.5s on 4G. Streaming SSR.
- `/hotele/[hotelId]` ISR for top 1000 hotels (revalidate 6h). SSR for long tail.
- Discovery results streamed via SSE.
- **Structured data** (JSON-LD): Hotel, Offer (with `priceCurrency: PLN`, `availability`, `validThrough`), AggregateRating (only if real), BreadcrumbList, FAQPage on FAQ.
- **sitemap.xml dynamic** — include hotel detail pages (top 10k by traffic), all destination pages, comparison pages, theme pages.
- **hreflang** if PL/EN coexist.
- Polish meta titles/descriptions per page, hand-tuned for top destinations.
- OG images via `@vercel/og` — destination + price + dates baked in.
- **WCAG 2.2 AA**: keyboard nav, focus visible, aria labels in Polish, contrast verified (axe-core in CI), prefers-reduced-motion respected on Embla and animations.
- Lighthouse minimums (mobile, CI gate on PR): Perf ≥ 90, A11y ≥ 95, BP ≥ 95, SEO ≥ 95 on `/hotele`, `/hotele/szukaj`, `/hotele/[hotelId]`, `/planner?mode=discovery`, `/rezerwacja/[ref]`.

---

## SECTION 13 — Observability, security, compliance

### 13.1 Observability — *map metrics to revenue*

- **Sentry** (separate dev/prod DSN). Source maps. Error budget alerting.
- **Structured logs** (pino) with `bookingRef` + `prebookId` + `sessionId` on every booking-pipeline log line.
- **PostHog** (preferred over Plausible — we need event-level funnels, not just page views).

**Funnel events** (mandatory, named consistently):

```
search_initiated → search_results_viewed → hotel_card_clicked → 
hotel_detail_viewed → room_selected → checkout_step1_completed → 
checkout_step2_completed → payment_redirected → payment_returned → 
booking_confirmed
```

**Discovery funnel**:

```
discovery_brief_submitted → discovery_results_viewed → 
discovery_card_clicked → hotel_detail_viewed → … → booking_confirmed
```

**Revenue tracking**: every `booking_confirmed` event carries GMV in PLN, estimated margin, source (planner / search / discovery / kierunki page), origin city, destination, lead time (days from booking to checkin), nights, guests. This is what the owner reads weekly.

### 13.2 Security

- CSP headers (allow LiteAPI payment domain in `frame-src` and `form-action` only), HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff.
- No inline scripts. Nonces for streaming if needed.
- Webhook signature verification (HMAC) — fail closed.
- PII encrypted at rest (Postgres column encryption or app-layer for guest data).
- Secrets only in Vercel env or 1Password — never in repo.
- Rate limits on every API route (Section 4).

### 13.3 Compliance

- **RODO/GDPR**: cookie consent banner with granular categories (necessary, analytics, marketing). Default reject all non-necessary. Consent log persisted.
- **Updated `/regulamin` and `/polityka-prywatnosci`** to reflect: HelpTravel sells hotels as merchant (or as agent of LiteAPI — confirm in Phase 0 contractual model); payment processed by LiteAPI's payment provider; refund/cancellation policy aligns with LiteAPI's per-rate policy; Aviasales is affiliate partner not merchant for flights; right of withdrawal limitations under Polish travel services law (Ustawa o usługach turystycznych — these limit consumer cancel rights for travel services and must be properly disclosed).
- **Legal review section in `INTEGRATION_PLAN.md`** explicitly listing regulatory points: ustawa o usługach turystycznych, RODO, merchant disclosure, refund alignment, mandatory pre-contractual information, OTU (ogólne warunki). The owner consults a lawyer. Claude Code does not give legal advice — only flags items.
- **Faktura VAT compliance** per Section 7.2.

---

## SECTION 14 — Tests

- **Unit**: msw mocks of every documented LiteAPI response shape including all error cases. ≥ 90% line coverage on `/lib/liteapi/`.
- **Integration**: full booking pipeline against LiteAPI sandbox (`LITEAPI_SANDBOX_KEY`). Includes prebook → payment session → simulated webhook → book → retrieve → cancel.
- **Contract tests**: Zod schemas validated against live sandbox responses weekly in CI to catch LiteAPI schema drift.
- **E2E (Playwright)**:
  - Search → results → hotel → checkout → LiteAPI payment sandbox (test card + sandbox BLIK if available) → return → confirmation.
  - Discovery brief → SSE-streamed results → click result → hotel detail → checkout.
  - Cancellation flow.
  - Abandonment → recovery email triggers (cron unit-tested).
  - Mobile viewport 375px and desktop 1440px on every flow.
- **Visual regression**: Playwright snapshots on key pages, blocking on PR.
- **A11y**: axe-core scans on key pages, blocking on PR.
- **Load test (k6)**: search endpoint sustains 50 RPS without LiteAPI rate limit hits.

---

## SECTION 15 — Delivery phases

**One commit batch per phase. Do not advance until current phase acceptance checks pass.**

### Phase 0 — Audit + commercial verification
- Read entire repo. Map all routes, components, env vars.
- Run full purge grep. List every file/line.
- **Verify LiteAPI Payments activation, BLIK support, faktura VAT mechanism, contractual model (merchant vs agent).** If BLIK absent → flag as commercial blocker per Section 7.1.
- Inventory destination metadata for Discovery Planner (extract from existing `/kierunki/*` pages into `destinations.json`).
- Output `INTEGRATION_PLAN.md`: files to create/modify/delete, env vars, dependencies, purge list, legal review section, payment verification result, BLIK result, faktura plan, destination catalog seed plan, identified risks.
- **WAIT for owner approval before Phase 1.**

### Phase 1 — Affiliate purge + LiteAPI client + sandbox smoke test
- Execute full purge per Section 2. Update footer, copy, redirect proxy, all theme pages.
- Build `/lib/liteapi/*` complete (including `payments.ts`, `webhook.ts`).
- `scripts/smoke-liteapi.ts` runs search → rates → prebook → payment-session → simulate-pay (BLIK + card) → book → cancel against sandbox.
- Unit tests for client.
- Output `PURGE_REPORT.md`. Final grep verification.

### Phase 2 — Hotel search UX
- `/hotele`, `/hotele/szukaj` with real sandbox data. Filters, sort, map, mobile sheet.
- Update planner-results page hotel section to use LiteAPI + internal links (Section 5.8).

### Phase 3 — Hotel detail + room/rate selection
- `/hotele/[hotelId]` with full detail UX.

### Phase 4 — Checkout + LiteAPI hosted payment + booking persistence
- Prisma schema. Prebook → payment session → webhook → book flow. Payment state machine. Faktura VAT integration. Confirmation email pipeline.

### Phase 5 — Confirmation + booking management + retention
- `/rezerwacja/oczekiwanie`, `/rezerwacja/[ref]`, `/moje-rezerwacje`. Cancellation. PDF. Email sequences (confirmation, pre-stay, deadline reminder, post-stay review, abandoned cart cron).

### Phase 6 — Discovery Planner
- `/api/planner/discovery` pipeline. LLM brief parsing. Destination pre-filter. LiteAPI feasibility. LLM ranking. SSE streaming.
- UI rebuild of `/planner?mode=discovery`.
- Standard mode rewiring fully completed.

### Phase 7 — Re-wiring all content pages
- `/kierunki/[city]`, `/kierunki/[city]/[month]` (Stay22 iframe deleted), `/porownanie/*`, all theme pages, homepage hero with two entry points.
- Sitemap regen. Final grep — zero purge-list matches.

### Phase 8 — Observability, SEO, A11y, perf, compliance pass
- Sentry, PostHog, structured logs. CSP. RODO banner. JSON-LD. OG images. Lighthouse + axe gates in CI. Updated regulamin/polityka.

### Phase 9 — Sandbox → Production switch
- Final dry run. Document rollback. Flip env. Smoke test prod with one real low-value booking + cancel. Done.

After each phase, post a status note: what was done, what was verified, what's pending, known risks.

---

## SECTION 16 — Rules of engagement

1. **Never invent LiteAPI fields.** Fetch docs (https://docs.liteapi.travel/) or run sandbox calls. Cite endpoint + field in code comments.
2. **Money in minor units (grosze).** No floats. Decimal.js or string math.
3. **Currency**: display PLN; store source currency on booking. Convert via LiteAPI rates only — never made up.
4. **Idempotency**: every `book` request carries server-generated UUID persisted before the call. Retries reuse the UUID.
5. **Rate drift > 1% between rate-list and prebook → block, force re-confirm.**
6. **Polish copy is native, not translated.** Booking.pl tone.
7. **WCAG 2.2 AA.** Keyboard, focus, aria-PL, contrast.
8. **Don't break Aviasales flight links.** They survive.
9. **Ask when ambiguous, BUT re-read this brief first.** Do not ask about scope already specified.
10. **No payment processor besides LiteAPI hosted.** Final.
11. **No card field on helptravel.pl.** Final.
12. **Do every requirement.** Self-review against this brief at the end of each phase. If something is genuinely impossible (LiteAPI feature gap), raise it in writing as a blocker with proposed workaround. Never silently skip.
13. **No fabricated reviews, fake prices, fake urgency, or placeholder data in production.** If LiteAPI doesn't return it, hide the section.
14. **Every UX decision is justified by conversion or margin.** If a feature doesn't move one of those, it doesn't ship.

---

## SECTION 17 — Acceptance criteria (Definition of Done)

A real booking flow must succeed end-to-end:

- Land on helptravel.pl. Click *"Mam kierunek"*. Search *"Barcelona, 12–15 grudnia, 2 dorosłych"*.
- See real hotels with real PLN prices including taxes, ranked sensibly, on mobile (375px) and desktop (1440px).
- Click hotel → see all rooms with cancellation policies and total pricing transparently.
- Click *"Wybierz"* → guest details → optional faktura VAT data → redirect to LiteAPI hosted payment → pay with sandbox BLIK and sandbox card (both tested) → return → confirmation page with real LiteAPI booking reference.
- Polish-language confirmation email arrives with PDF attachment within 30s.
- If faktura was requested, VAT invoice arrives within 24h.
- Booking visible in `/moje-rezerwacje` via bookingRef + email lookup.
- Cancellation works and reflects refund eligibility.
- Pre-stay reminder fires 3 days before checkin (verified via cron test).
- Abandoned cart recovery email fires +2h after Step 1 abandonment with email captured.
- No card field appeared anywhere on helptravel.pl during the entire flow.

A Discovery Planner attempt must succeed:

- `/planner?mode=discovery`, type *"Cieply kierunek na 5 dni z plaza do 3000 zl, z Krakowa"*, set dates flexible May.
- Within ≤ 8s see 5 ranked destinations with: real hotel preview with price, *"Why it fits"* reasoning, honest tradeoff, flight estimate range, working hotel-detail deeplink with dates pre-filled.
- Click hotel preview → enter booking flow at hotel detail page seamlessly.

Affiliate purge verification:

- Final grep returns zero matches for: stay22, booking.com, hotels.com, expedia, vrbo, airbnb, hostelworld, cheapoair, tpo.li, klook, tiqets, kiwi.com, kiwitaxi, localrent, lot.com, lotglobal, yesim, getyourguide, skyscanner, trivago, agoda. Aviasales remains. Footer "Partnerzy rezerwacyjni" shows Aviasales only.

Performance:

- Lighthouse mobile: Perf ≥ 90, A11y ≥ 95, BP ≥ 95, SEO ≥ 95 on `/hotele`, `/hotele/szukaj`, `/hotele/[hotelId]`, `/planner?mode=discovery`, `/rezerwacja/[ref]`. Verified in CI.
- E2E sandbox tests green in CI including full payment-via-LiteAPI flow with BLIK and card.

Visual:

- Side-by-side, `/hotele/szukaj` does not look meaningfully worse than booking.com/searchresults for the same query: same information density, similar polish, no "AI-generated template" feel. Same bar applies to hotel detail vs Booking's hotel page.

Security:

- CSP headers enforced. Webhook signature verification implemented and unit-tested. PII encrypted at rest. RODO consent banner active. Zero card data anywhere in code, logs, or analytics.

Commercial:

- BLIK confirmed working at checkout (or escalated to owner with proposed alternative if absent).
- Faktura VAT pipeline working end-to-end.
- All 13 deleted partners absent from codebase, footer, copy.
- Aviasales flight CTAs functioning on every relevant page (planner-results, kierunki, comparison, theme pages, confirmation cross-sell).

---

**Begin with Phase 0. Read the repo first. Run the affiliate grep. Verify LiteAPI Payments + BLIK + faktura VAT mechanism. Inventory destination catalog metadata. Then produce `INTEGRATION_PLAN.md` and stop for owner review.**

**This is your business. Build it like you want to run it for a decade.**
