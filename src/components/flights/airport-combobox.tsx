"use client";

// Wyszukiwarka lotnisk jak na Booking (zadanie 1). Renderuje grupy
// „Miasto — wszystkie lotniska" ORAZ pojedyncze lotniska ze słownika
// (lib/flights/airports). Działa po nazwach PL/EN, kodach IATA i aliasach
// (Chopin, Okęcie, Modlin, Heathrow…). Komponent kontrolowany przez rodzica
// (query + potwierdzony wybór w stanie formularza), wzorem OriginCombobox.

import { useId, useState, type KeyboardEvent } from "react";

import { searchAirports, type AirportOption } from "@/lib/flights/airports";

interface Props {
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (option: AirportOption) => void;
  onClear: () => void;
  error?: string;
  fieldClassName: string;
  labelClassName: string;
  label?: string;
  placeholder?: string;
  inputAriaLabel?: string;
}

function optionKey(o: AirportOption): string {
  return o.kind === "group" ? `g:${o.group.id}` : `a:${o.airport.code}`;
}

export function AirportCombobox({
  query,
  onQueryChange,
  onSelect,
  onClear,
  error,
  fieldClassName,
  labelClassName,
  label = "Skąd",
  placeholder = "Miasto lub lotnisko",
  inputAriaLabel = "Lotnisko wylotu",
}: Props) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  // Bez wpisywania pokazujemy szeroką listę domyślną (cała PL + grupy EU +
  // huby świata) — stąd wyższy limit; po wpisaniu zwężamy do najtrafniejszych.
  const options = searchAirports(query, query.trim() ? 8 : 40);

  const pick = (o: AirportOption) => {
    onSelect(o);
    setOpen(false);
    setHighlight(-1);
  };

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      pick(options[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-1.5">
      <span className={labelClassName}>{label}</span>
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
            aria-label="Wyczyść lotnisko"
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
          aria-label="Lotniska"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
        >
          {options.length > 0 ? (
            options.map((o, idx) => {
              const active = idx === highlight;
              const isGroup = o.kind === "group";
              const title = isGroup ? o.group.label : o.airport.name;
              const sub = isGroup
                ? `${o.group.city}, ${o.group.country}`
                : `${o.airport.city}, ${o.airport.country}`;
              const code = isGroup ? o.group.airportCodes.join(" · ") : o.airport.code;
              return (
                <li
                  key={optionKey(o)}
                  role="option"
                  aria-selected={active}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pick(o);
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 transition ${
                    active ? "bg-emerald-50" : "hover:bg-emerald-50/60"
                  }`}
                >
                  <span aria-hidden className="shrink-0 text-sm text-emerald-700">
                    {isGroup ? "📍" : "✈"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-emerald-950">{title}</span>
                    <span className="block truncate text-[11px] text-emerald-900/50">{sub}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-medium tabular-nums text-emerald-900/45">{code}</span>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-emerald-900/56">
              Brak lotniska dla „{query}”. Spróbuj miasta lub kodu IATA.
            </li>
          )}
        </ul>
      )}

      {error && (
        <p className="mt-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">{error}</p>
      )}
    </div>
  );
}
