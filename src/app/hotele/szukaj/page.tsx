// /hotele/szukaj — search results. Master spec §5.2.
//
// Server component. Streams skeleton then real results via <Suspense>.
// Filters/sort are URL-driven (every page is shareable).
// LCP target <2.5s on 4G — we render the sticky bar + skeletons immediately
// and stream the result list.

import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { fromMinor } from "@/lib/money";
import { fetchHotelsList, getRates, LiteApiError } from "@/lib/liteapi";
import { normalizeOffer, nightsBetween } from "@/lib/hotels/normalize";

import { MiniPlannerForm } from "@/components/home/mini-planner-form";
import { FlightOffersPanel } from "@/components/mvp/flight-offers-panel";
import { FiltersSidebar, applyFiltersAndSort } from "./_components/filters-sidebar";
import { ResultCard } from "./_components/result-card";
import { ResultSkeletonList } from "./_components/skeleton";

export const dynamic = "force-dynamic";

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
  return {
    title,
    description: dest
      ? `Znajdź hotel w ${dest}. Prawdziwe ceny w PLN, bezpłatna anulacja w wybranych ofertach, polskie wsparcie.`
      : "Wyszukaj hotel z prawdziwymi cenami w PLN.",
    alternates: { canonical: "/hotele/szukaj" },
    robots: { index: false, follow: true }, // dynamic listings — don't index
  };
}

export default async function HotelResultsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const valid =
    sp.destination &&
    sp.country &&
    sp.checkin &&
    sp.checkout &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.checkin) &&
    /^\d{4}-\d{2}-\d{2}$/.test(sp.checkout);

  return (
    <main className="min-h-screen bg-neutral-50">
      {/* Sticky search bar — same component as homepage hero */}
      <div className="sticky top-0 z-20 border-b border-emerald-900/10 bg-emerald-700/5 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <MiniPlannerForm
            compact
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
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[280px_1fr]">
        <FiltersSidebar />

        <section className="space-y-6">
          {/* Anchor link to flights below */}
          {valid && sp.origin && (
            <a
              href="#planner-flights"
              className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-900/10 bg-gradient-to-r from-emerald-50 to-white p-4 transition hover:border-emerald-300 hover:shadow"
            >
              <div className="flex items-center gap-3">
                <span aria-hidden className="text-2xl">✈</span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-emerald-950">Loty na ten kierunek</div>
                  <div className="line-clamp-2 text-xs text-emerald-900/72">
                    Sprawdź ceny przelotów z {sp.origin} dopasowane do Twoich dat.
                  </div>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white">
                Zobacz wszystkie loty →
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
            <EmptyPrompt />
          ) : (
            <Suspense fallback={<ResultSkeletonList count={6} />}>
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

  let offers: Array<ReturnType<typeof toCardOffer>> = [];
  let errorMessage: string | null = null;

  try {
    const list = await fetchHotelsList({ city: destination, country, limit: 30 });
    if (list.data?.length) {
      const hotelIds = list.data.map((h) => h.id);
      const rates = await getRates({
        hotelIds,
        checkin,
        checkout,
        currency: "PLN",
        occupancies: Array.from({ length: rooms }, () => ({ adults, children })),
      });
      const ratesByHotel = new Map(rates.data.map((r) => [r.hotelId, r] as const));
      offers = list.data
        .map((h) => normalizeOffer(h, ratesByHotel.get(h.id)))
        .filter((o): o is NonNullable<typeof o> => o !== null)
        .map(toCardOffer);
    }
  } catch (err) {
    errorMessage = err instanceof LiteApiError ? err.userMessagePl : "Coś poszło nie tak. Spróbuj ponownie.";
  }

  if (errorMessage) return <ErrorState message={errorMessage} />;

  // Apply URL filters/sort
  const filtered = applyFiltersAndSort(offers, {
    minPrice: sp.minPrice ? Number(sp.minPrice) : undefined,
    maxPrice: sp.maxPrice ? Number(sp.maxPrice) : undefined,
    minStars: sp.minStars ? Number(sp.minStars) : undefined,
    minRating: sp.minRating ? Number(sp.minRating) : undefined,
    cancel: sp.cancel,
    sort: sp.sort,
    q: sp.q,
    propertyType: sp.propertyType ? sp.propertyType.split(",").filter(Boolean) : undefined,
    board: sp.board ? sp.board.split(",").filter(Boolean) : undefined,
  });

  if (filtered.length === 0) return <EmptyResults destination={destination} />;

  // Identify badges (cheapest, top-rated)
  const cheapestId = [...filtered].sort((a, b) => a.cheapestRate.totalAmount - b.cheapestRate.totalAmount)[0]?.hotelId;
  const topRatedId = [...filtered]
    .filter((o) => (o.rating ?? 0) > 0)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0]?.hotelId;

  // Preserve search params for child links.
  const childParams = new URLSearchParams();
  childParams.set("destination", destination);
  childParams.set("country", country);
  childParams.set("checkin", checkin);
  childParams.set("checkout", checkout);
  childParams.set("adults", String(adults));
  childParams.set("rooms", String(rooms));
  if (children.length) childParams.set("children", children.join(","));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold text-neutral-900 sm:text-2xl">
          {filtered.length} {filtered.length === 1 ? "hotel" : filtered.length < 5 ? "hotele" : "hoteli"} w{" "}
          {destination}
        </h1>
        <div className="text-sm text-neutral-500">
          {nights} {nights === 1 ? "noc" : nights < 5 ? "noce" : "nocy"} · {adults} {adults === 1 ? "dorosły" : "dorosłych"}
        </div>
      </header>

      {filtered.map((o) => (
        <ResultCard
          key={o.hotelId}
          offer={o}
          searchQuery={childParams.toString()}
          nights={nights}
          badges={{
            cheapest: o.hotelId === cheapestId,
            topRated: Boolean(topRatedId) && o.hotelId === topRatedId && o.hotelId !== cheapestId,
            freeCancel: o.cheapestRate.refundableTag === "RFN",
          }}
        />
      ))}
    </div>
  );
}

