// Karta oferty pakietu lot+hotel renderowana w czacie AI Concierge (Task 4.1).
// To jest moment konwersji całego czatu — musi wyglądać jak dopracowany kawałek
// PRODUKTU (ta sama DNA co karta wyników hoteli i wiersz oferty lotu), NIE jak
// generyczny „AI slop" dymek. Zero pastelowych gradientów, zero fałszywej presji.
//
// Komponent prezentacyjny bez hooków; renderowany wyłącznie wewnątrz
// klientowego czatu (concierge-chat.tsx), więc onClick (analytics handoffu)
// jest legalny bez własnej dyrektywy "use client". Każda liczba pochodzi
// WYŁĄCZNIE z propsów (realne dane z TripOffer: snapshot crona / żywe
// LiteAPI) — PRODUCT.md: brak danych = brak liczby, nigdy nie liczymy ani
// nie zgadujemy nic po stronie UI.
//
// Wzorce skopiowane z:
// - src/app/hotele/szukaj/_components/result-card.tsx — karta = cały <Link>,
//   biało-zielona paleta (emerald), rounded-2xl, shadow rgba(16,84,48,…),
//   odznaka oceny (rounded bg-emerald-700 + ratingLabel), CTA jako <span
//   aria-hidden> (parent Link już nawiguje).
// - src/app/loty/wyniki/_components/flight-results.tsx — stopsLabel/fmtTime/
//   fmtMoneyPln z lib/flights/display, „Bez opłat za rezerwację" pod CTA lotu.
// - src/app/hotele/szukaj/_components/hotel-card-image.tsx — idiom fallbacku
//   zdjęcia (gradient emerald + ikona + nazwa) gdy brak/nieudane zdjęcie;
//   tu bez stanu klienta — po prostu renderujemy fallback, gdy mainPhotoUrl
//   jest null (uczciwie: nie mamy zdjęcia, nie udajemy że mamy).

import Link from "next/link";

import { track } from "@/lib/analytics/track";
import type { TripOffer } from "@/lib/concierge/types";
import { stopsLabel, fmtTime } from "@/lib/flights/display";
import { ratingLabel } from "@/lib/hotels/rating";
import { localizeCountry } from "@/lib/mvp/i18n-geo";
import { formatPLN } from "@/lib/money";

function formatDateRangePl(checkin: string, checkout: string): string {
  const inD = new Date(`${checkin}T00:00:00`);
  const outD = new Date(`${checkout}T00:00:00`);
  if (Number.isNaN(inD.getTime()) || Number.isNaN(outD.getTime())) {
    return `${checkin} – ${checkout}`;
  }
  const sameMonth = inD.getMonth() === outD.getMonth() && inD.getFullYear() === outD.getFullYear();
  const day = new Intl.DateTimeFormat("pl-PL", { day: "numeric" });
  const dayMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long" });
  return sameMonth
    ? `${day.format(inD)}–${dayMonth.format(outD)}`
    : `${dayMonth.format(inD)} – ${dayMonth.format(outD)}`;
}

function travelersLabel(adults: number, children: number): string {
  const total = adults + children;
  const word = total === 1 ? "osoba" : total < 5 ? "osoby" : "osób";
  return `${total} ${word}`;
}

