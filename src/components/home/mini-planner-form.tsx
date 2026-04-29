"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { sendClientEvent } from "@/lib/mvp/client-events";
import {
  DEFAULT_ORIGIN_CITY,
  EUROPEAN_ORIGIN_CITIES,
  POLISH_ORIGIN_CITIES,
} from "@/lib/mvp/origin-cities";
import type { DestinationSuggestion } from "@/lib/mvp/types";

interface MiniPlannerFormProps {
  // Kompakt = true ukrywa opis ponizej (gdy form jest w cinematic hero).
  compact?: boolean;
}

function toISO(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function defaultStartDate(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 14));
  return toISO(target);
}

function defaultEndDate(): string {
  const now = new Date();
  const target = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 18));
  return toISO(target);
}

function diffNights(start: string, end: string): number {
  if (!start || !end) return 4;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : 4;
}

export function MiniPlannerForm({ compact = false }: MiniPlannerFormProps) {
  const router = useRouter();
  const { locale } = useLanguage();
  const listboxId = useId();
  const destInputRef = useRef<HTMLInputElement>(null);
  const destListRef = useRef<HTMLUListElement>(null);
  const [origin, setOrigin] = useState(DEFAULT_ORIGIN_CITY);
  const [destination, setDestination] = useState("");
  const [destQuery, setDestQuery] = useState("");
  const [destSuggestions, setDestSuggestions] = useState<DestinationSuggestion[]>([]);
  const [destOpen, setDestOpen] = useState(false);
  const [destHighlight, setDestHighlight] = useState(-1);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [travelers, setTravelers] = useState(2);

  useEffect(() => {
    if (destQuery.trim().length < 2) {
      setDestSuggestions([]);
      setDestOpen(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/destinations/suggest?q=${encodeURIComponent(destQuery.trim())}`, {
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({ items: [] }))) as { items?: DestinationSuggestion[] };
        const items = payload.items ?? [];
        setDestSuggestions(items);
        setDestOpen(items.length > 0);
        setDestHighlight(-1);
      } catch {
        // aborted or network error
      }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [destQuery]);

  function selectSuggestion(s: DestinationSuggestion) {
    setDestination(s.queryValue);
    setDestQuery(s.city);
    setDestOpen(false);
    setDestHighlight(-1);
    destInputRef.current?.blur();
  }

  function handleDestKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!destOpen || destSuggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestHighlight((h) => Math.min(h + 1, destSuggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && destHighlight >= 0) {
      e.preventDefault();
      selectSuggestion(destSuggestions[destHighlight]);
    } else if (e.key === "Escape") {
      setDestOpen(false);
    }
  }

  const dateMin = useMemo(() => toISO(new Date()), []);
  const endMin = useMemo(() => {
    if (!startDate) return dateMin;
    const d = new Date(startDate);
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
    return toISO(next);
  }, [startDate, dateMin]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nights = diffNights(startDate, endDate);
    const params = new URLSearchParams({
      mode: "standard",
      origin: origin || DEFAULT_ORIGIN_CITY,
      startDate,
      endDate,
      nights: String(nights),
      travelers: String(travelers),
    });
    const trimmedDestination = destination.trim();
    if (trimmedDestination.length > 0) {
      params.set("destination", trimmedDestination);
    }
    sendClientEvent("mini_planner_submitted", {
      origin: origin || DEFAULT_ORIGIN_CITY,
      destination: trimmedDestination || null,
      nights,
      travelers,
      hasDestination: trimmedDestination.length > 0,
    });
    const prefix = locale === "en" ? "/en" : "";
    router.push(`${prefix}/planner?${params.toString()}`);
  }

  const fieldCls =
    "h-12 rounded-xl border border-white/60 bg-white/95 px-3 text-sm font-medium text-emerald-950 shadow-inner transition focus:outline-none focus:ring-2 focus:ring-amber-400/60 focus:border-amber-400";
  const labelCls =
    "text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800/80";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-3xl border border-white/40 bg-white/80 p-4 shadow-[0_24px_60px_rgba(16,84,48,0.24)] backdrop-blur-xl sm:p-5"
    >
      <div className="grid gap-3 lg:grid-cols-[1.1fr_1.4fr_1fr_1fr_0.9fr_auto] lg:items-end">
        {/* SKAD */}
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Skad</span>
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className={fieldCls}
          >
            <optgroup label="Polska">
              {POLISH_ORIGIN_CITIES.map((city) => (
                <option key={city.iata} value={city.city}>
                  {city.city}
                </option>
              ))}
            </optgroup>
            <optgroup label="Europa (polska diaspora)">
              {EUROPEAN_ORIGIN_CITIES.map((city) => (
                <option key={city.iata} value={city.city}>
                  {city.city}
                </option>
              ))}
            </optgroup>
          </select>
        </label>

        {/* DOKAD — autocomplete combobox */}
        <div className="relative flex flex-col gap-1.5">
          <span className={labelCls}>Dokad</span>
          <input
            ref={destInputRef}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={destOpen}
            aria-controls={listboxId}
            value={destQuery}
            onChange={(e) => {
              setDestQuery(e.target.value);
              setDestination(e.target.value);
            }}
            onKeyDown={handleDestKeyDown}
            onFocus={() => { if (destSuggestions.length > 0) setDestOpen(true); }}
            onBlur={() => { window.setTimeout(() => setDestOpen(false), 150); }}
            placeholder="Wpisz miasto lub kraj…"
            autoComplete="off"
            className={fieldCls}
          />
          {destOpen && destSuggestions.length > 0 && (
            <ul
              id={listboxId}
              ref={destListRef}
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
            >
              {destSuggestions.map((s, idx) => (
                <li
                  key={s.id}
                  role="option"
                  aria-selected={idx === destHighlight}
                  onMouseDown={() => selectSuggestion(s)}
                  onMouseEnter={() => setDestHighlight(idx)}
                  className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition ${
                    idx === destHighlight ? "bg-emerald-50" : "hover:bg-emerald-50/60"
                  }`}
                >
                  <span className="text-base leading-none">
                    {s.source === "curated" ? "🌍" : "📍"}
                  </span>
                  <span>
                    <span className="font-semibold text-emerald-950">{s.city}</span>
                    <span className="ml-1 text-xs text-emerald-900/56">
                      {[s.country, s.region].filter(Boolean).join(" / ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* WYLOT */}
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Wylot</span>
          <input
            type="date"
            value={startDate}
            min={dateMin}
            onChange={(e) => {
              setStartDate(e.target.value);
              // Jesli powrot jest wczesniejszy niz nowy wylot, przesun go o 4 dni.
              if (e.target.value && endDate && new Date(endDate) <= new Date(e.target.value)) {
                const d = new Date(e.target.value);
                const next = new Date(
                  Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4),
                );
                setEndDate(toISO(next));
              }
            }}
            className={fieldCls}
          />
        </label>

        {/* POWROT */}
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>Powrot</span>
          <input
            type="date"
            value={endDate}
            min={endMin}
            onChange={(e) => setEndDate(e.target.value)}
            className={fieldCls}
          />
        </label>

        {/* OSOBY - stepper */}
        <div className="flex flex-col gap-1.5">
          <span className={labelCls}>Osoby</span>
          <div className="flex h-12 items-center justify-between rounded-xl border border-white/60 bg-white/95 px-2 shadow-inner">
            <button
              type="button"
              onClick={() => setTravelers((v) => Math.max(1, v - 1))}
              aria-label="Zmniejsz liczbe osob"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-lg font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-40"
              disabled={travelers <= 1}
            >
              −
            </button>
            <span className="min-w-[24px] text-center text-base font-bold text-emerald-950 tabular-nums">
              {travelers}
            </span>
            <button
              type="button"
              onClick={() => setTravelers((v) => Math.min(8, v + 1))}
              aria-label="Zwieksz liczbe osob"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-lg font-bold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-40"
              disabled={travelers >= 8}
            >
              +
            </button>
          </div>
        </div>

        {/* CTA */}
        <button
          type="submit"
          className="group relative h-12 overflow-hidden rounded-xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 px-6 text-sm font-bold uppercase tracking-[0.08em] text-white shadow-[0_10px_30px_rgba(234,88,12,0.45)] transition hover:shadow-[0_14px_40px_rgba(234,88,12,0.6)] focus:outline-none focus:ring-4 focus:ring-amber-300/60"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            Zaplanuj
            <span aria-hidden className="transition group-hover:translate-x-1">→</span>
          </span>
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-rose-500 to-amber-500 opacity-0 transition group-hover:opacity-100"
          />
        </button>
      </div>

      {!compact && (
        <p className="mt-3 text-[11px] text-emerald-900/70">
          Dokad mozesz zostawic puste — pomozemy wybrac kierunek po Twoich preferencjach.
        </p>
      )}
    </form>
  );
}
