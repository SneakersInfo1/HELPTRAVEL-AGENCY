"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import { DateRangeField } from "@/components/search/date-range-field";
import { GuestsField } from "@/components/search/guests-field";
import { exactOriginMatch } from "@/components/search/origin-combobox";
import { AirportCombobox } from "@/components/flights/airport-combobox";
import { bestAirportOption, resolveOriginFromOption } from "@/lib/flights/airports";
import { useLanguage } from "@/components/site/language-provider";
import { track } from "@/lib/analytics/track";
import { localizeCity, localizeCountry, localizeRegion } from "@/lib/mvp/i18n-geo";
import { sendClientEvent } from "@/lib/mvp/client-events";
import type { DestinationSuggestion } from "@/lib/mvp/types";

interface MiniPlannerFormProps {
  // Kompakt = true ukrywa opis ponizej (gdy form jest w cinematic hero).
  compact?: boolean;
  /** Tryb wyszukiwarki (Faza 2 toggle Hotele/Loty). Domyślnie "hotels" —
   *  bez zmian dla istniejących użyć (homepage hotelowy, pasek wyników).
   *  "flights": pokazuje "Skąd" (wymagane), niemowlęta, kieruje na /loty/wyniki. */
  mode?: "hotels" | "flights";
  /** Initial values when reusing the bar on results pages. Sesja C pkt 2.
      `travelers` is the TOTAL guest count from the `adults` URL param (sum of
      adults+children — product decision); `kids` is the informational
      breakdown from the new `kids` param so "Edytuj" can restore the
      Dorośli/Dzieci split. Old links without `kids` show everyone as adults. */
  initial?: Partial<{
    origin: string;
    destination: string;
    destinationCountry: string;
    /** Zadanie 2 — slug wyspy/regionu (parametr `region` na /hotele/szukaj). */
    regionId: string;
    startDate: string;
    endDate: string;
    travelers: number;
    kids: number;
  }>;
}

/** Wynik rozstrzygnięcia pola "Dokąd" na submit (miasto albo wyspa/region). */
interface ResolvedDestination {
  kind: "city" | "region";
  city: string;
  country: string;
  regionId: string | null;
}

function diffNights(start: string, end: string): number {
  if (!start || !end) return 4;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const nights = Math.round(ms / 86_400_000);
  return nights > 0 ? nights : 4;
}

