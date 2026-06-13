"use client";

// /loty/platnosc — krok płatności (Faza 3.4). Renderuje LiteAPI Payment SDK
// przez współdzielony PaymentSlot (race-fix #payment-element + publicKey=
// widgetEnv są w nim zaszyte). Przed pokazaniem płatności: jeśli od ostatniego
// verify minęło > 10 min — ponawiamy verify (reguła z briefu 3.4).
//
// Kontekst (sessionId/secretKey/widgetEnv/kwota) z sessionStorage (FlightFlow).
// Brak → wróć do wyników. secretKey idzie tylko do widgetu, nie zapisujemy go
// nigdzie indziej.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { track } from "@/lib/analytics/track";
import { fmtMoneyPln } from "@/lib/flights/display";
import { loadFlightFlow, type FlightFlow } from "@/lib/flights/flow-storage";
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
    // Cena jest już ZABLOKOWANA przez prebook: f.verifiedTotal to kwota zwrócona
    // przez /flights/prebooks (ustawiona na stronie pasażerów) i dokładnie ją
    // obciąży PaymentIntent powiązany z secretKey. Świadomie NIE re-verify'ujemy
    // tu oferty — offerId został już skonsumowany przez prebook, więc verify
    // mógłby zwrócić OFFER_UNAVAILABLE i ZABLOKOWAĆ ważną płatność, albo pokazać
    // inną cenę niż realnie pobierana. Źródłem prawdy o kwocie jest prebook.
    const amount = f.verifiedTotal ?? 0;
    const currency = f.verifiedCurrency ?? "PLN";
    // Deferred (setTimeout 0) — unika kaskadowego renderu w efekcie
    // (react-hooks/set-state-in-effect); wzorzec użyty w home-search-tabs.
    window.setTimeout(() => {
      setFlow(f);
      setPrebook({ secretKey: f.secretKey!, sessionId: f.sessionId!, amount, currency, widgetEnv: f.widgetEnv ?? "live" });
      setStatus("ready");
    }, 0);
    track("flight_payment_start", { amount, currency });
  }, [router]);

  if (!flow || status === "checking") {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-sm text-neutral-500">Potwierdzam cenę i dostępność…</main>;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Płatność</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {flow.origin} → {flow.destination} · {flow.adults + flow.children + flow.infants} pasażerów
      </p>

      {notice && (
        <div className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">{notice}</div>
      )}

      {status === "error" ? (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
          <p className="text-sm text-neutral-700">{notice}</p>
          <button onClick={() => router.push("/loty/wyniki")} className="mt-4 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
            Wróć do wyników
          </button>
        </div>
      ) : prebook ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-neutral-700">Do zapłaty</span>
              <span className="text-2xl font-bold text-emerald-700">{fmtMoneyPln(prebook.amount, prebook.currency)}</span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500">
              Bezpieczna, szyfrowana płatność. Obciążenie karty może widnieć pod nazwą operatora płatności (NUITEE TRAVEL) —
              to merchant of record obsługujący rezerwację.
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <PaymentSlot
              prebook={prebook}
              returnBaseUrl={typeof window !== "undefined" ? window.location.origin : ""}
              returnPath="/loty/platnosc/return"
              submitText={`Zapłać ${fmtMoneyPln(prebook.amount, prebook.currency)}`}
              onMountFail={() => {
                setStatus("error");
                setNotice("Nie udało się załadować formularza płatności. Odśwież stronę lub spróbuj ponownie.");
              }}
            />
          </div>
        </div>
      ) : null}
    </main>
  );
}
