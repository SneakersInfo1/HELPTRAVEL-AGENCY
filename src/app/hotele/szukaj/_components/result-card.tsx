// Hotel result card. Reused brand DNA from /components/mvp/stay-offers-panel
// (white card, green CTA, badges). Server-rendered per result.

import Image from "next/image";
import Link from "next/link";

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
  cheapestRate: {
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

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n < 5) return `${n} noce`;
  return `${n} nocy`;
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
}: {
  offer: OfferCard;
  searchQuery: string;
  nights: number;
  badges?: BadgeKind;
}) {
  const total = formatPLN(offer.cheapestRate.totalAmount, offer.cheapestRate.currency);
  const perNight = formatPLN(
    Math.round(offer.cheapestRate.totalAmount / Math.max(1, nights)),
    offer.cheapestRate.currency,
  );
  const freeCancelDate = formatDate(offer.cheapestRate.cancellationDeadline);
  const isFreeCancel = offer.cheapestRate.refundableTag === "RFN" || badges?.freeCancel;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md sm:flex-row">
      {/* Image */}
      <div className="relative aspect-[4/3] w-full shrink-0 bg-neutral-100 sm:aspect-[1/1] sm:w-64">
        {offer.thumbnailUrl ? (
          <Image
            src={offer.thumbnailUrl}
            alt={offer.name}
            fill
            sizes="(max-width: 640px) 100vw, 256px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            <span className="text-sm">Brak zdjęcia</span>
          </div>
        )}
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
                {offer.country ? `, ${offer.country}` : ""}
              </span>
            </div>
          </div>
          {offer.rating !== undefined && offer.rating > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
              <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white">
                {offer.rating.toFixed(1)}
              </span>
              <span className="text-xs font-medium">{ratingLabel(offer.rating)}</span>
            </div>
          )}
        </div>

        {offer.cheapestRate.boardName && (
          <div className="text-xs text-neutral-600">{offer.cheapestRate.boardName}</div>
        )}

        {isFreeCancel && freeCancelDate && (
          <div className="text-xs font-medium text-emerald-700">
            Bezpłatna anulacja do {freeCancelDate}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2">
          <div>
            <div className="text-xs text-neutral-500">
              {nightsLabel(nights)} · od {perNight}/noc
            </div>
            <div className="text-xl font-bold text-neutral-900">{total}</div>
            <div className="text-[11px] text-neutral-500">wł. podatków i opłat</div>
          </div>
          <Link
            href={`/hotele/${encodeURIComponent(offer.hotelId)}?${searchQuery}`}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Zobacz pokoje
          </Link>
        </div>
      </div>
    </article>
  );
}
