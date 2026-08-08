"use client";

// Sesja C1 FIX 1 — Booking-style sticky bar that defaults to a slim summary
// when valid search params are in the URL ("Warszawa → Berlin · 22-26 maja
// · 2 os." + Edytuj). Click Edytuj → form expands inline. Submit collapses
// back. Wraps MiniPlannerForm so we keep one search component everywhere.

import { useState } from "react";

import { MiniPlannerForm } from "@/components/home/mini-planner-form";
import { HOTEL_SHELL_BAR } from "@/lib/hotels/layout";
import { localizeCountry } from "@/lib/mvp/i18n-geo";

interface Props {
  initial: {
    origin?: string;
    destination?: string;
    destinationCountry?: string;
    /** Zadanie 2 — slug wyspy/regionu; wraca do MiniPlannerForm. */
    regionId?: string;
    startDate?: string;
    endDate?: string;
    /** Total guests (the summed `adults` URL param). */
    travelers?: number;
    /** Children share of the total (informational `kids` param) — lets the
        expanded form restore the Dorośli/Dzieci split. */
    kids?: number;
  };
  // True only when URL has destination + country + valid checkin + checkout.
  // The summary collapses only when there's something meaningful to show.
  valid: boolean;
}

const formatRange = (start?: string, end?: string): string | null => {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`);
  const b = new Date(`${end}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const fmt = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long" });
  return `${fmt.format(a)} – ${fmt.format(b)}`;
};

const peopleLabel = (n?: number): string => {
  const v = n ?? 2;
  if (v === 1) return "1 os.";
  return `${v} os.`;
};

export function CollapsibleSearchBar({ initial, valid }: Props) {
  // Start collapsed when params look meaningful — gives users back the
  // viewport for results, exactly like Booking does after submit.
  const [expanded, setExpanded] = useState(!valid);

  const dateRange = formatRange(initial.startDate, initial.endDate);
  const summary = [
    initial.origin && initial.destination ? `${initial.origin} → ${initial.destination}` : initial.destination,
    dateRange,
    peopleLabel(initial.travelers),
  ]
    .filter(Boolean)
    .join(" · ");

  if (expanded) {
    return (
      <div className="border-b border-emerald-900/10 bg-emerald-700/5 backdrop-blur-md">
        <div className={`${HOTEL_SHELL_BAR} py-3`}>
          <MiniPlannerForm compact initial={initial} />
          {valid && (
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
              >
                Anuluj edycję
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-emerald-900/10 bg-white/95 backdrop-blur-md">
      <div className={`${HOTEL_SHELL_BAR} flex items-center gap-3 py-3`}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-emerald-950 sm:text-base">
            {summary || "Wybierz kierunek i daty"}
          </div>
          {initial.destinationCountry && (
            <div className="text-[11px] text-emerald-900/80">
              {localizeCountry(initial.destinationCountry)}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-emerald-700 bg-white px-4 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50"
          aria-label="Edytuj wyszukiwanie"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          Edytuj
        </button>
      </div>
    </div>
  );
}
