"use client";

// Single date-range field (zadanie 1) replacing the two native date inputs.
// Desktop (≥1024px): WYŚRODKOWANY dialog (fixed, portal do <body>) z DWOMA
// miesiącami obok siebie. Mobile: NIEMODALNY bottom-sheet (portal do <body>)
// z jednym miesiącem + strzałki i stopką "Wyczyść / zakres / Gotowe" — strona
// pod spodem dalej się przewija (prośba właściciela 2026-07-11).
// Field shows the Booking-style label "śr. 17 cze – sob. 20 cze".
// URL contract unchanged: parent keeps checkin/checkout as YYYY-MM-DD strings.
//
// DLACZEGO portal + fixed, a nie absolute przy polu: formularz wyszukiwarki ma
// `backdrop-blur-xl`, a backdrop-filter tworzy containing block dla fixed/
// absolute — popover kotwiczony w formularzu potrafił wylądować poza ekranem
// (ucięty kalendarz z góry — zgłoszenie właściciela 2026-07-11). Portal do
// <body> + pozycja względem viewportu = kalendarz zawsze w całości widoczny.

import { format } from "date-fns";
import { pl } from "date-fns/locale";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { RangeValue } from "./range-calendar";

// rdp + date-fns load only when the calendar first opens — keeps the search
// bar's initial JS untouched (homepage LCP path).
const RangeCalendar = dynamic(
  () => import("./range-calendar").then((m) => m.RangeCalendar),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[320px] w-[280px] items-center justify-center text-sm text-emerald-900/50 sm:w-[560px]">
        Ładowanie kalendarza…
      </div>
    ),
  },
);

function isoToDate(iso: string): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function dateToIso(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** "śr. 17 cze" — Booking-style short label (date-fns, locale pl). */
function dayLabel(date: Date): string {
  return format(date, "EEEEEE d MMM", { locale: pl });
}

export function formatRangeLabel(checkin: string, checkout: string): string | null {
  const from = isoToDate(checkin);
  const to = isoToDate(checkout);
  if (!from || !to) return null;
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

interface Props {
  checkin: string; // YYYY-MM-DD | ""
  checkout: string; // YYYY-MM-DD | ""
  onChange: (checkin: string, checkout: string) => void;
  fieldClassName: string;
  labelClassName: string;
  /** Tryb jednej daty (lot w jedną stronę): tylko wylot, jeden klik = gotowe. */
  singleDate?: boolean;
}

export function DateRangeField({
  checkin,
  checkout,
  onChange,
  fieldClassName,
  labelClassName,
  singleDate = false,
}: Props) {
  const [open, setOpen] = useState(false);
  // Desktop vs mobile decided when the picker opens (lg breakpoint, brief).
  const [isDesktop, setIsDesktop] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  const value: RangeValue = { from: isoToDate(checkin), to: isoToDate(checkout) };
  // W trybie jednej daty etykieta to sam wylot; inaczej pełny zakres wylot–powrót.
  const label = singleDate
    ? (value.from ? dayLabel(value.from) : null)
    : (checkin && checkout ? formatRangeLabel(checkin, checkout) : null);
  const placeholderText = singleDate ? "Data wylotu" : "Wylot – Powrót";

  const openPicker = () => {
    setIsDesktop(window.matchMedia("(min-width: 1024px)").matches);
    setOpen(true);
  };

  // Escape zamyka oba warianty (dialog i sheet). Klik poza obsługuje backdrop
  // (desktop); mobilny sheet jest niemodalny — zamyka go tylko ✕ / Gotowe.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const handleRangeChange = (next: RangeValue, completed: boolean) => {
    onChange(next.from ? dateToIso(next.from) : "", next.to ? dateToIso(next.to) : "");
    // Brief: on desktop the second (completing) click closes the popover.
    if (completed && isDesktop) setOpen(false);
  };

  const clear = () => onChange("", "");

  const footerRangeText = (() => {
    if (singleDate) return value.from ? dayLabel(value.from) : "Wybierz datę wylotu";
    if (value.from && value.to) return `${dayLabel(value.from)} – ${dayLabel(value.to)}`;
    if (value.from) return `${dayLabel(value.from)} – wybierz powrót`;
    return "Wybierz datę wylotu";
  })();

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <span className={labelClassName}>Termin</span>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label ? `Termin: ${label}` : (singleDate ? "Wybierz datę wylotu" : "Wybierz termin podróży")}
        className={`${fieldClassName} flex items-center gap-2 text-left`}
      >
        <span aria-hidden className="text-emerald-900/45">📅</span>
        <span className={`truncate ${label ? "" : "text-emerald-950/45"}`}>
          {label ?? placeholderText}
        </span>
      </button>

      {/* Desktop: dialog WYŚRODKOWANY w viewporcie (portal — patrz nagłówek
          pliku). Lekki backdrop wyłapuje klik-poza i domyka; z-[80] siedzi nad
          headerem (z-30), paskami wyników (z-20) i dymkiem konsierża (z-40). */}
      {open && isDesktop &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
            <button
              type="button"
              aria-label="Zamknij kalendarz"
              onClick={() => setOpen(false)}
              className="absolute inset-0 cursor-default bg-emerald-950/25"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Kalendarz wyboru terminu"
              className="relative rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_24px_64px_rgba(16,84,48,0.28)]"
            >
              <RangeCalendar value={value} onChange={handleRangeChange} numberOfMonths={2} singleDate={singleDate} />
              <div className="mt-2 flex items-center justify-between gap-4 border-t border-emerald-900/8 pt-3">
                <button
                  type="button"
                  onClick={clear}
                  className="text-xs font-semibold text-emerald-700 transition hover:text-emerald-900"
                >
                  Wyczyść
                </button>
                <span className="text-xs text-emerald-900/55">{footerRangeText}</span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={singleDate ? !value.from : (!value.from || !value.to)}
                  className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/40"
                >
                  Gotowe
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Mobile: NIEMODALNY bottom-sheet — strona pod spodem dalej się
          przewija (bez blokady scrolla body, bez backdropu). Zamknięcie:
          ✕ / Gotowe / Escape. */}
      {open && !isDesktop &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="dialog"
            aria-label="Kalendarz wyboru terminu"
            className="fixed inset-x-0 bottom-0 z-[70] flex max-h-[80vh] flex-col rounded-t-2xl border-t border-emerald-900/10 bg-white shadow-[0_-16px_48px_rgba(16,84,48,0.28)]"
          >
            <div className="flex items-center justify-between border-b border-emerald-900/10 px-4 py-3">
              <h2 className="text-base font-bold text-emerald-950">{singleDate ? "Wybierz datę wylotu" : "Wybierz termin"}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Zamknij kalendarz"
                className="flex h-9 w-9 items-center justify-center rounded-full text-emerald-900/60 transition hover:bg-emerald-50"
              >
                ✕
              </button>
            </div>
            <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-4">
              <RangeCalendar value={value} onChange={handleRangeChange} numberOfMonths={1} singleDate={singleDate} />
            </div>
            <div className="border-t border-emerald-900/10 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <p className="text-center text-xs font-medium text-emerald-900/70">{footerRangeText}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={clear}
                  className="rounded-xl border border-emerald-900/15 px-4 py-2.5 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50"
                >
                  Wyczyść
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={singleDate ? !value.from : (!value.from || !value.to)}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/50"
                >
                  Gotowe
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
