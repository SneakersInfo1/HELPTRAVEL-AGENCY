// Listing pakietów (krok 1 „Wybierz pobyt"). Server component. Nagłówek z
// kontekstem wyszukiwania + pionowy stos kart (mobile-first — 90% ruchu to
// telefon). Filtry/sort dochodzą osobno (krok 1.1). Cena „od" liczona z ofert
// (najtańszy pakiet), nigdy zmyślona (PRODUCT.md: uczciwość ponad kompletność).

import { formatPLN } from "@/lib/money";

import type { PackageOffer } from "../types";
import { PackageCard } from "./PackageCard";

function offersLabel(n: number): string {
  if (n === 1) return "1 pakiet";
  if (n < 5) return `${n} pakiety`;
  return `${n} pakietów`;
}

export function PackageListing({
  offers,
  originLabel,
  destinationCity,
  destinationCountry,
  hrefForOffer,
}: {
  offers: PackageOffer[];
  originLabel: string;
  destinationCity: string;
  destinationCountry?: string;
  /** Link karty → krok 2 „Wybierz lot". Domyślnie „#" (podgląd). */
  hrefForOffer?: (offer: PackageOffer) => string;
}) {
  const fromPrice = offers.length
    ? formatPLN(Math.min(...offers.map((o) => o.pricing.pricePerPerson.amount)), "PLN")
    : null;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-xl font-bold tracking-tight text-neutral-900 sm:text-2xl">
          Lot + hotel: {destinationCity}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-600">
          <span>{offersLabel(offers.length)} z przelotem z {originLabel}</span>
          {fromPrice && (
            <>
              <span aria-hidden className="text-neutral-300">|</span>
              <span className="font-medium text-emerald-700">od {fromPrice} / os.</span>
            </>
          )}
        </p>
      </header>

      {offers.length === 0 ? (
        <div className="rounded-2xl border border-emerald-900/10 bg-white p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">Brak pakietów dla tych dat</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-neutral-600">
            Spróbuj innego terminu albo pobliskiego lotniska — pokazujemy tylko hotele z bezpłatną
            anulacją i realnym lotem w cenie.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {offers.map((offer, i) => (
            <li key={offer.hotel.hotelId} className="animate-rise-card" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
              <PackageCard
                offer={offer}
                originLabel={originLabel}
                destinationCity={destinationCity}
                destinationCountry={destinationCountry}
                href={hrefForOffer?.(offer) ?? "#"}
                imagePriority={i === 0}
                badges={{ cheapest: i === 0 }}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
