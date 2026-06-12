"use client";

// Single date-range field (zadanie 1) replacing the two native date inputs.
// Desktop (≥1024px): popover with TWO months side by side. Mobile: full-screen
// sheet with ONE month + arrows, sticky footer ("Wyczyść" / selected range /
// "Gotowe"). Field shows the Booking-style label "śr. 17 cze – sob. 20 cze".
// URL contract unchanged: parent keeps checkin/checkout as YYYY-MM-DD strings.

import { format } from "date-fns";
import { pl } from "date-fns/locale";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

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
}

export function DateRangeField({
  checkin,
  checkout,
  onChange,
  fieldClassName,
  labelClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  // Desktop vs mobile decided when the picker opens (lg breakpoint, brief).
  const [isDesktop, setIsDesktop] = useState(true);
  // Desktop popover flips ABOVE the field when there's not enough room below
  // (hero form sits at the bottom of the viewport — owner request 2026-06-11:
  // "na komputerze pole ma pojawiać się nad paskiem").
  const [flipUp, setFlipUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const value: RangeValue = { from: isoToDate(checkin), to: isoToDate(checkout) };
  const label = checkin && checkout ? formatRangeLabel(checkin, checkout) : null;

  // Two months side by side ≈ 420px tall incl. footer.
  const POPOVER_HEIGHT_PX = 440;

  const openPicker = () => {
    setIsDesktop(window.matchMedia("(min-width: 1024px)").matches);
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setFlipUp(spaceBelow < POPOVER_HEIGHT_PX && spaceAbove > spaceBelow);
    }
    setOpen(true);
  };

  // Outside click + Escape (desktop popover); Escape also closes the sheet.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (isDesktop) document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, isDesktop]);

  // Mobile sheet: lock body scroll while open.
  useEffect(() => {
    if (!open || isDesktop) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, isDesktop]);

  const handleRangeChange = (next: RangeValue, completed: boolean) => {
    onChange(next.from ? dateToIso(next.from) : "", next.to ? dateToIso(next.to) : "");
    // Brief: on desktop the second (completing) click closes the popover.
    if (completed && isDesktop) setOpen(false);
  };

  const clear = () => onChange("", "");

  const footerRangeText = (() => {
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
        aria-label={label ? `Termin: ${label}` : "Wybierz termin podróży"}
        className={`${fieldClassName} flex items-center gap-2 text-left`}
      >
        <span aria-hidden className="text-emerald-900/45">📅</span>
        <span className={`truncate ${label ? "" : "text-emerald-950/45"}`}>
          {label ?? "Wylot – Powrót"}
        </span>
      </button>

      {open && isDesktop && (
        <div
          role="dialog"
          aria-label="Kalendarz wyboru terminu"
          className={`absolute left-1/2 z-50 -translate-x-1/2 rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-[0_18px_48px_rgba(16,84,48,0.16)] ${
            flipUp ? "bottom-[calc(100%+6px)]" : "top-[calc(100%+6px)]"
          }`}
        >
          <RangeCalendar value={value} onChange={handleRangeChange} numberOfMonths={2} />
          <div className="mt-2 flex items-center justify-between border-t border-emerald-900/8 pt-3">
            <button
              type="button"
              onClick={clear}
              className="text-xs font-semibold text-emerald-700 transition hover:text-emerald-900"
            >
              Wyczyść
            </button>
            <span className="text-xs text-emerald-900/55">{footerRangeText}</span>
          </div>
        </div>
      )}

      {open && !isDesktop && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kalendarz wyboru terminu"
          className="fixed inset-0 z-[70] flex flex-col bg-white"
        >
          <div className="flex items-center justify-between border-b border-emerald-900/10 px-4 py-3">
            <h2 className="text-base font-bold text-emerald-950">Wybierz termin</h2>
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
            <RangeCalendar value={value} onChange={handleRangeChange} numberOfMonths={1} />
          </div>
          <div className="sticky bottom-0 border-t border-emerald-900/10 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
                disabled={!value.from || !value.to}
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-600/50"
              >
                Gotowe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
