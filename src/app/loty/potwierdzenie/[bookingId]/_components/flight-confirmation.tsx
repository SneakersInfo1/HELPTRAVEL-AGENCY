"use client";

// Potwierdzenie rezerwacji lotu (Faza 3.5). Pobiera GET /api/flights/booking/
// [bookingId] (źródło prawdy: status + ticketing odświeżane live). Pokazuje
// status, pasażerów, PNR, e-bilety. ticketingStatus=pending → uczciwy komunikat
// (Faza 5). Przycisk „Odśwież status" ponawia GET. `purchase` (GA4) raz na
// potwierdzeniu (item_category:flight — odróżnialne od hoteli).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { track } from "@/lib/analytics/track";
import { clearFlightFlow } from "@/lib/flights/flow-storage";

interface BookingData {
  bookingId: string;
  bookingStatus: string;
  ticketingStatus: string;
  pnr: string | null;
  eTicketNumbers: string[];
  price: number | null;
  currency: string | null;
  passengers: Array<{ firstName: string; lastName: string; type: string }>;
}

const STATUS_LABEL: Record<string, { text: string; tone: string }> = {
  confirmed: { text: "Rezerwacja potwierdzona", tone: "emerald" },
  pending_confirmation: { text: "Rezerwacja w trakcie potwierdzania", tone: "amber" },
  manual_review: { text: "Rezerwacja w weryfikacji", tone: "amber" },
  cancelled: { text: "Rezerwacja anulowana", tone: "red" },
};

export function FlightConfirmation({ bookingId }: { bookingId: string }) {
  const [data, setData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const purchaseFiredRef = useRef(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/flights/booking/${encodeURIComponent(bookingId)}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error === "not_found" ? "Nie znaleźliśmy tej rezerwacji." : "Nie udało się pobrać statusu.");
        setData(null);
      } else {
        setData(json as BookingData);
        setError(null);
        if (!purchaseFiredRef.current && json.bookingStatus === "confirmed") {
          purchaseFiredRef.current = true;
          track("purchase", { booking_id: bookingId, value: json.price ?? undefined, currency: json.currency ?? undefined, item_category: "flight" });
          clearFlightFlow(); // sprzątanie kontekstu po sukcesie
        }
      }
    } catch {
      setError("Problem z połączeniem.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const label = data ? (STATUS_LABEL[data.bookingStatus] ?? { text: "Status rezerwacji", tone: "neutral" }) : null;
  const toneCls =
    label?.tone === "emerald" ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : label?.tone === "amber" ? "bg-amber-50 text-amber-900 border-amber-200"
    : label?.tone === "red" ? "bg-red-50 text-red-800 border-red-200"
    : "bg-neutral-50 text-neutral-700 border-neutral-200";

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-neutral-900">Twoja rezerwacja lotu</h1>

      {loading && !data && <p className="mt-4 text-sm text-neutral-500">Wczytywanie statusu…</p>}
      {error && <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</p>}

      {data && (
        <div className="mt-4 space-y-4">
          <div className={`rounded-2xl border p-5 ${toneCls}`}>
            <p className="text-lg font-bold">{label?.text}</p>
            <p className="mt-1 text-sm">Numer rezerwacji: <span className="font-mono font-semibold">{data.bookingId}</span></p>
            {data.pnr && <p className="text-sm">PNR: <span className="font-mono font-semibold">{data.pnr}</span></p>}
          </div>

          {/* Ticketing pending — uczciwy komunikat (Faza 5). */}
          {data.bookingStatus === "confirmed" && data.ticketingStatus !== "ticketed" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Rezerwacja jest potwierdzona. Status wystawienia biletu zostanie zaktualizowany po otrzymaniu danych od przewoźnika.
            </div>
          )}
          {data.bookingStatus === "manual_review" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Płatność została odnotowana, ale rezerwacja wymaga ręcznej weryfikacji. Skontaktujemy się z Tobą jak najszybciej.
            </div>
          )}

          {data.eTicketNumbers.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-bold text-neutral-900">E-bilety</h2>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {data.eTicketNumbers.map((t) => <li key={t} className="font-mono">{t}</li>)}
              </ul>
            </div>
          )}

          {data.passengers.length > 0 && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <h2 className="text-sm font-bold text-neutral-900">Pasażerowie</h2>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {data.passengers.map((p, i) => <li key={i}>{p.firstName} {p.lastName} <span className="text-neutral-400">· {p.type}</span></li>)}
              </ul>
            </div>
          )}

          {data.price !== null && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold text-neutral-700">Zapłacono</span>
                <span className="text-xl font-bold text-emerald-700">
                  {new Intl.NumberFormat("pl-PL", { style: "currency", currency: data.currency ?? "PLN", maximumFractionDigits: 0 }).format(data.price)}
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button onClick={() => load()} disabled={loading} className="rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60">
              {loading ? "Odświeżam…" : "Odśwież status"}
            </button>
            <Link href="/" className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">Strona główna</Link>
          </div>
        </div>
      )}
    </main>
  );
}
