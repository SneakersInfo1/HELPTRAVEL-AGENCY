// Karta pakietu Lot + Hotel (krok 1 „Wybierz pobyt"). Server component.
// Bogata informacyjnie — użytkownik ma zobaczyć MAKSIMUM przed kliknięciem:
// hotel (ocena+opinie+wyżywienie), PEŁNY rozkład lotu tam/powrót (godziny, kody
// lotnisk, czas, przesiadki, przewoźnik), bagaż, anulacja, rozbicie ceny.
// Dziedziczy DNA karty hotelowej (biała rounded-2xl, emerald, CTA-span). Cały
// kafelek to jeden <Link>; kolory na wewnętrznych elementach (a{color:inherit}).
// Wszystkie dane REALNE (z API) — zero wypełniaczy (PRODUCT.md: uczciwość).

import Link from "next/link";

import { fmtDuration, fmtTime, stopsLabel } from "@/lib/flights/display";
import { ratingLabel } from "@/lib/hotels/rating";
import { formatPLN } from "@/lib/money";

import { HotelCardImage } from "@/app/hotele/szukaj/_components/hotel-card-image";
import type { PackageFlightLeg, PackageOffer } from "../types";

function nightsLabel(n: number): string {
  if (n === 1) return "1 noc";
  if (n < 5) return `${n} noce`;
  return `${n} nocy`;
}

function reviewsLabel(n: number): string {
  const w = n === 1 ? "opinia" : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? "opinie" : "opinii";
  return `${n.toLocaleString("pl-PL")} ${w}`;
}

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" }).format(new Date(iso));

const fmtLongDay = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", { day: "2-digit", month: "long" }).format(new Date(iso));

function PlaneIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3.5S18 3 16.5 4.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .4 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.5.8.6 1.3.4l.5-.2c.4-.2.6-.6.5-1.1Z" />
    </svg>
  );
}

/** Jeden odcinek lotu — data/kierunek | godzina+kod ── czas·przesiadki ── godzina+kod. */
function LegRow({ leg, label }: { leg: PackageFlightLeg; label: string }) {
  return (
    <div className="flex items-center gap-2.5 sm:gap-3">
      <div className="w-16 shrink-0">
        <div className="text-[11px] font-semibold text-emerald-800">{label}</div>
        <div className="text-[10px] text-neutral-500">{fmtDay(leg.departISO)}</div>
      </div>
      <div className="text-right">
        <div className="text-sm font-bold tabular-nums text-neutral-900">{fmtTime(leg.departISO)}</div>
        <div className="text-[10px] font-medium text-neutral-500">{leg.fromCode}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-center px-1">
        <span className="text-[10px] leading-none text-neutral-500">{fmtDuration(leg.durationMinutes)}</span>
        <span className="relative my-1 h-px w-full bg-neutral-200">
          <span className="absolute -left-0.5 -top-[3px] h-[7px] w-[7px] rounded-full border border-neutral-300 bg-white" />
          <span className="absolute -right-0.5 -top-[3px] h-[7px] w-[7px] rounded-full bg-emerald-500" />
        </span>
        <span className={`text-[10px] leading-none ${leg.stops === 0 ? "text-emerald-700" : "text-neutral-500"}`}>
          {leg.stops === 0 ? "bezpośredni" : stopsLabel(leg.stops)}
        </span>
      </div>
      <div>
        <div className="text-sm font-bold tabular-nums text-neutral-900">{fmtTime(leg.arriveISO)}</div>
        <div className="text-[10px] font-medium text-neutral-500">{leg.toCode}</div>
      </div>
    </div>
  );
}

function BaggageChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${ok ? "text-emerald-800" : "text-neutral-400"}`}>
      <span aria-hidden className={`text-[13px] ${ok ? "text-emerald-600" : "text-neutral-400"}`}>{ok ? "✓" : "✕"}</span>
      {label}
    </span>
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
  /** Dopełniacz miasta wylotu, np. „Warszawy". */
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
  const hotelPart = formatPLN(pricing.breakdown.hotel.amount, "PLN");
  const flightPart = formatPLN(pricing.breakdown.flight.amount, "PLN");
  const taxes = pricing.taxesAtHotel ? formatPLN(pricing.taxesAtHotel.amount, "PLN") : null;
  const freeCancel = hotel.freeCancellationUntil ? fmtLongDay(hotel.freeCancellationUntil) : null;

  return (
    <Link
      href={href}
      aria-label={`Wybierz pakiet: ${hotel.name} w ${destinationCity} z lotem z ${originLabel}, od ${perPerson} od osoby`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)] transition-[border-color,box-shadow] duration-200 hover:border-emerald-300 hover:shadow-[0_12px_28px_rgba(16,84,48,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:flex-row"
    >
      {/* Zdjęcie */}
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 sm:aspect-auto sm:w-60 lg:w-72">
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
          {flight.direct && (
            <span className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 shadow">
              Lot bezpośredni
            </span>
          )}
        </div>
      </div>

      {/* Treść */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        {/* Hotel: nazwa, gwiazdki, ocena, opinie, wyżywienie */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-neutral-900 sm:text-lg">{hotel.name}</h3>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
              {hotel.stars !== undefined && hotel.stars > 0 && (
                <span className="text-amber-500" aria-label={`${hotel.stars} gwiazdek`}>{"★".repeat(Math.round(hotel.stars))}</span>
              )}
              <span className="truncate">{destinationCity}</span>
              <span aria-hidden>·</span>
              <span className="whitespace-nowrap">{nightsLabel(hotel.nights)}</span>
              {hotel.distanceLabel && (
                <>
                  <span aria-hidden>·</span>
                  <span className="whitespace-nowrap text-emerald-700">{hotel.distanceLabel}</span>
                </>
              )}
            </div>
            {hotel.boardName && (
              <div className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900">
                <span aria-hidden>🍽</span> {hotel.boardName}
              </div>
            )}
          </div>
          {hotel.rating !== undefined && hotel.rating > 0 && (
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-emerald-800">
                <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-xs font-bold text-white tabular-nums">
                  {hotel.rating.toFixed(1)}
                </span>
                <span className="text-xs font-semibold">{ratingLabel(hotel.rating)}</span>
              </div>
              {hotel.reviewCount !== undefined && hotel.reviewCount > 0 && (
                <span className="text-[10px] text-neutral-500">{reviewsLabel(hotel.reviewCount)}</span>
              )}
            </div>
          )}
        </div>

        {/* Lot — pełny rozkład tam/powrót */}
        <div className="rounded-xl border border-emerald-900/10 bg-emerald-50/50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-900">
              <PlaneIcon className="h-4 w-4 text-emerald-600" />
              Przelot w cenie
            </span>
            <span aria-hidden className="text-emerald-600">·</span>
            <span className="text-emerald-800">z {originLabel} w obie strony</span>
            {flight.carrierName && <span className="ml-auto text-[11px] font-medium text-neutral-500">{flight.carrierName}</span>}
          </div>
          <div className="flex flex-col gap-2">
            {flight.outbound && <LegRow leg={flight.outbound} label="Tam" />}
            {flight.inbound && <LegRow leg={flight.inbound} label="Powrót" />}
          </div>
          {flight.baggageIncluded && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-emerald-900/10 pt-2 text-[11px] font-medium">
              <BaggageChip ok={flight.baggageIncluded.cabin} label="Bagaż podręczny" />
              <BaggageChip ok={flight.baggageIncluded.checked} label="Bagaż rejestrowany" />
            </div>
          )}
        </div>

        {freeCancel && (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0l-3.5-3.5a1 1 0 1 1 1.4-1.4l2.8 2.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
            </svg>
            Bezpłatna anulacja hotelu do {freeCancel}
          </div>
        )}

        {/* Cena — za osobę + łącznie + rozbicie + CTA */}
        <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-neutral-100 pt-3">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">Pakiet od osoby</div>
            <div className="text-2xl font-bold leading-tight text-emerald-700">
              {perPerson}
              <span className="ml-1 text-xs font-semibold text-emerald-700/80">/ os.</span>
            </div>
            <div className="text-[11px] text-neutral-500">
              {total} za {nightsLabel(hotel.nights)} z lotem
              {taxes ? ` · + ${taxes} opłat w hotelu` : ""}
            </div>
            <div className="mt-0.5 text-[11px] text-neutral-400">
              hotel {hotelPart} + lot {flightPart}
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
