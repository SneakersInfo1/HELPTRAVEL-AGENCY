// /loty/wyniki — wyniki wyszukiwania lotów.
//
// FAZA 2: PLACEHOLDER. Toggle Hotele/Loty na homepage kieruje tutaj z
// parametrami (origin, destination, depart, return, adults, children, infants).
// Pełna lista ofert + flow rezerwacji powstaje w FAZIE 3. Ta strona na razie
// potwierdza odebrane parametry, żeby submit z paska nie dawał 404 i żeby
// dało się przetestować routing toggle'a.

import type { Metadata } from "next";

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

function fmtDate(iso?: string): string | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long" }).format(new Date(`${iso}T00:00:00`));
}

export default async function FlightResultsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const depart = fmtDate(sp.depart);
  const ret = fmtDate(sp.return);
  const pax = [
    sp.adults ? `${sp.adults} dorosł${Number(sp.adults) === 1 ? "y" : "ych"}` : null,
    sp.children && Number(sp.children) > 0 ? `${sp.children} dzieci` : null,
    sp.infants && Number(sp.infants) > 0 ? `${sp.infants} niemowląt` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const hasQuery = Boolean(sp.origin && sp.destination && sp.depart);

  return (
    <main className="mx-auto min-h-[60vh] max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">Wyniki lotów</h1>

      {hasQuery ? (
        <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-emerald-50/50 p-5">
          <p className="text-lg font-semibold text-emerald-950">
            {sp.origin} → {sp.destination}
          </p>
          <p className="mt-1 text-sm text-emerald-900/80">
            {depart}
            {ret ? ` – ${ret}` : " · w jedną stronę"}
            {pax ? ` · ${pax}` : ""}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-sm text-neutral-600">Brak parametrów wyszukiwania. Wróć na stronę główną i wybierz lot.</p>
      )}

      <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        <p className="text-base font-semibold text-neutral-900">Wyszukiwarka lotów jest w przygotowaniu ✈</p>
        <p className="mt-1 text-sm text-neutral-600">
          Backend (LiteAPI Flights) już działa — pełna lista ofert i rezerwacja pojawią się tu wkrótce.
        </p>
      </div>
    </main>
  );
}
