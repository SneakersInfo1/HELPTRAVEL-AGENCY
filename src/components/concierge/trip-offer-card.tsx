"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Clock3,
  Luggage,
  MapPin,
  Plane,
  Star,
  Users,
  Utensils,
} from "lucide-react";

import { track } from "@/lib/analytics/track";
import type { TripOffer } from "@/lib/concierge/types";
import { fmtDuration, fmtTime } from "@/lib/flights/display";
import { formatPricePln, nightsLabel } from "@/lib/home/deal-card";
import { ratingLabel } from "@/lib/hotels/rating";
import { localizeBoard, localizeRoomName } from "@/lib/liteapi/translations";
import { localizeCountry } from "@/lib/mvp/i18n-geo";

type HotelOffer = NonNullable<TripOffer["hotel"]>;

function formatDateRangePl(checkin: string, checkout: string): string {
  const inDate = new Date(`${checkin}T00:00:00Z`);
  const outDate = new Date(`${checkout}T00:00:00Z`);
  if (Number.isNaN(inDate.getTime()) || Number.isNaN(outDate.getTime())) {
    return `${checkin} – ${checkout}`;
  }
  const options = { timeZone: "UTC" } as const;
  const sameMonth =
    inDate.getUTCMonth() === outDate.getUTCMonth() &&
    inDate.getUTCFullYear() === outDate.getUTCFullYear();
  const day = new Intl.DateTimeFormat("pl-PL", { day: "numeric", ...options });
  const dayMonth = new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    ...options,
  });
  return sameMonth
    ? `${day.format(inDate)}–${dayMonth.format(outDate)}`
    : `${dayMonth.format(inDate)} – ${dayMonth.format(outDate)}`;
}

function pluralLabel(value: number, one: string, few: string, many: string): string {
  const last = value % 10;
  const lastTwo = value % 100;
  const word = value === 1 ? one : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many;
  return `${value} ${word}`;
}

function occupancyLabel(adults: number, children: number): string {
  const adultPart = pluralLabel(adults, "dorosły", "dorosłych", "dorosłych");
  if (children <= 0) return adultPart;
  return `${adultPart}, ${pluralLabel(children, "dziecko", "dzieci", "dzieci")}`;
}

function reviewsLabel(count: number): string {
  const last = count % 10;
  const lastTwo = count % 100;
  const word = count === 1
    ? "opinia"
    : last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)
      ? "opinie"
      : "opinii";
  const formatted = new Intl.NumberFormat("pl-PL", { useGrouping: "always" }).format(count);
  return `${formatted} ${word}`;
}

function formatStars(stars: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(stars);
}

function formatCancellation(hotel: HotelOffer): string | null {
  if (hotel.refundableTag === "NRFN") return "Taryfa bezzwrotna";
  if (hotel.refundableTag !== "RFN") return null;
  if (!hotel.freeCancellationDeadline) return "Taryfa zwrotna";
  const deadline = new Date(hotel.freeCancellationDeadline);
  if (Number.isNaN(deadline.getTime())) return "Taryfa zwrotna";
  const formatted = new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(deadline);
  return `Bezpłatne anulowanie do ${formatted}`;
}

function stopsDescription(stops: number): string {
  if (stops === 0) return "Lot bezpośredni";
  return `Maks. ${pluralLabel(stops, "przesiadka", "przesiadki", "przesiadek")} na odcinku`;
}

