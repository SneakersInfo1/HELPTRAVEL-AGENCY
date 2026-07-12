"use client";

// Lista wyników pakietów z sortowaniem (klient — oferty już pobrane serwerowo,
// sort client-side jest natychmiastowy). Polecane (kolejność z searchu, waga
// ceny) / Cena za osobę / Ocena hotelu. Badge „Najtańszy" trzyma się realnie
// najtańszej oferty niezależnie od sortu.

import { useMemo, useState } from "react";

import type { PackageOffer } from "../types";
import { PackageCard } from "./PackageCard";

type Sort = "recommended" | "price" | "rating";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recommended", label: "Polecane" },
  { key: "price", label: "Cena za osobę" },
  { key: "rating", label: "Ocena hotelu" },
];

export function PackageResultsList({
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
  hrefForOffer?: (offer: PackageOffer) => string;
}) {
  const [sort, setSort] = useState<Sort>("recommended");

  const cheapestId = useMemo(() => {
    let id: string | null = null;
    let min = Infinity;
    for (const o of offers) {
      if (o.pricing.pricePerPerson.amount < min) {
        min = o.pricing.pricePerPerson.amount;
        id = o.hotel.hotelId;
      }
    }
    return id;
  }, [offers]);

  const sorted = useMemo(() => {
    const arr = [...offers];
    if (sort === "price") arr.sort((a, b) => a.pricing.pricePerPerson.amount - b.pricing.pricePerPerson.amount);
    else if (sort === "rating") arr.sort((a, b) => (b.hotel.rating ?? 0) - (a.hotel.rating ?? 0));
    return arr; // recommended = kolejność z searchu
  }, [offers, sort]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
        <span className="shrink-0 text-xs font-medium text-neutral-500">Sortuj:</span>
        <div role="tablist" aria-label="Sortowanie pakietów" className="flex gap-1 rounded-full bg-neutral-100 p-1">
          {SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <button
                key={s.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSort(s.key)}
                className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  active ? "bg-white text-emerald-800 shadow-sm" : "text-neutral-600 hover:text-neutral-900"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <ol className="flex flex-col gap-4">
        {sorted.map((offer, i) => (
          <li
            key={offer.hotel.hotelId}
            className="animate-rise-card"
            style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
          >
            <PackageCard
              offer={offer}
              originLabel={originLabel}
              destinationCity={destinationCity}
              destinationCountry={destinationCountry}
              href={hrefForOffer?.(offer) ?? "#"}
              imagePriority={i === 0}
              badges={{ cheapest: offer.hotel.hotelId === cheapestId }}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}
