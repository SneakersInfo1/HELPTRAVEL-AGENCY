// Live wyniki lotów do kroku 2 (async server component — streamowany Suspense).
// Odpala flight-search dla trasy/dat/pax (żywy moment, jak /pakiety/szukaj).

import { iataForCity } from "@/lib/flights/airports";
import { searchFlightOffers } from "@/lib/flights/search-offers";
import { localizeCity } from "@/lib/mvp/i18n-geo";
import { buildFlightSearchInput } from "@/modules/packages/services/flightSearchInput";

import { FlightPicker } from "./flight-picker";

export interface OfferParams {
  destination: string; // miasto (EN)
  origin: string; // miasto wylotu (domyślnie Warszawa)
  dateFrom: string;
  dateTo: string;
  adults: number;
  hotelId: string;
  hotelName: string;
  hotelPln: number;
  nights: number;
  stars?: number;
  board?: string;
  freeCancel?: string;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="rounded-2xl border border-emerald-900/10 bg-white p-8 text-center">
        <p className="text-base font-semibold text-neutral-900">{title}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">{body}</p>
        <a href="/pakiety/szukaj" className="mt-4 inline-block text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          ← Wróć do pakietów
        </a>
      </div>
    </div>
  );
}

export async function FlightResults({ params }: { params: OfferParams }) {
  const originIata = iataForCity(params.origin) ?? "WAW";
  const destIata = iataForCity(params.destination);
  if (!destIata) {
    return <EmptyState title="Nie rozpoznaliśmy kierunku" body="Wróć i wybierz kierunek z listy podpowiedzi." />;
  }

  const input = buildFlightSearchInput({
    originAirport: originIata,
    destinationAirport: destIata,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    occupancies: [{ adults: params.adults, children: [] }],
    cabinClass: "economy",
  });

  let offers;
  try {
    offers = await searchFlightOffers(input);
  } catch (err) {
    console.error("[pakiety/oferta] searchFlightOffers error", err);
    return <EmptyState title="Nie udało się pobrać lotów" body="Spróbuj ponownie za chwilę albo zmień termin." />;
  }

  const priced = offers.filter((o) => o.total !== null);
  if (priced.length === 0) {
    return <EmptyState title="Brak lotów dla tych dat" body="Spróbuj innego terminu albo pobliskiego lotniska wylotu." />;
  }

  return (
    <FlightPicker
      offers={offers}
      hotel={{
        id: params.hotelId,
        name: params.hotelName,
        pricePln: params.hotelPln,
        nights: params.nights,
        ...(params.stars ? { stars: params.stars } : {}),
        ...(params.board ? { board: params.board } : {}),
        ...(params.freeCancel ? { freeCancelUntil: params.freeCancel } : {}),
      }}
      origin={{ label: params.origin, codes: [originIata] }}
      destination={{ city: localizeCity(params.destination), iata: destIata }}
      dateFrom={params.dateFrom}
      dateTo={params.dateTo}
      adults={params.adults}
    />
  );
}
