"use client";

// Booking-style guests popover (zadanie 1): separate Dorośli / Dzieci
// steppers behind a single trigger that reads "2 dorosłych · 1 dziecko".
// PRODUCT DECISION (do not change): the backend treats children as adults —
// the PARENT sums adults+children into the `adults` URL param; this component
// only owns the two counters and the popover UX. No rooms, no child ages.

import { useEffect, useId, useRef, useState } from "react";

import { adultsLabel, childrenLabel, guestsLabel } from "./pluralize";

export const ADULTS_MIN = 1;
export const ADULTS_MAX = 9;
export const CHILDREN_MIN = 0;
export const CHILDREN_MAX = 6;

interface Props {
  adults: number;
  childCount: number;
  onChange: (adults: number, childCount: number) => void;
  fieldClassName: string;
  labelClassName: string;
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  const btnCls =
    "flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-lg font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-emerald-950">{label}</p>
        <p className="text-[11px] text-emerald-900/55">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={decreaseLabel}
          className={btnCls}
        >
          −
        </button>
        <span className="min-w-[24px] text-center text-base font-bold tabular-nums text-emerald-950">
          {value}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={increaseLabel}
          className={btnCls}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function GuestsField({
  adults,
  childCount,
  onChange,
  fieldClassName,
  labelClassName,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Close on outside click / Escape (standard popover contract).
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
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative flex flex-col gap-1.5">
      <span className={labelClassName}>Goście</span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Goście: ${guestsLabel(adults, childCount)}`}
        className={`${fieldClassName} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate">{guestsLabel(adults, childCount)}</span>
        <span
          aria-hidden
          className={`text-xs text-emerald-900/45 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Wybierz liczbę gości"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 min-w-[240px] rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
        >
          <Stepper
            label="Dorośli"
            hint="13 lat i więcej"
            value={adults}
            min={ADULTS_MIN}
            max={ADULTS_MAX}
            onChange={(v) => onChange(v, childCount)}
            decreaseLabel={`Mniej dorosłych (teraz ${adultsLabel(adults)})`}
            increaseLabel={`Więcej dorosłych (teraz ${adultsLabel(adults)})`}
          />
          <div className="mx-4 border-t border-emerald-900/8" />
          <Stepper
            label="Dzieci"
            hint="0–12 lat"
            value={childCount}
            min={CHILDREN_MIN}
            max={CHILDREN_MAX}
            onChange={(v) => onChange(adults, v)}
            decreaseLabel={`Mniej dzieci (teraz ${childrenLabel(childCount)})`}
            increaseLabel={`Więcej dzieci (teraz ${childrenLabel(childCount)})`}
          />
          <div className="flex justify-end px-4 pb-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Gotowe
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
