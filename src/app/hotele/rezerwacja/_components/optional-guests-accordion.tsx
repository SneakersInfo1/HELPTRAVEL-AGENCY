"use client";

// Collapsible block for co-traveler names. Holder (guest #1) lives outside —
// THESE are guests #2..#occupancy and are entirely OPTIONAL. The user may
// leave them blank (solo trip in a multi-occupancy room) — only fully-filled
// rows are sent to LiteAPI; rows with exactly one field filled fail
// validation in the parent (`reservation-form.tsx`). This component does not
// validate; it only renders rows and forwards changes.

import { useState } from "react";

interface Props {
  occupancy: number;
  value: { firstName: string; lastName: string }[];
  onChange: (i: number, field: "firstName" | "lastName", v: string) => void;
  disabled?: boolean;
}

const inputCls =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-50";
const labelCls = "mb-1 block text-[11px] font-medium uppercase text-neutral-500";

export function OptionalGuestsAccordion({
  occupancy,
  value,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const slots = Math.max(0, occupancy - 1);
  if (slots === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="co-guests-panel"
        className="flex items-center gap-2 text-sm font-medium text-emerald-700 hover:text-emerald-800"
      >
        <span
          aria-hidden
          className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}
        >
          ▸
        </span>
        Dodaj dane współpodróżnych{" "}
        <span className="font-normal text-neutral-500">(opcjonalne)</span>
      </button>

      {open && (
        <div id="co-guests-panel" className="mt-3 space-y-3">
          <p className="text-xs text-neutral-500">
            Wystarczą dane osoby rezerwującej. Imiona pozostałych gości pomagają
            hotelowi przy odprawie, ale nie są wymagane.
          </p>
          {Array.from({ length: slots }).map((_, i) => {
            const firstNameId = `co-guest-${i + 2}-first-name`;
            const lastNameId = `co-guest-${i + 2}-last-name`;
            return (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={firstNameId} className={labelCls}>Imię gościa {i + 2}</label>
                  <input
                    id={firstNameId}
                    name={firstNameId}
                    className={inputCls}
                    value={value[i]?.firstName ?? ""}
                    onChange={(e) => onChange(i, "firstName", e.target.value)}
                    disabled={disabled}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label htmlFor={lastNameId} className={labelCls}>Nazwisko gościa {i + 2}</label>
                  <input
                    id={lastNameId}
                    name={lastNameId}
                    className={inputCls}
                    value={value[i]?.lastName ?? ""}
                    onChange={(e) => onChange(i, "lastName", e.target.value)}
                    disabled={disabled}
                    autoComplete="off"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