export function MiniPlannerForm({ compact = false, initial, mode = "hotels" }: MiniPlannerFormProps) {
  const router = useRouter();
  const { locale } = useLanguage();
  const isFlights = mode === "flights";
  const listboxId = useId();
  const destInputRef = useRef<HTMLInputElement>(null);
  const destListRef = useRef<HTMLUListElement>(null);
  // "Skąd" is OPTIONAL now (zadanie 1): no default airport. `origin` holds a
  // CONFIRMED city from the list (or ""), `originQuery` the visible text —
  // same confirmed/query split the destination combobox uses.
  const [origin, setOrigin] = useState(initial?.origin ?? "");
  const [originQuery, setOriginQuery] = useState(initial?.origin ?? "");
  // Tryb lotów (zadanie 1): rozstrzygnięty wybór „Skąd" — kody do zapytania
  // (1 lotnisko, kod metra, albo fan-out grupy „wszystkie lotniska") + etykieta
  // miasta do nagłówka wyników.
  const [originCodes, setOriginCodes] = useState<string[]>([]);
  const [originLabel, setOriginLabel] = useState("");
  const [originError, setOriginError] = useState("");
  // Faza 2 (loty): IATA celu (z s.airportCode), liczba niemowląt, one-way.
  const [destIata, setDestIata] = useState("");
  const [infants, setInfants] = useState(0);
  const [oneWay, setOneWay] = useState(false);
  const [destination, setDestination] = useState(initial?.destination ?? "");
  const [destinationCountry, setDestinationCountry] = useState(initial?.destinationCountry ?? "");
  // Zadanie 2 — wybrana wyspa/region (null = zwykłe miasto). Wpisywanie
  // czegokolwiek w pole zeruje wybór, jak destConfirmed.
  const [destRegionId, setDestRegionId] = useState<string | null>(initial?.regionId ?? null);
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
    // Zadanie 2 — wyspa/region niesie regionId; miasto je zeruje.
    setDestRegionId(s.kind === "region" ? (s.regionId ?? null) : null);
    // Faza 2 (loty): zapamiętaj IATA celu (z autocomplete: airportCode).
    setDestIata(s.airportCode ?? "");
    // Visible input gets the Polish exonym so the user sees what they picked.
    setDestQuery(s.cityPl ?? localizeCity(s.city));
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Jak na Booking: wpisany tekst bez wyboru z listy NIE blokuje submitu.
    // Bierzemy najlepszą podpowiedź serwera ("warszaw"/"warszawa" →
    // Warszawa, "majorka" → wyspa Majorka). Błąd dopiero gdy podpowiedzi
    // nie ma wcale (czyli tekst nie przypomina żadnego kierunku).
    let resolvedDest: ResolvedDestination = {
      kind: destRegionId ? "region" : "city",
      city: destination,
      country: destinationCountry,
      regionId: destRegionId,
    };
    let resolvedDestIata = destIata; // IATA celu (tryb lotów)
    if (destQuery.trim().length > 0 && !destConfirmed) {
      let top: DestinationSuggestion | undefined;
      try {
        const res = await fetch(
          `/api/destinations/suggest?q=${encodeURIComponent(destQuery.trim())}&limit=1`,
        );
        const payload = (await res.json().catch(() => ({ items: [] }))) as {
          items?: DestinationSuggestion[];
        };
        top = payload.items?.[0];
      } catch {
        top = undefined;
      }
      if (!top) {
        setDestError("Nie znaleziono takiego kierunku. Wybierz miasto z listy podpowiedzi.");
        setDestOpen(true);
        return;
      }
      resolvedDest = {
        kind: top.kind === "region" ? "region" : "city",
        city: top.city,
        country: top.country,
        regionId: top.kind === "region" ? (top.regionId ?? null) : null,
      };
      resolvedDestIata = top.airportCode ?? "";
      // Dosynchronizuj UI, żeby po nawigacji wstecz pole pokazywało wybór.
      selectSuggestion(top);
    }
    setDestError("");

    // ── TRYB LOTÓW (Faza 2) ──────────────────────────────────────────────
    if (isFlights) {
      // Cel musi mieć lotnisko (IATA).
      if (!resolvedDestIata) {
        setDestError("Wybierz miasto z lotniskiem z listy podpowiedzi.");
        setDestOpen(true);
        return;
      }
      // "Skąd" WYMAGANE w trybie lotów. Wybór z listy → originCodes/originLabel;
      // wpisany-niewybrany tekst → najlepsza podpowiedź ze słownika (jak na
      // Booking: „warszaw" → grupa Warszawa, „modlin" → WMI).
      let resolvedCodes = originCodes;
      let resolvedOriginLabel = originLabel;
      if (resolvedCodes.length === 0) {
        const best = originQuery.trim() ? bestAirportOption(originQuery) : null;
        if (best) {
          const sel = resolveOriginFromOption(best);
          resolvedCodes = sel.codes;
          resolvedOriginLabel = sel.label;
          setOriginCodes(sel.codes);
          setOriginLabel(sel.label);
          setOriginQuery(sel.inputLabel);
        } else {
          setOriginError("Wybierz lotnisko wylotu z listy.");
          return;
        }
      }
      setOriginError("");
      // Data wylotu wymagana; powrót wymagany, chyba że "w jedną stronę".
      if (!startDate) {
        setDateError("Wybierz datę wylotu.");
        return;
      }
      if (!oneWay && !endDate) {
        setDateError("Wybierz datę powrotu albo zaznacz „w jedną stronę”.");
        return;
      }
      setDateError("");
      const flightParams = new URLSearchParams({
        origin: resolvedCodes.join(","),
        destination: resolvedDestIata,
        depart: startDate,
        adults: String(adults),
      });
      if (resolvedOriginLabel) flightParams.set("originLabel", resolvedOriginLabel);
      if (!oneWay && endDate) flightParams.set("return", endDate);
      if (childCount > 0) flightParams.set("children", String(childCount));
      if (infants > 0) flightParams.set("infants", String(infants));
      track("flight_search", {
        origin: resolvedCodes.join(","),
        destination: resolvedDestIata,
        depart: startDate,
        return: oneWay ? undefined : endDate,
        passengers: adults + childCount + infants,
        round_trip: !oneWay,
        cabin_class: "ECONOMY",
      });
      const flightPrefix = locale === "en" ? "/en" : "";
      router.push(`${flightPrefix}/loty/wyniki?${flightParams.toString()}`);
      return;
    }
    // ── TRYB HOTELI (dotychczasowy) ──────────────────────────────────────
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
    const trimmedDestination = resolvedDest.city.trim();
    // PRODUCT DECISION (zadanie 1): children count as adults downstream —
    // LiteAPI occupancies and the flights search both read the summed
    // `adults` param. `kids` is informational only (restores the UI split).
    const totalGuests = adults + childCount;
    // Sesja C pkt 2: route directly to /hotele/szukaj — the unified results
    // page that composes hotels (LiteAPI).
    const params = new URLSearchParams({
      destination: trimmedDestination,
      country: resolvedDest.country,
      checkin: startDate,
      checkout: endDate,
      adults: String(totalGuests),
      rooms: "1",
    });
    // Zadanie 2 — wyspa/region: dodatkowy parametr `region` (slug ze
    // słownika). `destination` zostaje (EN nazwa regionu) dla spójności
    // metadanych i starych konsumentów; strona wyników preferuje `region`.
    if (resolvedDest.kind === "region" && resolvedDest.regionId) {
      params.set("region", resolvedDest.regionId);
    }
    if (childCount > 0) params.set("kids", String(childCount));
    // Empty "Skąd" → no origin param at all; the results page already hides
    // the flights section when sp.origin is absent.
    if (resolvedOrigin) params.set("origin", resolvedOrigin);
    sendClientEvent("mini_planner_submitted", {
      origin: resolvedOrigin || null,
      destination: trimmedDestination || null,
      country: resolvedDest.country || null,
      region: resolvedDest.regionId,
      nights,
      travelers: totalGuests,
      hasDestination: trimmedDestination.length > 0,
    });
    // GA4 funnel event — hotel_search_submit was defined in the catalogue but
    // never fired anywhere (faza 0 finding); wired here with the two new
    // params from the brief.
    track("hotel_search_submit", {
      destination: trimmedDestination,
      country: resolvedDest.country || undefined,
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
      <div
        className={`grid gap-3 lg:items-end ${
          isFlights
            ? "lg:grid-cols-[1.1fr_1.4fr_1.3fr_1fr_auto]"
            : "lg:grid-cols-[1.4fr_1.3fr_1fr_auto]"
        }`}
      >
        {/* SKAD — tylko w trybie LOTY (Faza 2.2: znika z widoku hotelowego).
            Pojawia się z subtelną animacją fade/slide przy wejściu w loty. */}
        {isFlights && (
          <div className="animate-fade-in">
            <AirportCombobox
              query={originQuery}
              onQueryChange={(value) => {
                setOriginQuery(value);
                setOriginCodes([]);
                setOriginLabel("");
                setOriginError("");
              }}
              onSelect={(option) => {
                const sel = resolveOriginFromOption(option);
                setOriginCodes(sel.codes);
                setOriginLabel(sel.label);
                setOriginQuery(sel.inputLabel);
                setOriginError("");
              }}
              onClear={() => {
                setOriginCodes([]);
                setOriginLabel("");
                setOriginQuery("");
                setOriginError("");
              }}
              error={originError}
              fieldClassName={fieldCls}
              labelClassName={labelCls}
              placeholder="Skąd lecisz?"
              inputAriaLabel="Skąd (lotnisko wylotu)"
            />
          </div>
        )}

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
              setDestRegionId(null);
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
                  // Zadanie 2 — wyspy z oznaczeniem typu ("wyspa · Hiszpania").
                  const isRegion = s.kind === "region";
                  const ctry = localizeCountry(s.country);
                  const reg = isRegion ? "wyspa" : localizeRegion(s.region);
                  const meta = isRegion
                    ? [reg, ctry].filter(Boolean).join(" · ")
                    : [ctry, reg].filter(Boolean).join(" · ");
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
                      <div className="font-semibold text-emerald-950">{s.cityPl ?? localizeCity(s.city)}</div>
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

        {/* GOŚCIE / PASAŻEROWIE — popover; w trybie lotów dochodzą niemowlęta */}
        <GuestsField
          adults={adults}
          childCount={childCount}
          infants={infants}
          showInfants={isFlights}
          fieldLabel={isFlights ? "Pasażerowie" : "Goście"}
          onChange={(nextAdults, nextChildren, nextInfants) => {
            setAdults(nextAdults);
            setChildCount(nextChildren);
            if (typeof nextInfants === "number") setInfants(nextInfants);
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
            {isFlights ? "Szukaj lotów" : "Zaplanuj"}
            <span aria-hidden className="transition group-hover:translate-x-1">→</span>
          </span>
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-rose-500 to-amber-500 opacity-0 transition group-hover:opacity-100"
          />
        </button>
      </div>

      {/* Loty: opcja „w jedną stronę" (pojedyncza data = one-way). */}
      {isFlights && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-[11px] font-medium text-emerald-900/80">
          <input
            type="checkbox"
            checked={oneWay}
            onChange={(e) => {
              setOneWay(e.target.checked);
              setDateError("");
            }}
            className="h-3.5 w-3.5 rounded border-emerald-900/30 text-emerald-600 focus:ring-emerald-500"
          />
          Lot w jedną stronę
        </label>
      )}

      {dateError && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
          {dateError}
        </p>
      )}

      {!compact && !isFlights && (
        <p className="mt-3 text-[11px] text-emerald-900/70">
              Dokąd możesz zostawić puste — pomożemy wybrać kierunek po Twoich preferencjach.
        </p>
      )}
    </form>
  );
}
