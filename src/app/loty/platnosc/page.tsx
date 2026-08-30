"use client";

// /loty/platnosc — krok płatności. Renderuje LiteAPI Payment SDK przez
// współdzielony PaymentSlot (race-fix #payment-element + publicKey=widgetEnv
// są w nim zaszyte).
//
// ── ZMIANY Flights V2 (2026-08-29) ───────────────────────────────────────────
//
// KWOTA POCHODZI Z SERWERA. Do tej pory „Do zapłaty" brało się z
// `sessionStorage` (`flow.verifiedTotal`). Realnie pobierana kwota była
// bezpieczna — PaymentIntent siedzi po stronie LiteAPI i wisi na `secretKey`,
// front nie ma na nią wpływu (patrz `payment-slot.tsx`: do konstruktora widgetu
// idą tylko publicKey/secretKey/returnUrl/targetElement, ŻADNEJ kwoty). Ale
// ostatnia liczba, jaką człowiek widzi przed obciążeniem karty, nie może
// pochodzić z magazynu, który sam może edytować i który potrafi się rozjechać.
// Teraz pytamy `GET /api/flights/session/[sessionId]` i pokazujemy to, co
// odpowie serwer; `sessionStorage` służy już tylko do kontekstu trasy.
//
// Świadomie NIE re-verify'ujemy tu oferty: `offerId` został skonsumowany przez
// prebook, więc verify mógłby zwrócić OFFER_UNAVAILABLE i ZABLOKOWAĆ ważną
// płatność albo pokazać inną cenę niż realnie pobierana.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ShieldCheck } from "lucide-react";

import { track } from "@/lib/analytics/track";
import { formatFlightPriceExact } from "@/lib/flights/money";
import { FLIGHT_SHELL_NARROW } from "@/lib/flights/layout";
import { loadFlightFlow, type FlightFlow } from "@/lib/flights/flow-storage";
import { FlightStepNav } from "@/components/flights/flight-step-nav";
import { PaymentSlot, type PaymentSlotPrebook } from "@/app/hotele/rezerwacja/_components/payment-slot";

export default function FlightPaymentPage() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlightFlow | null>(null);
  const [prebook, setPrebook] = useState<PaymentSlotPrebook | null>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "error">("checking");
  const [notice, setNotice] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const f = loadFlightFlow();
    if (!f || !f.sessionId || !f.secretKey) {
      router.replace("/loty/wyniki");
      return;
    }

    // WSZYSTKIE setState idą do środka funkcji asynchronicznej. Wywołanie
    // `setFlow(f)` wprost w ciele efektu jest błędem reguły
    // `react-hooks/set-state-in-effect` (kaskadowy render) — poprzednia wersja
    // obchodziła to `setTimeout(…, 0)`, ale skoro i tak czekamy tu na serwer
    // po autorytatywną kwotę, naturalnym miejscem jest to oczekiwanie.
    void (async () => {
      // Kwota AUTORYTATYWNA — z serwera, nie z sessionStorage.
      let amount: number | null = null;
      let currency = "PLN";
      try {
        const res = await fetch(`/api/flights/session/${encodeURIComponent(f.sessionId!)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.payable || typeof json.amount !== "number") {
          setFlow(f);
          setStatus("error");
          setNotice(
            res.status === 410
              ? "Sesja rezerwacji wygasła. Wróć do wyników i wybierz lot ponownie."
              : json.flightsDisabled === true
                ? // Kill-switch, nie awaria sesji. Nie każemy zaczynać od nowa,
                  // bo powtórzenie tej samej drogi skończy się tak samo.
                  "Rezerwacja lotów jest chwilowo niedostępna. Twoje dane nie zostały nigdzie wysłane, a karta nie została obciążona. Spróbuj ponownie później."
                : "Nie udało się potwierdzić kwoty do zapłaty. Rozpocznij rezerwację od nowa.",
          );
          track("flight_payment_error", { code: String(json.error ?? "amount_unconfirmed"), http_status: res.status });
          return;
        }
        amount = json.amount;
        currency = json.currency ?? "PLN";
      } catch {
        setFlow(f);
        setStatus("error");
        setNotice("Problem z połączeniem. Odśwież stronę.");
        return;
      }

      setFlow(f);
      setPrebook({ secretKey: f.secretKey!, sessionId: f.sessionId!, amount: amount!, currency, widgetEnv: f.widgetEnv ?? "live" });
      setStatus("ready");
      track("flight_payment_start", { amount: amount!, currency });
    })();
  }, [router]);

  if (!flow || status === "checking") {
    return (
      <main className={`${FLIGHT_SHELL_NARROW} py-12`}>
        <FlightStepNav current="platnosc" className="mb-6" />
        <p className="text-sm text-ink-muted">Potwierdzam kwotę do zapłaty…</p>
      </main>
    );
  }

  return (
    <main className={`${FLIGHT_SHELL_NARROW} py-6 sm:py-8`}>
      <FlightStepNav current="platnosc" className="mb-4" />

      <h1 className="text-2xl font-bold text-ink sm:text-3xl">Płatność</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {flow.origin} → {flow.destination} · {flow.adults + flow.children + flow.infants}{" "}
        {flow.adults + flow.children + flow.infants === 1 ? "podróżny" : "podróżnych"}
      </p>

      {status === "error" ? (
        <div className="mt-6 rounded-lg border border-line bg-surface-raised p-6 text-center">
          <p className="text-sm text-ink">{notice}</p>
          <button
            onClick={() => router.push("/loty/wyniki")}
            className="mt-4 inline-flex h-11 items-center rounded-md bg-brand px-5 font-semibold text-white transition hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <span className="text-sm">Wróć do wyników</span>
          </button>
        </div>
      ) : prebook ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-lg border border-line bg-surface-raised p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-semibold text-ink">Do zapłaty</span>
              <span className="text-2xl font-bold text-accent">
                {formatFlightPriceExact(prebook.amount, prebook.currency)}
              </span>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
              <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" strokeWidth={2} />
              <span>
                Kwota potwierdzona po stronie serwera — zapłacisz dokładnie tyle. Obciążenie karty może widnieć pod nazwą
                operatora płatności (NUITEE TRAVEL), który jest merchant of record obsługującym tę rezerwację.
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-line bg-surface-raised p-5">
            <PaymentSlot
              prebook={prebook}
              returnBaseUrl={typeof window !== "undefined" ? window.location.origin : ""}
              returnPath="/loty/platnosc/return"
              submitText={`Zapłać ${formatFlightPriceExact(prebook.amount, prebook.currency)}`}
              onMountFail={() => {
                setStatus("error");
                setNotice("Nie udało się załadować formularza płatności. Odśwież stronę lub spróbuj ponownie.");
                track("flight_payment_error", { code: "widget_mount_failed" });
              }}
            />
          </div>
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-muted">
            <Lock aria-hidden className="h-3.5 w-3.5" strokeWidth={2} />
            Szyfrowane połączenie · Nie przechowujemy danych karty
          </p>
        </div>
      ) : null}
    </main>
  );
}
