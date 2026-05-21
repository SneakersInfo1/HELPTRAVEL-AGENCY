"use client";

// Guest-data form (holder required, co-travelers optional) → POST
// /api/booking/prebook → hand-off to <PaymentSlot/>, which owns the LiteAPI
// Payment widget (B5 race fix + B6 env binding + skeleton-tiles fix).
//
// Layout per docs/superpowers/specs/2026-05-20-booking-ui-polish-design.md.

import { useRef, useState } from "react";

import { LiteApiGuestSchema, LiteApiHolderSchema } from "@/lib/liteapi";

import { OptionalGuestsAccordion } from "./optional-guests-accordion";
import { OrderSummaryBanner } from "./order-summary-banner";
import { PaymentSlot, type PaymentSlotPrebook } from "./payment-slot";
import { TrustStrip } from "./trust-strip";

interface Props {
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
  const [error, setError] = useState<string | null>(null);
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
      setError(v);
      return;
    }
    if (!idemKey.current) idemKey.current = freshIdemKey();
    setError(null);
    setStep("submitting");
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
        // New attempt must use a fresh idempotency key.
        idemKey.current = freshIdemKey();
        setError(
          data.message ?? "Nie udało się rozpocząć rezerwacji. Spróbuj ponownie.",
        );
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
      setError(
        "Nie udało się uruchomić płatności. Odśwież stronę i spróbuj ponownie — Twoja karta nie została obciążona.",
      );
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
        />
        <h2 className="text-lg font-bold text-neutral-900">Płatność</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600">
          Wprowadź dane karty w bezpiecznym formularzu. Po opłaceniu wrócisz tu
          z potwierdzeniem.
        </p>
        <PaymentSlot
          prebook={pay}
          returnBaseUrl={returnBaseUrl}
          onMountFail={() => {
            setError(
              "Nie udało się uruchomić płatności. Odśwież stronę i spróbuj ponownie — Twoja karta nie została obciążona.",
            );
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
      />
      <fieldset disabled={step === "submitting"} className="space-y-6">
        <div>
          <h2 className="text-lg font-bold text-neutral-900">Osoba rezerwująca</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Imię</label>
              <input
                className={inputCls}
                value={holder.firstName}
                onChange={(e) => setHolder({ ...holder, firstName: e.target.value })}
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className={labelCls}>Nazwisko</label>
              <input
                className={inputCls}
                value={holder.lastName}
                onChange={(e) => setHolder({ ...holder, lastName: e.target.value })}
                autoComplete="family-name"
              />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input
                type="email"
                className={inputCls}
                value={holder.email}
                onChange={(e) => setHolder({ ...holder, email: e.target.value })}
                autoComplete="email"
              />
            </div>
            <div>
              <label className={labelCls}>Telefon</label>
              <input
                type="tel"
                className={inputCls}
                value={holder.phone}
                onChange={(e) => setHolder({ ...holder, phone: e.target.value })}
                autoComplete="tel"
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
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </p>
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
