"use client";

// Lista wyników pakietów z FILTRAMI + sortowaniem (klient — oferty już pobrane
// serwerowo; filtr/sort po pobranym zbiorze, natychmiast, bez re-fetchu §8).
// Filtry §4 krok 1: bezpośredni lot, śniadanie w cenie, gwiazdki. Sort:
// Polecane / Cena / Ocena. Badge „Najtańszy" trzyma się realnie najtańszej
// WIDOCZNEJ oferty.

import { useMemo, useState, type ReactNode } from "react";

import { buildOfferHref, type OfferHrefContext } from "../href";
import type { PackageOffer } from "../types";
import { PackageCard } from "./PackageCard";

type Sort = "recommended" | "price" | "rating";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recommended", label: "Polecane" },
  { key: "price", label: "Cena za osobę" },
  { key: "rating", label: "Ocena hotelu" },
];

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-emerald-600 bg-emerald-600 text-white"
          : "border-emerald-900/15 bg-white text-neutral-700 hover:border-emerald-300"
      }`}
    >
      {children}
    </button>
  );
}

export function PackageResultsList({
  offers,
  originLabel,
  destinationCity,
  destinationCountry,
  hrefContext,
}: {
  offers: PackageOffer[];
  originLabel: string;
  destinationCity: string;
  destinationCountry?: string;
  hrefContext?: OfferHrefContext;
}) {
  const [sort, setSort] = useState<Sort>("recommended");
  const [directOnly, setDirectOnly] = useState(false);
  const [breakfastOnly, setBreakfastOnly] = useState(false);
  const [minStars, setMinStars] = useState(0);

  const anyFilter = directOnly || breakfastOnly || minStars > 0;
  const clearFilters = () => {
    setDirectOnly(false);
    setBreakfastOnly(false);
    setMinStars(0);
  };

  const filtered = useMemo(
    () =>
      offers.filter((o) => {
        if (directOnly && !o.flight.direct) return false;
        if (minStars > 0 && (o.hotel.stars ?? 0) < minStars) return false;
        if (breakfastOnly && !(o.hotel.boardName && /niadan/i.test(o.hotel.boardName))) return false;
        return true;
      }),
    [offers, directOnly, breakfastOnly, minStars],
  );

  const cheapestId = useMemo(() => {
    let id: string | null = null;
    let min = Infinity;
    for (const o of filtered) {
      if (o.pricing.pricePerPerson.amount < min) {
        min = o.pricing.pricePerPerson.amount;
        id = o.hotel.hotelId;
      }
    }
    return id;
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "price") arr.sort((a, b) => a.pricing.pricePerPerson.amount - b.pricing.pricePerPerson.amount);
    else if (sort === "rating") arr.sort((a, b) => (b.hotel.rating ?? 0) - (a.hotel.rating ?? 0));
    return arr; // recommended = kolejność z searchu
  }, [filtered, sort]);

  return (
    <div>
      {/* Filtry */}
      <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1">
        <FilterChip active={directOnly} onClick={() => setDirectOnly((v) => !v)}>
          ✈ Bezpośredni lot
        </FilterChip>
        <FilterChip active={breakfastOnly} onClick={() => setBreakfastOnly((v) => !v)}>
          🍽 Śniadanie w cenie
        </FilterChip>
        <span aria-hidden className="h-5 w-px shrink-0 bg-neutral-200" />
        {[3, 4, 5].map((s) => (
          <FilterChip key={s} active={minStars === s} onClick={() => setMinStars((v) => (v === s ? 0 : s))}>
            {s === 5 ? "5★" : `${s}+ ★`}
          </FilterChip>
        ))}
      </div>

      {/* Sort + licznik */}
      <div className="mb-4 flex items-center gap-2 overflow-x-auto">
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
        <span className="ml-auto shrink-0 text-xs text-neutral-500">
          {anyFilter ? `${filtered.length} z ${offers.length}` : `${offers.length} pakietów`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-emerald-900/10 bg-white p-8 text-center">
          <p className="text-base font-semibold text-neutral-900">Żaden pakiet nie pasuje do filtrów</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 inline-flex h-9 items-center rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Wyczyść filtry
          </button>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {sorted.map((offer, i) => (
            <li key={offer.hotel.hotelId} className="animate-rise-card" style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}>
              <PackageCard
                offer={offer}
                originLabel={originLabel}
                destinationCity={destinationCity}
                destinationCountry={destinationCountry}
                href={hrefContext ? buildOfferHref(hrefContext, offer) : "#"}
                imagePriority={i === 0}
                badges={{ cheapest: offer.hotel.hotelId === cheapestId }}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
