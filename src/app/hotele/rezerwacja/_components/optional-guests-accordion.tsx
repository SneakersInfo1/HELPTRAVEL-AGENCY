"use client";

// Collapsible block: główny gość pokoju #2..#rooms — WYŁĄCZNIE przy rezerwacji
// wielu pokoi (rooms=1 → nic nie renderujemy). Semantyka LiteAPI /rates/book:
// guests[] mapuje się 1:1 na POKOJE (jeden gość główny na occupancy), NIE na
// osoby — wysyłanie gościa per osoba przy jednym pokoju kończyło się 400
// „invalid occupancy number" PO pobraniu płatności (incydent 2026-07-10).
// Dlatego nie zbieramy już imion współpodróżnych w ogóle (minimalizacja
// danych): pytamy tylko o głównego gościa każdego DODATKOWEGO pokoju. Puste
// pola = pokój zapisany na osobę rezerwującą (fallback po stronie serwera).
// Ten komponent nie waliduje; walidacja w rodzicu (reservation-form.tsx).

import { useState } from "react";

interface Props {
  /** Liczba pokoi oferty — renderujemy rooms-1 wierszy (pokoje 2..rooms). */
  rooms: number;
  value: { firstName: string; lastName: string }[];
  onChange: (i: number, field: "firstName" | "lastName", v: string) => void;
  disabled?: boolean;
}

const inputCls =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:cursor-not-allowed disabled:bg-neutral-50";
const labelCls = "mb-1 block text-[11px] font-medium uppercase text-neutral-500";

export function OptionalGuestsAccordion({
  rooms,
  value,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const slots = Math.max(0, rooms - 1);
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
        Główni goście pozostałych pokoi{" "}
        <span className="font-normal text-neutral-500">(opcjonalne)</span>
      </button>

      {open && (
        <div id="co-guests-panel" className="mt-3 space-y-3">
          <p className="text-xs text-neutral-500">
            Rezerwujesz {rooms} pokoje — możesz wskazać, kto będzie głównym
            gościem każdego z nich. Puste pola oznaczają, że pokój zostanie
            zapisany na osobę rezerwującą.
          </p>
          {Array.from({ length: slots }).map((_, i) => {
            const firstNameId = `room-guest-${i + 2}-first-name`;
            const lastNameId = `room-guest-${i + 2}-last-name`;
            return (
              <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={firstNameId} className={labelCls}>
                    Imię — pokój {i + 2}
                  </label>
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
                  <label htmlFor={lastNameId} className={labelCls}>
                    Nazwisko — pokój {i + 2}
                  </label>
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
