// /hotele/szukaj — search results. Master spec §5.2.
//
// Server component. Streams skeleton then real results via <Suspense>.
// Filters/sort are URL-driven (every page is shareable).
// LCP target <2.5s on 4G — we render the sticky bar + skeletons immediately
// and stream the result list.

import type { Metadata } from "next";
import { Suspense } from "react";

import { fetchHotelsList, LiteApiError } from "@/lib/liteapi";
import { nightsBetween } from "@/lib/hotels/normalize";
import { resolveDestinationFromQuery } from "@/lib/mvp/destinations-seed";
import { localizeCity } from "@/lib/mvp/i18n-geo";

import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { CollapsibleSearchBar } from "./_components/collapsible-search-bar";
import { FiltersSidebar } from "./_components/filters-sidebar";
import { ResultsList } from "./_components/results-list";
import { ResultsError } from "./_components/results-error";
import { ResultsSkeleton } from "./_components/results-skeleton";

export const revalidate = 300;

// Hotel metadata (/data/hotels) is cheap, so we pull the LiteAPI cap so
// every available property in the destination is eligible. Rates are
// expensive — those are fetched client-side via /api/hotels/rates/batch.
// The full pool is shipped to the client so sort-by-price and the
// "hide unavailable" filter operate GLOBALLY (not just per current page).
//
// Page sizing: 20/page (down from 30) — fewer DOM nodes, faster card
// images render, and the user can see the next page faster without a
// long scroll. LiteAPI returns up to 1000 metadata records per /data/hotels
// call, so cities like Barcelona (~500-600 properties) fit in one fetch
// without paginating the upstream.
const HOTEL_POOL_SIZE = 1000;
const RESULTS_PER_PAGE = 20;

interface SP {
  destination?: string;
  country?: string;
  origin?: string;
  checkin?: string;
  checkout?: string;
  adults?: string;
  rooms?: string;
  children?: string;
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
  flightSort?: string;
  directOnly?: string;
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const dest = sp.destination ?? "";
  const ctry = sp.country ?? "";
  const title = dest
    ? `Hotele ${dest}${ctry ? `, ${ctry}` : ""} — ceny w PLN | HelpTravel`
    : "Wyszukiwarka hoteli | HelpTravel";
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
  const destinationRecord = sp.destination
    ? resolveDestinationFromQuery({ destination: sp.destination, country: sp.country })
    : null;
  const valid =
    sp.destination &&
    sp.country &&
    sp.checkin &&
    sp.checkout &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout);

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Sticky search bar — sits BELOW the site-shell header (which is
          itself sticky top-0 z-30). Without this offset the bar slides
          underneath the header on scroll and only its bottom edge is
          visible. Header logo h-12 (48px) + py-2 (16px) + mt-2 (8px) ≈ 72px
          on mobile; sm: bumps to ≈ 84px because logo is sm:h-14. */}
      <div className="sticky top-[72px] z-20 shadow-sm sm:top-[84px]">
        <CollapsibleSearchBar
          // Re-key per search so the bar REMOUNTS on every submit and
          // re-derives `expanded` from the new `valid`. Without this, the
          // `useState(!valid)` init runs only once: arriving from a tile
          // (no dates → invalid → expanded), then picking dates + ZAPLANUJ
          // keeps the form expanded (user had to hit "Anuluj edycję"). On
          // remount with dates present, valid=true → collapsed → results.
          key={`sb-${sp.destination ?? ""}-${sp.country ?? ""}-${sp.checkin ?? ""}-${sp.checkout ?? ""}-${sp.adults ?? ""}-${sp.origin ?? ""}`}
          valid={Boolean(valid)}
          initial={{
            origin: sp.origin,
            destination: sp.destination,
            destinationCountry: sp.country,
            startDate: sp.checkin,
            endDate: sp.checkout,
            travelers: sp.adults ? Number(sp.adults) : undefined,
          }}
        />
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <FiltersSidebar />

        <section className="space-y-6">
          {/* Sesja C1 FIX 6 — prominent flight banner above hotels.
              Plane icon + bolded route + subtitle + larger CTA. */}
          {valid && sp.origin && (
            <a
              href="#planner-flights"
              className="flex flex-col gap-3 rounded-2xl border border-emerald-900/12 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-4"
            >
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-md sm:h-14 sm:w-14"
                >
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-base font-bold text-emerald-950 sm:text-lg">
                    Loty {sp.origin} → {sp.destination}
                  </div>
                  <div className="text-sm text-emerald-900/72">
                    Najlepsze połączenia · ceny w obie strony · sortowane po wartości
                  </div>
                </div>
              </div>
              <span className="inline-flex h-11 shrink-0 items-center justify-center self-stretch rounded-full bg-emerald-700 px-6 text-sm font-bold text-white shadow-md transition hover:bg-emerald-800 sm:self-center">
                Zobacz loty →
              </span>
            </a>
          )}
          {valid && !sp.origin && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <div className="font-semibold">Dodaj miasto wylotu, by zobaczyć loty.</div>
              <div className="mt-0.5 text-xs text-amber-800">
                Kliknij pole „Skąd” w pasku wyszukiwania powyżej.
              </div>
            </div>
          )}

          {!valid ? (
            <EmptyPrompt hasDestination={Boolean(sp.destination)} />
          ) : (
            <Suspense fallback={<ResultsSkeleton count={6} />}>
              <Results sp={sp} />
            </Suspense>
          )}
        </section>
      </div>

      {/* Flights — full-width below hotels. FlightOffersPanel is its own
          client component with internal Suspense-equivalent loading. */}
      {valid && sp.origin && sp.destination && sp.checkin && sp.checkout && (
        <div className="mx-auto max-w-7xl px-4 pb-12">
          <FlightOffersPanel
            originCity={sp.origin}
            destinationCity={sp.destination}
            destinationCountry={sp.country ?? ""}
            departureDate={sp.checkin}
            returnDate={sp.checkout}
            passengers={sp.adults ? Math.max(1, Math.min(8, Number(sp.adults))) : 2}
            destinationIata={destinationRecord?.airports[0] ?? null}
            destinationLat={destinationRecord?.lat ?? null}
            destinationLng={destinationRecord?.lng ?? null}
          />
        </div>
      )}
    </main>
  );
}