function toCardOffer(o: ReturnType<typeof normalizeOffer> & object) {
  return {
    hotelId: o.hotelId,
    name: o.name,
    city: o.city,
    country: o.country,
    address: o.address,
    stars: o.stars,
    rating: o.rating,
    reviewCount: o.reviewCount,
    thumbnailUrl: o.thumbnailUrl,
    cheapestRate: {
      rateId: o.cheapestRate.rateId,
      offerId: o.cheapestRate.offerId,
      boardName: o.cheapestRate.boardName,
      refundableTag: o.cheapestRate.refundableTag,
      totalAmount: fromMinor(o.cheapestRate.totalAmountMinor),
      currency: o.cheapestRate.currency,
      cancellationDeadline: o.cheapestRate.cancellationDeadline,
    },
  };
}

function EmptyPrompt() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-neutral-900">Wpisz miasto, aby zacząć</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Pole „Dokąd?” na górze podpowiada miasta i kraje.
      </p>
    </div>
  );
}

function EmptyResults({ destination }: { destination: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
      <h2 className="text-lg font-semibold text-neutral-900">
        Brak hoteli pasujących do filtrów dla {destination}
      </h2>
      <p className="mt-2 text-sm text-neutral-600">Spróbuj:</p>
      <ul className="mx-auto mt-2 max-w-md space-y-1 text-left text-sm text-neutral-700">
        <li>• poszerzyć zakres dat o 1–2 dni,</li>
        <li>• zmienić obszar lub miasto,</li>
        <li>• zwiększyć budżet w filtrze cen,</li>
        <li>• zmniejszyć minimalny standard hotelu.</li>
      </ul>
      <Link
        href="/planner?mode=discovery"
        className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        Otwórz Discovery Planner
      </Link>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
      <h2 className="font-semibold">Nie udało się pobrać ofert</h2>
      <p className="mt-1 text-sm">{message}</p>
    </div>
  );
}
