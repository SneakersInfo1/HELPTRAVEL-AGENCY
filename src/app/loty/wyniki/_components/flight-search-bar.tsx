"use client";

// Pasek edycji nad wynikami lotów (jak na hotelach: CollapsibleSearchBar).
// Domyślnie zwinięty do podsumowania („Warszawa → Barcelona · 10–17 sie ·
// 2 pasażerów" + „Zmień"). Klik „Zmień" → rozwija MiniPlannerForm w trybie
// lotów, wstępnie wypełniony bieżącym wyszukiwaniem. Submit nawiguje na nowe
// /loty/wyniki — użytkownik zmienia kierunek BEZ wracania na homepage.

import { useState } from "react";

import { MiniPlannerForm } from "@/components/home/mini-planner-form";
import { airportLabel } from "@/lib/flights/airports";

interface Props {
  origins: string[];
  originLabel?: string;
  /** IATA celu. */
  destination: string;
  /** Nazwa miasta celu (z URL `destLabel`); fallback do IATA. */
  destLabel?: string;
  depart: string;
  ret?: string;
  adults: number;
  childrenCount: number;
  infants: number;
}

function fmtRange(start: string, end?: string): string {
  const f = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short" });
  const a = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(a.getTime())) return "";
  if (!end) return `${f.format(a)} · w jedną stronę`;
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(b.getTime())) return f.format(a);
  return `${f.format(a)} – ${f.format(b)}`;
}

export function FlightSearchBar({
  origins,
  originLabel,
  destination,
  destLabel,
  depart,
  ret,
  adults,
  childrenCount,
  infants,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const originText = originLabel || airportLabel(origins[0] ?? "");
  const destText = destLabel || destination;
  const pax = adults + childrenCount + infants;
  const summary = `${originText} → ${destText} · ${fmtRange(depart, ret)} · ${pax} ${pax === 1 ? "pasażer" : "pasażerów"}`;

  if (expanded) {
    return (
      <div className="border-b border-emerald-900/10 bg-emerald-700/5 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <MiniPlannerForm
            compact
            mode="flights"
            initial={{
              originCodes: origins,
              originLabel,
              originInput: originText,
              destination: destText,
              destIata: destination,
              startDate: depart,
              endDate: ret,
              travelers: adults + childrenCount,
              kids: childrenCount,
              infants,
              oneWay: !ret,
            }}
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Anuluj edycję
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-emerald-900/10 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-emerald-950 sm:text-base">
          {summary}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-700 bg-white px-4 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
          aria-label="Zmień wyszukiwanie lotu"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Zmień
        </button>
      </div>
    </div>
  );
}