export function TripOfferCard({ offer }: { offer: TripOffer }) {
  const { hotel, flight } = offer;
  const dateRange = formatDateRangePl(offer.checkin, offer.checkout);
  const travelers = travelersLabel(offer.adults, offer.children);
  const countryPl = localizeCountry(offer.countryEn);

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-900/10 bg-white shadow-[0_4px_16px_rgba(16,84,48,0.06)]">
      {/* Nagłówek: destynacja + daty + liczba osób */}
      <div className="border-b border-emerald-900/10 bg-emerald-50/50 px-4 py-3">
        <h3 className="text-base font-bold text-neutral-900">
          {offer.cityPl}
          {countryPl ? <span className="font-medium text-neutral-500">, {countryPl}</span> : null}
        </h3>
        <p className="mt-0.5 text-xs font-medium text-neutral-600">
          {dateRange} · {travelers}
        </p>
      </div>

      {/* Rozbicie ceny — tylko linie z realnymi danymi */}
      {(flight || hotel || offer.totalPerPersonPln !== null) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-emerald-900/10 px-4 py-3 text-xs text-neutral-600">
          {flight && (
            <span>
              Lot: <span className="font-semibold text-neutral-900">{formatPLN(flight.totalPln)}</span>
            </span>
          )}
          {hotel && (
            <span>
              Hotel: <span className="font-semibold text-neutral-900">{formatPLN(hotel.totalPln)}</span>
            </span>
          )}
          {offer.totalPerPersonPln !== null && (
            <span className="ml-auto text-sm font-bold text-emerald-700">
              Razem {formatPLN(offer.totalPerPersonPln)}
              <span className="text-xs font-semibold text-emerald-700/80"> / os.</span>
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 p-4">
        {/* Podgląd hotelu */}
        {hotel ? (
          <Link
            href={hotel.url}
            onClick={() => track("concierge_offer_click", { target: "hotel", city: offer.cityPl })}
            className="group flex items-stretch gap-3 overflow-hidden rounded-xl border border-emerald-900/10 bg-white transition-colors transition-shadow hover:border-emerald-300 hover:shadow-[0_8px_20px_rgba(16,84,48,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <div className="relative aspect-square w-24 shrink-0 overflow-hidden bg-neutral-100 sm:w-28">
              {hotel.mainPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hotel.mainPhotoUrl}
                  alt={hotel.name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 p-2 text-center text-white">
                  <span aria-hidden className="text-lg opacity-90">🏨</span>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-2 pr-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Hotel</p>
                <p className="truncate text-sm font-semibold text-neutral-900">{hotel.name}</p>
              </div>
              {hotel.rating !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    {hotel.rating.toFixed(1)}
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-800">{ratingLabel(hotel.rating)}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-emerald-700">{formatPLN(hotel.totalPln)}</span>
                <span
                  aria-hidden
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors group-hover:bg-emerald-700"
                >
                  <span>Zobacz hotel →</span>
                </span>
              </div>
            </div>
          </Link>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
            Hotelu nie udało się teraz potwierdzić — sprawdź na stronie wyników.
            {flight && (
              <>
                {" "}
                <Link
                  href={flight.url}
                  onClick={() => track("concierge_offer_click", { target: "flight", city: offer.cityPl })}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  <span>Zobacz wyniki lotu →</span>
                </Link>
              </>
            )}
          </p>
        )}

        {/* Podgląd lotu */}
        {flight ? (
          <Link
            href={flight.url}
            onClick={() => track("concierge_offer_click", { target: "flight", city: offer.cityPl })}
            className="group flex items-center justify-between gap-3 rounded-xl border border-emerald-900/10 bg-white p-3 transition-colors transition-shadow hover:border-emerald-300 hover:shadow-[0_8px_20px_rgba(16,84,48,0.10)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-400">Lot</p>
              <p className="truncate text-sm font-semibold text-neutral-900">
                {flight.carrierName ?? "Przewoźnik"}
              </p>
              <p className="mt-0.5 text-xs text-neutral-500">
                Wylot {fmtTime(flight.outboundDepartureTime)}
                {flight.inboundDepartureTime ? ` · powrót ${fmtTime(flight.inboundDepartureTime)}` : ""} ·{" "}
                {stopsLabel(flight.stops)}
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-700">{formatPLN(flight.totalPln)}</p>
            </div>
            <span
              aria-hidden
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition-colors group-hover:bg-emerald-700"
            >
              <span>Zobacz lot →</span>
            </span>
          </Link>
        ) : (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-3 py-3 text-xs text-neutral-600">
            Lotu nie udało się teraz potwierdzić — sprawdź na stronie wyników.
            {hotel && (
              <>
                {" "}
                <Link
                  href={hotel.url}
                  onClick={() => track("concierge_offer_click", { target: "hotel", city: offer.cityPl })}
                  className="font-semibold text-emerald-700 hover:underline"
                >
                  <span>Zobacz hotel →</span>
                </Link>
              </>
            )}
          </p>
        )}
      </div>

      {/* Sygnał zaufania spójny z lejkiem lotów (flight-results.tsx) — tylko
          gdy mamy przynajmniej jeden realny komponent oferty do pokazania. */}
      {(hotel || flight) && (
        <p className="border-t border-emerald-900/10 px-4 py-2 text-[11px] text-neutral-500">
          Ceny finalne w PLN, bez ukrytych opłat · Bez opłat za rezerwację
        </p>
      )}
    </div>
  );
}
