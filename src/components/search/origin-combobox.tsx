"use client";

// Optional "Skąd" combobox (zadanie 1). Replaces the mandatory <select> with
// a Booking-style searchable field over the SAME static 22-airport list
// (lib/mvp/origin-cities.ts) — filtering is local (no endpoint), matches are
// case- and diacritics-insensitive on the city name AND the IATA code
// ("warszawa", "WAW"). Empty value is a first-class state: the parent simply
// omits `origin` from the results URL and the flights section stays hidden.
//
// Controlled by the parent (query + confirmed value live in the form state),
// mirroring how the existing "Dokąd" combobox is wired in mini-planner-form.

import { useId, useState, type KeyboardEvent } from "react";

import { ALL_ORIGIN_CITIES, type OriginCity } from "@/lib/mvp/origin-cities";

export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
    .trim();
}

export function matchOriginCities(query: string): OriginCity[] {
  const q = foldText(query);
  if (!q) return [...ALL_ORIGIN_CITIES];
  return ALL_ORIGIN_CITIES.filter(
    (c) => foldText(c.city).includes(q) || c.iata.toLowerCase().startsWith(q),
  );
}

/** Exact single match for submit-time auto-confirm ("krakow" → Kraków). */
export function exactOriginMatch(query: string): OriginCity | null {
  const q = foldText(query);
  if (!q) return null;
  const exact = ALL_ORIGIN_CITIES.find(
    (c) => foldText(c.city) === q || c.iata.toLowerCase() === q,
  );
  if (exact) return exact;
  const hits = matchOriginCities(query);
  return hits.length === 1 ? hits[0] : null;
}

interface Props {
  /** Visible input text (parent state, like destQuery for "Dokąd"). */
  query: string;
  onQueryChange: (value: string) => void;
  /** User picked a city from the list (confirmed value). */
  onSelect: (city: OriginCity) => void;
  /** X button / emptied input — origin becomes "none". */
  onClear: () => void;
  error?: string;
  fieldClassName: string;
  labelClassName: string;
  /** Placeholder pola — domyślnie wariant hotelowy „(opcjonalnie)". W trybie
   *  lotów przekazujemy wariant „wymagane" (Faza 2). */
  placeholder?: string;
  /** aria-label inputu — analogicznie do placeholdera. */
  inputAriaLabel?: string;
}

export function OriginCombobox({
  query,
  onQueryChange,
  onSelect,
  onClear,
  error,
  fieldClassName,
  labelClassName,
  placeholder = "Skąd? (opcjonalnie)",
  inputAriaLabel = "Skąd (opcjonalnie)",
}: Props) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const hits = matchOriginCities(query);
  const polishHits = hits.filter((c) => c.region === "PL");
  const europeanHits = hits.filter((c) => c.region === "EU");
  // Flat list in render order — keyboard navigation indexes into this.
  const flat = [...polishHits, ...europeanHits];

  const pick = (city: OriginCity) => {
    onSelect(city);
    setOpen(false);
    setHighlight(-1);
  };

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      pick(flat[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const renderGroup = (label: string, cities: OriginCity[], offset: number) =>
    cities.length > 0 && (
      <li role="presentation">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-900/45">
          {label}
        </p>
        <ul role="group" aria-label={label}>
          {cities.map((c, i) => {
            const idx = offset + i;
            return (
              <li
                key={c.iata}
                role="option"
                aria-selected={idx === highlight}
                onMouseDown={(event) => {
                  event.preventDefault();
                  pick(c);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className={`flex cursor-pointer items-baseline justify-between gap-2 px-3 py-2 text-sm transition ${
                  idx === highlight ? "bg-emerald-50" : "hover:bg-emerald-50/60"
                }`}
              >
                <span className="font-semibold text-emerald-950">{c.city}</span>
                <span className="text-xs tabular-nums text-emerald-900/45">{c.iata}</span>
              </li>
            );
          })}
        </ul>
      </li>
    );

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className={labelClassName}>Skąd</span>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={inputAriaLabel}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={`${fieldClassName} w-full ${query ? "pr-9" : ""}`}
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            aria-label="Wyczyść miasto wylotu"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-emerald-900/45 transition hover:bg-emerald-50 hover:text-emerald-900"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Lotniska wylotu"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
        >
          {flat.length > 0 ? (
            <>
              {renderGroup("Polska", polishHits, 0)}
              {renderGroup("Europa", europeanHits, polishHits.length)}
            </>
          ) : (
            <li className="px-3 py-2 text-sm text-emerald-900/56">
              Brak lotniska dla „{query}”. Zostaw puste, aby szukać samych hoteli.
            </li>
          )}
        </ul>
      )}

      {error && (
        <p className="mt-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
