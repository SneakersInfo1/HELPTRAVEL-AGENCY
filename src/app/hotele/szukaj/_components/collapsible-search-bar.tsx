"use client";

// Sesja C1 FIX 1 — Booking-style sticky bar that defaults to a slim summary
// when valid search params are in the URL ("Warszawa → Berlin · 22-26 maja
// · 2 os." + Edytuj). Click Edytuj → form expands inline. Submit collapses
// back. Wraps MiniPlannerForm so we keep one search component everywhere.

import { CalendarDays, MapPin, Pencil, Users } from "lucide-react";
import { useState } from "react";

import { MiniPlannerForm } from "@/components/home/mini-planner-form";
import { HOTEL_SHELL_BAR } from "@/lib/hotels/layout";
import { localizeCountry } from "@/lib/mvp/i18n-geo";

// SPÓJNOŚĆ BEZ POWTARZANIA KSZTAŁTU (decyzja właściciela, 2026-08-08 — cofa
// poprzednią wersję tego pliku).
//
// Poprzednia sesja ujednoliciła ten pasek z nagłówkiem, nadając mu TEN SAM
// promień 1,2 rem, to samo obramowanie i ten sam półprzezroczysty materiał.
// Właściciel odrzucił ten kierunek wprost: „nie chcę dwóch podobnych
// zaokrąglonych kart". Dwie pływające pastylki jedna nad drugą czytały się jak
// dwa konkurujące nagłówki, a nie jak nagłówek i kontekst wyszukiwania.
//
// Podział ról jest teraz jawny:
//   • nagłówek serwisu — pływająca pastylka (`rounded-[1.2rem]`, mocny cień),
//   • ten pasek — PROSTOKĄTNY pas z kontekstem wyszukiwania.
//
// Spójność niosą wspólne kolory (emerald), typografia, odstępy, obramowania
// i ikony (`MapPin`, `CalendarDays`, `Users`) — NIE wspólny kształt.
//
// Pas idzie od krawędzi do krawędzi i ma promień 0 — mieści się w dopuszczonym
// zakresie 0–8 px i nie da się go pomylić z pływającą kartą. Warstwę zamyka
// jedna hairline'owa krawędź u dołu, a nie cień.
//
// UWAGA na tokeny promienia w globals.css, gdyby ktoś chciał tu dodać
// zaokrąglenie: `--radius-lg` to 1,25 rem = 20 px, więc `rounded-lg` jest
// w tym motywie WIĘKSZE niż `rounded-2xl` (16 px). Nie dobieraj promienia po
// nazwie klasy.
//
// TREŚĆ jest wyrównana do `HOTEL_SHELL_BAR`, czyli do tej samej powłoki co
// wyniki — dzięki temu kierunek i termin stoją w jednej linii pionowej
// z pierwszą kartą hotelu. Wcześniej pasek miał własne `mx-4 sm:mx-6 xl:mx-10`
// na pojemniku pełnej szerokości, co zgadzało się z listą tylko przy 1920 px:
// przy 2400 px (to jest widok przy zoomie 80%) pasek miał 2320 px, a lista
// 1840 px, więc wystawał poza treść o 240 px z każdej strony.
const PASEK = "border-b border-emerald-900/10 bg-white";
const PASEK_WNETRZE = `${HOTEL_SHELL_BAR} py-2.5`;

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
      <div className={PASEK}>
        <div className={PASEK_WNETRZE}>
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
      </div>
    );
  }

  return (
    <div className={PASEK}>
      <div className={`${PASEK_WNETRZE} flex items-center gap-3`}>
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
    </div>
  );
}
