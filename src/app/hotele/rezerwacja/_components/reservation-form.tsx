"use client";

// Guest-data form (holder required, co-travelers optional) → POST
// /api/booking/prebook → hand-off to <PaymentSlot/>, which owns the LiteAPI
// Payment widget (B5 race fix + B6 env binding + skeleton-tiles fix).
//
// 2026-06-10 redesign (Fazy 2-3, wzór Booking.com):
//   • CheckoutSteps (1 Dane → 2 Płatność → 3 Potwierdzenie) on both views.
//   • BookingSummaryCard — photo/stars/rating/dates/price — sticky right
//     column on lg, above the form on mobile, on BOTH steps (the buyer never
//     loses sight of what they're paying for). On the payment step the card
//     shows the PREBOOK price (authoritative).
//   • Inline blur validation with Polish messages + focus-first-error.
//   • Payment step: the wall-of-text trust box is reduced to one line +
//     a collapsed "Co zobaczę na wyciągu z banku?" <details> (a big block
//     explaining yourself BEFORE payment seeds doubt instead of killing it).
//   • Pay CTA shows the exact amount ("Zapłać 2060 zł") via the SDK's
//     submitButton.text.

import Link from "next/link";
import { useRef, useState } from "react";

import { track } from "@/lib/analytics/track";
import { LiteApiGuestSchema, LiteApiHolderSchema } from "@/lib/liteapi";

import { BookingSummaryCard } from "./booking-summary-card";
import { CheckoutSteps } from "./checkout-steps";
import { OptionalGuestsAccordion } from "./optional-guests-accordion";
import { PaymentBrandsInline } from "./payment-brands";
import { PaymentSlot, type PaymentSlotPrebook } from "./payment-slot";
import { TrustStrip } from "./trust-strip";

interface Props {
  hotelId: string;
  offerId: string;
  hotelName: string;
  hotelCity?: string;
  /** Hotel photo / category / guest score for the summary card (all from the
      already-fetched getHotelDetail — no extra API calls). */
  photoUrl?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  checkin: string;
  checkout: string;
  price?: number;
  currency: string;
  board?: string;
  adults: number;
  publicKey: string;
  returnBaseUrl: string;
  /** Deep link back to the hotel page (same dates/occupancy) — the recovery
      path when the offer can't be prebooked anymore. */
  backToHotelHref: string;
  /** Cancellation badge for the summary card (from the rate link). */
  cancel?: "free" | "nrf";
  cancelUntil?: string;
}

// Structured prebook error: `repick` decides whether the recovery panel
// promotes "pick a fresh offer" (deterministic failures — retrying the same
// offerId cannot succeed) over plain retry (transient failures).
interface FormError {
  message: string;
  repick: boolean;
}

// code → recovery classification for /api/booking/prebook failures.
// PREBOOK_EXPIRED / RATE_UNAVAILABLE: the offer is gone — only a fresh rate
// helps. LITEAPI_DOWN is ALSO classified repick: production logs (2026-06-09)
// show it firing deterministically for specific offers (supplier rejected /
// price drifted), and the user who retried it 4× hit the same wall each
// time — while picking another offer worked on the first try.
function classifyPrebookError(
  code: string | undefined,
  httpStatus: number,
  apiMessage: string | undefined,
): FormError {
  switch (code) {
    case "PREBOOK_EXPIRED":
    case "RATE_UNAVAILABLE":
      return {
        message:
          apiMessage ??
          "Ta oferta nie jest już dostępna. Wybierz ofertę ponownie na stronie hotelu.",
        repick: true,
      };
    case "LITEAPI_DOWN":
    case "prebook_no_payment_session":
      return {
        message:
          "Nie udało się potwierdzić tej oferty u dostawcy — najczęściej oznacza to, że cena lub dostępność właśnie się zmieniła. Wybierz ofertę ponownie, to zajmie chwilę.",
        repick: true,
      };
    case "RATE_LIMIT_EXCEEDED":
      return {
        message: apiMessage ?? "Zbyt wiele prób w krótkim czasie. Odczekaj chwilę i spróbuj ponownie.",
        repick: false,
      };
    default:
      return {
        message: apiMessage ?? "Nie udało się rozpocząć rezerwacji. Spróbuj ponownie.",
        repick: httpStatus >= 500,
      };
  }
}

