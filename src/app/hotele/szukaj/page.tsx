// /hotele/szukaj — search results. Master spec §5.2.
//
// Server component. Streams skeleton then real results via <Suspense>.
// Filters/sort are URL-driven (every page is shareable).
// LCP target <2.5s on 4G — we render the sticky bar + skeletons immediately
// and stream the result list.

import type { Metadata } from "next";
import { Suspense } from "react";

import { fetchHotelsByPlaceId, fetchHotelsForDestination, LiteApiError } from "@/lib/liteapi";
import { POOL_PAGE_SIZE, toMetaOffer, type MetaOffer } from "@/lib/hotels/meta-pool";

import { nightsBetween } from "@/lib/hotels/normalize";
import { getRegionById, isInRegion, type RegionRecord } from "@/lib/hotels/regions";
import { resolveDestinationFromQuery } from "@/lib/mvp/destinations-seed";
import { localizeCity } from "@/lib/mvp/i18n-geo";

import { CollapsibleSearchBar } from "./_components/collapsible-search-bar";
import { HeaderOffsetProbe } from "./_components/header-offset";
import { FiltersSidebar } from "./_components/filters-sidebar";
import { ResultsLayout } from "./_components/results-layout";
import { ResultsList } from "./_components/results-list";
import { ResultsError } from "./_components/results-error";
import { ResultsSkeleton } from "./_components/results-skeleton";

export const revalidate = 300;

// Hotel metadata (/data/hotels) feeds the results pool. We ship the pool to
// the client so sort-by-price and the "hide unavailable" filter operate
// GLOBALLY (not just per current page). Rates are fetched client-side via
// /api/hotels/rates/batch.
//
// POOL SIZE — serwer renderuje PIERWSZĄ stronę puli (300; historię capu 2 MB
// Next Data Cache opisuje lib/hotels/meta-pool.ts). Od 2026-07-11 to już NIE
// jest twardy limit widocznych hoteli: ResultsList dociąga kolejne strony
// metadanych w tle przez /api/hotels/meta (offset zweryfikowany na LiteAPI),
// aż pula obejmie wszystkie hotele kierunku (sufit POOL_MAX_TOTAL = 2000).
// Serwerowe 300 zostaje, bo daje natychmiastowy first paint z cache i zerowy
// wzrost payloadu RSC — reszta puli płynie osobnym torem JSON.
//
// Page sizing: 20/page — fewer DOM nodes, faster card images render.
const HOTEL_POOL_SIZE = POOL_PAGE_SIZE;
const RESULTS_PER_PAGE = 20;

interface SP {
  destination?: string;
  country?: string;
  /** Zadanie 2 — slug wyspy/regionu z data/regions.ts (np. "majorka"). */
  region?: string;
  origin?: string;
  checkin?: string;
  checkout?: string;
  adults?: string;
  rooms?: string;
  children?: string;
  /** Informational: children share of `adults` (UI split restore only). */
  kids?: string;
  minPrice?: string;
  maxPrice?: string;
  minStars?: string;
  minRating?: string;
  cancel?: string;
  sort?: string;
  q?: string;
  strona?: string;
  propertyType?: string;
  board?: string;
  /** Klucze filtrów udogodnień (FACILITY_FILTERS), rozdzielone przecinkami. */
  facilities?: string;
  /** Nazwy sieci hotelowych rozdzielone „|" — nazwy zawierają przecinki. */
  chains?: string;
  flightSort?: string;
  directOnly?: string;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const region = sp.region ? getRegionById(sp.region) : null;
  if (region) {
    return {
      title: `Hotele ${region.namePl}, ${region.countryPl} — ceny w PLN`,
      description: `Znajdź hotel na wyspie ${region.namePl}. Prawdziwe ceny w PLN, bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`,
      alternates: {
        canonical: `/hotele/szukaj?${new URLSearchParams({ region: region.id }).toString()}`,
      },
      robots: "index, follow",
    };
  }
  const dest = sp.destination ?? "";
  const ctry = sp.country ?? "";
  const title = dest
    ? `Hotele ${dest}${ctry ? `, ${ctry}` : ""} — ceny w PLN`
    : "Wyszukiwarka hoteli";
  const canonical = dest
    ? `/hotele/szukaj?${new URLSearchParams({ destination: dest, ...(ctry ? { country: ctry } : {}) }).toString()}`
    : "/hotele/szukaj";
  return {
    title,
    description: dest
      ? `Znajdź hotel w ${dest}. Prawdziwe ceny w PLN, bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`
      : "Wyszukaj hotel z prawdziwymi cenami w PLN.",
    alternates: { canonical },
    robots: dest ? "index, follow" : "noindex, follow",
  };
}

