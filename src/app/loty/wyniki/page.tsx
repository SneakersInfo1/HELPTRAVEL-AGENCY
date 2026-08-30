// /loty/wyniki — wyniki wyszukiwania lotów (Faza 3.1).
//
// Server shell: czyta parametry z URL (origin/destination IATA, depart, return,
// adults/children/infants), waliduje minimalny komplet i przekazuje do klienta
// FlightResults, który pobiera oferty (/api/flights/rates), sortuje, renderuje
// i obsługuje verify → przejście do danych pasażerów.

import type { Metadata } from "next";

import { isFlightsLive } from "@/lib/config/featureFlags";
import { FLIGHT_SHELL_BAR, FLIGHT_SHELL_NARROW, FLIGHT_STICKY_TOP } from "@/lib/flights/layout";

import { FlightResults } from "./_components/flight-results";
import { FlightSearchBar } from "./_components/flight-search-bar";

export const metadata: Metadata = {
  title: "Wyniki lotów",
  robots: "noindex, follow",
};

interface SP {
  origin?: string;
  /** Etykieta miasta/grupy do nagłówka (zadanie 1), np. „Warszawa — wszystkie lotniska". */
  originLabel?: string;
  destination?: string;
  /** Nazwa miasta celu (do nagłówka + paska edycji), np. „Barcelona". */
  destLabel?: string;
  depart?: string;
  return?: string;
  adults?: string;
  children?: string;
  infants?: string;
  /** `1` = recovery po wygaśnięciu oferty → omiń cache ofert (świeże wyniki). */
  fresh?: string;
}

const isIata = (v?: string) => Boolean(v && /^[A-Z]{3}$/.test(v));
const isDate = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** `origin` może być jednym kodem (WAW), kodem metra (LON) albo listą kodów
 *  rozdzieloną przecinkami dla grupy „wszystkie lotniska" (WAW,WMI,RDO). */
function parseOrigins(v?: string): string[] {
  if (!v) return [];
  const codes = v.split(",").map((s) => s.trim().toUpperCase()).filter(isIata);
  // Cap 6 — „Polska — dowolne lotnisko" robi fan-out po 6 największych
  // lotniskach (WAW/KRK/KTW/GDN/WRO/POZ). Grupy miejskie i tak mają ≤3.
  return [...new Set(codes)].slice(0, 6);
}

export default async function FlightResultsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const origins = parseOrigins(sp.origin);
  const destination = sp.destination?.toUpperCase();
  const valid = origins.length > 0 && isIata(destination) && isDate(sp.depart);

  if (!valid) {
    return (
      <main className={`${FLIGHT_SHELL_NARROW} min-h-[60vh] py-12`}>
        <h1 className="text-2xl font-bold text-ink">Wyniki lotów</h1>
        <p className="mt-4 text-sm text-ink-muted">
          Brak poprawnych parametrów wyszukiwania. Wróć na stronę główną i wybierz lot.
        </p>
      </main>
    );
  }

  const ret = isDate(sp.return) ? sp.return : undefined;
  const adults = Math.max(1, Math.min(9, Number(sp.adults) || 1));
  const childrenCount = Math.max(0, Math.min(8, Number(sp.children) || 0));
  const infants = Math.max(0, Math.min(4, Number(sp.infants) || 0));

  // Klucz per-wyszukiwanie: zmiana kierunku/dat/pasażerów w pasku edycji robi
  // SOFT-NAV na ten sam route /loty/wyniki, więc bez tego React reużywałby
  // instancję FlightResults — a `fetchedRef` blokował ponowny fetch → stare
  // wyniki mimo nowych parametrów. `key` wymusza remount: świeży stan +
  // ponowny fetch. Pasek edycji też się remountuje (zwija do podsumowania).
  const searchKey = [origins.join(","), destination, sp.depart, ret ?? "", adults, childrenCount, infants].join("|");

  return (
    <>
      {/* Kill-switch lotów. Wyszukiwanie zostaje włączone (nie rusza pieniędzy
          i nadal ma wartość informacyjną), ale mówimy o tym NA WEJŚCIU, zanim
          ktoś wypełni formularz pasażerów i uderzy w ścianę na płatności. */}
      {!isFlightsLive() ? (
        <div className={`${FLIGHT_SHELL_BAR} pt-4`}>
          <p
            role="status"
            className="rounded-lg border border-line bg-surface-sunken px-4 py-3 text-sm text-ink"
          >
            Rezerwacja lotów jest chwilowo niedostępna — ceny i połączenia możesz przeglądać, ale nie
            dokończysz teraz rezerwacji.
          </p>
        </div>
      ) : null}

      {/* Pasek edycji wyszukiwania — sticky pod headerem, jak na hotelach.
          Pozwala zmienić kierunek/daty bez wracania na homepage.
          Offset z `FLIGHT_STICKY_TOP`, nie z palca: header lotów jest teraz
          pasem bez `mt-2`, więc stare `top-[72px]` zostawiało szczelinę. */}
      <div className={`sticky ${FLIGHT_STICKY_TOP} z-20 shadow-sm`}>
        <FlightSearchBar
          key={`sb-${searchKey}`}
          origins={origins}
          originLabel={sp.originLabel}
          destination={destination!}
          destLabel={sp.destLabel}
          depart={sp.depart!}
          ret={ret}
          adults={adults}
          childrenCount={childrenCount}
          infants={infants}
        />
      </div>
      <FlightResults
        key={`fr-${searchKey}`}
        origins={origins}
        originLabel={sp.originLabel}
        destination={destination!}
        destLabel={sp.destLabel}
        depart={sp.depart!}
        ret={ret}
        adults={adults}
        childrenCount={childrenCount}
        infants={infants}
        fresh={sp.fresh === "1"}
      />
    </>
  );
}
