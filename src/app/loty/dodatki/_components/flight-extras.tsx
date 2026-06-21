"use client";

// Krok „Bagaż / taryfa" (Faza D). Pokazuje taryfy wybranej trasy (offer.fares)
// z bagażem + ceną; wybór → verify(offerId) → /loty/pasazerowie. Weryfikacja i
// obsługa zmiany ceny / wygaśnięcia oferty przeniesione tu z listy wyników.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { track } from "@/lib/analytics/track";
import { fmtMoneyPln, type FareOption } from "@/lib/flights/display";
import { loadFlightFlow, patchFlightFlow, type FlightFlow } from "@/lib/flights/flow-storage";
import { FlightItinerarySummary } from "@/components/flights/flight-itinerary-summary";

function BagRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${ok ? "text-emerald-700" : "text-neutral-400"}`}>
      <span aria-hidden>{ok ? "✓" : "—"}</span>
      <span className={ok ? "" : "line-through"}>{label}</span>
    </span>
  );
}

export function FlightExtras() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlightFlow | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<{ oldTotal: number; newTotal: number; currency: string; fare: FareOption } | null>(null);

  useEffect(() => {
    const f = loadFlightFlow();
    if (!f || !f.offer) {
      router.replace("/?tab=loty");
      return;
    }
    setFlow(f);
    setSelectedId(f.offerId || f.offer.fares[0]?.offerId || "");
  }, [router]);

  if (!flow) {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-sm text-neutral-500">Wczytywanie…</main>;
  }

  const fares = flow.offer.fares.length > 0 ? flow.offer.fares : [];
  const cheapest = fares[0]?.total ?? null;
  const selected = fares.find((f) => f.offerId === selectedId) ?? fares[0];

  function commit(fare: FareOption, total: number | null, currency: string) {
    patchFlightFlow({
      offerId: fare.offerId,
      verifiedTotal: total,
      verifiedCurrency: currency,
      verifiedAt: Date.now(),
      fare: { name: fare.fareName, hasCarryOnBag: fare.hasCarryOnBag, hasCheckedBag: fare.hasCheckedBag },
    });
    router.push("/loty/pasazerowie");
  }

  async function proceed() {
    if (!selected || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch("/api/flights/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: selected.offerId, previousTotal: selected.total ?? undefined, previousCurrency: selected.currency }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === "OFFER_UNAVAILABLE" ? "Ta oferta wygasła. Wróć do wyników i wybierz lot ponownie." : json.message || "Nie udało się potwierdzić oferty. Spróbuj ponownie.");
        return;
      }
      if (json.priceChanged && typeof json.newTotal === "number") {
        track("flight_verify_price_change", { offer_id: selected.offerId, old_price: json.oldTotal, new_price: json.newTotal, currency: json.currency });
        setPriceChange({ oldTotal: json.oldTotal ?? selected.total ?? 0, newTotal: json.newTotal, currency: json.currency ?? selected.currency, fare: selected });
        return;
      }
      commit(selected, json.total ?? selected.total, json.currency ?? selected.currency);
    } catch {
      setError("Problem z połączeniem. Spróbuj ponownie.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">Bagaż i taryfa</h1>
      <p className="mt-1 text-sm text-neutral-600">
        {flow.origin} → {flow.destination} · {flow.adults + flow.children + flow.infants} pasażerów
      </p>

      {/* Skrót wybranego lotu — logo linii, godziny, daty, czas i przesiadki. */}
      <div className="mt-4 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <FlightItinerarySummary offer={flow.offer} depart={flow.depart} ret={flow.ret} />
      </div>

      {/* Taryfy */}
      <h2 className="mt-6 text-sm font-bold text-neutral-900">
        {fares.length > 1 ? "Wybierz taryfę z bagażem" : "Taryfa"}
      </h2>
      <div className="mt-2 space-y-2.5">
        {fares.map((fare) => {
          const active = fare.offerId === selectedId;
          const diff = cheapest !== null && fare.total !== null ? Math.round(fare.total - cheapest) : 0;
          return (
            <label
              key={fare.offerId}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 transition ${active ? "border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500" : "border-neutral-200 bg-white hover:border-neutral-300"}`}
            >
              <input
                type="radio"
                name="fare"
                checked={active}
                onChange={() => setSelectedId(fare.offerId)}
                className="h-4 w-4 shrink-0 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-neutral-900">{fare.fareName}</p>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  <BagRow ok={fare.hasCarryOnBag} label="Bagaż podręczny" />
                  <BagRow ok={fare.hasCheckedBag} label="Bagaż rejestrowany" />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-base font-bold text-emerald-700">{fmtMoneyPln(fare.total, fare.currency)}</p>
                {diff > 0 && <p className="text-[11px] text-neutral-500">+{fmtMoneyPln(diff, fare.currency)}</p>}
              </div>
            </label>
          );
        })}
      </div>

      {/* Uczciwa nota o pozostałych usługach (miejsca / bagaż à la carte) */}
      <p className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-xs text-neutral-500">
        Wybór miejsc i dodatkowy bagaż mogą być dostępne zależnie od linii i taryfy — niektórzy przewoźnicy oferują je przy
        odprawie online. Cena powyżej zawiera bagaż wskazany w wybranej taryfie.
      </p>

      {error && (
        <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
          <button onClick={() => router.push("/loty/wyniki")} className="ml-2 underline">Wróć do wyników</button>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button onClick={() => router.back()} className="text-sm font-semibold text-neutral-600 hover:underline">
          ← Wróć
        </button>
        <button
          onClick={() => void proceed()}
          disabled={verifying || !selected}
          className="inline-flex h-12 items-center justify-center rounded-xl bg-emerald-600 px-6 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {verifying ? "Sprawdzam cenę…" : "Dalej do danych pasażerów →"}
        </button>
      </div>

      {/* Modal zmiany ceny */}
      {priceChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-neutral-900">Cena lotu się zmieniła</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Cena zmieniła się z <span className="font-semibold">{fmtMoneyPln(priceChange.oldTotal, priceChange.currency)}</span> na{" "}
              <span className="font-semibold text-emerald-700">{fmtMoneyPln(priceChange.newTotal, priceChange.currency)}</span>. Kontynuuj
              tylko, jeśli akceptujesz nową cenę.
            </p>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setPriceChange(null)} className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50">
                Wróć
              </button>
              <button
                onClick={() => {
                  const pc = priceChange;
                  setPriceChange(null);
                  commit(pc.fare, pc.newTotal, pc.currency);
                }}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Akceptuję
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
