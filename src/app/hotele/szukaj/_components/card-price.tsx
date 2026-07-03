"use client";

import type { PriceEntry } from "@/lib/hotels/price-store";
import { formatPLN } from "@/lib/money";

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

// Presentational price slot — pure function of the store entry. Fetching
// is owned by ResultsList via the price-store so prices survive
// re-sorts/filters without re-hitting the network.
export function PriceView({ entry, nights }: { entry: PriceEntry | undefined; nights: number }) {
  if (entry === undefined || entry === "loading") {
    return (
      <div className="animate-pulse" aria-label="Sprawdzam cenę">
        <div className="h-3 w-16 rounded bg-neutral-200" />
        <div className="mt-1.5 h-6 w-28 rounded bg-neutral-200" />
        <div className="mt-1.5 h-2.5 w-36 rounded bg-neutral-100" />
      </div>
    );
  }

  if (entry === "error") {
    // Fetch ceny padł (po ponowce) — to NIE jest brak miejsc. Strona hotelu
    // pobiera stawki osobnym endpointem, więc kierujemy tam.
    return (
      <div className="text-sm text-neutral-500">
        <div className="font-medium text-neutral-600">Nie udało się pobrać ceny</div>
        <div className="text-[11px]">Otwórz hotel — sprawdzimy dostępność na jego stronie.</div>
      </div>
    );
  }

  if (entry === null) {
    return (
      <div className="text-sm text-neutral-500">
        <div className="font-medium text-neutral-600">Brak miejsc w tym terminie</div>
        <div className="text-[11px]">Spróbuj zmienić daty lub zobacz pokoje.</div>
      </div>
    );
  }

  const board = polishBoard(entry.boardName);
  const isFreeCancel = entry.refundableTag === "RFN" || Boolean(entry.cancellationDeadline);
  const freeCancelDate = formatDate(entry.cancellationDeadline);
  const perNight = formatPLN(Math.round(entry.totalAmount / Math.max(1, nights)), entry.currency);
  const total = formatPLN(entry.totalAmount, entry.currency);

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
