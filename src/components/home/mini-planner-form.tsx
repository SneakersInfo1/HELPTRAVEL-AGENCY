"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { DateRangeField } from "@/components/search/date-range-field";
import { GuestsField } from "@/components/search/guests-field";
import { OriginCombobox, exactOriginMatch } from "@/components/search/origin-combobox";
import { useLanguage } from "@/components/site/language-provider";
import { track } from "@/lib/analytics/track";
import { localizeCity, localizeCountry, localizeRegion } from "@/lib/mvp/i18n-geo";
import { sendClientEvent } from "@/lib/mvp/client-events";
import type { DestinationSuggestion } from "@/lib/mvp/types";

interface MiniPlannerFormProps {
  // Kompakt = true ukrywa opis ponizej (gdy form jest w cinematic hero).
  compact?: boolean;
  /** Initial values when reusing the bar on results pages. Sesja C pkt 2.
      `travelers` is the TOTAL guest count from the `adults` URL param (sum of
      adults+children — product decision); `kids` is the informational
      breakdown from the new `kids` param so "Edytuj" can restore the
      Dorośli/Dzieci split. Old links without `kids` show everyone as adults. */
  initial?: Partial<{
    origin: string;
    destination: string;
    destinationCountry: string;
    startDate: string;
    endDate: string;
    travelers: number;
    kids: number;
  }>;
}

function diffNights(start: string, end: string): number {
  if (!start || !end) return 4;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : 4;
}

