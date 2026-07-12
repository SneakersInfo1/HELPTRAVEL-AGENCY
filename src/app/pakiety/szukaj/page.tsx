// Interaktywne wyszukiwanie pakietów (krok 1 „Wybierz pobyt") — LIVE.
// Wejście: query z formularza (tab „Lot+Hotel") albo z CTA landingu. Odpala
// żywy searchPackages (loty + hotele). Za flagą NEXT_PUBLIC_FEATURE_PACKAGES,
// noindex (krok flow, §6). Renderowanie dynamiczne (żywe ceny, nie ISR).

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { localizeCity } from "@/lib/mvp/i18n-geo";
import type { PackageSearchParams } from "@/modules/packages/types";

import { PackageResults } from "./_components/package-results";
import { PackageSearchSkeleton } from "./_components/package-search-skeleton";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pakiety Lot + Hotel — wyniki",
  robots: { index: false, follow: false },
};

type SP = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function clampInt(v: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const CABINS = new Set(["economy", "premium_economy", "business", "first"]);
function parseCabin(v: string | undefined): PackageSearchParams["cabinClass"] {
  return v && CABINS.has(v) ? (v as PackageSearchParams["cabinClass"]) : "economy";
}

/** Wieki dzieci z „5,8" → [5,8]; puste/nieparsowalne → []. */
function parseChildren(v: string | undefined): number[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n >= 0 && n < 18);
}

/**
 * Rozkład na pokoje do searcha hoteli. UWAGA (incydent guests 2026-07-10):
 * loty liczą PŁASKO (buildFlightSearchInput sumuje adults), a hotele per pokój.
 * Rozdzielamy dorosłych możliwie równo; dzieci do 1. pokoju (MVP — pełna
 * dystrybucja multi-room później).
 */
function buildOccupancies(adults: number, children: number[], rooms: number): PackageSearchParams["occupancies"] {
  const r = Math.max(1, Math.min(rooms, adults));
  const base = Math.floor(adults / r);
  const extra = adults % r;
  const occ = Array.from({ length: r }, (_, i) => ({ adults: base + (i < extra ? 1 : 0), children: [] as number[] }));
  if (children.length) occ[0].children = children;
  return occ;
}

function originGenitive(origin: string): string {
  return origin.trim().toLowerCase() === "warszawa" ? "Warszawy" : origin;
}

export default async function PackageSearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") notFound();

  const sp = await searchParams;
  const destination = one(sp.destination)?.trim();
  const origin = one(sp.origin)?.trim() || "Warszawa";
  const dateFrom = one(sp.dateFrom) ?? one(sp.checkin);
  const dateTo = one(sp.dateTo) ?? one(sp.checkout);
  const adults = clampInt(one(sp.adults), 1, 9, 2);
  const rooms = clampInt(one(sp.rooms), 1, 5, 1);
  const children = parseChildren(one(sp.children));
  const cabinClass = parseCabin(one(sp.cabinClass));

  // Brak kierunku/dat → nie ma czego szukać (do route wchodzi się z formularza).
  if (!destination || !dateFrom || !dateTo) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
          <h1 className="text-xl font-bold text-neutral-900">Wybierz kierunek i termin</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600">
            Zacznij od wyszukiwarki na stronie głównej — dobierzemy lot i hotel w jednej cenie.
          </p>
        </div>
      </main>
    );
  }

  const params: PackageSearchParams = {
    origin,
    destinationId: destination,
    dateFrom,
    dateTo,
    occupancies: buildOccupancies(adults, children, rooms),
    cabinClass,
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
        <PackageResults
          params={params}
          originLabel={originGenitive(origin)}
          destinationCity={localizeCity(destination)}
        />
      </Suspense>
    </main>
  );
}
