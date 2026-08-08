// Karta wyniku wyszukiwania hoteli.
//
// UX: CAŁA karta jest jednym `Link` — klik w zdjęcie, nazwę, ocenę, cenę,
// przycisk, cokolwiek, prowadzi do /hotele/[hotelId]. Wcześniej linkiem był
// tylko mały przycisk „Zobacz pokoje", więc klik w zdjęcie albo nazwę (czyli
// w naturalny cel) nic nie robił — zgłoszenie „dwa kliknięcia, żeby otworzyć
// ofertę" z 2026-05-28. Z tego samego powodu w środku NIE MA zagnieżdżonych
// linków ani przycisków: to nieprawidłowy HTML i pułapka dla czytników.
//
// `hover:-translate-y-0.5` zostało usunięte, bo transform na celu kliknięcia
// potrafi rozjechać mousedown z mouseup. Zmiana obramowania i cienia wystarczy.
//
// UKŁAD (przebudowa 2026-08-07, brief §17). Wcześniej treść była jedną kolumną
// z `mt-auto` przy cenie, więc na szerokim ekranie środek karty był pustym
// polem na ~200 px wysokości — „wygląda niedokończone". Teraz od `lg` treść
// dzieli się na kolumnę informacji i wydzieloną SZYNĘ CENOWĄ po prawej:
// wzrok ma jedno miejsce, w którym szuka kwoty i przycisku, a wolna przestrzeń
// idzie na chipy z realnych danych zamiast na pustkę.

import type { ReactNode } from "react";
import Link from "next/link";

import { UtensilsCrossed } from "lucide-react";

import { hotelDistanceLabels } from "@/lib/geo/distance-label";
import { nightsWord, reviewsLabel, taxNoticeFromSlim, taxNoticeText } from "@/lib/hotels/domain/format";
import { discountPercent } from "@/lib/hotels/domain/price";
import { offerHighlights } from "@/lib/hotels/facility-filters";
import { ratingLabel } from "@/lib/hotels/rating";
import { localizeBoard } from "@/lib/liteapi/translations";
import { localizeCountry } from "@/lib/mvp/i18n-geo";
import { formatPLN } from "@/lib/money";
import { HotelCardImage } from "./hotel-card-image";

interface OfferCard {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  address?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
  /** Udogodnienia z `/data/hotels` — źródło chipów. Brak = brak chipów. */
  facilityIds?: number[];
  // Opcjonalne: gdy pominięte, karta renderuje `priceSlot` (progresywne
  // ładowanie cen po stronie klienta) zamiast ceny z serwera.
  cheapestRate?: {
    rateId: string;
    offerId: string;
    boardName?: string;
    refundableTag?: string;
    totalAmount: number;
    currency: string;
    cancellationDeadline?: string;
    /** Patrz SlimRate w rate-cache.ts — `undefined` = brak danych, milczymy. */
    taxesIncluded?: boolean;
    taxExtraAmount?: number;
    /** Cena wyjściowa TEJ SAMEJ taryfy, gdy dostawca ją obniżył. */
    originalAmount?: number;
  };
}

