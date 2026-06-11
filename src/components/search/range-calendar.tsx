"use client";

// Range calendar (zadanie 1) — react-day-picker v9 + date-fns/pl, styled
// entirely through `classNames` (Tailwind, site palette) so it reads as part
// of helptravel, not the library default. Loaded lazily by DateRangeField
// (next/dynamic) so the ~20 kB gz of rdp+date-fns never lands in initial JS.
//
// Range rules (brief, Booking-like):
//   click 1 → start; click 2 AFTER start → end (parent may close);
//   click 2 ON/BEFORE start → restart selection from that day.
//   Past disabled, today allowed, horizon = +12 months, min 1 night
//   (end must be a later day). Hover shows a live preview of the range.

import { useState } from "react";
import { DayPicker } from "react-day-picker";
import { pl } from "react-day-picker/locale";

export interface RangeValue {
  from?: Date;
  to?: Date;
}

interface Props {
  value: RangeValue;
  /** completed=true when the second click just finished a full range. */
  onChange: (next: RangeValue, completed: boolean) => void;
  numberOfMonths: 1 | 2;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

export function RangeCalendar({ value, onChange, numberOfMonths }: Props) {
  const [hovered, setHovered] = useState<Date | undefined>(undefined);
  const today = startOfToday();

  const handleDayClick = (day: Date) => {
    const { from, to } = value;
    // No start yet, or a full range already picked → (re)start here.
    if (!from || (from && to)) {
      onChange({ from: day, to: undefined }, false);
      return;
    }
    // Second click strictly after start → complete the range (min 1 night).
    if (day.getTime() > from.getTime()) {
      onChange({ from, to: day }, true);
      return;
    }
    // On/before start → restart from the clicked day.
    onChange({ from: day, to: undefined }, false);
  };

  // Live preview between start and the hovered day (only while picking end).
  const previewActive =
    Boolean(value.from && !value.to && hovered && hovered.getTime() > value.from!.getTime());

  return (
    <DayPicker
      mode="range"
      required={false}
      selected={value.from ? { from: value.from, to: value.to } : undefined}
      onDayClick={handleDayClick}
      onDayMouseEnter={(day) => setHovered(day)}
      onDayMouseLeave={() => setHovered(undefined)}
      modifiers={
        previewActive ? { preview: { from: value.from!, to: hovered! } } : undefined
      }
      modifiersClassNames={{ preview: "bg-emerald-50" }}
      locale={pl}
      weekStartsOn={1}
      numberOfMonths={numberOfMonths}
      // Reopen on the month of the already-picked start (not on "today") —
      // otherwise editing a September trip greets you with June.
      defaultMonth={value.from ?? today}
      // Past disabled, today allowed; horizon 12 months out.
      disabled={{ before: today }}
      startMonth={today}
      endMonth={addMonths(today, 12)}
      classNames={{
        root: "ht-rdp select-none",
        months: "flex flex-col gap-6 sm:flex-row",
        month: "space-y-3",
        month_caption: "flex h-9 items-center justify-center",
        caption_label: "text-sm font-bold capitalize text-emerald-950",
        nav: "absolute inset-x-2 top-2 flex items-center justify-between",
        button_previous:
          "flex h-8 w-8 items-center justify-center rounded-full text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-30",
        button_next:
          "flex h-8 w-8 items-center justify-center rounded-full text-emerald-800 transition hover:bg-emerald-50 disabled:opacity-30",
        chevron: "h-4 w-4 fill-current",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-10 text-center text-[11px] font-semibold uppercase text-emerald-900/45",
        week: "mt-1 flex",
        day: "p-0",
        day_button:
          "flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium text-emerald-950 transition hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600 disabled:pointer-events-none",
        range_start: "[&>button]:bg-emerald-600 [&>button]:text-white [&>button]:hover:bg-emerald-700",
        range_end: "[&>button]:bg-emerald-600 [&>button]:text-white [&>button]:hover:bg-emerald-700",
        range_middle: "[&>button]:rounded-none [&>button]:bg-emerald-100/80",
        today: "[&>button]:ring-1 [&>button]:ring-emerald-500/60",
        disabled: "[&>button]:text-neutral-300",
        outside: "[&>button]:text-neutral-300",
        hidden: "invisible",
      }}
      style={{ position: "relative" }}
    />
  );
}
