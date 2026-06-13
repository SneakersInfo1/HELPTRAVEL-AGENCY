"use client";

// Lista ofert lotów (Faza 3.1). Pobiera oferty z /api/flights/rates, sortuje
// (cena/czas), renderuje karty (przewoźnik, godziny, czas, przesiadki, cena
// total za wszystkich pasażerów). Klik „Wybierz" → /api/flights/verify:
//   • priceChanged → modal „cena się zmieniła" (Akceptuję / Wróć)
//   • OFFER_UNAVAILABLE → toast + powrót do listy (oferta znika)
//   • OK → zapis kontekstu (sessionStorage) → /loty/pasazerowie

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { track } from "@/lib/analytics/track";
import {
  fmtDuration,
  fmtMoneyPln,
  fmtTime,
  normalizeRatesResponse,
  stopsLabel,
  type DisplayLeg,
  type DisplayOffer,
} from "@/lib/flights/display";
import { saveFlightFlow } from "@/lib/flights/flow-storage";

interface Props {
  origin: string;
  destination: string;
  depart: string;
  ret?: string;
  adults: number;
  childrenCount: number;
  infants: number;
}

type SortKey = "price" | "duration";

type Leg = { origin: string; destination: string; date: string; direction: "OUTBOUND" | "INBOUND" };

