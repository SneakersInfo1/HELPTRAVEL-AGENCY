// Hotel result card. Reused brand DNA from /components/mvp/stay-offers-panel
// (white card, green CTA, badges). Server-rendered per result.
//
// UX: the ENTIRE card is one big Next.js Link — clicking the photo, the
// hotel name, the rating chip, the price, the CTA, ANYTHING navigates to
// /hotele/[hotelId]. Previously only the small "Zobacz pokoje" button was
// a Link, so users who clicked the photo or hotel name (the natural target)
// got no feedback and had to aim at the button — a "two clicks to open
// the offer" complaint we hit 2026-05-28.
//
// `hover:-translate-y-0.5` was also removed because a transform on the
// click target during hover can race with the click event (mousedown vs.
// mouseup hitting subtly different positions on some browsers). The hover
// border + shadow change is enough to signal interactivity without any
// layout motion.

import type { ReactNode } from "react";
import Link from "next/link";

import { localizeCountry } from "@/lib/mvp/i18n-geo";
import { HotelCardImage } from "./hotel-card-image";

interface OfferCard {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
  // Optional: when omitted, the card renders `priceSlot` (progressive
  // client-side pricing) instead of a server-rendered price.
  cheapestRate?: {
    rateId: string;
    offerId: string;
    boardName?: string;
    refundableTag?: string;
    totalAmount: number;
    currency: string;
    cancellationDeadline?: string;
  };
}

const formatPLN = (amount: number, currency: string) =>
  new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);

const formatDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};

const ratingLabel = (r: number): string => {
  if (r >= 9) return "Wspaniały";
  if (r >= 8) return "Bardzo dobry";
  if (r >= 7) return "Dobry";
  return "Akceptowalny";
};

// Sesja C pkt 5 — polish board names that come from LiteAPI in English.
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

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n < 5) return `${n} noce`;
  return `${n} nocy`;
}

function nightsForTotal(n: number): string {
  if (n === 1) return "noc";
  if (n < 5) return "noce";
  return "nocy";
}

interface BadgeKind {
  cheapest?: boolean;
  topRated?: boolean;
  freeCancel?: boolean;
}

export function ResultCard({
  offer,
  searchQuery,
  nights,
  badges,
  imagePriority = false,
  priceSlot,
}: {
  offer: OfferCard;
  searchQuery: string;
  nights: number;
  badges?: BadgeKind;
  imagePriority?: boolean;
  priceSlot?: ReactNode;
}) {
  const rate = offer.cheapestRate;
  const total = rate ? formatPLN(rate.totalAmount, rate.currency) : null;
  const perNight = rate
    ? formatPLN(Math.round(rate.totalAmount / Math.max(1, nights)), rate.currency)
    : null;
  const freeCancelDate = rate ? formatDate(rate.cancellationDeadline) : null;
  const isFreeCancel = (rate?.refundableTag === "RFN" || badges?.freeCancel) ?? false;

  return (
    <Link
      href={`/hotele/${encodeURIComponent(offer.hotelId)}?${searchQuery}`}
      aria-label={`Zobacz ofertę: ${offer.name}, ${offer.city}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] transition-colors transition-shadow duration-200 hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(16,84,48,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:flex-row"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 sm:aspect-[1/1] sm:w-64">
        <HotelCardImage
          thumbnailUrl={offer.thumbnailUrl}
          name={offer.name}
          city={offer.city}
          country={offer.country}
          priority={imagePriority}
        />
        {/* Subtle gradient at top for badge readability */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/30 to-transparent" />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {badges?.cheapest && (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
              Najtańsze
            </span>
          )}
          {badges?.topRated && (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
              Najlepsza ocena
            </span>
          )}
          {isFreeCancel && (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
              Bezpłatna anulacja
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-neutral-900 sm:text-lg">
              {offer.name}
            </h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
              {offer.stars !== undefined && offer.stars > 0 && (
                <span className="text-amber-500" aria-label={`${offer.stars} gwiazdek`}>
                  {"★".repeat(Math.round(offer.stars))}
                </span>
              )}
              <span>
                {offer.city}
                {offer.country ? `, ${localizeCountry(offer.country)}` : ""}
              </span>
            </div>
          </div>
          {offer.rating !== undefined && offer.rating > 0 && (
            <div className="flex shrink-0 flex-col items-end">
              <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white">
                  {offer.rating.toFixed(1)}
                </span>
                <span className="text-xs font-semibold">{ratingLabel(offer.rating)}</span>
              </div>
              {offer.reviewCount !== undefined && offer.reviewCount > 0 && (
                <span className="mt-0.5 text-[10px] text-neutral-500">
                  {offer.reviewCount.toLocaleString("pl-PL")} {offer.reviewCount === 1 ? "opinia" : offer.reviewCount < 5 ? "opinie" : "opinii"}
                </span>
              )}
            </div>
          )}
        </div>

        {rate && polishBoard(rate.boardName) && (
          <div className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
            <span aria-hidden>🍽</span>
            {polishBoard(rate.boardName)}
          </div>
        )}

        {rate && isFreeCancel && freeCancelDate && (
          <div className="text-xs font-medium text-emerald-700">
            Bezpłatna anulacja do {freeCancelDate}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          {rate ? (
            <div>
              <div className="text-xs text-neutral-500">{nightsLabel(nights)}</div>
              <div className="text-xl font-bold text-emerald-700">
                {perNight}
                <span className="ml-0.5 text-xs font-semibold text-emerald-700/80">/ noc</span>
              </div>
              <div className="text-[11px] text-neutral-500">
                {total} za {nights} {nightsForTotal(nights)} · wł. podatków i opłat
              </div>
            </div>
          ) : (
            <div className="min-w-[10rem]">{priceSlot}</div>
          )}
          {/* CTA is now a styled span (NOT a nested Link) — the parent
              Link already handles navigation. The visual button stays so
              the user has an obvious call-to-action target; the whole
              card is clickable but the green button anchors the eye. */}
          <span
            aria-hidden
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors group-hover:bg-emerald-700"
          >
            Zobacz pokoje
          </span>
        </div>
      </div>
    </Link>
  );
}
