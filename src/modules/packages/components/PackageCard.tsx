// Karta pakietu Lot + Hotel (krok 1 „Wybierz pobyt"). Server component.
// Świadomie dziedziczy DNA karty hotelowej (`hotele/szukaj/result-card`): biała
// karta rounded-2xl, border-emerald-900/10, hover border+shadow, badge'e,
// cena emerald-700, CTA-span emerald-600. RÓŻNICA pakietu: cena „za osobę"
// (psychologicznie tańsza, §2) + pasmo „✈ przelot w cenie" (to ono robi z karty
// hotelowej — pakiet). Zero side-stripe/gradient-text (bany impeccable).
//
// Cały kafelek jest jednym <Link> (jak w hotelach — klikalna całość). Kolory
// tekstu na wewnętrznych elementach, nie na <a> (globalne a{color:inherit}).

import Link from "next/link";

import { formatPLN } from "@/lib/money";

import { HotelCardImage } from "@/app/hotele/szukaj/_components/hotel-card-image";
import type { PackageOffer } from "../types";

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n < 5) return `${n} noce`;
  return `${n} nocy`;
}

/** Ikona samolotu — spójna z resztą (currentColor, cienka). */
function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M10.8 2.2c.5-.5 1.4-.5 1.8 0 .5.5.5 1.3 0 1.8L10.4 6.2l1 5.2 1.7-1.7c.2-.2.4-.3.7-.3l.9.1c.5 0 .8.6.5 1L14 13.9l.3 2.2c0 .3-.1.6-.4.7l-.5.2c-.3.1-.6 0-.8-.3l-1.5-2.4-2.4-1.5c-.3-.2-.4-.5-.3-.8l.2-.5c.1-.3.4-.4.7-.4l2.2.3 1.4-1.2c.4-.3 1-.1 1 .5l.1.9c0 .3-.1.5-.3.7l-1.7 1.7 5.2 1 2.2-2.2c.5-.5 1.3-.5 1.8 0" />
    </svg>
  );
}

export function PackageCard({
  offer,
  originLabel,
  destinationCity,
  destinationCountry,
  href,
  imagePriority = false,
  badges,
}: {
  offer: PackageOffer;
  /** Dopełniacz miasta wylotu, np. „Warszawy" → „loty z Warszawy". */
  originLabel: string;
  destinationCity: string;
  destinationCountry?: string;
  href: string;
  imagePriority?: boolean;
  badges?: { cheapest?: boolean };
}) {
  const { hotel, flight, pricing } = offer;
  const perPerson = formatPLN(pricing.pricePerPerson.amount, "PLN");
  const total = formatPLN(pricing.total.amount, "PLN");
  const taxes = pricing.taxesAtHotel ? formatPLN(pricing.taxesAtHotel.amount, "PLN") : null;
  const freeCancel = hotel.freeCancellationUntil
    ? new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "long" }).format(new Date(hotel.freeCancellationUntil))
    : null;

  return (
    <Link
      href={href}
      aria-label={`Wybierz pakiet: ${hotel.name} w ${destinationCity} z lotem z ${originLabel}, od ${perPerson} od osoby`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(16,84,48,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:flex-row"
    >
      {/* Zdjęcie */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 sm:aspect-auto sm:w-64">
        <HotelCardImage
          thumbnailUrl={hotel.thumbnailUrl}
          name={hotel.name}
          city={destinationCity}
          country={destinationCountry}
          priority={imagePriority}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/35 to-transparent" />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {badges?.cheapest && (
            <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
              Najtańszy pakiet
            </span>
          )}
          {freeCancel && (
            <span className="rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow">
              Bezpłatna anulacja
            </span>
          )}
        </div>
      </div>

      {/* Treść */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-neutral-900 sm:text-lg">{hotel.name}</h3>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
              {hotel.stars !== undefined && hotel.stars > 0 && (
                <span className="text-amber-500" aria-label={`${hotel.stars} gwiazdek`}>
                  {"★".repeat(Math.round(hotel.stars))}
                </span>
              )}
              <span className="truncate">{destinationCity}</span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">{nightsLabel(hotel.nights)}</span>
            </div>
          </div>
          {hotel.rating !== undefined && hotel.rating > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
              <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white">
                {hotel.rating.toFixed(1)}
              </span>
            </div>
          )}
        </div>

        {/* Pasmo pakietowe — to ono odróżnia kartę od hotelowej */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-emerald-50/70 px-3 py-2 text-[13px] text-emerald-900">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <PlaneIcon className="h-4 w-4 text-emerald-600" />
            Przelot w cenie
          </span>
          <span className="text-emerald-600" aria-hidden>·</span>
          <span className="text-emerald-800">w obie strony z {originLabel}</span>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
              flight.direct ? "bg-emerald-600/10 text-emerald-800" : "bg-neutral-100 text-neutral-700"
            }`}
          >
            {flight.direct ? "Lot bezpośredni" : "Z przesiadką"}
          </span>
        </div>

        {freeCancel && (
          <div className="text-xs font-medium text-emerald-700">Bezpłatna anulacja do {freeCancel}</div>
        )}

        {/* Cena — za osobę (hook), obok łącznie */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-1">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
              Pakiet od osoby
            </div>
            <div className="text-2xl font-bold leading-tight text-emerald-700">
              {perPerson}
              <span className="ml-1 text-xs font-semibold text-emerald-700/80">/ os.</span>
            </div>
            <div className="text-[11px] text-neutral-500">
              {total} łącznie · {nightsLabel(hotel.nights)} z lotem
              {taxes ? ` · + ${taxes} opłat w hotelu` : ""}
            </div>
          </div>
          <span
            aria-hidden
            className="inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors group-hover:bg-emerald-700"
          >
            Wybierz pakiet
          </span>
        </div>
      </div>
    </Link>
  );
}