function HotelGallery({ hotel }: { hotel: HotelOffer }) {
  const photos = hotel.photoUrls?.length
    ? hotel.photoUrls
    : hotel.mainPhotoUrl
      ? [hotel.mainPhotoUrl]
      : [];
  const [activeImage, setActiveImage] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollToImage = (index: number) => {
    const target = Math.max(0, Math.min(index, photos.length - 1));
    const scroller = scrollerRef.current;
    const frame = scroller?.children.item(target) as HTMLElement | null;
    if (!scroller || !frame) return;
    scroller.scrollTo({ left: frame.offsetLeft, behavior: "auto" });
    setActiveImage(target);
  };

  const updateActiveImage = () => {
    const scroller = scrollerRef.current;
    if (!scroller || scroller.clientWidth <= 0) return;
    const next = Math.max(
      0,
      Math.min(photos.length - 1, Math.round(scroller.scrollLeft / scroller.clientWidth)),
    );
    setActiveImage((current) => (current === next ? current : next));
  };

  if (photos.length === 0) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-brand-strong text-white/60">
        <Building2 aria-hidden className="h-10 w-10" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="relative bg-surface-sunken">
      <div
        ref={scrollerRef}
        role="region"
        aria-label={`Galeria zdjęć hotelu ${hotel.name}`}
        tabIndex={photos.length > 1 ? 0 : -1}
        onScroll={updateActiveImage}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            scrollToImage(activeImage - 1);
          } else if (event.key === "ArrowRight") {
            event.preventDefault();
            scrollToImage(activeImage + 1);
          }
        }}
        className="flex snap-x snap-mandatory overflow-x-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, index) => (
          <div
            key={photo}
            role="group"
            aria-label={`Zdjęcie ${index + 1} z ${photos.length}: ${hotel.name}`}
            className="relative aspect-[4/3] min-w-full snap-start overflow-hidden bg-brand-strong"
          >
            <div className="absolute inset-0 flex items-center justify-center text-white/60">
              <Building2 aria-hidden className="h-10 w-10" strokeWidth={1.5} />
            </div>
            <Image
              src={photo}
              alt=""
              fill
              sizes="(max-width: 639px) calc(100vw - 2rem), 368px"
              loading={index === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
              className="object-cover"
            />
          </div>
        ))}
      </div>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            onClick={() => scrollToImage(activeImage - 1)}
            disabled={activeImage === 0}
            aria-label="Poprzednie zdjęcie hotelu"
            className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised/90 text-ink shadow-[var(--shadow-sm)] transition-colors duration-200 ease-out hover:bg-surface-raised active:bg-surface-sunken disabled:invisible sm:flex motion-reduce:transition-none"
          >
            <ArrowLeft aria-hidden className="h-5 w-5" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={() => scrollToImage(activeImage + 1)}
            disabled={activeImage === photos.length - 1}
            aria-label="Następne zdjęcie hotelu"
            className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised/90 text-ink shadow-[var(--shadow-sm)] transition-colors duration-200 ease-out hover:bg-surface-raised active:bg-surface-sunken disabled:invisible sm:flex motion-reduce:transition-none"
          >
            <ArrowRight aria-hidden className="h-5 w-5" strokeWidth={2} />
          </button>
          <span
            aria-hidden
            className="absolute bottom-2 right-2 rounded-full bg-ink/85 px-2.5 py-1 text-xs font-semibold text-surface-raised"
          >
            {activeImage + 1}/{photos.length}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function TripOfferCard({
  offer,
  onNavigate,
}: {
  offer: TripOffer;
  /** Zwrócenie `true` oznacza, że launcher przejął nawigację po zamknięciu dialogu. */
  onNavigate?: (href: string) => boolean | void;
}) {
  const { hotel, flight } = offer;
  const dateRange = formatDateRangePl(offer.checkin, offer.checkout);
  const occupancy = occupancyLabel(offer.adults, offer.children);
  const countryPl = localizeCountry(offer.countryEn);
  const cancellation = hotel ? formatCancellation(hotel) : null;
  const outboundTime = flight ? fmtTime(flight.outboundDepartureTime) : "";
  const inboundTime = flight?.inboundDepartureTime ? fmtTime(flight.inboundDepartureTime) : "";
  const included = hotel && flight
    ? flight.inboundDepartureTime
      ? "Hotel na cały pobyt i lot w obie strony"
      : "Hotel na cały pobyt i lot"
    : hotel
      ? "Hotel na cały pobyt"
      : flight?.inboundDepartureTime
        ? "Lot w obie strony"
        : flight
          ? "Lot"
          : null;

  return (
    <article
      data-trip-offer-card
      className="overflow-hidden rounded-lg border border-line bg-surface-raised text-left shadow-[var(--shadow-md)]"
    >
      <header className="border-b border-line bg-surface-sunken px-4 py-3">
        <h3 className="text-base font-bold text-ink">
          {offer.cityPl}
          {countryPl ? <span className="font-medium text-ink-muted">, {countryPl}</span> : null}
        </h3>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays aria-hidden className="h-3.5 w-3.5 text-brand" strokeWidth={2} />
            {dateRange}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users aria-hidden className="h-3.5 w-3.5 text-brand" strokeWidth={2} />
            {occupancy}
          </span>
          {offer.nights && offer.nights > 0 ? (
            <span>{nightsLabel(offer.nights)}</span>
          ) : null}
        </div>
      </header>

      {hotel ? (
        <section aria-label="Hotel">
          <HotelGallery hotel={hotel} />
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Hotel</p>
                <h4 className="text-base font-bold leading-snug text-ink">{hotel.name}</h4>
                {hotel.stars && hotel.stars > 0 ? (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <Star aria-hidden className="h-3.5 w-3.5 fill-brand text-brand" strokeWidth={1.5} />
                    {formatStars(hotel.stars)} gw.
                  </p>
                ) : null}
              </div>
              {hotel.rating !== null && hotel.rating > 0 ? (
                <div className="shrink-0 text-right">
                  <div className="inline-flex items-center gap-1.5 rounded-sm bg-brand-soft px-2 py-1 text-brand-strong">
                    <span className="rounded-sm bg-brand px-1.5 py-0.5 text-xs font-bold text-white">
                      {hotel.rating.toFixed(1)}
                    </span>
                    <span className="text-xs font-semibold">{ratingLabel(hotel.rating)}</span>
                  </div>
                  {hotel.reviewCount && hotel.reviewCount > 0 ? (
                    <p className="mt-1 text-[11px] text-ink-muted">
                      {reviewsLabel(hotel.reviewCount)}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            {hotel.address ? (
              <p className="flex items-start gap-2 text-xs leading-5 text-ink-muted">
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                <span>{hotel.address}</span>
              </p>
            ) : null}

            {hotel.roomName || hotel.boardName || cancellation ? (
              <ul className="space-y-2 border-y border-line py-3 text-xs text-ink">
                {hotel.roomName ? (
                  <li className="flex items-start gap-2">
                    <BedDouble aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                    <span>{localizeRoomName(hotel.roomName)}</span>
                  </li>
                ) : null}
                {hotel.boardName ? (
                  <li className="flex items-start gap-2">
                    <Utensils aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                    <span>{localizeBoard(hotel.boardName)}</span>
                  </li>
                ) : null}
                {cancellation ? (
                  <li className="flex items-start gap-2">
                    <CalendarDays aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                    <span>{cancellation}</span>
                  </li>
                ) : null}
              </ul>
            ) : null}

            <div>
              <p className="text-xs text-ink-muted">
                {offer.nights && offer.nights > 0 ? nightsLabel(offer.nights) : "Cena za pobyt"}
              </p>
              <p className="text-xl font-bold text-accent">{formatPricePln(hotel.totalPln)}</p>
              {hotel.perNightPln !== null && hotel.perNightPln !== undefined && hotel.perNightPln > 0 ? (
                <p className="text-xs text-ink-muted">
                  Średnio {formatPricePln(hotel.perNightPln)} za noc
                </p>
              ) : null}
            </div>

            <Link
              href={hotel.url}
              aria-label={`Zobacz hotel ${hotel.name}`}
              data-concierge-hotel-cta
              onClick={() => {
                track("concierge_offer_click", { target: "hotel", city: offer.cityPl });
              }}
              onNavigate={(event) => {
                if (onNavigate?.(hotel.url)) event.preventDefault();
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 [--focus-ring:#fff] transition-[filter,transform] duration-200 ease-out hover:brightness-95 active:scale-[0.99] active:brightness-90 motion-reduce:transform-none motion-reduce:transition-none"
            >
              <span className="text-sm font-semibold text-white">Zobacz hotel</span>
              <ArrowRight aria-hidden className="h-4 w-4 text-white" strokeWidth={2} />
            </Link>
          </div>
        </section>
      ) : offer.wantsHotel === false ? null : (
        <p className="border-b border-line bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-muted">
          Hotelu nie udało się teraz potwierdzić. Zmień termin lub spróbuj ponownie później.
        </p>
      )}

      {flight ? (
        <section aria-label="Lot" className="border-t border-line px-4 py-4">
          <div className="flex items-start gap-2">
            <Plane aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">Lot</p>
              {flight.carrierName ? (
                <h4 className="text-sm font-bold text-ink">{flight.carrierName}</h4>
              ) : null}
            </div>
          </div>

          {outboundTime || inboundTime || Number.isFinite(flight.stops) ||
          (flight.outboundDurationMinutes && flight.outboundDurationMinutes > 0) ||
          (flight.inboundDurationMinutes && flight.inboundDurationMinutes > 0) ||
          flight.hasCarryOnBag === true || flight.hasCheckedBag === true ? (
            <ul className="mt-3 grid gap-2 text-xs text-ink sm:grid-cols-2">
              {outboundTime ? (
                <li className="flex items-center gap-2">
                  <Clock3 aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  Wylot {outboundTime}
                </li>
              ) : null}
              {inboundTime ? (
                <li className="flex items-center gap-2">
                  <Clock3 aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  Powrót {inboundTime}
                </li>
              ) : null}
              {Number.isFinite(flight.stops) && flight.stops >= 0 ? (
                <li className="flex items-center gap-2">
                  <Plane aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  {stopsDescription(flight.stops)}
                </li>
              ) : null}
              {flight.outboundDurationMinutes && flight.outboundDurationMinutes > 0 ? (
                <li className="flex items-center gap-2">
                  <Clock3 aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  Tam {fmtDuration(flight.outboundDurationMinutes)}
                </li>
              ) : null}
              {flight.inboundDurationMinutes && flight.inboundDurationMinutes > 0 ? (
                <li className="flex items-center gap-2">
                  <Clock3 aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  Z powrotem {fmtDuration(flight.inboundDurationMinutes)}
                </li>
              ) : null}
              {flight.hasCarryOnBag === true ? (
                <li className="flex items-center gap-2">
                  <Luggage aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  Bagaż podręczny
                </li>
              ) : null}
              {flight.hasCheckedBag === true ? (
                <li className="flex items-center gap-2">
                  <Luggage aria-hidden className="h-4 w-4 shrink-0 text-brand" strokeWidth={2} />
                  Bagaż rejestrowany
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="mt-4">
            <p className="text-xs text-ink-muted">Łącznie za podróżnych</p>
            <p className="text-lg font-bold text-accent">{formatPricePln(flight.totalPln)}</p>
          </div>

          <Link
            href={flight.url}
            aria-label="Zobacz lot"
            onClick={() => {
              track("concierge_offer_click", { target: "flight", city: offer.cityPl });
            }}
            onNavigate={(event) => {
              if (onNavigate?.(flight.url)) event.preventDefault();
            }}
            className={
              hotel
                ? "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border border-brand/30 bg-surface-raised px-4 transition-colors duration-200 ease-out hover:bg-brand-soft active:bg-brand-soft motion-reduce:transition-none"
                : "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 [--focus-ring:#fff] transition-[filter,transform] duration-200 ease-out hover:brightness-95 active:scale-[0.99] active:brightness-90 motion-reduce:transform-none motion-reduce:transition-none"
            }
          >
            <span className={`text-sm font-semibold ${hotel ? "text-brand-strong" : "text-white"}`}>
              Zobacz lot
            </span>
            <ArrowRight
              aria-hidden
              className={`h-4 w-4 ${hotel ? "text-brand-strong" : "text-white"}`}
              strokeWidth={2}
            />
          </Link>
        </section>
      ) : offer.wantsFlight === false ? null : (
        <p className="border-t border-line bg-surface-sunken px-4 py-3 text-xs leading-5 text-ink-muted">
          Lotu nie udało się teraz potwierdzić. Zmień termin lub spróbuj ponownie później.
        </p>
      )}

      {offer.totalPln !== null && offer.totalPln !== undefined &&
      offer.totalPerPersonPln !== null ? (
        <footer className="border-t border-line bg-surface-sunken px-4 py-4">
          {included ? <p className="text-xs font-medium text-ink-muted">Obejmuje: {included}</p> : null}
          <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div>
              <p className="text-xs text-ink-muted">Cena łączna</p>
              <p className="text-xl font-bold text-accent">{formatPricePln(offer.totalPln)}</p>
            </div>
            <p className="text-sm font-semibold text-ink">
              {formatPricePln(offer.totalPerPersonPln)} za osobę
            </p>
          </div>
        </footer>
      ) : null}
    </article>
  );
}