export function MiniPlannerForm({ compact = false, initial }: MiniPlannerFormProps) {
  const router = useRouter();
  const { locale } = useLanguage();
  const listboxId = useId();
  const destInputRef = useRef<HTMLInputElement>(null);
  const destListRef = useRef<HTMLUListElement>(null);
  // "Skąd" is OPTIONAL now (zadanie 1): no default airport. `origin` holds a
  // CONFIRMED city from the list (or ""), `originQuery` the visible text —
  // same confirmed/query split the destination combobox uses.
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [originQuery, setOriginQuery] = useState(initial?.origin ?? "");
  const [originError, setOriginError] = useState("");
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [destinationCountry, setDestinationCountry] = useState(initial?.destinationCountry ?? "");
  // Visible input gets the Polish exonym (e.g. "Lizbona") so collapsing back
  // from /hotele/szukaj?destination=Lisbon shows what the user picked, not
  // the canonical English key.
  const [destQuery, setDestQuery] = useState(initial?.destination ? localizeCity(initial.destination) : "");
  const [destSuggestions, setDestSuggestions] = useState<DestinationSuggestion[]>([]);
  const [destOpen, setDestOpen] = useState(false);
  const [destHighlight, setDestHighlight] = useState(-1);
  const [destFetching, setDestFetching] = useState(false);
  const [destConfirmed, setDestConfirmed] = useState(Boolean(initial?.destination));
  const [destError, setDestError] = useState("");
  // No default dates — the user must pick them (homepage + results bar).
  const [startDate, setStartDate] = useState(initial?.startDate ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  // Adults/children split. URL `adults` carries the SUM (initial.travelers);
  // `kids` (informational param) restores the split on the results bar.
  const initialKids = Math.max(0, Math.min(6, initial?.kids ?? 0));
  const [childCount, setChildCount] = useState(initialKids);
  const [adults, setAdults] = useState(
    Math.max(1, Math.min(9, (initial?.travelers ?? 2) - initialKids)),
  );
  const [dateError, setDateError] = useState("");

  useEffect(() => {
    // After user picks a suggestion (destConfirmed=true), don't refetch with
    // the now-confirmed city name — that's what reopens the dropdown after
    // the click. onChange resets destConfirmed=false so typing still works.
    if (destConfirmed) {
      return;
    }
    if (destQuery.trim().length < 2) {
      setDestSuggestions([]);
      setDestOpen(false);
      setDestFetching(false);
      return;
    }
    setDestFetching(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/destinations/suggest?q=${encodeURIComponent(destQuery.trim())}`, {
          signal: controller.signal,
        });
        const payload = (await res.json().catch(() => ({ items: [] }))) as { items?: DestinationSuggestion[] };
        const items = payload.items ?? [];
        setDestSuggestions(items);
        setDestOpen(true);
        setDestHighlight(-1);
      } catch {
        // aborted or network error
      } finally {
        setDestFetching(false);
      }
    }, 150);
    return () => { controller.abort(); window.clearTimeout(timeout); };
  }, [destQuery, destConfirmed]);

  function selectSuggestion(s: DestinationSuggestion) {
    // Backend key (URL param, LiteAPI/IATA lookups) stays English.
    setDestination(s.city);
    setDestinationCountry(s.country);
    // Visible input gets the Polish exonym so the user sees what they picked.
    setDestQuery(localizeCity(s.city));
    setDestSuggestions([]);
    setDestFetching(false);
    setDestOpen(false);
    setDestHighlight(-1);
    setDestConfirmed(true);
    setDestError("");
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Jeśli user coś wpisał ale nie wybrał z listy → pokaż błąd
    if (destQuery.trim().length > 0 && !destConfirmed) {
      setDestError("Nie znaleziono takiego kierunku. Wybierz miasto z listy podpowiedzi.");
      setDestOpen(true);
      return;
    }
    setDestError("");
    // "Skąd" is optional — but typed-and-unmatched text must not silently
    // turn into "no flights". Exact single match auto-confirms ("krakow" →
    // Kraków); anything else asks the user to pick or clear.
    let resolvedOrigin = origin;
    if (originQuery.trim() && !resolvedOrigin) {
      const match = exactOriginMatch(originQuery);
      if (match) {
        resolvedOrigin = match.city;
        setOrigin(match.city);
        setOriginQuery(match.city);
      } else {
        setOriginError("Wybierz lotnisko z listy albo zostaw pole puste.");
        return;
      }
    }
    setOriginError("");
    // Daty są wymagane — użytkownik musi je wybrać (brak domyślnych).
    if (!startDate || !endDate) {
      setDateError("Wybierz datę wyjazdu i powrotu.");
      return;
    }
    setDateError("");
    const nights = diffNights(startDate, endDate);
    const trimmedDestination = destination.trim();
    // PRODUCT DECISION (zadanie 1): children count as adults downstream —
    // LiteAPI occupancies and the flights search both read the summed
    // `adults` param. `kids` is informational only (restores the UI split).
    const totalGuests = adults + childCount;
    // Sesja C pkt 2: route directly to /hotele/szukaj — the unified results
    // page that composes hotels (LiteAPI) + flights (Travelpayouts).
    const params = new URLSearchParams({
      destination: trimmedDestination,
      country: destinationCountry,
      checkin: startDate,
      checkout: endDate,
      adults: String(totalGuests),
      rooms: "1",
    });
    if (childCount > 0) params.set("kids", String(childCount));
    // Empty "Skąd" → no origin param at all; the results page already hides
    // the flights section when sp.origin is absent.
    if (resolvedOrigin) params.set("origin", resolvedOrigin);
    sendClientEvent("mini_planner_submitted", {
      origin: resolvedOrigin || null,
      destination: trimmedDestination || null,
      country: destinationCountry || null,
      nights,
      travelers: totalGuests,
      hasDestination: trimmedDestination.length > 0,
    });
    // GA4 funnel event — hotel_search_submit was defined in the catalogue but
    // never fired anywhere (faza 0 finding); wired here with the two new
    // params from the brief.
    track("hotel_search_submit", {
      destination: trimmedDestination,
      country: destinationCountry || undefined,
      checkin: startDate,
      checkout: endDate,
      adults: totalGuests,
      rooms: 1,
      source: "search_bar",
      children_count: childCount,
      origin_provided: Boolean(resolvedOrigin),
    });
    const prefix = locale === "en" ? "/en" : "";
    router.push(`${prefix}/hotele/szukaj?${params.toString()}`);
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
      <div className="grid gap-3 lg:grid-cols-[1.1fr_1.4fr_1.3fr_1fr_auto] lg:items-end">
        {/* SKAD — optional searchable combobox over the static airport list */}
        <OriginCombobox
          query={originQuery}
          onQueryChange={(value) => {
            setOriginQuery(value);
            setOrigin("");
            setOriginError("");
          }}
          onSelect={(city) => {
            setOrigin(city.city);
            setOriginQuery(city.city);
            setOriginError("");
          }}
          onClear={() => {
            setOrigin("");
            setOriginQuery("");
            setOriginError("");
          }}
          error={originError}
          fieldClassName={fieldCls}
          labelClassName={labelCls}
        />

        {/* DOKAD — autocomplete combobox */}
        <div className="relative flex flex-col gap-1.5">
            <span className={labelCls}>Dokąd</span>
          <input
            ref={destInputRef}
            data-mini-planner-destination
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={destOpen}
            aria-controls={listboxId}
            value={destQuery}
            onChange={(e) => {
              setDestQuery(e.target.value);
              setDestination(e.target.value);
              setDestConfirmed(false);
              setDestError("");
            }}
            onKeyDown={handleDestKeyDown}
            onFocus={() => { if (destSuggestions.length > 0) setDestOpen(true); }}
            onBlur={() => { window.setTimeout(() => setDestOpen(false), 150); }}
            placeholder="Wpisz miasto lub kraj…"
            autoComplete="off"
            className={fieldCls}
          />
          {destOpen && (
            <ul
              id={listboxId}
              ref={destListRef}
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-64 overflow-y-auto rounded-xl border border-emerald-900/10 bg-white py-1 shadow-[0_8px_24px_rgba(16,84,48,0.12)]"
            >
              {destFetching ? (
                <li className="px-3 py-2 text-sm text-emerald-900/56">Szukamy kierunków…</li>
              ) : destSuggestions.length > 0 ? (
                destSuggestions.map((s, idx) => {
                  const ctry = localizeCountry(s.country);
                  const reg = localizeRegion(s.region);
                  const meta = [ctry, reg].filter(Boolean).join(" · ");
                  return (
                    <li
                      key={s.id}
                      role="option"
                      aria-selected={idx === destHighlight}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        selectSuggestion(s);
                      }}
                      onMouseEnter={() => setDestHighlight(idx)}
                      className={`cursor-pointer px-3 py-2 text-sm transition ${
                        idx === destHighlight ? "bg-emerald-50" : "hover:bg-emerald-50/60"
                      }`}
                    >
                      <div className="font-semibold text-emerald-950">{localizeCity(s.city)}</div>
                      {meta && <div className="text-xs text-emerald-900/56">{meta}</div>}
                    </li>
                  );
                })
              ) : (
                <li className="px-3 py-2 text-sm text-emerald-900/56">
                  Brak wyników dla „{destQuery}&rdquo;. Spróbuj innego miasta lub kraju.
                </li>
              )}
            </ul>
          )}
          {destError && (
            <p className="mt-1 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
              {destError}
            </p>
          )}
        </div>

        {/* TERMIN — single field, Booking-style range calendar */}
        <DateRangeField
          checkin={startDate}
          checkout={endDate}
          onChange={(nextStart, nextEnd) => {
            setStartDate(nextStart);
            setEndDate(nextEnd);
            setDateError("");
          }}
          fieldClassName={fieldCls}
          labelClassName={labelCls}
        />

        {/* GOŚCIE — popover with Dorośli / Dzieci steppers */}
        <GuestsField
          adults={adults}
          childCount={childCount}
          onChange={(nextAdults, nextChildren) => {
            setAdults(nextAdults);
            setChildCount(nextChildren);
          }}
          fieldClassName={fieldCls}
          labelClassName={labelCls}
        />

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

      {dateError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          {dateError}
        </p>
      )}

      {!compact && (
        <p className="mt-3 text-[11px] text-emerald-900/70">
              Dokąd możesz zostawić puste — pomożemy wybrać kierunek po Twoich preferencjach.
        </p>
      )}
    </form>
  );
}