export function FlightResults(props: Props) {
  const { origin, destination, depart, ret, adults, childrenCount, infants } = props;
  const router = useRouter();
  const [offers, setOffers] = useState<DisplayOffer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("price");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<{ offer: DisplayOffer; oldTotal: number; newTotal: number; currency: string } | null>(null);
  const fetchedRef = useRef(false);

  const passengers = adults + childrenCount + infants;

  // Pobranie ofert (raz).
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const legs: Leg[] = [{ origin, destination, date: depart, direction: "OUTBOUND" }];
    if (ret) legs.push({ origin: destination, destination: origin, date: ret, direction: "INBOUND" });
    (async () => {
      try {
        const res = await fetch("/api/flights/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ legs, adults, children: childrenCount, infants, cabinClass: "ECONOMY" }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(json.message || "Nie udało się pobrać ofert. Spróbuj ponownie.");
          setOffers([]);
          return;
        }
        const list = normalizeRatesResponse(json);
        setOffers(list);
        track("flight_results_view", { origin, destination, results_count: list.length });
      } catch {
        setError("Problem z połączeniem. Spróbuj ponownie.");
        setOffers([]);
      }
    })();
  }, [origin, destination, depart, ret, adults, childrenCount, infants]);

  const sorted = useMemo(() => {
    if (!offers) return [];
    const copy = [...offers];
    if (sort === "price") {
      copy.sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
    } else {
      copy.sort((a, b) => a.maxDurationMinutes - b.maxDurationMinutes);
    }
    return copy;
  }, [offers, sort]);

  function toResults(offer: DisplayOffer, total: number | null, currency: string) {
    saveFlightFlow({
      origin, destination, depart, ret, adults, children: childrenCount, infants,
      offerId: offer.offerId, offer,
      verifiedTotal: total, verifiedCurrency: currency, verifiedAt: Date.now(),
    });
    router.push("/loty/pasazerowie");
  }

  async function selectOffer(offer: DisplayOffer) {
    if (verifyingId) return;
    setVerifyingId(offer.offerId);
    track("flight_select", { offer_id: offer.offerId, price: offer.total ?? undefined, currency: offer.currency, carrier: offer.legs[0]?.carriers[0] });
    try {
      const res = await fetch("/api/flights/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: offer.offerId, previousTotal: offer.total ?? undefined, previousCurrency: offer.currency }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.error === "OFFER_UNAVAILABLE") {
          setToast("Ta oferta jest już niedostępna. Wybierz inną.");
          setOffers((prev) => (prev ? prev.filter((o) => o.offerId !== offer.offerId) : prev));
        } else {
          setToast(json.message || "Nie udało się potwierdzić oferty. Spróbuj ponownie.");
        }
        return;
      }
      if (json.priceChanged && typeof json.newTotal === "number") {
        track("flight_verify_price_change", { offer_id: offer.offerId, old_price: json.oldTotal, new_price: json.newTotal, currency: json.currency });
        setPriceChange({ offer, oldTotal: json.oldTotal ?? offer.total ?? 0, newTotal: json.newTotal, currency: json.currency ?? offer.currency });
        return;
      }
      toResults(offer, json.total ?? offer.total, json.currency ?? offer.currency);
    } catch {
      setToast("Problem z połączeniem. Spróbuj ponownie.");
    } finally {
      setVerifyingId(null);
    }
  }

  // Auto-ukrycie tostu.
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(id);
  }, [toast]);

  return (
    <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
            Loty {origin} → {destination}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            {ret ? "W obie strony" : "W jedną stronę"} · {passengers} {passengers === 1 ? "pasażer" : "pasażerów"}
            {offers ? ` · ${offers.length} ${offers.length === 1 ? "oferta" : "ofert"}` : ""}
          </p>
        </div>
        {offers && offers.length > 0 && (
          <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSort("price")}
              className={`rounded-md px-3 py-1.5 transition ${sort === "price" ? "bg-emerald-600 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              Najtańsze
            </button>
            <button
              type="button"
              onClick={() => setSort("duration")}
              className={`rounded-md px-3 py-1.5 transition ${sort === "duration" ? "bg-emerald-600 text-white" : "text-neutral-600 hover:bg-neutral-50"}`}
            >
              Najszybsze
            </button>
          </div>
        )}
      </header>

      {/* Loading skeleton */}
      {offers === null && (
        <div className="mt-6 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="h-4 w-1/3 rounded bg-neutral-100" />
              <div className="mt-3 h-6 w-2/3 rounded bg-neutral-100" />
              <div className="mt-3 h-4 w-1/4 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      )}

      {/* Empty / error */}
      {offers !== null && sorted.length === 0 && (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">
            {error ?? "Brak lotów dla wybranych dat"}
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Spróbuj zmienić daty albo lotnisko wylotu. Część tras lata tylko w wybrane dni tygodnia.
          </p>
        </div>
      )}

      {/* Lista */}
      {sorted.length > 0 && (
        <div className="mt-6 space-y-3">
          {sorted.map((offer) => (
            <OfferCard
              key={offer.offerId}
              offer={offer}
              passengers={passengers}
              busy={verifyingId === offer.offerId}
              disabled={Boolean(verifyingId) && verifyingId !== offer.offerId}
              onSelect={() => selectOffer(offer)}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit max-w-[92%] rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Modal zmiany ceny */}
      {priceChange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-neutral-900">Cena lotu się zmieniła</h2>
            <p className="mt-2 text-sm text-neutral-600">
              Cena lotu zmieniła się z{" "}
              <span className="font-semibold">{fmtMoneyPln(priceChange.oldTotal, priceChange.currency)}</span> na{" "}
              <span className="font-semibold text-emerald-700">{fmtMoneyPln(priceChange.newTotal, priceChange.currency)}</span>.
              Kontynuuj tylko, jeśli akceptujesz nową cenę.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setPriceChange(null)}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                Wróć do wyników
              </button>
              <button
                type="button"
                onClick={() => {
                  const pc = priceChange;
                  setPriceChange(null);
                  toResults(pc.offer, pc.newTotal, pc.currency);
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

function LegRow({ leg }: { leg: DisplayLeg }) {
  return (
    <div className="flex items-center gap-3">
      {leg.carrierLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={leg.carrierLogo} alt={leg.carriers[0]} className="h-6 w-6 shrink-0 rounded object-contain" />
      ) : (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-emerald-50 text-[10px] font-bold text-emerald-700">✈</span>
      )}
      <div className="flex flex-1 items-center gap-3">
        <div className="text-right">
          <div className="text-base font-bold tabular-nums text-neutral-900">{fmtTime(leg.departureTime)}</div>
          <div className="text-[11px] text-neutral-500">{leg.originCode}</div>
        </div>
        <div className="flex-1 text-center">
          <div className="text-[11px] text-neutral-500">{fmtDuration(leg.durationMinutes)}</div>
          <div className="relative my-1 h-px bg-neutral-200">
            <span className="absolute -top-1 right-0 text-[8px] text-neutral-400">▶</span>
          </div>
          <div className="text-[11px] font-medium text-neutral-600">{stopsLabel(leg.stops)}</div>
        </div>
        <div>
          <div className="text-base font-bold tabular-nums text-neutral-900">{fmtTime(leg.arrivalTime)}</div>
          <div className="text-[11px] text-neutral-500">{leg.destinationCode}</div>
        </div>
      </div>
    </div>
  );
}

function OfferCard({
  offer,
  passengers,
  busy,
  disabled,
  onSelect,
}: {
  offer: DisplayOffer;
  passengers: number;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const carrier = offer.legs[0]?.carriers.join(", ");
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-3">
          {offer.legs.map((leg) => (
            <LegRow key={leg.direction} leg={leg} />
          ))}
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-500">
            <span className="font-medium text-neutral-700">{carrier}</span>
            {offer.hasCarryOnBag && <span className="rounded bg-neutral-100 px-1.5 py-0.5">bagaż podręczny</span>}
            {offer.hasCheckedBag && <span className="rounded bg-neutral-100 px-1.5 py-0.5">bagaż rejestrowany</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 border-t border-neutral-100 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <div className="text-right">
            <div className="text-xl font-bold text-emerald-700">{fmtMoneyPln(offer.total, offer.currency)}</div>
            <div className="text-[11px] text-neutral-500">za {passengers} {passengers === 1 ? "pasażera" : "pasażerów"} · wł. opłat</div>
          </div>
          <button
            type="button"
            onClick={onSelect}
            disabled={busy || disabled}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Sprawdzam…" : "Wybierz"}
          </button>
        </div>
      </div>
    </article>
  );
}
