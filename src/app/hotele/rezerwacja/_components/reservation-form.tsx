"use client";

// Guest-data form → POST /api/booking/prebook → LiteAPI Payment SDK widget.
// Plain React + native inputs, matching the existing booking-widget.tsx style
// (the site has no form library; per reuse/minimum-surface we do NOT introduce
// one). Client validation reuses the zod schemas from @/lib/liteapi.
//
// Flow (Q1 confirmed redirect model, BOOKING_AUDIT.md §8):
//   submit → prebook → {sessionId, secretKey} → load widget →
//   new LiteAPIPayment({ ..., returnUrl: <site>/hotele/rezerwacja/return?sid }) →
//   user pays → LiteAPI redirects browser to that returnUrl.

import { useEffect, useRef, useState } from "react";

import { LiteApiGuestSchema, LiteApiHolderSchema } from "@/lib/liteapi";

const WIDGET_SRC = "https://payment-wrapper.liteapi.travel/dist/liteAPIPayment.js?v=a1";

interface LiteApiPaymentCtor {
  new (config: Record<string, unknown>): { handlePayment: () => Promise<void> };
}
declare global {
  interface Window {
    LiteAPIPayment?: LiteApiPaymentCtor;
  }
}

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
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none";
const labelCls = "mb-1 block text-[11px] font-medium uppercase text-neutral-500";