const formatDate = (iso: string | undefined): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "2-digit" }).format(d);
};

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
  // `null` gdy dostawca nie podał rozbicia — wtedy o podatkach MILCZYMY.
  const taxText = rate
    ? taxNoticeText(taxNoticeFromSlim(rate.taxesIncluded, rate.taxExtraAmount, rate.currency))
    : null;
  const percent =
    rate?.originalAmount !== undefined
      ? discountPercent(rate.originalAmount, rate.totalAmount)
      : null;
  const distances = hotelDistanceLabels(
    { lat: offer.latitude, lng: offer.longitude },
    offer.city,
    offer.countryCode ?? offer.country,
  );
  const highlights = offerHighlights(offer.facilityIds);

  return (
    <Link
      href={`/hotele/${encodeURIComponent(offer.hotelId)}?${searchQuery}`}
      aria-label={`Zobacz ofertę: ${offer.name}, ${offer.city}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] transition-colors transition-shadow duration-200 hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(16,84,48,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:flex-row"
    >
      {/* Zdjęcie. Szersze od `lg`, bo karta ma teraz ~1300 px i kwadrat 256 px
          wyglądał jak znaczek doklejony do ściany tekstu. */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 sm:aspect-auto sm:w-56 lg:w-72 xl:w-80">
        <HotelCardImage
          thumbnailUrl={offer.thumbnailUrl}
          name={offer.name}
          city={offer.city}
          country={offer.country}
          priority={imagePriority}
        />
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
        </div>
      </div>

      {/* Treść: informacje | szyna cenowa (od lg) */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_248px] lg:items-stretch lg:gap-6">
        {/* ── Kolumna informacji ───────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col gap-2">
          {/* Ograniczenie szerokości TEGO wiersza jest celowe. Karta ma na
              1920 px około 1400 px, a `justify-between` bez limitu odpychało
              ocenę o ~600 px od nazwy hotelu — dwie informacje, które czyta
              się razem, przestawały tworzyć parę. Chipy poniżej korzystają
              z pełnej szerokości kolumny. */}
          <div className="flex flex-wrap items-start justify-between gap-2 xl:max-w-[46rem]">
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
              {(distances.center || distances.beach) && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-neutral-600">
                  <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-emerald-600">
                    <path
                      fillRule="evenodd"
                      d="M10 2a5 5 0 0 0-5 5c0 3.36 3.69 7.39 4.65 8.39a.48.48 0 0 0 .7 0C11.31 14.39 15 10.36 15 7a5 5 0 0 0-5-5zm0 6.8A1.8 1.8 0 1 1 10 5.2a1.8 1.8 0 0 1 0 3.6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {[distances.center, distances.beach].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            {/* Ocena zostaje przy nazwie — to para, którą wzrok czyta razem.
                Na lg szyna cenowa jest osobno po prawej, więc nie kolidują. */}
            {offer.rating !== undefined && offer.rating > 0 && (
              <div className="flex shrink-0 flex-col items-end">
                <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                  <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white">
                    {offer.rating.toFixed(1)}
                  </span>
                  <span className="text-xs font-semibold">{ratingLabel(offer.rating)}</span>
                </div>
                {offer.reviewCount !== undefined && offer.reviewCount > 0 && (
                  <span className="mt-0.5 text-[10px] text-neutral-500">{reviewsLabel(offer.reviewCount)}</span>
                )}
              </div>
            )}
          </div>

          {/* Chipy: wyżywienie i anulacja z taryfy, udogodnienia z facilityIds.
              Wszystko z danych dostawcy — nic nie jest dopisane „dla wyglądu". */}
          <div className="flex flex-wrap items-center gap-1.5">
            {rate?.boardName && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-900">
                <UtensilsCrossed aria-hidden className="h-3 w-3" />
                {localizeBoard(rate.boardName)}
              </span>
            )}
            {isFreeCancel && (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-800">
                {freeCancelDate ? `Bezpłatna anulacja do ${freeCancelDate}` : "Bezpłatna anulacja"}
              </span>
            )}
            {highlights.map((h) => (
              <span
                key={h}
                className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-medium text-neutral-700"
              >
                {h}
              </span>
            ))}
          </div>
        </div>

        {/* ── Szyna cenowa ─────────────────────────────────────────────────
            Od lg wydzielona pionową linią i wyrównana do dołu: cena i CTA
            zawsze w tym samym miejscu, niezależnie od długości nazwy hotelu. */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-2 lg:mt-0 lg:flex-col lg:items-end lg:justify-end lg:gap-2 lg:border-l lg:border-neutral-100 lg:pl-6 lg:pt-0">
          {rate ? (
            <div className="lg:text-right">
              {/* Przecena — tylko przy REALNEJ obniżce tej samej taryfy.
                  Źródłem jest `initialPrice`, nigdy cena konkurenta. */}
              {percent !== null && rate.originalAmount !== undefined && (
                <div className="mb-1 flex items-center gap-2 lg:justify-end">
                  <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    −{percent}%
                  </span>
                  <span className="text-xs text-neutral-500 line-through">
                    {formatPLN(rate.originalAmount, rate.currency)}
                  </span>
                </div>
              )}
              {/* Hierarchia §8.5: cena CAŁEGO pobytu dominuje, „za noc" pomocnicza. */}
              <div className="text-xl font-bold text-emerald-700 xl:text-2xl">{total}</div>
              <div className="text-xs text-neutral-600">
                za {nights} {nightsWord(nights)} · {perNight} / noc
              </div>
              {taxText && <div className="text-[11px] text-neutral-500">{taxText}</div>}
            </div>
          ) : (
            <div className="min-w-[10rem] lg:w-full">{priceSlot}</div>
          )}
          {/* CTA jest `span`, NIE zagnieżdżonym linkiem — nawigację obsługuje
              cała karta. Przycisk zostaje, bo kotwiczy wzrok. */}
          <span
            aria-hidden
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors group-hover:bg-emerald-700 lg:w-full"
          >
            Zobacz pokoje
          </span>
        </div>
      </div>
    </Link>
  );
}
