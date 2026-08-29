"use client";

// Pasek edycji nad wynikami lotów (jak na hotelach: CollapsibleSearchBar).
// Domyślnie zwinięty do podsumowania („Warszawa → Barcelona · 10–17 sie ·
// 2 pasażerów" + „Zmień"). Klik „Zmień" → rozwija MiniPlannerForm w trybie
// lotów, wstępnie wypełniony bieżącym wyszukiwaniem. Submit nawiguje na nowe
// /loty/wyniki — użytkownik zmienia kierunek BEZ wracania na homepage.

import { useState } from "react";
import { Pencil } from "lucide-react";

import { MiniPlannerForm } from "@/components/home/mini-planner-form";
import { airportLabel } from "@/lib/flights/airports";
import { FLIGHT_SHELL_BAR } from "@/lib/flights/layout";

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
  const summary = `${originText} → ${destText} · ${fmtRange(depart, ret)} · ${pax} ${pax === 1 ? "podróżny" : "podróżnych"}`;

  if (expanded) {
    return (
      <div className="border-b border-line bg-brand-soft/60 backdrop-blur-md">
        <div className={`${FLIGHT_SHELL_BAR} py-3`}>
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
              className="inline-flex h-9 items-center rounded-sm px-2 text-xs font-medium text-brand transition hover:bg-brand-soft active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              Anuluj edycję
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-line bg-surface-raised/95 backdrop-blur-md">
      <div className={`${FLIGHT_SHELL_BAR} flex items-center gap-3 py-3`}>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold text-ink sm:text-base">
          {summary}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-md border border-brand bg-surface-raised px-4 font-semibold text-brand transition hover:bg-brand-soft active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
          aria-label="Zmień wyszukiwanie lotu"
        >
          <Pencil aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
          <span className="text-xs">Zmień</span>
        </button>
      </div>
    </div>
  );
}
