# Booking UI Polish — Design Spec (2026-05-20)

Brand: helptravel.pl · Surface: `/hotele/rezerwacja` · Status: design approved, implementation in progress
Branch: `feat/booking-ui-polish` off `phase-1-purge-affiliate-pivot` (post B4 + B5 + B6).

## Context

After B4/B5/B6 the production booking flow works (real card + Google Pay confirmed by the operator). Three remaining UX defects:

1. Three skeleton tiles remain visible **above** the Stripe payment form because they're rendered as children of `#payment-element` and the LiteAPI widget appends its iframe without removing them.
2. The widget's pay button label `Zapłać i zarezerwuj` is too long / mis-styled for Stripe's native button slot.
3. The guest-data form forces N guest rows = `adults` from the URL, all required — a single person booking a 2-person room cannot proceed without inventing data for a phantom guest.

Plus a positive ask: the page should look like a world-class travel site — trustworthy, calm, spacious — with truthful security/trust signals near the payment.

## Goals

- Fix the three defects above.
- Add an honest, calm trust strip (Stripe PCI DSS Level 1, TLS, LiteAPI MoR — only true claims).
- Adopt a single-column "Airbnb-style" layout matching existing emerald + rounded-2xl + neutral tokens.
- Keep guest-data optional for co-travelers; holder remains required.
- Zero regression on B4/B5/B6, backend, tests, or anything outside `_components/`.

## Non-Goals (explicit)

- No changes to backend (`/api/booking/*`, `src/lib/liteapi/*`, `src/lib/booking/*`).
- No changes to `page.tsx` (the server wrapper / feature flag).
- No changes to `next.config.ts` (CSP / Permissions-Policy).
- No changes to `widget-env.ts`, B4/B5/B6 fixes.
- No new dependencies, no new test files in `package.json`.
- No homepage touch (locked per `memory/feedback_homepage_locked.md`).
- No real-card test by me — operator does that after redeploy.

## Approach (selected)

**Selective extraction.** Pull only the highest-value, isolation-worth blocks into co-located components under `src/app/hotele/rezerwacja/_components/`. Keep state, validation, and `onSubmit` inline in `reservation-form.tsx`.

Approaches considered:
- **Inline additive** (rejected: file grows monolithic, harder to isolate B5 effect).
- **Selective extraction** (chosen).
- **Full decomposition** (rejected: too many props-drilling seams, more places for B5/B6 to desync).

## Architecture

### File layout

**New (4 files under `src/app/hotele/rezerwacja/_components/`):**
- `order-summary-banner.tsx` — pure presentational, server-safe.
- `optional-guests-accordion.tsx` — client, collapsible co-traveler block.
- `trust-strip.tsx` — client, three truthful badges + one copy line.
- `payment-slot.tsx` — client, **owns** B5 rAF DOM-wait, B6 widget config, skeleton-tiles fix.

**Modified:**
- `reservation-form.tsx` — composes the four new components; keeps state, `onSubmit`, holder fields, validation, idempotency handling.

**Untouched (NON-NEGOTIABLE):**
- `page.tsx`, `next.config.ts`, `src/lib/liteapi/**`, `src/lib/booking/**`, `src/app/api/booking/**`, `widget-env.ts`, all tests.

## Component Contracts

### `OrderSummaryBanner`

```ts
interface Props {
  hotelName: string;
  hotelCity?: string;
  checkin: string;   // YYYY-MM-DD
  checkout: string;  // YYYY-MM-DD
  price?: number;
  currency: string;
}
```

Renders one compact emerald-tinted banner at the top of the card. Computes `nights` from dates. Polish noun agreement: `1 noc / 2-4 noce / 5+ nocy`. Shown in **both** the form view and the paying view (same component, same props).

Visual: `bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-5`, strong hotel name, single meta line `text-xs text-emerald-900/70` with `·` separators.

### `OptionalGuestsAccordion`

```ts
interface Props {
  occupancy: number;                                             // = adults
  value: { firstName: string; lastName: string }[];              // length = occupancy - 1
  onChange: (i: number, field: "firstName" | "lastName", v: string) => void;
  disabled?: boolean;
}
```

If `occupancy <= 1` returns `null`. Otherwise renders a collapsible block, **closed by default**.

Header (button): chevron + "Dodaj dane współpodróżnych *(opcjonalne)*". Click toggles open/close.
Sub-helper (visible when open, above rows): "Wystarczą dane osoby rezerwującej. Imiona pozostałych gości pomagają hotelowi przy odprawie, ale nie są wymagane."

Rows: `occupancy - 1` two-column grids (Imię / Nazwisko). Inputs disabled when `disabled=true`. Accordion itself does NOT validate — validation is centralized in `reservation-form.tsx`.

### `TrustStrip`

No props. Three mini-tiles in a flex row (mobile: column stack). Content lock:
1. 🔒 — "Połączenie szyfrowane TLS"
2. 💳 — "Stripe (PCI DSS Level 1)" + inline monochrome SVG marks: Visa / MC / Amex
3. 🏨 — "LiteAPI · partner hotelu"

