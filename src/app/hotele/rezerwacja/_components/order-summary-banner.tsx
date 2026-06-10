// Compact emerald-tinted banner shown at the top of the booking card in both
// the form view and the paying view. Pure presentational, server-safe.
//
// Faza 1 redesign (2026-06-10): human date range ("15–16 cze 2026" — no raw
// ISO anywhere the user looks), price breakdown (nights × per-night, bold
// total) and the cancellation-policy badge that previously vanished between
// the hotel page and the checkout.

interface Props {
  hotelName: string;
  hotelCity?: string;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  price?: number;
  currency: string;
  /** "free" → green free-cancellation badge, "nrf" → neutral non-refundable
      note. Absent (old links) → no badge at all. */
  cancel?: "free" | "nrf";
  /** ISO date(time) of the free-cancellation deadline. Only the DAY is shown
      — supplier cutoffs carry hotel-local times that would mislead. */
  cancelUntil?: string;
}

const PL_MONTHS = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
];

interface DateParts {
  day: number;
  monthIdx: number;
  year: number;
}

function parseIsoDate(iso: string): DateParts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), monthIdx: Number(m[2]) - 1, day: Number(m[3]) };
}

// "15–16 cze 2026" (same month) · "30 cze – 2 lip 2026" (same year) ·
// "30 gru 2026 – 2 sty 2027" (year boundary). Exported for the page header.
export function formatStayRange(checkin: string, checkout: string): string {
  const a = parseIsoDate(checkin);
  const b = parseIsoDate(checkout);
  if (!a || !b) return `${checkin} – ${checkout}`;
  const am = PL_MONTHS[a.monthIdx] ?? "";
  const bm = PL_MONTHS[b.monthIdx] ?? "";
  if (a.year === b.year && a.monthIdx === b.monthIdx) {
    return `${a.day}–${b.day} ${bm} ${b.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${am} – ${b.day} ${bm} ${b.year}`;
  }
  return `${a.day} ${am} ${a.year} – ${b.day} ${bm} ${b.year}`;
}

export function formatPlDay(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  const month = PL_MONTHS[d.monthIdx];
  return month ? `${d.day} ${month}` : iso;
}

function nightsBetween(checkin: string, checkout: string): number {
  const a = new Date(`${checkin.slice(0, 10)}T00:00:00Z`);
  const b = new Date(`${checkout.slice(0, 10)}T00:00:00Z`);
  const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return Math.max(1, diff);
}

function nightNoun(n: number): string {
  if (n === 1) return "noc";
  if (n >= 2 && n <= 4) return "noce";
  return "nocy";
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function OrderSummaryBanner({
  hotelName,
  hotelCity,
  checkin,
  checkout,
  price,
  currency,
  cancel,
  cancelUntil,
}: Props) {
  const nights = nightsBetween(checkin, checkout);
  const hasPrice = typeof price === "number" && Number.isFinite(price);
  const perNight = hasPrice ? price / nights : null;
  const perNightRounded = perNight !== null ? Math.round(perNight) : null;
  const perNightExact =
    perNightRounded !== null && hasPrice && perNightRounded * nights === Math.round(price);

  return (
    <div className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5">
      <div className="text-sm font-semibold text-emerald-900">{hotelName}</div>
      <div className="mt-0.5 text-xs text-emerald-900/70">
        {[hotelCity, formatStayRange(checkin, checkout), `${nights} ${nightNoun(nights)}`]
          .filter(Boolean)
          .join(" · ")}
      </div>

      {cancel === "free" && (
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
          <span aria-hidden>✓</span>
          Bezpłatne anulowanie{cancelUntil ? ` do ${formatPlDay(cancelUntil)}` : ""}
        </div>
      )}
      {cancel === "nrf" && (
        <div className="mt-2 inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
          Oferta bezzwrotna — najniższa cena za ten pokój
        </div>
      )}

      {hasPrice && perNightRounded !== null && (
        <div className="mt-3 border-t border-emerald-100 pt-2.5 text-sm">
          <div className="flex items-center justify-between text-xs text-emerald-900/70">
            <span>
              {nights} {nightNoun(nights)} × {perNightExact ? "" : "ok. "}
              {formatPrice(perNightRounded, currency)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-950">Razem</span>
            <span className="text-base font-bold text-emerald-950">
              {formatPrice(price, currency)}
            </span>
          </div>
          <div className="text-right text-[11px] text-emerald-900/60">
            wł. podatków i opłat · płatność w PLN
          </div>
        </div>
      )}
    </div>
  );
}