export default async function HotelResultsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  // Zadanie 2 — wyspa/region ma pierwszeństwo przed destination (miastem).
  const region = sp.region ? getRegionById(sp.region) : null;
  const valid =
    (region || (sp.destination && sp.country)) &&
    sp.checkin &&
    sp.checkout &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout);

  // Etykieta dla bannera „trwa wyszukiwanie" w fallbacku <Suspense> (pokazywany
  // gdy serwer pobiera pulę hoteli z LiteAPI — ~2–3 s). Po wczytaniu metadanych
  // ResultsList przejmuje z własnym licznikiem „Sprawdzam dostępność…".
  const destLabel = region ? region.namePl : sp.destination;
  const skeletonTitle = `Szukamy najlepszych hoteli${destLabel ? ` w ${destLabel}` : ""}…`;

  return (
    <main className="min-h-screen bg-neutral-50">
      <HeaderOffsetProbe />

      {/* Pasek wyszukiwania przykleja się DOKŁADNIE pod nagłówkiem serwisu.
          Offset idzie ze zmierzonej zmiennej `--ht-header-h` (patrz
          HeaderOffsetProbe) — wcześniej były tu wpisane ręcznie 72/84 px, przez
          co między nagłówkiem a paskiem prześwitywała treść. Zapasowa wartość
          w `var()` obsługuje pierwszą klatkę przed pomiarem. */}
      <div className="sticky z-20 pt-2" style={{ top: "var(--ht-header-h, 84px)" }}>
        <CollapsibleSearchBar
          // Re-key per search so the bar REMOUNTS on every submit and
          // re-derives `expanded` from the new `valid`. Without this, the
          // `useState(!valid)` init runs only once: arriving from a tile
          // (no dates → invalid → expanded), then picking dates + ZAPLANUJ
          // keeps the form expanded (user had to hit "Anuluj edycję"). On
          // remount with dates present, valid=true → collapsed → results.
          key={`sb-${sp.region ?? ""}-${sp.destination ?? ""}-${sp.country ?? ""}-${sp.checkin ?? ""}-${sp.checkout ?? ""}-${sp.adults ?? ""}-${sp.origin ?? ""}`}
          valid={Boolean(valid)}
          initial={{
            origin: sp.origin,
            // Region: pole "Dokąd" pokazuje polską nazwę wyspy, a regionId
            // wraca do formularza, żeby resubmit znowu zbudował region=….
            destination: region ? region.namePl : sp.destination,
            destinationCountry: region ? region.countryPl : sp.country,
            regionId: region?.id,
            startDate: sp.checkin,
            endDate: sp.checkout,
            travelers: sp.adults ? Number(sp.adults) : undefined,
            kids: sp.kids ? Number(sp.kids) : undefined,
          }}
        />
      </div>

      {/* Sidebar wchodzi jako `prop`, a nie jako dziecko: w trybie mapy
          powłoka go NIE renderuje (brief V3 §5). Filtry zostają dostępne
          z paska szybkich filtrów nad wynikami. */}
      <ResultsLayout sidebar={<FiltersSidebar />}>
        {/* Loty wyszukuje się osobnym torem (toggle Hotele/Loty na stronie
            głównej → /loty/wyniki). Strona hoteli nie miesza już lotów do
            lejka hotelowego. */}
        {!valid ? (
          <EmptyPrompt hasDestination={Boolean(sp.destination)} />
        ) : (
          <Suspense fallback={<ResultsSkeleton count={6} title={skeletonTitle} />}>
            <Results sp={sp} region={region} />
          </Suspense>
        )}
      </ResultsLayout>
    </main>
  );
}