Below: centered thin line `text-[11px] text-neutral-500 max-w-md mx-auto`: "Dane karty wpisujesz w bezpiecznym formularzu Stripe — helptravel.pl nigdy ich nie widzi ani nie przechowuje."

Rendered in **both** form view and paying view (under CTA / widget).

### `PaymentSlot` — single source of truth for the payment flow

```ts
interface Props {
  prebook: {
    secretKey: string;
    sessionId: string;
    amount: number;
    currency: string;
    widgetEnv: "live" | "sandbox";   // B6
  };
  returnBaseUrl: string;
  onMountFail: () => void;
}
```

Owns:
- B5 `useEffect` with bounded rAF DOM-wait (max 10 frames) and `cancelled` cleanup — copied verbatim from current `reservation-form.tsx` to avoid race regression.
- B6 widget config — `publicKey: prebook.widgetEnv` (per-prebook env), `secretKey: prebook.secretKey`, `returnUrl: ${returnBaseUrl}/hotele/rezerwacja/return?sid=<sessionId>`, `targetElement: "#payment-element"`, `appearance: { theme: "flat" }`, `options: { business: { name: "helptravel.pl" } }`, `amount`, `currency`, `submitButton: { text: "Zapłać teraz" }`.
- Skeleton-tiles fix (see below).

Calls `onMountFail()` on any permanent init failure; parent (`reservation-form.tsx`) clears `pay` + sets back to `step="form"` with the standard error.

## Guest-Data Flow

**State in `reservation-form.tsx`:**
- `holder: { firstName; lastName; email; phone }` — required.
- `coGuests: { firstName: string; lastName: string }[]` of length `Math.max(0, adults - 1)`.

