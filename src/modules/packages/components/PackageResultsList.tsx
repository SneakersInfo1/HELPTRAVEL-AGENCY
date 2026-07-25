"use client";

// Lista wyników pakietów — filtry klasy pełnoprawnego OTA, wyłącznie na
// REALNYCH danych (cena/os., ocena gości, gwiazdki, wyżywienie z boardName,
// liczbowe dystanse z współrzędnych, lot bezpośredni). Logika filtrów w
// services/listingFilters (czysta, testowana) — tu tylko stan i render.
//
// Desktop (lg): sticky sidebar sekcyjny z licznikami + suwak ceny.
// Mobile: szybkie chipy + „Wszystkie filtry" → bottom-sheet z CTA
// „Pokaż N pakietów" (wzór dużych OTA; 90% ruchu to telefon).

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { track } from "@/lib/analytics/track";

import { buildOfferHref, type OfferHrefContext } from "../href";
import {
  BOARD_LABELS,
  EMPTY_FILTERS,
  NEAR_BEACH_KM,
  applyFilters,
  computeFacets,
  countActiveFilters,
  sortOffersForListing,
  type BoardGroup,
  type ListingFilters,
  type ListingSort,
} from "../services/listingFilters";
import type { PackageOffer } from "../types";
import { PackageCard } from "./PackageCard";

const RATING_LABELS: Record<7 | 8 | 9, string> = { 7: "Dobry", 8: "Bardzo dobry", 9: "Znakomity" };

function fmtZl(n: number): string {
  return `${n.toLocaleString("pl-PL")} zł`;
}

