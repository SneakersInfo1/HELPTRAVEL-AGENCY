"use client";

// Booking.com-style reservation summary card. Shown beside the form (sticky
// right column on lg) and above it on mobile, on BOTH checkout steps — the
// buyer never loses sight of what they're paying for. Replaces the old
// OrderSummaryBanner (this file also took over its date/price helpers).
//
// Client component only because the hotel photo needs an onError fallback
// (house pattern from hotel-card-image.tsx) — everything else is pure props.

import { useState } from "react";

interface Props {
  hotelName: string;
  hotelCity?: string;
  photoUrl?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  adults: number;
  board?: string;
  price?: number;
  currency: string;
  cancel?: "free" | "nrf";
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
// "30 gru 2026 – 2 sty 2027" (year boundary).
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

// Same quality labels the hotel page uses for the LiteAPI 0–10 guest score.
function ratingLabel(r: number): string {
  if (r >= 9) return "Wspaniały";
  if (r >= 8) return "Bardzo dobry";
  if (r >= 7) return "Dobry";
  return "Przyzwoity";
}

function reviewsNoun(n: number): string {
  if (n === 1) return "opinia";
  const d = n % 10;
  const dd = n % 100;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return "opinie";
  return "opinii";
}

// Minimal board localisation (mirror of the hotel-page labels).
function polishBoard(raw?: string): string | null {
  if (!raw) return null;
  const r = raw.toLowerCase();
  if (r.includes("breakfast")) return "Ze śniadaniem";
  if (r.includes("all-inclusive") || r.includes("all_inclusive") || r === "ai") return "All Inclusive";
  if (r.includes("half")) return "Śniadanie i obiadokolacja (HB)";
  if (r.includes("full")) return "Pełne wyżywienie (FB)";
  if (r.includes("room only") || r === "ro" || r.includes("room_only")) return "Bez wyżywienia";
  return raw;
}

function adultsLabel(n: number): string {
  return n === 1 ? "1 dorosły" : `${n} dorosłych`;
}

export function BookingSummaryCard({
  hotelName,
  hotelCity,
  photoUrl,
  stars,
  rating,
  reviewCount,
  checkin,
  checkout,
  adults,
  board,
  price,
  currency,
  cancel,
  cancelUntil,
}: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const nights = nightsBetween(checkin, checkout);
  const hasPrice = typeof price === "number" && Number.isFinite(price);
  const perNight = hasPrice ? Math.round(price / nights) : null;
  const perNightExact = perNight !== null && hasPrice && perNight * nights === Math.round(price);
  const boardLabel = polishBoard(board);
  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const starsCount =
    typeof stars === "number" && Number.isFinite(stars)
      ? Math.max(0, Math.min(5, Math.round(stars)))
      : 0;

  return (
    <aside
      aria-label="Podsumowanie rezerwacji"
      className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      {showPhoto && (
        /* LiteAPI photo hosts are arbitrary supplier CDNs; plain <img> +
           onError fallback is the house pattern (hotel-card-image.tsx). */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={hotelName}
          loading="lazy"
          onError={() => setPhotoFailed(true)}
          className="h-36 w-full object-cover"
        />
      )}

      <div className="p-4">
        {starsCount > 0 && (
          <div aria-label={`Kategoria: ${starsCount} gwiazdek`} className="text-xs leading-none text-amber-500">
            {"★".repeat(starsCount)}
          </div>
        )}
        <h2 className="mt-1 text-base font-bold leading-snug text-neutral-900">{hotelName}</h2>
        {hotelCity && <p className="mt-0.5 text-xs text-neutral-500">{hotelCity}</p>}

        {typeof rating === "number" && rating > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md rounded-bl-none bg-emerald-700 px-1.5 text-xs font-bold text-white">
              {rating.toFixed(1).replace(".", ",")}
            </span>
            <span className="text-xs text-neutral-700">
              <strong>{ratingLabel(rating)}</strong>
              {typeof reviewCount === "number" && reviewCount > 0
                ? ` · ${reviewCount} ${reviewsNoun(reviewCount)}`
                : ""}
            </span>
          </div>
        )}

        <dl className="mt-3 space-y-1.5 border-t border-neutral-100 pt-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">Termin</dt>
            <dd className="text-right font-medium text-neutral-900">
              {formatStayRange(checkin, checkout)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">Długość</dt>
            <dd className="font-medium text-neutral-900">
              {nights} {nightNoun(nights)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-neutral-500">Goście</dt>
            <dd className="font-medium text-neutral-900">{adultsLabel(adults)}</dd>
          </div>
          {boardLabel && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-neutral-500">Wyżywienie</dt>
              <dd className="text-right font-medium text-neutral-900">{boardLabel}</dd>
            </div>
          )}
        </dl>

        {cancel === "free" && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
            <span aria-hidden>✓</span>
            Bezpłatne anulowanie{cancelUntil ? ` do ${formatPlDay(cancelUntil)}` : ""}
          </div>
        )}
        {cancel === "nrf" && (
          <div className="mt-3 inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
            Oferta bezzwrotna — najniższa cena za ten pokój
          </div>
        )}

        {hasPrice && perNight !== null && (
          <div className="mt-3 border-t border-neutral-100 pt-3">
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                {nights} {nightNoun(nights)} × {perNightExact ? "" : "ok. "}
                {formatPrice(perNight, currency)}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm font-semibold text-neutral-900">Razem</span>
              <span className="text-xl font-bold text-neutral-900">
                {formatPrice(price, currency)}
              </span>
            </div>
            <p className="mt-0.5 text-right text-[11px] text-neutral-400">
              wł. podatków i opłat · płatność w PLN
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
