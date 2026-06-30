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
  // Czy użytkownik COKOLWIEK wpisał od ostatniego wejścia w pole. Gdy `false`
  // (świeży fokus — także na polu z już potwierdzonym lotniskiem) pokazujemy
  // PEŁNĄ listę domyślną zamiast filtrować po nazwie potwierdzonego wyboru.
  // Bez tego klik w pole „Lotnisko Chopina (WAW)" filtrował po tym tekście →
  // 0 trafień → komunikat „Brak lotniska dla…" zamiast listy do zmiany.
  const [typed, setTyped] = useState(false);

  // Dopóki user nie zacznie pisać, traktujemy pole jak puste → lista domyślna
  // („Polska — dowolne lotnisko" + cała PL + grupy EU + popularne huby).
  const term = typed ? query : "";
  const options = searchAirports(term, term.trim() ? 8 : 40);

  const pick = (o: AirportOption) => {
    onSelect(o);
    setOpen(false);
    setHighlight(-1);
    setTyped(false);
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
            setTyped(true);
            onQueryChange(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            // Wejście w pole = pokaż pełną listę (nie filtruj po potwierdzonym
            // wyborze) i zaznacz tekst, żeby pierwszy znak go zastąpił.
            setOpen(true);
            setTyped(false);
            e.currentTarget.select();
          }}
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
          // Szerokość = szerokość pola (left-0 right-0), jak lista „Dokąd" —
          // nie wystaje poza kartę na telefonie. Nazwy mieszczą się bo rząd jest
          // teraz prosty (nazwa + miasto/kraj), bez szerokiego badge'a z kodami.
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-80 overflow-y-auto rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
        >
          {options.length > 0 ? (
            options.map((o, idx) => {
              const active = idx === highlight;
              const isGroup = o.kind === "group";
              const title = isGroup ? o.group.label : o.airport.name;
              // Bez kodów IATA (prośba właściciela) — sam opis lokalizacji.
              // Grupa „Polska" (city===country) dostaje czytelniejszy podpis.
              const sub = isGroup
                ? (o.group.city === o.group.country ? "Wszystkie polskie lotniska" : o.group.country)
                : `${o.airport.city}, ${o.airport.country}`;
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
                  className={`cursor-pointer px-3.5 py-2.5 transition ${
                    active ? "bg-emerald-50" : "hover:bg-emerald-50/60"
                  }`}
                >
                  {/* Prosty, profesjonalny rząd jak na „Dokąd": nazwa + opis,
                      bez skrótów lotnisk i bez ucinania (długie nazwy zawijają). */}
                  <div className="text-sm font-semibold text-emerald-950">{title}</div>
                  <div className="text-[11px] text-emerald-900/55">{sub}</div>
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
