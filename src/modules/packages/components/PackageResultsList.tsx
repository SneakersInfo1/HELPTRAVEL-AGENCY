"use client";

// Lista wyników pakietów z FILTRAMI + sortowaniem (klient — oferty już pobrane
// serwerowo; filtr/sort po pobranym zbiorze, natychmiast, bez re-fetchu §8).
// Layout: mobile = filtry-chipy na górze + kolumna kart; desktop (lg) =
// STICKY SIDEBAR filtrów po lewej + szersza kolumna wyników (wzór Booking, żeby
// strona była „pełna i bogata", nie wąska kolumna tonąca w pustce).
// Filtry §4 krok 1: bezpośredni lot, śniadanie, gwiazdki. Sort: Polecane/Cena/Ocena.

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { track } from "@/lib/analytics/track";

import { buildOfferHref, type OfferHrefContext } from "../href";
import type { PackageOffer } from "../types";
import { PackageCard } from "./PackageCard";

type Sort = "recommended" | "price" | "rating";

const SORTS: { key: Sort; label: string }[] = [
  { key: "recommended", label: "Polecane" },
  { key: "price", label: "Cena za osobę" },
  { key: "rating", label: "Ocena hotelu" },
];

function Chip({
  active,
  onClick,
  block,
  children,
}: {
  active: boolean;
  onClick: () => void;
  block?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        block ? "w-full justify-start" : ""
      } ${
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

  useEffect(() => {
    track("package_listing_view", { destination: hrefContext?.destination ?? destinationCity, available_count: offers.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    return arr;
  }, [filtered, sort]);

  const starChips = (block?: boolean) =>
    [3, 4, 5].map((s) => (
      <Chip key={s} active={minStars === s} onClick={() => setMinStars((v) => (v === s ? 0 : s))} block={block}>
        {s === 5 ? "5★" : `${s}+ ★`}
      </Chip>
    ));

  return (
    <div className="lg:flex lg:gap-6">
      {/* Sidebar filtrów — desktop */}
      <aside className="hidden lg:block lg:w-60 lg:shrink-0">
        <div className="sticky top-24 rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_4px_16px_rgba(16,84,48,0.06)]">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-neutral-900">Filtry</span>
            {anyFilter && (
              <button type="button" onClick={clearFilters} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
                Wyczyść
              </button>
            )}
          </div>
          <div className="mt-3 space-y-4">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Lot</div>
              <Chip active={directOnly} onClick={() => setDirectOnly((v) => !v)} block>
                ✈ Tylko bezpośrednie
              </Chip>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Wyżywienie</div>
              <Chip active={breakfastOnly} onClick={() => setBreakfastOnly((v) => !v)} block>
                🍽 Śniadanie w cenie
              </Chip>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Gwiazdki</div>
              <div className="flex gap-1.5">{starChips()}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Kolumna wyników */}
      <div className="min-w-0 lg:flex-1">
        {/* Filtry — mobile (chipy) */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          <Chip active={directOnly} onClick={() => setDirectOnly((v) => !v)}>
            ✈ Bezpośredni lot
          </Chip>
          <Chip active={breakfastOnly} onClick={() => setBreakfastOnly((v) => !v)}>
            🍽 Śniadanie
          </Chip>
          <span aria-hidden className="h-5 w-px shrink-0 bg-neutral-200" />
          {starChips()}
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
              <li
                key={offer.hotel.hotelId}
                className="animate-rise-card"
                style={{ animationDelay: `${Math.min(i, 6) * 45}ms` }}
                onClick={() =>
                  track("package_hotel_select", {
                    hotel_id: offer.hotel.hotelId,
                    destination: hrefContext?.destination ?? destinationCity,
                    position: i + 1,
                    price_per_person: offer.pricing.pricePerPerson.amount,
                  })
                }
              >
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
    </div>
  );
}