async function Results({ sp, region }: { sp: SP; region: RegionRecord | null }) {
  // Region: destination/country pochodzą ze słownika (URL może mieć samo
  // region=… — np. link kanoniczny), miasto: z parametrów jak dotąd.
  const destination = region ? region.nameEn : sp.destination!;
  const country = region ? region.countryPl : sp.country!;
  const checkin = sp.checkin!;
  const checkout = sp.checkout!;
  // Cap 15 = 9 adults + 6 children from the guests popover (zadanie 1).
  const adults = sp.adults ? Math.max(1, Math.min(15, Number(sp.adults))) : 2;
  const rooms = sp.rooms ? Math.max(1, Math.min(5, Number(sp.rooms))) : 1;
  const children = sp.children
    ? sp.children.split(",").map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 0 && n < 18)
    : [];
  const nights = nightsBetween(checkin, checkout);

  // FAZA 2 — rozwiązujemy rekord katalogu PRZED fetchem: daje kanoniczny EN
  // `cityName` (LiteAPI matchuje dokładny string → polska nazwa = 0 hoteli) oraz
  // lat/lng do fallbacku po współrzędnych, gdy nazwa nie trafi w indeks LiteAPI.
  const destinationRecord = region ? null : resolveDestinationFromQuery({ destination, country });
  const canonicalCity = destinationRecord?.city.en ?? destination;

  let metaPool: MetaOffer[] = [];
  // Czy istnieją kolejne strony puli (RAW count == limit strony). Liczone
  // PRZED filtrem wyspy — offset kolejnych stron liczy się po surowej liście.
  let poolHasMore = false;
  let errorMessage: string | null = null;

  try {
    // Server-side: pull the FULL metadata pool for the destination (up to
    // LiteAPI's 1000 cap). Metadata is cheap (just names, photos, stars) —
    // the expensive part is the per-hotel rate lookup, which is done on the
    // client via /api/hotels/rates/batch + the existing price-store. The
    // ResultsList client component then owns filter / sort / paginate over
    // the WHOLE pool so:
    //   • "price ascending" is a global ladder (cheapest in the destination
    //     first, not just cheapest among the current 20 cards).
    //   • Hotels that come back unavailable for the chosen dates are HIDDEN
    //     entirely — no more "Brak miejsc w tym terminie" cards.
    //   • The count line reflects ACTUAL availability ("511 dostępnych
    //     obiektów"), not the metadata count.
    // Region (zadanie 2): jeden call po placeId (zweryfikowane — działa jak
    // cityName, ten sam cap 1000), po czym przycinamy do hoteli faktycznie
    // leżących na wyspie (placeId-search dorzuca sąsiednie wyspy).
    const list = region
      ? await fetchHotelsByPlaceId({ placeId: region.placeId, limit: HOTEL_POOL_SIZE })
      : await fetchHotelsForDestination({
          city: canonicalCity,
          country,
          lat: destinationRecord?.lat ?? null,
          lng: destinationRecord?.lng ?? null,
          limit: HOTEL_POOL_SIZE,
        });
    let raw = list.data ?? [];
    poolHasMore = raw.length >= HOTEL_POOL_SIZE;
    if (region) raw = raw.filter((h) => isInRegion(region, h));
    metaPool = raw.map(toMetaOffer);

    // USUNIĘTE 2026-08-07: rozwiązywanie `placeId` kierunku przez
    // `suggestPlaces`. Było potrzebne wyłącznie widgetowi mapy LiteAPI, który
    // centrował się TYLKO po placeId. Własna mapa centruje się po
    // współrzędnych hoteli, które i tak są w puli — a ten `await` siedział
    // SEKWENCYJNIE na ścieżce krytycznej KAŻDEGO wyszukiwania, po pobraniu
    // listy hoteli, opóźniając pierwszy render o pełny round-trip do LiteAPI.
  } catch (err) {
    errorMessage = err instanceof LiteApiError ? err.userMessagePl : "Coś poszło nie tak. Spróbuj ponownie.";
  }

  const cityPl = region ? region.namePl : (destinationRecord?.city.pl ?? localizeCity(destination));
  const fallbackIata = region ? (region.airports[0] ?? null) : (destinationRecord?.airports[0] ?? null);
  const fallbackLat = region ? region.lat : (destinationRecord?.lat ?? null);
  const fallbackLng = region ? region.lng : (destinationRecord?.lng ?? null);

  if (errorMessage) {
    return (
      <ResultsError
        title={`Nie znaleźliśmy hoteli w ${cityPl}`}
        message={errorMessage}
        iata={fallbackIata}
        lat={fallbackLat}
        lng={fallbackLng}
      />
    );
  }

  if (metaPool.length === 0) {
    return (
      <EmptyResults
        destination={cityPl}
        iata={fallbackIata}
        lat={fallbackLat}
        lng={fallbackLng}
      />
    );
  }

  // Base query (all params except the page cursor) so pagination links
  // preserve the active search + every filter/sort.
  const pageBaseParams = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === "strona" || v == null || v === "") continue;
    pageBaseParams.set(k, String(v));
  }
  const pageBaseQuery = pageBaseParams.toString();

  // Preserve search params for child links.
  const childParams = new URLSearchParams();
  childParams.set("destination", destination);
  childParams.set("country", country);
  childParams.set("checkin", checkin);
  childParams.set("checkout", checkout);
  childParams.set("adults", String(adults));
  childParams.set("rooms", String(rooms));
  if (children.length) childParams.set("children", children.join(","));
  // Region w linkach do hoteli — powrót z karty hotelu zachowuje kontekst.
  if (region) childParams.set("region", region.id);

  // Shared search context for the client price islands.
  const priceCtx = { checkin, checkout, adults, children, rooms, currency: "PLN" };

  // Parse URL-driven filters/sort once at the boundary; ResultsList stays
  // a pure consumer of these props.
  const requestedPage = Number(sp.strona);
  const pageFromUrl = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;
  const propertyTypeList = sp.propertyType
    ? sp.propertyType.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const boardList = sp.board
    ? sp.board.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const facilitiesList = sp.facilities
    ? sp.facilities.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  // Separator „|", nie przecinek — nazwy sieci potrafią zawierać przecinki.
  const chainsList = sp.chains
    ? sp.chains.split("|").map((s) => s.trim()).filter(Boolean)
    : undefined;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
          {region ? `Hotele: ${region.namePl}` : `Hotele w ${cityPl}`}
        </h1>
      </header>

      <ResultsList
        pool={metaPool}
        // Dociąganie pełnej puli w tle (/api/hotels/meta): opis źródła, od
        // którego offsetu zacząć i czy w ogóle są kolejne strony.
        poolSource={{
          city: region ? undefined : canonicalCity,
          country: region ? undefined : country,
          lat: destinationRecord?.lat ?? undefined,
          lng: destinationRecord?.lng ?? undefined,
          regionId: region?.id,
        }}
        poolNextOffset={HOTEL_POOL_SIZE}
        poolHasMore={poolHasMore}
        ctx={priceCtx}
        nights={nights}
        childParams={childParams.toString()}
        baseQuery={pageBaseQuery}
        pageFromUrl={pageFromUrl}
        pageSize={RESULTS_PER_PAGE}
        sort={sp.sort}
        minPrice={sp.minPrice ? Number(sp.minPrice) : undefined}
        maxPrice={sp.maxPrice ? Number(sp.maxPrice) : undefined}
        minStars={sp.minStars ? Number(sp.minStars) : undefined}
        minRating={sp.minRating ? Number(sp.minRating) : undefined}
        cancel={sp.cancel}
        q={sp.q}
        propertyType={propertyTypeList}
        board={boardList}
        facilities={facilitiesList}
        chains={chainsList}
      />
    </div>
  );
}

function EmptyPrompt({ hasDestination }: { hasDestination: boolean }) {
  // City is already set (e.g. arrived from a homepage tile) — the only thing
  // missing is the dates, so prompt for THOSE, not for a city.
  if (hasDestination) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-neutral-900">Wybierz datę, aby zobaczyć hotele</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Uzupełnij pola „Wylot” i „Powrót” w pasku powyżej, a pokażemy dostępne hotele.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-neutral-900">Wpisz miasto, aby zacząć</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Pole „Dokąd?” na górze podpowiada miasta i kraje.
      </p>
    </div>
  );
}

function EmptyResults({
  destination,
  iata,
  lat,
  lng,
}: {
  destination: string;
  iata?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  return (
    <ResultsError
      title={`Nie znaleźliśmy hoteli w ${destination}`}
      message="Spróbuj zmienić daty, wyczyścić filtry albo wybrać pobliski kierunek."
      iata={iata}
      lat={lat}
      lng={lng}
    />
  );
}
