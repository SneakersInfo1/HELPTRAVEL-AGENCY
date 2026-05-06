"use client";

// Sticky booking widget — desktop right rail, mobile bottom CTA.
// Always shows: dates (editable), guests, lowest available rate total, CTA.
// Master spec §5.3.

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  hotelId: string;
  initial: {
    checkin: string;
    checkout: string;
    adults: number;
    rooms: number;
    children: number[];
  };
  cheapestTotal?: number;
  currency: string;
}

const formatPLN = (amount: number, currency: string) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

export function BookingWidget({ hotelId, initial, cheapestTotal, currency }: Props) {
  const router = useRouter();
  const [checkin, setCheckin] = useState(initial.checkin);
  const [checkout, setCheckout] = useState(initial.checkout);
  const [adults, setAdults] = useState(initial.adults);
  const [rooms, setRooms] = useState(initial.rooms);

  const refresh = () => {
    const params = new URLSearchParams({
      checkin,
      checkout,
      adults: String(adults),
      rooms: String(rooms),
    });
    if (initial.children.length) params.set("children", initial.children.join(","));
    router.push(`/hotele/${encodeURIComponent(hotelId)}?${params.toString()}`);
  };

  const scrollToRooms = () => {
    document.getElementById("rooms")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      {/* Desktop right rail */}
      <aside className="hidden lg:sticky lg:top-24 lg:block">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          {cheapestTotal !== undefined && (
            <div className="mb-3 border-b border-neutral-100 pb-3">
              <div className="text-xs text-neutral-500">Od</div>
              <div className="text-2xl font-bold text-neutral-900">{formatPLN(cheapestTotal, currency)}</div>
              <div className="text-[11px] text-neutral-500">wł. podatków i opłat</div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-neutral-500">Przyjazd</label>
              <input
                type="date"
                value={checkin}
                onChange={(e) => setCheckin(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-neutral-500">Wyjazd</label>
              <input
                type="date"
                value={checkout}
                min={checkin}
                onChange={(e) => setCheckout(e.target.value)}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-neutral-500">Dorośli</label>
              <input
                type="number"
                min={1}
                max={8}
                value={adults}
                onChange={(e) => setAdults(Number(e.target.value))}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase text-neutral-500">Pokoje</label>
              <input
                type="number"
                min={1}
                max={5}
                value={rooms}
                onChange={(e) => setRooms(Number(e.target.value))}
                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 w-full rounded-lg border border-emerald-600 bg-white py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Sprawdź dostępność
          </button>
          <button
            type="button"
            onClick={scrollToRooms}
            className="mt-2 w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Wybierz pokój
          </button>
        </div>
      </aside>

      {/* Mobile sticky bottom */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            {cheapestTotal !== undefined ? (
              <>
                <div className="text-[11px] text-neutral-500">Od</div>
                <div className="text-base font-bold text-neutral-900">{formatPLN(cheapestTotal, currency)}</div>
              </>
            ) : (
              <div className="text-sm text-neutral-600">Wybierz daty</div>
            )}
          </div>
          <button
            type="button"
            onClick={scrollToRooms}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Wybierz pokój
          </button>
        </div>
      </div>
    </>
  );
}