/* ── Klocki panelu ─────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-neutral-100 pt-3 first:border-t-0 first:pt-0">
      <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{title}</legend>
      <div className="flex flex-col">{children}</div>
    </fieldset>
  );
}

/** Wiersz-opcja (checkbox/radio) z licznikiem — pełna szerokość, duży hit-area. */
function OptionRow({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count?: number;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="group -mx-1.5 flex items-center gap-2.5 rounded-lg px-1.5 py-[7px] text-left text-[13px] transition-colors hover:bg-emerald-50/60"
    >
      <span
        aria-hidden
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors ${
          active ? "border-emerald-600 bg-emerald-600" : "border-neutral-300 bg-white group-hover:border-emerald-400"
        }`}
      >
        {active && (
          <svg viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        )}
      </span>
      <span className={`min-w-0 flex-1 truncate ${active ? "font-semibold text-neutral-900" : "text-neutral-700"}`}>
        {children}
      </span>
      {count !== undefined && <span className="shrink-0 text-xs tabular-nums text-neutral-400">{count}</span>}
    </button>
  );
}

/** Podwójny suwak zakresu ceny (dwa natywne range'y nałożone na jeden tor). */
function PriceSlider({
  bounds,
  valueMin,
  valueMax,
  onChange,
}: {
  bounds: { min: number; max: number };
  valueMin: number;
  valueMax: number;
  onChange(min: number, max: number): void;
}) {
  const span = Math.max(1, bounds.max - bounds.min);
  const pct = (v: number) => ((v - bounds.min) / span) * 100;
  const thumb =
    "pointer-events-none absolute inset-x-0 top-1/2 h-0 w-full appearance-none bg-transparent outline-none " +
    "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-[18px] [&::-webkit-slider-thumb]:w-[18px] " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 " +
    "[&::-webkit-slider-thumb]:border-emerald-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow " +
    "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-[18px] [&::-moz-range-thumb]:w-[18px] " +
    "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-emerald-600 " +
    "[&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow";

  return (
    <div className="px-1.5 pb-1 pt-2">
      <div className="relative h-[18px]">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-neutral-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-emerald-500"
          style={{ left: `${pct(valueMin)}%`, right: `${100 - pct(valueMax)}%` }}
        />
        <input
          type="range"
          aria-label="Cena minimalna za osobę"
          min={bounds.min}
          max={bounds.max}
          value={valueMin}
          onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax), valueMax)}
          className={thumb}
        />
        <input
          type="range"
          aria-label="Cena maksymalna za osobę"
          min={bounds.min}
          max={bounds.max}
          value={valueMax}
          onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin))}
          className={thumb}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-medium tabular-nums text-neutral-700">
        <span>{fmtZl(valueMin)}</span>
        <span className="text-neutral-400">–</span>
        <span>{fmtZl(valueMax)}</span>
      </div>
    </div>
  );
}

/* ── Panel filtrów (wspólny: sidebar + bottom-sheet) ───────────────────── */

function FilterPanel({
  offers,
  filters,
  setFilters,
}: {
  offers: PackageOffer[];
  filters: ListingFilters;
  setFilters(next: ListingFilters): void;
}) {
  const facets = useMemo(() => computeFacets(offers), [offers]);
  const bounds = facets.price;

  const toggleStar = (s: number) => {
    const stars = new Set(filters.stars);
    if (stars.has(s)) stars.delete(s);
    else stars.add(s);
    setFilters({ ...filters, stars });
  };
  const toggleBoard = (g: BoardGroup) => {
    const boards = new Set(filters.boards);
    if (boards.has(g)) boards.delete(g);
    else boards.add(g);
    setFilters({ ...filters, boards });
  };

  return (
    <div className="flex flex-col gap-4">
      {bounds && bounds.max > bounds.min && (
        <Section title="Cena za osobę">
          <PriceSlider
            bounds={bounds}
            valueMin={filters.priceMin ?? bounds.min}
            valueMax={filters.priceMax ?? bounds.max}
            onChange={(min, max) =>
              setFilters({
                ...filters,
                priceMin: min <= bounds.min ? null : min,
                priceMax: max >= bounds.max ? null : max,
              })
            }
          />
        </Section>
      )}

      <Section title="Ocena gości">
        {([9, 8, 7] as const).map((r) => (
          <OptionRow
            key={r}
            active={filters.minRating === r}
            count={facets.rating[r]}
            onClick={() => setFilters({ ...filters, minRating: filters.minRating === r ? 0 : r })}
          >
            {r}+ · {RATING_LABELS[r]}
          </OptionRow>
        ))}
      </Section>

      {facets.stars.length > 0 && (
        <Section title="Standard hotelu">
          {facets.stars.map(({ value, count }) => (
            <OptionRow key={value} active={filters.stars.has(value)} count={count} onClick={() => toggleStar(value)}>
              <span className="text-amber-500">{"★".repeat(value)}</span>
              <span className="ml-1.5 text-neutral-500">{value} gw.</span>
            </OptionRow>
          ))}
        </Section>
      )}

      {facets.boards.length > 1 && (
        <Section title="Wyżywienie">
          {facets.boards.map(({ group, count }) => (
            <OptionRow key={group} active={filters.boards.has(group)} count={count} onClick={() => toggleBoard(group)}>
              {BOARD_LABELS[group]}
            </OptionRow>
          ))}
        </Section>
      )}

      {facets.hasAnyCenterData && (
        <Section title="Odległość od centrum">
          {([1, 3, 5] as const)
            .filter((km) => facets.center[km] > 0)
            .map((km) => (
              <OptionRow
                key={km}
                active={filters.maxCenterKm === km}
                count={facets.center[km]}
                onClick={() => setFilters({ ...filters, maxCenterKm: filters.maxCenterKm === km ? null : km })}
              >
                do {km} km
              </OptionRow>
            ))}
        </Section>
      )}

      {facets.hasAnyBeachData && facets.nearBeach > 0 && (
        <Section title="Plaża">
          <OptionRow
            active={filters.nearBeach}
            count={facets.nearBeach}
            onClick={() => setFilters({ ...filters, nearBeach: !filters.nearBeach })}
          >
            do {NEAR_BEACH_KM} km od plaży
          </OptionRow>
        </Section>
      )}

      {facets.direct > 0 && facets.direct < offers.length && (
        <Section title="Lot">
          <OptionRow
            active={filters.directOnly}
            count={facets.direct}
            onClick={() => setFilters({ ...filters, directOnly: !filters.directOnly })}
          >
            Tylko bezpośrednie
          </OptionRow>
        </Section>
      )}
    </div>
  );
}

/* ── Komponent główny ──────────────────────────────────────────────────── */

const SORTS: { key: ListingSort; label: string; needsCenter?: boolean }[] = [
  { key: "recommended", label: "Polecane" },
  { key: "price", label: "Cena za osobę" },
  { key: "rating", label: "Ocena hotelu" },
  { key: "center", label: "Najbliżej centrum", needsCenter: true },
];

function QuickChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? "border-emerald-600 bg-emerald-600 text-white" : "border-emerald-900/15 bg-white text-neutral-700"
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
  const [sort, setSort] = useState<ListingSort>("recommended");
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    track("package_listing_view", { destination: hrefContext?.destination ?? destinationCity, available_count: offers.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Blokada scrolla pod otwartym bottom-sheetem.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prev;
    };
  }, [sheetOpen]);

  const facets = useMemo(() => computeFacets(offers), [offers]);
  const activeCount = countActiveFilters(filters);
  const filtered = useMemo(() => applyFilters(offers, filters), [offers, filters]);
  const sorted = useMemo(() => sortOffersForListing(filtered, sort), [filtered, sort]);

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

  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const panelHeader = (
    <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
      <span className="text-sm font-bold text-neutral-900">Filtry{activeCount > 0 ? ` (${activeCount})` : ""}</span>
      {activeCount > 0 && (
        <button type="button" onClick={clearFilters} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800">
          Wyczyść wszystko
        </button>
      )}
    </div>
  );

  return (
    <div className="lg:flex lg:gap-6">
      {/* Sidebar filtrów — desktop */}
      <aside className="hidden lg:block lg:w-64 lg:shrink-0">
        <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_4px_16px_rgba(16,84,48,0.06)]">
          {panelHeader}
          <div className="mt-3">
            <FilterPanel offers={offers} filters={filters} setFilters={setFilters} />
          </div>
        </div>
      </aside>

      {/* Kolumna wyników */}
      <div className="min-w-0 lg:flex-1">
        {/* Mobile: przycisk filtrów + szybkie chipy */}
        <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-600 bg-white px-3 py-1.5 text-xs font-bold text-emerald-700"
          >
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Wszystkie filtry
            {activeCount > 0 && (
              <span className="rounded-full bg-emerald-600 px-1.5 text-[10px] font-bold leading-4 text-white">{activeCount}</span>
            )}
          </button>
          <QuickChip
            active={filters.minRating >= 8}
            onClick={() => setFilters({ ...filters, minRating: filters.minRating >= 8 ? 0 : 8 })}
          >
            Ocena 8+
          </QuickChip>
          <QuickChip
            active={filters.boards.has("breakfast")}
            onClick={() => {
              const boards = new Set(filters.boards);
              if (boards.has("breakfast")) boards.delete("breakfast");
              else boards.add("breakfast");
              setFilters({ ...filters, boards });
            }}
          >
            Śniadanie
          </QuickChip>
          {facets.hasAnyCenterData && (
            <QuickChip
              active={filters.maxCenterKm === 3}
              onClick={() => setFilters({ ...filters, maxCenterKm: filters.maxCenterKm === 3 ? null : 3 })}
            >
              Blisko centrum
            </QuickChip>
          )}
        </div>

        {/* Sort + licznik */}
        <div className="mb-4 flex items-center gap-2 overflow-x-auto">
          <div role="tablist" aria-label="Sortowanie pakietów" className="flex gap-1 rounded-full bg-neutral-100 p-1">
            {SORTS.filter((s) => !s.needsCenter || facets.hasAnyCenterData).map((s) => {
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
            {activeCount > 0 ? `${filtered.length} z ${offers.length}` : `${offers.length} pakietów`}
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

      {/* Bottom-sheet filtrów — mobile */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filtry pakietów">
          <button aria-label="Zamknij filtry" className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col rounded-t-2xl bg-white shadow-[0_-12px_40px_rgba(0,0,0,0.18)]">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              {panelHeader}
              <button
                type="button"
                aria-label="Zamknij"
                onClick={() => setSheetOpen(false)}
                className="-mr-1 ml-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100"
              >
                <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <FilterPanel offers={offers} filters={filters} setFilters={setFilters} />
            </div>
            <div className="border-t border-neutral-100 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="h-11 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
              >
                Pokaż{" "}
                {filtered.length === 1
                  ? "1 pakiet"
                  : `${filtered.length} ${filtered.length >= 2 && filtered.length <= 4 ? "pakiety" : "pakietów"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
