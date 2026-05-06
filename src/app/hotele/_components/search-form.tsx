"use client";

// Hotel search form — destination autocomplete + dates + guests popover.
// Submits a GET to /hotele/szukaj with URL-encoded params (shareable).
// Mobile-first: stacks vertically <640px, row on sm+.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Suggestion {
  id?: string;
  name?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  label?: string;
}

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDaysIso = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

interface SearchFormProps {
  initial?: Partial<{
    destination: string;
    country: string;
    checkin: string;
    checkout: string;
    adults: number;
    children: number[];
    rooms: number;
  }>;
  variant?: "hero" | "compact";
}

export function HotelSearchForm({ initial, variant = "hero" }: SearchFormProps) {
  const router = useRouter();
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [checkin, setCheckin] = useState(initial?.checkin ?? plusDaysIso(14));
  const [checkout, setCheckout] = useState(initial?.checkout ?? plusDaysIso(18));
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [children, setChildren] = useState<number[]>(initial?.children ?? []);
  const [rooms, setRooms] = useState(initial?.rooms ?? 1);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showGuests, setShowGuests] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const guestRef = useRef<HTMLDivElement>(null);

  // Debounced autocomplete (200ms per spec).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = destination.trim();
    if (trimmed.length < 2) {
      // Clear via the same async path so the lint rule is satisfied and there
      // are no synchronous setState-in-effect cascading renders.
      const handle = setTimeout(() => setSuggestions([]), 0);
      return () => clearTimeout(handle);
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { items?: Suggestion[] };
        setSuggestions(data.items ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [destination]);

  // Click-outside guests popover.
  useEffect(() => {
    if (!showGuests) return;
    const onClick = (e: MouseEvent) => {
      if (guestRef.current && !guestRef.current.contains(e.target as Node)) setShowGuests(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [showGuests]);

  const guestsLabel = useMemo(() => {
    const parts = [
      `${adults} ${adults === 1 ? "dorosły" : adults < 5 ? "dorosłych" : "dorosłych"}`,
    ];
    if (children.length) parts.push(`${children.length} ${children.length === 1 ? "dziecko" : "dzieci"}`);
    parts.push(`${rooms} ${rooms === 1 ? "pokój" : rooms < 5 ? "pokoje" : "pokoi"}`);
    return parts.join(" · ");
  }, [adults, children, rooms]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination.trim() || !country.trim()) return;
    const params = new URLSearchParams({
      destination: destination.trim(),
      country: country.trim(),
      checkin,
      checkout,
      adults: String(adults),
      rooms: String(rooms),
    });
    if (children.length) params.set("children", children.join(","));
    router.push(`/hotele/szukaj?${params.toString()}`);
  };

  const onPickSuggestion = (s: Suggestion) => {
    const city = s.city ?? s.name ?? s.label ?? destination;
    const ctry = s.country ?? s.countryCode ?? country;
    setDestination(city);
    setCountry(ctry);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const isHero = variant === "hero";
  const fieldBase =
    "block w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-900 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";

  return (
    <form
      onSubmit={onSubmit}
      className={
        isHero
          ? "flex w-full flex-col gap-3 rounded-2xl bg-white p-4 shadow-lg sm:flex-row sm:items-end sm:gap-2"
          : "flex w-full flex-col gap-2 sm:flex-row sm:items-end"
      }
      aria-label="Wyszukiwarka hoteli"
    >
      {/* Destination */}
      <div className="relative flex-1 min-w-0">
        <label className="mb-1 block text-xs font-medium text-neutral-600">Dokąd?</label>
        <input
          type="text"
          value={destination}
          onChange={(e) => {
            setDestination(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder="Miasto lub region"
          className={fieldBase}
          autoComplete="off"
          aria-autocomplete="list"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-neutral-200 bg-white shadow-xl"
          >
            {suggestions.map((s, i) => (
              <li key={`${s.id ?? s.name}-${i}`}>
                <button
                  type="button"
                  onClick={() => onPickSuggestion(s)}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-emerald-50"
                >
                  <span className="font-medium text-neutral-900">{s.city ?? s.name ?? s.label}</span>
                  {s.country && <span className="text-neutral-500">· {s.country}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Country (small input — autocomplete sets it; user can edit if needed) */}
      <div className="w-full sm:w-32">
        <label className="mb-1 block text-xs font-medium text-neutral-600">Kraj</label>
        <input
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="np. Spain"
          className={fieldBase}
          required
        />
      </div>

      {/* Dates */}
      <div className="flex flex-1 gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Przyjazd</label>
          <input
            type="date"
            value={checkin}
            min={todayIso()}
            onChange={(e) => setCheckin(e.target.value)}
            className={fieldBase}
            required
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium text-neutral-600">Wyjazd</label>
          <input
            type="date"
            value={checkout}
            min={checkin}
            onChange={(e) => setCheckout(e.target.value)}
            className={fieldBase}
            required
          />
        </div>
      </div>

      {/* Guests */}
      <div ref={guestRef} className="relative w-full sm:w-56">
        <label className="mb-1 block text-xs font-medium text-neutral-600">Goście i pokoje</label>
        <button
          type="button"
          onClick={() => setShowGuests((v) => !v)}
          className={`${fieldBase} text-left`}
          aria-expanded={showGuests}
        >
          {guestsLabel}
        </button>
        {showGuests && (
          <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-4 shadow-xl">
            <Stepper label="Dorośli" value={adults} min={1} max={8} onChange={setAdults} />
            <Stepper label="Pokoje" value={rooms} min={1} max={5} onChange={setRooms} />
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-medium text-neutral-800">Dzieci</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setChildren((c) => (c.length > 0 ? c.slice(0, -1) : c))}
                    className="h-7 w-7 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                    aria-label="Usuń dziecko"
                  >
                    −
                  </button>
                  <span className="w-5 text-center text-sm">{children.length}</span>
                  <button
                    type="button"
                    onClick={() => setChildren((c) => (c.length < 4 ? [...c, 8] : c))}
                    className="h-7 w-7 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100"
                    aria-label="Dodaj dziecko"
                  >
                    +
                  </button>
                </div>
              </div>
              {children.map((age, i) => (
                <label key={i} className="mt-1 flex items-center justify-between text-sm text-neutral-700">
                  <span>Wiek dziecka {i + 1}</span>
                  <select
                    value={age}
                    onChange={(e) =>
                      setChildren((c) => c.map((a, j) => (j === i ? Number(e.target.value) : a)))
                    }
                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
                  >
                    {Array.from({ length: 18 }, (_, k) => k).map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="mt-1 inline-flex h-12 w-full shrink-0 items-center justify-center rounded-lg bg-emerald-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 sm:w-auto"
      >
        Szukaj
      </button>
    </form>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mt-2 flex items-center justify-between text-sm">
      <span className="font-medium text-neutral-800">{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="h-7 w-7 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
          disabled={value <= min}
          aria-label={`Zmniejsz ${label.toLowerCase()}`}
        >
          −
        </button>
        <span className="w-5 text-center">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          className="h-7 w-7 rounded-full border border-neutral-300 text-neutral-700 hover:bg-neutral-100 disabled:opacity-40"
          disabled={value >= max}
          aria-label={`Zwiększ ${label.toLowerCase()}`}
        >
          +
        </button>
      </div>
    </div>
  );
}
