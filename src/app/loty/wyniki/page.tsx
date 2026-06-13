// /loty/wyniki — wyniki wyszukiwania lotów (Faza 3.1).
//
// Server shell: czyta parametry z URL (origin/destination IATA, depart, return,
// adults/children/infants), waliduje minimalny komplet i przekazuje do klienta
// FlightResults, który pobiera oferty (/api/flights/rates), sortuje, renderuje
// i obsługuje verify → przejście do danych pasażerów.

import type { Metadata } from "next";

import { FlightResults } from "./_components/flight-results";

export const metadata: Metadata = {
  title: "Wyniki lotów | HelpTravel",
  robots: "noindex, follow",
};

interface SP {
  origin?: string;
  destination?: string;
  depart?: string;
  return?: string;
  adults?: string;
  children?: string;
  infants?: string;
}

const isIata = (v?: string) => Boolean(v && /^[A-Z]{3}$/.test(v));
const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

export default async function FlightResultsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const valid = isIata(sp.origin) && isIata(sp.destination) && isDate(sp.depart);

  if (!valid) {
    return (
      <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-12">
        <h1 className="text-2xl font-bold text-neutral-900">Wyniki lotów</h1>
        <p className="mt-4 text-sm text-neutral-600">
          Brak poprawnych parametrów wyszukiwania. Wróć na stronę główną i wybierz lot.
        </p>
      </main>
    );
  }

  return (
    <FlightResults
      origin={sp.origin!}
      destination={sp.destination!}
      depart={sp.depart!}
      ret={isDate(sp.return) ? sp.return : undefined}
      adults={Math.max(1, Math.min(9, Number(sp.adults) || 1))}
      childrenCount={Math.max(0, Math.min(8, Number(sp.children) || 0))}
      infants={Math.max(0, Math.min(4, Number(sp.infants) || 0))}
    />
  );
}