**Validation on submit (`validate()` rewrite):**
1. `LiteApiHolderSchema.safeParse(holder)` — fail → "Uzupełnij poprawnie dane osoby rezerwującej (imię, nazwisko, e-mail, telefon)." (kept verbatim from current).
2. For each `coGuests[i]`:
   - both empty → skip.
   - exactly one filled → fail: "Uzupełnij oba pola gościa N lub wyczyść oba." (N = i + 2 because guest #1 is holder.)
   - both filled → run `LiteApiGuestSchema.safeParse({ occupancyNumber: i + 2, firstName, lastName })`; fail → "Uzupełnij imię i nazwisko gościa N."

**Guests array sent to `POST /api/booking/prebook`:**
```ts
const guests = [
  { occupancyNumber: 1, firstName: holder.firstName, lastName: holder.lastName },
  ...coGuests
    .map((g, i) => ({ occupancyNumber: i + 2, ...g }))
    .filter((g) => g.firstName.trim() && g.lastName.trim()),
];
```

`guests.length` is between `1` and `adults`.

**Backend compatibility:** existing `BodySchema` in `src/app/api/booking/prebook/route.ts` declares `guests: z.array(LiteApiGuestSchema).min(1).optional()` → accepts any length ≥ 1 → no backend change required.

**Documented future contingency (NOT implemented now):** if LiteAPI's `/rates/book` rejects when `guests.length < occupancy`, the fallback is to pad the array with copies of the holder name. Will only be added if production evidence shows a rejection — current evidence (LiteAPI docs + B6 confirmation) suggests variable-length guest arrays are accepted.

## Skeleton-Tiles Fix (the main visible defect)

**Root cause:** current `reservation-form.tsx` renders three skeleton `<div>`s as **children** of `#payment-element`. The LiteAPI widget appends its own iframe to `#payment-element` without clearing those children, so they remain visible above the real Stripe form.

**Fix (in `PaymentSlot`):**

```tsx
<div className="relative min-h-[280px]">
  {!widgetMounted && (
    <div aria-hidden className="absolute inset-0 animate-pulse space-y-3 motion-reduce:animate-none pointer-events-none">
      <div className="h-10 rounded bg-neutral-100" />
      <div className="h-10 rounded bg-neutral-100" />
      <div className="h-10 w-1/2 rounded bg-neutral-100" />
    </div>
  )}
  <div id="payment-element" className="relative z-10" />
</div>
```

- `#payment-element` is **empty** when handed to the widget — the widget owns its DOM exclusively.
- Skeleton is an absolutely-positioned **sibling**, hidden when `widgetMounted=true`.
- After `new LiteAPIPayment(...).handlePayment()` is called, we set up a `MutationObserver` on `#payment-element` watching `childList`. When `target.childElementCount > 0` we set `widgetMounted=true` and disconnect.
- Fallback `setTimeout(3000ms)` always sets `widgetMounted=true` so the skeleton never gets stuck (defensive, in case the widget injects DOM in a way the observer misses).
- Cleanup on unmount: `observer.disconnect()`, `clearTimeout(t)`, plus the existing B5 `cancelled` flag and `cancelAnimationFrame`.

## Visual Spec (concrete)

- Card container: `rounded-2xl border border-neutral-200 bg-white p-6` (unchanged).
- Section headings: `text-lg font-bold text-neutral-900` (unchanged).
- Section dividers: `<hr className="my-6 border-neutral-100" />` between holder block, optional guests, payment.
- Summary banner: `bg-emerald-50 border border-emerald-100 rounded-xl p-3 mb-5`. Strong name, then meta line.
- Accordion header: `flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800`. Chevron rotates 180° when open via Tailwind `rotate-180` class.
- Trust strip: `flex flex-col sm:flex-row gap-3 sm:gap-6 justify-center mt-5 text-xs text-neutral-600` for tiles; centered `text-[11px] text-neutral-400 max-w-md mx-auto mt-2` for the copy line.
- Card-brand SVGs: inline (no external image dep), monochrome `text-neutral-400`, ~24×16. Created inline as small `<svg>` paths. Zero CSP / image-host changes.

**Copy lock (Polish):**
- Banner: `{hotel} · {city} · {dd mmm} → {dd mmm} · {nights} {noc/noce/nocy} · {price} {currency}`
- Holder heading: "Osoba rezerwująca"
- Holder helper: (none — fields are clear)
- Accordion header: "Dodaj dane współpodróżnych *(opcjonalne)*"
- Accordion open-helper: "Wystarczą dane osoby rezerwującej. Imiona pozostałych gości pomagają hotelowi przy odprawie, ale nie są wymagane."
- Payment heading: "Płatność"
- Payment helper (above widget): "Wprowadź dane karty w bezpiecznym formularzu. Po opłaceniu wrócisz tu z potwierdzeniem." (unchanged.)
- Form submit button: "Przejdź do płatności" / "Rezerwujemy pokój… To może potrwać do 30 sekund" (unchanged.)
- Widget pay button (`submitButton.text`): "Zapłać teraz" (changed from "Zapłać i zarezerwuj").
- Trust strip tiles: lock above.
- Trust copy line: lock above.

## Error Handling

- Prebook fetch failure: existing catch block (unchanged) sets the user-facing message, regenerates `idemKey`, returns to `step="form"`.
- Widget mount failure (PaymentSlot): calls `onMountFail()` → parent clears `pay`, sets `step="form"`, sets the existing error message.
- Co-guest validation failure: inline error message above the submit button (same `role="alert"` red banner that already exists).
- MutationObserver never firing: 3000 ms fallback always hides skeleton.

## Testing Strategy

- `pnpm tsc --noEmit` → 0 errors.
- `pnpm lint` → 0 errors across whole project.
- `pnpm test` → 73 pass, 0 new regressions. Only failure: pre-existing `src/lib/mvp/tp-airport-directory.test.ts` (Windows `spawnSync pnpm.cmd EINVAL`, unrelated to booking).
- `booking-routes.test.ts`, `booking.test.ts`, `client.test.ts` must remain green without modification (backend untouched).
- No new test files added to the curated list in `package.json` (consistent with B4/B5/B6 practice).
- Manual verification on Vercel preview: operator's responsibility.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| MutationObserver misses widget DOM injection. | 3000 ms fallback timeout always hides skeleton. |
| LiteAPI rejects `guests.length < occupancy` at book step. | Documented contingency above; will pad with holder name in a follow-up if production proves it. Not anticipated. |
| `submitButton.text` change breaks widget render. | LiteAPI docs accept arbitrary strings; reverting is a one-line change. |
| Extracting `PaymentSlot` causes B5 race regression. | The B5 `useEffect` block is **copied verbatim** (logic, deps, cleanup) — no logic changes inside. |
| Extracting components causes B6 widgetEnv drift. | `widgetEnv` flows through one prop (`prebook.widgetEnv`); not derived inside `PaymentSlot`. |
| File grows / lint regressions on existing impure-during-render code. | The `freshIdemKey` extraction from B5 stays — no new render-time impurity. |

## Commit Plan (atomic, each green standalone)

1. `docs(brainstorm): spec for booking UI polish (2026-05-20)` — this file.
2. `feat(booking): add OrderSummaryBanner + TrustStrip + OptionalGuestsAccordion` — purely additive, not yet composed.
3. `feat(booking): add PaymentSlot with B5 effect + skeleton MutationObserver fix` — additive; B5 logic copied verbatim.
4. `feat(booking): rewire reservation-form — optional co-guests, polished layout, "Zapłać teraz"` — composes the four components; removes the inline paying view + inline skeleton.

After commit 4, `pnpm test`, `pnpm tsc --noEmit`, `pnpm lint` are all green and the new UI is live in the bundle.

## Out-of-Spec Items (not addressed here)

- BOOKING_BLOCKERS / BOOKING_AUDIT updates — optional; this is UX polish, not a blocker. May add a small B7 note in BOOKING_BLOCKERS later if the optional-guests semantic needs LiteAPI clarification.
- Page-wrapper polish (`page.tsx` h1 / breadcrumb) — out of scope for this spec.
- Return / recovery pages (`/hotele/rezerwacja/return`) — out of scope.
