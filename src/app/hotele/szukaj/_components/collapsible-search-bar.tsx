"use client";

// Sesja C1 FIX 1 — Booking-style sticky bar that defaults to a slim summary
// when valid search params are in the URL ("Warszawa → Berlin · 22-26 maja
// · 2 os." + Edytuj). Click Edytuj → form expands inline. Submit collapses
// back. Wraps MiniPlannerForm so we keep one search component everywhere.

import { CalendarDays, MapPin, Pencil, Users } from "lucide-react";
import { useState } from "react";

import { MiniPlannerForm } from "@/components/home/mini-planner-form";
import { localizeCountry } from "@/lib/mvp/i18n-geo";

// JEDEN JĘZYK Z NAGŁÓWKIEM (zgłoszenie 2026-08-08: „dwa paski na górze, jeden
// zaokrąglony, drugi kanciasty — nie tworzą spójnego systemu").
//
// Nagłówek serwisu na trasach hotelowych jest pływającą pastylką:
// `mx-4 sm:mx-6 xl:mx-10`, `rounded-[1.2rem]`, obramowanie `emerald-900/15`,
// półprzezroczyste tło z rozmyciem. Ten pasek był jego przeciwieństwem —
// prostokątem na całą szerokość z krawędzią u dołu — więc dwie warstwy nad
// treścią wyglądały jak elementy z dwóch różnych serwisów.
//
// Teraz to ta sama pastylka: identyczne marginesy (czyli krawędzie stoją
// w JEDNEJ linii pionowej), ten sam promień i to samo obramowanie. Różni je
// wyłącznie WYSOKOŚĆ CIENIA — nagłówek unosi się nad całą stroną, ten pasek
// przylega pod nim jako druga warstwa tej samej płaszczyzny.
const PASTYLKA =
  "mx-4 rounded-[1.2rem] border border-emerald-900/15 bg-surface-raised/90 px-4 py-2.5 shadow-[0_6px_20px_rgba(16,84,48,0.08)] backdrop-blur-md sm:mx-6 sm:px-5 xl:mx-10";

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

  // Pasek pokazuje kierunek, termin i liczbę osób jako TRZY osobne fakty
  // z własnymi ikonami, a nie jeden sklejony ciąg „A · B · C". Sklejony ciąg
  // był na telefonie ucinany w losowym miejscu (zrzut właściciela: „Rhodes ·
  // 15 września – 17 wrześni…"), więc gość tracił akurat liczbę osób.
  const dateRange = formatRange(initial.startDate, initial.endDate);

  if (expanded) {
    return (
      <div className={PASTYLKA}>
        <MiniPlannerForm compact initial={initial} />
        {valid && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex min-h-11 items-center rounded-full px-3 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800"
            >
              Anuluj edycję
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`${PASTYLKA} flex items-center gap-3`}>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <MapPin aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" />
          <span className="truncate text-sm font-bold text-emerald-950 sm:text-base">
            {initial.destination || "Wybierz kierunek"}
          </span>
          {initial.destinationCountry && (
            <span className="hidden truncate text-sm text-emerald-900/70 sm:inline">
              · {localizeCountry(initial.destinationCountry)}
            </span>
          )}
        </span>
        {dateRange && (
          <span className="inline-flex items-center gap-1.5 text-sm text-emerald-900/80">
            <span aria-hidden className="text-emerald-900/25">|</span>
            <CalendarDays aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" />
            {dateRange}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-900/80">
          <span aria-hidden className="text-emerald-900/25">|</span>
          <Users aria-hidden className="h-4 w-4 shrink-0 text-emerald-700" />
          {peopleLabel(initial.travelers)}
        </span>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-emerald-700 bg-white px-4 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
        aria-label="Edytuj wyszukiwanie"
      >
        <Pencil aria-hidden className="h-4 w-4" />
        <span className="hidden sm:inline">Edytuj</span>
      </button>
    </div>
  );
}
