"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { DEFAULT_ORIGIN_CITY, POLISH_ORIGIN_CITIES } from "@/lib/mvp/origin-cities";
import type { DestinationProfile } from "@/lib/mvp/types";

interface MiniPlannerFormProps {
  // Lista wszystkich destynacji do datalist (autocomplete pod polem "Dokad").
  // Przekazujemy z serwera, zeby nie ladowac calego katalogu w bundlu klienta.
  destinationOptions: Array<Pick<DestinationProfile, "city" | "country">>;
}

function defaultStartDate(): string {
  // +14 dni od dzis, w UTC, format YYYY-MM-DD (zgodne z input type="date").
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  return target.toISOString().slice(0, 10);
}

export function MiniPlannerForm({ destinationOptions }: MiniPlannerFormProps) {
  const router = useRouter();
  const { locale } = useLanguage();
  const datalistId = useId();
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN_CITY);
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(defaultStartDate);

  const dateMin = useMemo(() => {
    const today = new Date();
    return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams({
      mode: "standard",
      origin: origin || DEFAULT_ORIGIN_CITY,
      startDate: startDate,
      nights: "4",
      travelers: "2",
    });
    const trimmedDestination = destination.trim();
    if (trimmedDestination.length > 0) {
      params.set("destination", trimmedDestination);
    }
    const prefix = locale === "en" ? "/en" : "";
    router.push(`${prefix}/planner?${params.toString()}`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-emerald-900/12 bg-white p-3 shadow-[0_18px_42px_rgba(16,84,48,0.08)]"
    >
      <div className="grid gap-2 sm:grid-cols-[140px_1fr_160px_auto] sm:items-end">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Skad</span>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="h-11 rounded-xl border border-emerald-900/12 bg-emerald-50/72 px-3 text-sm font-medium text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          >
            {POLISH_ORIGIN_CITIES.map((city) => (
              <option key={city.iata} value={city.city}>
                {city.city}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Dokad</span>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Np. Malaga, Barcelona, Rzym..."
            list={datalistId}
            className="h-11 rounded-xl border border-emerald-900/12 bg-emerald-50/72 px-3 text-sm font-medium text-emerald-950 placeholder:text-emerald-900/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
          <datalist id={datalistId}>
            {destinationOptions.map((opt) => (
              <option key={`${opt.city}-${opt.country}`} value={opt.city}>
                {opt.country}
              </option>
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">Kiedy</span>
          <input
            type="date"
            value={startDate}
            min={dateMin}
            onChange={(e) => setStartDate(e.target.value)}
            className="h-11 rounded-xl border border-emerald-900/12 bg-emerald-50/72 px-3 text-sm font-medium text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </label>
        <button
          type="submit"
          className="h-11 rounded-xl bg-emerald-700 px-5 text-sm font-bold text-white transition hover:bg-emerald-800"
        >
          Zaplanuj wyjazd
        </button>
      </div>
      <p className="mt-2 text-[10px] text-emerald-900/60">
        Dokad mozesz zostawic puste — pomozemy wybrac kierunek po Twoich preferencjach.
      </p>
    </form>
  );
}