async function Results({ sp }: { sp: SP }) {
  const destination = sp.destination!;
  const country = sp.country!;
  const checkin = sp.checkin!;
  const checkout = sp.checkout!;
  const adults = sp.adults ? Math.max(1, Math.min(8, Number(sp.adults))) : 2;
  const rooms = sp.rooms ? Math.max(1, Math.min(5, Number(sp.rooms))) : 1;
  const children = sp.children
    ? sp.children.split(",").map((s) => Number(s)).filter((n) => Number.isFinite(n) && n >= 0 && n < 18)
    : [];
  const nights = nightsBetween(checkin, checkout);

  interface MetaOffer {
    hotelId: string;
    name: string;
    city: string;
    country?: string;
    stars?: number;
    rating?: number;
    reviewCount?: number;
    thumbnailUrl?: string;
  }

  let metaPool: MetaOffer[] = [];
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
    const list = await fetchHotelsList({ city: destination, country, limit: HOTEL_POOL_SIZE });
    const raw = list.data ?? [];
    metaPool = raw.map((h) => ({
      hotelId: h.id,
      name: h.name,
      city: h.city,
      country: h.country,
      stars: h.stars ?? undefined,
      rating: h.rating ?? undefined,
      reviewCount: h.reviewCount ?? undefined,
      thumbnailUrl: h.main_photo ?? h.thumbnail,
    }));
  } catch (err) {
    errorMessage = err instanceof LiteApiError ? err.userMessagePl : "Coś poszło nie tak. Spróbuj ponownie.";
  }

  const destinationRecord = resolveDestinationFromQuery({ destination, country });
  const cityPl = destinationRecord?.city.pl ?? localizeCity(destination);

  if (errorMessage) {
    return (
      <ResultsError
        title={`Nie znaleźliśmy hoteli w ${cityPl}`}
        message={errorMessage}
        iata={destinationRecord?.airports[0] ?? null}
        lat={destinationRecord?.lat ?? null}
        lng={destinationRecord?.lng ?? null}
      />
    );
  }

  if (metaPool.length === 0) {
    return (
      <EmptyResults
        destination={cityPl}
        iata={destinationRecord?.airports[0] ?? null}
        lat={destinationRecord?.lat ?? null}
        lng={destinationRecord?.lng ?? null}
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

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
          Hotele w {destination}
        </h1>
      </header>

      <ResultsList
        pool={metaPool}
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