function freshIdemKey(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random()}`;
}

function loadWidgetScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.LiteAPIPayment) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${WIDGET_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("widget script failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = WIDGET_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("widget script failed"));
    document.head.appendChild(s);
  });
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
  const [holder, setHolder] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [guests, setGuests] = useState(
    Array.from({ length: Math.max(1, adults) }, () => ({ firstName: "", lastName: "" })),
  );
  const [step, setStep] = useState<"form" | "submitting" | "paying">("form");
  const [error, setError] = useState<string | null>(null);
  // Prebook result that the payment widget mounts from. Set once prebook
  // succeeds; consumed by the widget effect below (NOT inside onSubmit — B5).
  const [pay, setPay] = useState<{
    secretKey: string;
    sessionId: string;
    amount: number;
    currency: string;
  } | null>(null);
  // Lazily generated in onSubmit (never during render — keeps the component
  // pure for the React Compiler / react-hooks/purity).
  const idemKey = useRef<string>("");

  const setGuest = (i: number, field: "firstName" | "lastName", v: string) =>
    setGuests((g) => g.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)));

  function validate(): string | null {
    const h = LiteApiHolderSchema.safeParse(holder);
    if (!h.success) return "Uzupełnij poprawnie dane osoby rezerwującej (imię, nazwisko, e-mail, telefon).";
    const gs = guests.map((g, i) => ({ occupancyNumber: i + 1, ...g }));
    for (const g of gs) {
      if (!LiteApiGuestSchema.safeParse(g).success) {
        return "Uzupełnij imię i nazwisko każdego gościa.";
      }
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== "form") return; // double-submit guard (Idempotency-Key also on backend)
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    if (!idemKey.current) idemKey.current = freshIdemKey();
    setError(null);
    setStep("submitting");
    try {
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
          guests: guests.map((g, i) => ({ occupancyNumber: i + 1, ...g })),
        }),
      });
      const data = (await res.json()) as {
        sessionId?: string;
        secretKey?: string;
        message?: string;
        rateSummary?: { price?: number; currency?: string };
      };
      if (!res.ok || !data.sessionId || !data.secretKey) {
        // New attempt must use a fresh idempotency key.
        idemKey.current = freshIdemKey();
        setError(data.message ?? "Nie udało się rozpocząć rezerwacji. Spróbuj ponownie.");
        setStep("form");
        return;
      }

      // Hand off to the widget effect. Init MUST happen from useEffect, after
      // React commits the #payment-element node — running it here races the
      // render on the cached-script path → Stripe IntegrationError (B5).
      setStep("paying");
      setPay({
        secretKey: data.secretKey,
        sessionId: data.sessionId,
        amount: data.rateSummary?.price ?? price ?? 0,
        currency: data.rateSummary?.currency ?? currency,
      });
    } catch {
      setError(
        "Nie udało się uruchomić płatności. Odśwież stronę i spróbuj ponownie — Twoja karta nie została obciążona.",
      );
      setStep("form");
    }
  }

  // B5: widget init runs ONLY after (a) the SDK script is loaded and (b) the
  // #payment-element node is committed to the DOM. The cached-script path made
  // loadWidgetScript() resolve before React committed the "paying" branch, so
  // Stripe had no node to mount → IntegrationError. rAF-poll the node, bounded.
  useEffect(() => {
    if (!pay) return;
    const prebook = pay; // narrow for the nested async closure (TS)

    let cancelled = false;
    let rafHandle = 0;

    const failToForm = () => {
      if (cancelled) return;
      setError(
        "Nie udało się uruchomić płatności. Odśwież stronę i spróbuj ponownie — Twoja karta nie została obciążona.",
      );
      setStep("form");
      setPay(null);
    };

    async function initWidget() {
      try {
        await loadWidgetScript();
      } catch {
        failToForm();
        return;
      }
      if (cancelled) return;

      let retries = 0;
      const MAX_RETRIES = 10;
      while (!document.getElementById("payment-element") && retries < MAX_RETRIES) {
        retries++;
        await new Promise<void>((r) => {
          rafHandle = requestAnimationFrame(() => r());
        });
        if (cancelled) return;
      }

      if (!document.getElementById("payment-element")) {
        console.error(
          "[booking][widget] #payment-element never mounted after",
          retries,
          "retries — aborting widget init",
        );
        failToForm();
        return;
      }
      if (!window.LiteAPIPayment) {
        console.error(
          "[booking][widget] LiteAPIPayment global unavailable after script load",
        );
        failToForm();
        return;
      }

      const returnUrl = `${returnBaseUrl}/hotele/rezerwacja/return?sid=${encodeURIComponent(
        prebook.sessionId,
      )}`;
      new window.LiteAPIPayment({
        publicKey,
        secretKey: prebook.secretKey,
        returnUrl,
        targetElement: "#payment-element",
        appearance: { theme: "flat" },
        options: { business: { name: "helptravel.pl" } },
        amount: prebook.amount,
        currency: prebook.currency,
        submitButton: { text: "Zapłać i zarezerwuj" },
      }).handlePayment();
    }

    void initWidget();

    return () => {
      cancelled = true;
      if (rafHandle) cancelAnimationFrame(rafHandle);
    };
  }, [pay, publicKey, returnBaseUrl]);

  if (step === "paying") {
    return (
      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-bold text-neutral-900">Płatność</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Wprowadź dane karty w bezpiecznym formularzu. Po opłaceniu wrócisz tu z
          potwierdzeniem.
        </p>
        <div id="payment-element" className="mt-4 min-h-[220px]">
          <div className="animate-pulse space-y-3 motion-reduce:animate-none">
            <div className="h-10 rounded bg-neutral-100" />
            <div className="h-10 rounded bg-neutral-100" />
            <div className="h-10 w-1/2 rounded bg-neutral-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="mt-6 space-y-6 rounded-2xl border border-neutral-200 bg-white p-6"
    >
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

        <div>
          <h2 className="text-lg font-bold text-neutral-900">
            Goście ({guests.length})
          </h2>
          <div className="mt-3 space-y-3">
            {guests.map((g, i) => (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Imię gościa {i + 1}</label>
                  <input
                    className={inputCls}
                    value={g.firstName}
                    onChange={(e) => setGuest(i, "firstName", e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelCls}>Nazwisko gościa {i + 1}</label>
                  <input
                    className={inputCls}
                    value={g.lastName}
                    onChange={(e) => setGuest(i, "lastName", e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

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
        <p className="text-center text-[11px] text-neutral-400">
          Płatność kartą obsługiwana przez bezpieczny system LiteAPI. Nie
          przechowujemy danych karty.
        </p>
      </fieldset>
    </form>
  );
}