// ── Inline (blur) validation ────────────────────────────────────────────────
// UX layer only — LiteApiHolderSchema stays the authoritative gate on submit.

type HolderField = "firstName" | "lastName" | "email" | "phone";

const FIELD_ORDER: HolderField[] = ["firstName", "lastName", "email", "phone"];

const FIELD_IDS: Record<HolderField, string> = {
  firstName: "holder-first-name",
  lastName: "holder-last-name",
  email: "holder-email",
  phone: "holder-phone",
};

function fieldError(field: HolderField, value: string): string | null {
  const v = value.trim();
  switch (field) {
    case "firstName":
      return v ? null : "Podaj imię.";
    case "lastName":
      return v ? null : "Podaj nazwisko.";
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
        ? null
        : "Podaj poprawny adres e-mail — wyślemy na niego potwierdzenie.";
    case "phone":
      return v.replace(/[^\d]/g, "").length >= 4
        ? null
        : "Podaj numer telefonu (np. +48 600 000 000).";
  }
}

const inputCls =
  "w-full rounded-lg border px-3 py-2.5 text-sm transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-neutral-50";
const inputOk =
  "border-neutral-300 focus:border-emerald-500 focus:ring-emerald-100";
const inputBad = "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100";
const labelCls = "mb-1 block text-[11px] font-medium uppercase tracking-wide text-neutral-500";

function freshIdemKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random()}`;
}

function formatAmount(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

export function ReservationForm({
  hotelId,
  offerId,
  hotelName,
  hotelCity,
  photoUrl,
  stars,
  rating,
  reviewCount,
  checkin,
  checkout,
  price,
  currency,
  board,
  adults,
  publicKey,
  returnBaseUrl,
  backToHotelHref,
  cancel,
  cancelUntil,
}: Props) {
  const occupancy = Math.max(1, adults);
  const [holder, setHolder] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  // Co-travelers (guests #2..#occupancy) — entirely OPTIONAL. A solo trip in
  // a multi-occupancy room is valid; only fully-filled rows are sent.
  const [coGuests, setCoGuests] = useState(
    Array.from({ length: Math.max(0, occupancy - 1) }, () => ({
      firstName: "",
      lastName: "",
    })),
  );
  const [step, setStep] = useState<"form" | "submitting" | "paying">("form");
  const [error, setError] = useState<FormError | null>(null);
  const [touched, setTouched] = useState<Partial<Record<HolderField, boolean>>>({});
  const [pay, setPay] = useState<PaymentSlotPrebook | null>(null);
  // Lazily generated in onSubmit (never during render — keeps the component
  // pure for the React Compiler / react-hooks/purity).
  const idemKey = useRef<string>("");

  const setCoGuest = (i: number, field: "firstName" | "lastName", v: string) =>
    setCoGuests((g) =>
      g.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)),
    );

  // Per-field inline errors (only for touched fields — no red wall on load).
  const inlineErrors: Partial<Record<HolderField, string>> = {};
  for (const f of FIELD_ORDER) {
    if (touched[f]) {
      const err = fieldError(f, holder[f]);
      if (err) inlineErrors[f] = err;
    }
  }

  function validate(): string | null {
    const h = LiteApiHolderSchema.safeParse(holder);
    if (!h.success)
      return "Uzupełnij poprawnie dane osoby rezerwującej (imię, nazwisko, e-mail, telefon).";
    for (let i = 0; i < coGuests.length; i++) {
      const row = coGuests[i];
      const a = row?.firstName.trim() ?? "";
      const b = row?.lastName.trim() ?? "";
      if (!a && !b) continue; // empty row = OK (skipped on submit)
      if (!a || !b)
        return `Uzupełnij oba pola gościa ${i + 2} lub wyczyść oba pola.`;
      const parsed = LiteApiGuestSchema.safeParse({
        occupancyNumber: i + 2,
        firstName: a,
        lastName: b,
      });
      if (!parsed.success)
        return `Uzupełnij imię i nazwisko gościa ${i + 2}.`;
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== "form") return; // double-submit guard (Idempotency-Key on backend too)

    // Inline pass first: mark every field touched, surface per-field messages
    // and move focus to the first offender (WCAG 3.3.1 + Booking pattern).
    setTouched({ firstName: true, lastName: true, email: true, phone: true });
    const firstBad = FIELD_ORDER.find((f) => fieldError(f, holder[f]));
    if (firstBad) {
      document.getElementById(FIELD_IDS[firstBad])?.focus();
      return;
    }

    const v = validate();
    if (v) {
      setError({ message: v, repick: false });
      return;
    }
    if (!idemKey.current) idemKey.current = freshIdemKey();
    setError(null);
    setStep("submitting");
    track("booking_prebook_start", { hotel_id: hotelId, price, currency });
    try {
      // guests[0] = holder (always); rows with both fields filled appended.
      // Result length is between 1 and occupancy.
      const guests = [
        {
          occupancyNumber: 1,
          firstName: holder.firstName,
          lastName: holder.lastName,
        },
        ...coGuests
          .map((g, i) => ({
            occupancyNumber: i + 2,
            firstName: g.firstName.trim(),
            lastName: g.lastName.trim(),
          }))
          .filter((g) => g.firstName && g.lastName),
      ];

      const res = await fetch("/api/booking/prebook", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idemKey.current,
        },
        body: JSON.stringify({
          offerId,
          hotel: { name: hotelName, city: hotelCity },
          rate: { boardName: board, price, currency, checkin, checkout },
          holder,
          guests,
        }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        secretKey?: string;
        widgetEnv?: "live" | "sandbox";
        message?: string;
        error?: string;
        debug?: { liteApiStatus?: number; liteApiCode?: string };
        rateSummary?: { price?: number; currency?: string };
      };
      if (!res.ok || !data.sessionId || !data.secretKey) {
        // Operator-visible diagnostic: open DevTools → Console after a failed
        // attempt and you see the underlying LiteAPI status + code immediately,
        // without needing to dig through Vercel logs (B6/B7 plumbing).
        console.error(
          "[booking][prebook] failed",
          { httpStatus: res.status, body: data },
        );
        track("booking_prebook_error", {
          hotel_id: hotelId,
          code: data.error,
          http_status: res.status,
        });
        // New attempt must use a fresh idempotency key.
        idemKey.current = freshIdemKey();
        setError(classifyPrebookError(data.error, res.status, data.message));
        setStep("form");
        return;
      }

      setStep("paying");
      setPay({
        secretKey: data.secretKey,
        sessionId: data.sessionId,
        amount: data.rateSummary?.price ?? price ?? 0,
        currency: data.rateSummary?.currency ?? currency,
        // Prefer the env bound to this prebook; fall back to the server prop
        // (B6 key-mode heuristic) if the API didn't include it.
        widgetEnv: data.widgetEnv ?? (publicKey === "live" ? "live" : "sandbox"),
      });
    } catch {
      track("booking_prebook_error", { hotel_id: hotelId, code: "network" });
      setError({
        message:
          "Nie udało się uruchomić płatności. Odśwież stronę i spróbuj ponownie — Twoja karta nie została obciążona.",
        repick: false,
      });
      setStep("form");
    }
  }

  const paying = step === "paying" && pay !== null;

  // Shared two-column shell: card sticky right on lg, stacked-first on mobile.
  // On the payment step the card switches to the PREBOOK price (authoritative
  // — if LiteAPI repriced, the buyer sees the real amount, same as the CTA).
  const summaryCard = (
    <BookingSummaryCard
      hotelName={hotelName}
      hotelCity={hotelCity}
      photoUrl={photoUrl}
      stars={stars}
      rating={rating}
      reviewCount={reviewCount}
      checkin={checkin}
      checkout={checkout}
      adults={adults}
      board={board}
      price={paying ? pay!.amount : price}
      currency={paying ? pay!.currency : currency}
      cancel={cancel}
      cancelUntil={cancelUntil}
    />
  );

  return (
    <div className="mt-5">
      <CheckoutSteps current={paying ? 2 : 1} />

      <h1 className="text-2xl font-bold text-neutral-900">
        {paying ? "Płatność" : "Już prawie gotowe! Uzupełnij dane"}
      </h1>
      <p className="mt-1 text-sm text-neutral-600">
        {paying
          ? "Zapłać w bezpiecznym formularzu Stripe. Po opłaceniu wrócisz tu z potwierdzeniem."
          : "Zajmie Ci to mniej niż minutę. Potwierdzenie wyślemy na e-mail."}
      </p>

      <div className="mt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6">
        {/* Summary card — first in DOM (mobile order), sticky on desktop. */}
        <div className="mb-5 lg:sticky lg:top-[104px] lg:order-2 lg:mb-0">
          {summaryCard}
        </div>

        <div className="lg:order-1">
          {paying ? (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6">
              {/* One-line trust row — Booking-style brevity. The long
                  explainer lives in the <details> below. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-600">
                <span className="inline-flex items-center gap-1.5 font-medium text-neutral-800">
                  <span aria-hidden>🔒</span>
                  Bezpieczna płatność Stripe · 3D Secure
                </span>
                <PaymentBrandsInline />
              </div>

              <div className="mt-4">
                <PaymentSlot
                  prebook={pay!}
                  returnBaseUrl={returnBaseUrl}
                  submitText={`Zapłać ${formatAmount(pay!.amount, pay!.currency)}`}
                  onMountFail={() => {
                    setError({
                      message:
                        "Nie udało się uruchomić płatności. Odśwież stronę i spróbuj ponownie — Twoja karta nie została obciążona.",
                      repick: false,
                    });
                    setStep("form");
                    setPay(null);
                  }}
                />
              </div>

              {/* The NUITEE TRAVEL statement-descriptor explainer, collapsed.
                  Everyone who needs it finds it; nobody else reads a wall of
                  text right before typing card numbers. */}
              <details className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
                <summary className="cursor-pointer text-xs font-semibold text-neutral-700">
                  Co zobaczę na wyciągu z banku?
                </summary>
                <p className="mt-2 text-xs leading-5 text-neutral-600">
                  Rozliczenie obsługuje nasz partner rezerwacyjny Nuitee Travel
                  (LiteAPI), dlatego w aplikacji banku i na wyciągu zobaczysz
                  pozycję <strong>NUITEE&nbsp;TRAVEL</strong>. To prawidłowe i
                  bezpieczne — Twoja rezerwacja jest powiązana z helptravel.pl,
                  a potwierdzenie dostaniesz od nas e-mailem.
                </p>
              </details>

              <TrustStrip />
            </div>
          ) : (
            <form
              onSubmit={onSubmit}
              noValidate
              className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6"
            >
              <fieldset disabled={step === "submitting"} className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">Osoba rezerwująca</h2>
                  {/* WCAG 2.1 SC 1.3.1 + 4.1.2 — every input must have a
                      programmatically-associated label (htmlFor → id). Inline
                      errors are tied via aria-describedby + aria-invalid. */}
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="holder-first-name" className={labelCls}>Imię</label>
                      <input
                        id="holder-first-name"
                        name="holderFirstName"
                        className={`${inputCls} ${inlineErrors.firstName ? inputBad : inputOk}`}
                        value={holder.firstName}
                        onChange={(e) => setHolder({ ...holder, firstName: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, firstName: true }))}
                        autoComplete="given-name"
                        required
                        aria-required="true"
                        aria-invalid={inlineErrors.firstName ? true : undefined}
                        aria-describedby={inlineErrors.firstName ? "holder-first-name-error" : undefined}
                      />
                      {inlineErrors.firstName && (
                        <p id="holder-first-name-error" className="mt-1 text-xs text-red-600">
                          {inlineErrors.firstName}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="holder-last-name" className={labelCls}>Nazwisko</label>
                      <input
                        id="holder-last-name"
                        name="holderLastName"
                        className={`${inputCls} ${inlineErrors.lastName ? inputBad : inputOk}`}
                        value={holder.lastName}
                        onChange={(e) => setHolder({ ...holder, lastName: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, lastName: true }))}
                        autoComplete="family-name"
                        required
                        aria-required="true"
                        aria-invalid={inlineErrors.lastName ? true : undefined}
                        aria-describedby={inlineErrors.lastName ? "holder-last-name-error" : undefined}
                      />
                      {inlineErrors.lastName && (
                        <p id="holder-last-name-error" className="mt-1 text-xs text-red-600">
                          {inlineErrors.lastName}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="holder-email" className={labelCls}>E-mail</label>
                      <input
                        id="holder-email"
                        name="holderEmail"
                        type="email"
                        className={`${inputCls} ${inlineErrors.email ? inputBad : inputOk}`}
                        value={holder.email}
                        onChange={(e) => setHolder({ ...holder, email: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                        autoComplete="email"
                        required
                        aria-required="true"
                        inputMode="email"
                        aria-invalid={inlineErrors.email ? true : undefined}
                        aria-describedby={inlineErrors.email ? "holder-email-error" : undefined}
                      />
                      {inlineErrors.email ? (
                        <p id="holder-email-error" className="mt-1 text-xs text-red-600">
                          {inlineErrors.email}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] text-neutral-400">
                          Tu wyślemy potwierdzenie rezerwacji.
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="holder-phone" className={labelCls}>Telefon</label>
                      <input
                        id="holder-phone"
                        name="holderPhone"
                        type="tel"
                        className={`${inputCls} ${inlineErrors.phone ? inputBad : inputOk}`}
                        value={holder.phone}
                        onChange={(e) => setHolder({ ...holder, phone: e.target.value })}
                        onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                        autoComplete="tel"
                        required
                        aria-required="true"
                        inputMode="tel"
                        placeholder="+48 600 000 000"
                        aria-invalid={inlineErrors.phone ? true : undefined}
                        aria-describedby={inlineErrors.phone ? "holder-phone-error" : "holder-phone-hint"}
                      />
                      {inlineErrors.phone ? (
                        <p id="holder-phone-error" className="mt-1 text-xs text-red-600">
                          {inlineErrors.phone}
                        </p>
                      ) : (
                        <p id="holder-phone-hint" className="mt-1 text-[11px] text-neutral-400">
                          Użyjemy go tylko w razie problemów z rezerwacją.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <OptionalGuestsAccordion
                  occupancy={occupancy}
                  value={coGuests}
                  onChange={setCoGuest}
                  disabled={step === "submitting"}
                />

                {error && (
                  <div
                    role="alert"
                    className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                  >
                    <p className="text-sm text-red-700">{error.message}</p>
                    {/* Deterministic failures (offer gone / provider rejected
                        it): retrying the same offerId is a dead end — promote
                        the path that actually works: fresh rates on the hotel
                        page, same dates and guests already in the link. */}
                    {error.repick && (
                      <Link
                        href={backToHotelHref}
                        className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Wybierz ofertę ponownie →
                      </Link>
                    )}
                  </div>
                )}

                <div>
                  <button
                    type="submit"
                    disabled={step === "submitting"}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/60"
                  >
                    {step === "submitting" ? (
                      <>
                        <svg
                          aria-hidden
                          className="h-4 w-4 animate-spin motion-reduce:hidden"
                          viewBox="0 0 24 24"
                          fill="none"
                        >
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
                          <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                        Rezerwujemy pokój… To może potrwać do 30 sekund
                      </>
                    ) : (
                      "Przejdź do płatności →"
                    )}
                  </button>
                  <p className="mt-2 text-center text-xs text-neutral-500">
                    <span aria-hidden>🔒</span> Za chwilę przejdziesz do bezpiecznej
                    płatności. Nic jeszcze nie pobieramy.
                  </p>
                  <p className="mt-2 text-center text-[11px] text-neutral-400">
                    Przechodząc dalej, akceptujesz{" "}
                    <Link href="/regulamin" target="_blank" className="underline underline-offset-2 hover:text-neutral-600">
                      Regulamin
                    </Link>{" "}
                    i{" "}
                    <Link href="/polityka-prywatnosci" target="_blank" className="underline underline-offset-2 hover:text-neutral-600">
                      Politykę prywatności
                    </Link>
                    .
                  </p>
                </div>
              </fieldset>
              <TrustStrip />
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
