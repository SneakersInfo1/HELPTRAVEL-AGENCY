// Krok 2 „Wybierz lot" — hotel wybrany w kroku 1 (dane w URL), tu dobiera lot.
// LIVE flight-search. Za flagą NEXT_PUBLIC_FEATURE_PACKAGES, noindex, dynamiczne.

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PackageSearchSkeleton } from "../szukaj/_components/package-search-skeleton";
import { FlightResults, type OfferParams } from "./_components/flight-results";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pakiet Lot + Hotel — wybierz lot",
  robots: { index: false, follow: false },
};

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function num(v: string | undefined): number | undefined {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? n : undefined;
}

export default async function PackageOfferPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();

  const sp = await searchParams;
  const destination = one(sp.destination)?.trim();
  const dateFrom = one(sp.dateFrom);
  const dateTo = one(sp.dateTo);
  const hotelId = one(sp.hotelId)?.trim();
  const hotelName = one(sp.hotelName)?.trim();
  const hotelPln = num(one(sp.hotelPln));

  // Brak twardych danych hotelu/kierunku/dat → wejście nie z kroku 1.
  if (!destination || !dateFrom || !dateTo || !hotelId || !hotelName || hotelPln === undefined) {
    notFound();
  }

  const params: OfferParams = {
    destination,
    origin: one(sp.origin)?.trim() || "Warszawa",
    dateFrom,
    dateTo,
    adults: Math.max(1, Math.min(9, num(one(sp.adults)) ?? 2)),
    hotelId,
    hotelName,
    hotelPln,
    nights: Math.max(1, num(one(sp.nights)) ?? 1),
    ...(num(one(sp.stars)) ? { stars: num(one(sp.stars)) } : {}),
    ...(one(sp.board) ? { board: one(sp.board) } : {}),
    ...(one(sp.freeCancel) ? { freeCancel: one(sp.freeCancel) } : {}),
  };

  return (
    <main className="min-h-screen">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
            <PackageSearchSkeleton />
          </div>
        }
      >
        <FlightResults params={params} />
      </Suspense>
    </main>
  );
}
