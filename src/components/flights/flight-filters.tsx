"use client";

// Panel filtrów lotów jak na Booking (zadanie 2). Czysto prezentacyjny —
// kontrolowany przez rodzica (facets + filters + onChange). Renderuje TYLKO te
// sekcje, które da się zastosować na danych (data-driven faceting). Używany w
// sidebarze (desktop) i w drawerze (mobile) — ten sam komponent.

import { fmtDuration } from "@/lib/flights/display";
import { formatFlightPrice } from "@/lib/flights/money";
import { lookupAirport } from "@/lib/flights/airports";
import { AirlineLogo } from "@/components/flights/airline-logo";
import {
  TIME_BUCKETS,
  hasActiveFilters,
  type Facets,
  type FlightFilters,
  type BaggageKey,
  type StopBucket,
  type TimeBucket,
} from "@/lib/flights/filters";

const STOP_LABEL: Record<StopBucket, string> = {
  0: "Bezpośrednie",
  1: "1 przesiadka",
  2: "2+ przesiadki",
};

interface Props {
  facets: Facets;
  filters: FlightFilters;
  onChange: (next: FlightFilters) => void;
  onClear: () => void;
  /** Arkusz mobilny ma własny nagłówek z przyciskiem zamknięcia — bez tego
   *  słowo „Filtry" pojawiało się dwa razy jedno pod drugim. */
  hideHeading?: boolean;
}

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{title}</h3>
      <div className="mt-2.5 space-y-2">{children}</div>
    </div>
  );
}

function Check({ checked, onChange, label, count, icon }: { checked: boolean; onChange: () => void; label: string; count?: number; icon?: React.ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 shrink-0 rounded border-line text-brand focus:ring-brand"
      />
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {typeof count === "number" && <span className="text-xs tabular-nums text-ink-muted">{count}</span>}
    </label>
  );
}

export function FlightFiltersPanel({ facets, filters, onChange, onClear, hideHeading = false }: Props) {
  const set = (patch: Partial<FlightFilters>) => onChange({ ...filters, ...patch });
  const showAirlines = facets.airlines.length > 1;
  const showOriginAirports = facets.originAirports.length > 1;
  const showPrice = facets.priceMax > facets.priceMin;
  const showDuration = facets.durationMax > facets.durationMin;
  const showBaggage = facets.carryCount > 0 || facets.checkedCount > 0;

  return (
    <div className="text-sm">
      {(!hideHeading || hasActiveFilters(filters)) && (
        <div className="flex items-center justify-between pb-3">
          {hideHeading ? <span /> : <h2 className="text-sm font-bold text-ink">Filtry</h2>}
          {hasActiveFilters(filters) && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center rounded-sm px-2 text-xs font-semibold text-brand transition hover:bg-brand-soft active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Wyczyść wszystko
            </button>
          )}
        </div>
      )}

      {/* Przesiadki */}
      {facets.stops.length > 0 && (
        <Section title="Przesiadki">
          {facets.stops.map((s) => (
            <Check
              key={s.value}
              checked={filters.stops.includes(s.value)}
              onChange={() => set({ stops: toggle(filters.stops, s.value) })}
              label={STOP_LABEL[s.value]}
              count={s.count}
            />
          ))}
        </Section>
      )}

      {/* Cena */}
      {showPrice && (
        <Section title="Cena maksymalna">
          <input
            type="range"
            min={facets.priceMin}
            max={facets.priceMax}
            step={10}
            value={filters.maxPrice ?? facets.priceMax}
            onChange={(e) => set({ maxPrice: Number(e.target.value) >= facets.priceMax ? null : Number(e.target.value) })}
            className="w-full accent-[var(--brand)]"
            aria-label="Cena maksymalna"
          />
          <p className="text-xs text-ink-muted">
            do <span className="font-semibold text-ink">{formatFlightPrice(filters.maxPrice ?? facets.priceMax, "PLN")}</span>
          </p>
        </Section>
      )}

      {/* Linie lotnicze */}
      {showAirlines && (
        <Section title="Linie lotnicze">
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {facets.airlines.map((a) => (
              <Check
                key={a.code}
                checked={filters.airlines.includes(a.code)}
                onChange={() => set({ airlines: toggle(filters.airlines, a.code) })}
                label={a.name}
                count={a.count}
                icon={<AirlineLogo logoUrl={a.logoUrl} code={a.code} name={a.name} size={18} />}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Godzina wylotu */}
      {facets.departBuckets.length > 0 && (
        <Section title="Godzina wylotu">
          {facets.departBuckets.map((b) => {
            const meta = TIME_BUCKETS.find((t) => t.key === b.key)!;
            return (
              <Check
                key={b.key}
                checked={filters.departBuckets.includes(b.key as TimeBucket)}
                onChange={() => set({ departBuckets: toggle(filters.departBuckets, b.key) })}
                label={`${meta.label} (${meta.range})`}
                count={b.count}
              />
            );
          })}
        </Section>
      )}

      {/* Czas podróży */}
      {showDuration && (
        <Section title="Maks. czas podróży">
          <input
            type="range"
            min={facets.durationMin}
            max={facets.durationMax}
            step={15}
            value={filters.maxDuration ?? facets.durationMax}
            onChange={(e) => set({ maxDuration: Number(e.target.value) >= facets.durationMax ? null : Number(e.target.value) })}
            className="w-full accent-[var(--brand)]"
            aria-label="Maksymalny czas podróży"
          />
          <p className="text-xs text-ink-muted">
            do <span className="font-semibold text-ink">{fmtDuration(filters.maxDuration ?? facets.durationMax)}</span>
          </p>
        </Section>
      )}

      {/* Lotniska wylotu (tylko przy „wszystkie lotniska") */}
      {showOriginAirports && (
        <Section title="Lotnisko wylotu">
          {facets.originAirports.map((a) => (
            <Check
              key={a.code}
              checked={filters.originAirports.includes(a.code)}
              onChange={() => set({ originAirports: toggle(filters.originAirports, a.code) })}
              label={`${lookupAirport(a.code)?.name ?? a.code} (${a.code})`}
              count={a.count}
            />
          ))}
        </Section>
      )}

      {/* Bagaż */}
      {showBaggage && (
        <Section title="Bagaż">
          {facets.carryCount > 0 && (
            <Check
              checked={filters.baggage.includes("carry")}
              onChange={() => set({ baggage: toggle<BaggageKey>(filters.baggage, "carry") })}
              label="Bagaż podręczny"
              count={facets.carryCount}
            />
          )}
          {facets.checkedCount > 0 && (
            <Check
              checked={filters.baggage.includes("checked")}
              onChange={() => set({ baggage: toggle<BaggageKey>(filters.baggage, "checked") })}
              label="Bagaż rejestrowany"
              count={facets.checkedCount}
            />
          )}
        </Section>
      )}
    </div>
  );
}
