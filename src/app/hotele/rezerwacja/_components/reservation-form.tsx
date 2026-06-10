"use client";

// Guest-data form (holder required, co-travelers optional) → POST
// /api/booking/prebook → hand-off to <PaymentSlot/>, which owns the LiteAPI
// Payment widget (B5 race fix + B6 env binding + skeleton-tiles fix).
//
// Layout per docs/superpowers/specs/2026-05-20-booking-ui-polish-design.md.

import Link from "next/link";
import { useRef, useState } from "react";

import { track } from "@/lib/analytics/track";
import { LiteApiGuestSchema, LiteApiHolderSchema } from "@/lib/liteapi";

import { OptionalGuestsAccordion } from "./optional-guests-accordion";
import { OrderSummaryBanner } from "./order-summary-banner";
import { PaymentBrands } from "./payment-brands";
import { PaymentSlot, type PaymentSlotPrebook } from "./payment-slot";
import { TrustStrip } from "./trust-strip";

interface Props {
  hotelId: string;
  offerId: string;
  hotelName: string;
  hotelCity?: string;
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
  /** Cancellation badge for the summary banner (from the rate link). */
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

const inputCls =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-50";
const labelCls = "mb-1 block text-[11px] font-medium uppercase text-neutral-500";

function freshIdemKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random()}`;
}

export function ReservationForm({
  hotelId,
  offerId,
  hotelName,
  hotelCity,
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
  const [pay, setPay] = useState<PaymentSlotPrebook | null>(null);
  // Lazily generated in onSubmit (never during render — keeps the component
  // pure for the React Compiler / react-hooks/purity).
  const idemKey = useRef<string>("");

  const setCoGuest = (i: number, field: "firstName" | "lastName", v: string) =>
    setCoGuests((g) =>
      g.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)),
    );

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

  // Paying view — widget owns the form; we render the banner above, the
  // PaymentSlot in the middle, and the truthful trust strip below.
  if (step === "paying" && pay) {
    return (
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <OrderSummaryBanner
          hotelName={hotelName}
          hotelCity={hotelCity}
          checkin={checkin}
          checkout={checkout}
          price={pay.amount}
          currency={pay.currency}
          cancel={cancel}
          cancelUntil={cancelUntil}
        />
        <h2 className="text-lg font-bold text-neutral-900">Płatność</h2>
        <p className="mb-3 mt-1 text-sm text-neutral-600">
          Wprowadź dane karty w bezpiecznym formularzu. Po opłaceniu wrócisz tu
          z potwierdzeniem.
        </p>
        {/* Strong trust card (payment step). Every claim is true + verifiable:
            Stripe is the processor (PCI DSS L1), card data never hits our
            server, 3D Secure happens in the user's bank app, and Nuitee Travel
            (LiteAPI) is the merchant of record — which is WHY the bank/Revolut
            screen reads "NUITEE TRAVEL". Stating it up-front removes the
            "is this a scam?" surprise that was costing conversions here. */}
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden className="h-4 w-4 shrink-0 text-emerald-700">
              <path
                fillRule="evenodd"
                d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1Zm3 8V5.5a3 3 0 10-6 0V9h6Z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-sm font-bold text-emerald-900">Bezpieczna, szyfrowana płatność</p>
          </div>
          <ul className="mt-2.5 space-y-1.5 text-[13px] leading-5 text-emerald-900/85">
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              <span>Dane karty wpisujesz w formularzu <strong>Stripe</strong> (PCI DSS Level 1) — my ich nie widzimy ani nie przechowujemy.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              <span>Płatność potwierdzasz w aplikacji swojego banku (<strong>3D&nbsp;Secure</strong>).</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              <span>Rozliczenie obsługuje nasz partner rezerwacyjny <strong>Nuitee&nbsp;Travel (LiteAPI)</strong> — dlatego na ekranie banku lub w aplikacji (np. Revolut) zobaczysz <strong>NUITEE&nbsp;TRAVEL</strong>. To prawidłowe i bezpieczne.</span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden className="text-emerald-600">✓</span>
              <span>
                Jesteśmy zweryfikowaną firmą na{" "}
                <a
                  href="https://pl.trustpilot.com/review/helptravel.pl"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline decoration-emerald-400 underline-offset-2 hover:text-emerald-700"
                >
                  Trustpilot ↗
                </a>
                {" "}— możesz sprawdzić nas przed płatnością.
              </span>
            </li>
          </ul>
          <PaymentBrands />
        </div>
        <PaymentSlot
          prebook={pay}
          returnBaseUrl={returnBaseUrl}
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
        <TrustStrip />
      </div>
    );
  }

  // Form view.
  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6"
    >
      <OrderSummaryBanner
        hotelName={hotelName}
        hotelCity={hotelCity}
        checkin={checkin}
        checkout={checkout}
        price={price}
        currency={currency}
        cancel={cancel}
        cancelUntil={cancelUntil}
      />
      <fieldset disabled={step === "submitting"} className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Osoba rezerwująca</h2>
          {/* WCAG 2.1 SC 1.3.1 + 4.1.2 — every input must have a
              programmatically-associated label. Each label uses `htmlFor`
              pointing at the input's `id`. Without this, screen readers
              announce "edit text, blank" for each field of the booking form
              — the only revenue-critical form on the site. */}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="holder-first-name" className={labelCls}>Imię</label>
              <input
                id="holder-first-name"
                name="holderFirstName"
                className={inputCls}
                value={holder.firstName}
                onChange={(e) => setHolder({ ...holder, firstName: e.target.value })}
                autoComplete="given-name"
                required
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor="holder-last-name" className={labelCls}>Nazwisko</label>
              <input
                id="holder-last-name"
                name="holderLastName"
                className={inputCls}
                value={holder.lastName}
                onChange={(e) => setHolder({ ...holder, lastName: e.target.value })}
                autoComplete="family-name"
                required
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor="holder-email" className={labelCls}>E-mail</label>
              <input
                id="holder-email"
                name="holderEmail"
                type="email"
                className={inputCls}
                value={holder.email}
                onChange={(e) => setHolder({ ...holder, email: e.target.value })}
                autoComplete="email"
                required
                aria-required="true"
                inputMode="email"
              />
            </div>
            <div>
              <label htmlFor="holder-phone" className={labelCls}>Telefon</label>
              <input
                id="holder-phone"
                name="holderPhone"
                type="tel"
                className={inputCls}
                value={holder.phone}
                onChange={(e) => setHolder({ ...holder, phone: e.target.value })}
                autoComplete="tel"
                required
                aria-required="true"
                inputMode="tel"
                placeholder="+48…"
              />
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
            {/* Deterministic failures (offer gone / provider rejected it):
                retrying the same offerId is a dead end — promote the path
                that actually works: fresh rates on the hotel page, same
                dates and guests already in the link. */}
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

        <button
          type="submit"
          disabled={step === "submitting"}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/60"
        >
          {step === "submitting"
            ? "Rezerwujemy pokój… To może potrwać do 30 sekund"
            : "Przejdź do płatności"}
        </button>
      </fieldset>
      <TrustStrip />
    </form>
  );
}
