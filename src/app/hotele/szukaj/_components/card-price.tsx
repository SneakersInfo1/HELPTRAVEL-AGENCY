"use client";

import { useEffect, useState } from "react";

import { fetchHotelPrice, type PriceQuery, type SlimRate } from "@/lib/hotels/price-batcher";

const formatPLN = (amount: number, currency: string) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

const formatDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};

function polishBoard(raw: string | undefined): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes("all inclusive") || r.includes("all-inclusive") || r === "ai") return "All Inclusive";
  if (r.includes("full board") || r === "fb") return "Pełne wyżywienie";
  if (r.includes("half board") || r === "hb") return "HB · śniadanie + obiadokolacja";
  if (r.includes("breakfast")) return "Ze śniadaniem w cenie";
  if (r.includes("room only") || r === "ro") return "Bez wyżywienia";
  return raw;
}

function nightsForTotal(n: number): string {
  if (n === 1) return "noc";
  if (n < 5) return "noce";
  return "nocy";
}

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n < 5) return `${n} noce`;
  return `${n} nocy`;
}

type State =
  | { kind: "loading" }
  | { kind: "ok"; rate: SlimRate }
  | { kind: "unavailable" };

// Progressive price slot. Renders a skeleton immediately, then the live
// cheapest price once the batched request resolves (or a graceful
// "no availability" state). The hotel-detail page still has full rates.
export function CardPrice({ query, nights }: { query: PriceQuery; nights: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const childrenKey = query.children.join(".");

  useEffect(() => {
    let alive = true;
    setState({ kind: "loading" });
    fetchHotelPrice(query).then((rate) => {
      if (!alive) return;
      setState(rate ? { kind: "ok", rate } : { kind: "unavailable" });
    });
    return () => {
      alive = false;
    };
    // Re-fetch only when the actual search context changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    query.hotelId,
    query.checkin,
    query.checkout,
    query.adults,
    childrenKey,
    query.rooms,
    query.currency,
  ]);

  if (state.kind === "loading") {
    return (
      <div className="animate-pulse" aria-label="Sprawdzam cenę">
        <div className="h-3 w-16 rounded bg-neutral-200" />
        <div className="mt-1.5 h-6 w-28 rounded bg-neutral-200" />
        <div className="mt-1.5 h-2.5 w-36 rounded bg-neutral-100" />
      </div>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <div className="text-sm text-neutral-500">
        <div className="font-medium text-neutral-600">Brak miejsc w tym terminie</div>
        <div className="text-[11px]">Spróbuj zmienić daty lub zobacz pokoje.</div>
      </div>
    );
  }

  const { rate } = state;
  const board = polishBoard(rate.boardName);
  const isFreeCancel = rate.refundableTag === "RFN" || Boolean(rate.cancellationDeadline);
  const freeCancelDate = formatDate(rate.cancellationDeadline);
  const perNight = formatPLN(Math.round(rate.totalAmount / Math.max(1, nights)), rate.currency);
  const total = formatPLN(rate.totalAmount, rate.currency);

  return (
    <div>
      {board && (
        <div className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
          <span aria-hidden>🍽</span>
          {board}
        </div>
      )}
      {isFreeCancel && freeCancelDate && (
        <div className="mb-1 text-xs font-medium text-emerald-700">
          Bezpłatna anulacja do {freeCancelDate}
        </div>
      )}
      <div className="text-xs text-neutral-500">{nightsLabel(nights)}</div>
      <div className="text-xl font-bold text-emerald-700">
        {perNight}
        <span className="ml-0.5 text-xs font-semibold text-emerald-700/80">/ noc</span>
      </div>
      <div className="text-[11px] text-neutral-500">
        {total} za {nights} {nightsForTotal(nights)} · wł. podatków i opłat
      </div>
    </div>
  );
}
