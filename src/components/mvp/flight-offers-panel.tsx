"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import type { FlightSearchResponse, NormalizedFlightOffer } from "@/lib/mvp/types";

const INITIAL_VISIBLE = 5;
const STEP = 5;
const MAX_VISIBLE = 30;

// Mapa IATA → czytelna nazwa lotniska
const AIRPORT_NAMES: Record<string, string> = {
  WMI: "Warszawa Modlin",
  WAW: "Warszawa Chopin",
  KRK: "Kraków",
  GDN: "Gdańsk",
  WRO: "Wrocław",
  POZ: "Poznań",
  KTW: "Katowice",
  RZE: "Rzeszów",
  LUZ: "Lublin",
  LCJ: "Łódź",
  SZZ: "Szczecin",
  BZG: "Bydgoszcz",
  LHR: "Londyn Heathrow",
  LGW: "Londyn Gatwick",
  STN: "Londyn Stansted",
  CDG: "Paryż CDG",
  ORY: "Paryż Orly",
  BCN: "Barcelona",
  MAD: "Madryt",
  FCO: "Rzym Fiumicino",
  CIA: "Rzym Ciampino",
  MXP: "Mediolan Malpensa",
  BGY: "Mediolan Bergamo",
  ATH: "Ateny",
  MLA: "Malta",
  TIA: "Tirana",
  IST: "Stambuł",
  SAW: "Stambuł Sabiha",
  AYT: "Antalya",
  LCA: "Larnaka",
  AMS: "Amsterdam",
  BER: "Berlin",
  VIE: "Wiedeń",
  PRG: "Praga",
  BUD: "Budapeszt",
  LIS: "Lizbona",
  OPO: "Porto",
  DUB: "Dublin",
  CPH: "Kopenhaga",
  ARN: "Sztokholm",
  OSL: "Oslo",
  HEL: "Helsinki",
  RAK: "Marrakesz",
  AGA: "Agadir",
  FNC: "Funchal",
  LPA: "Las Palmas",
  TFS: "Teneryfa",
  AGP: "Malaga",
  VLC: "Walencja",
  PMI: "Palma de Mallorca",
  IBZ: "Ibiza",
  BVA: "Paryż Beauvais",
  EIN: "Eindhoven",
  CRL: "Bruksela Charleroi",
  BRU: "Bruksela",
  DUS: "Düsseldorf",
  MUC: "Monachium",
  FRA: "Frankfurt",
  HAM: "Hamburg",
  SOF: "Sofia",
  OTP: "Bukareszt",
  SKG: "Saloniki",
  HER: "Heraklion",
  CFU: "Korfu",
  RHO: "Rodos",
  CHQ: "Chania",
  ZTH: "Zakynthos",
  KGS: "Kos",
  JMK: "Mykonos",
  JTR: "Santorini",
  SPU: "Split",
  DBV: "Dubrownik",
  ZAG: "Zagrzeb",
  LJU: "Lublana",
  RIX: "Ryga",
  VNO: "Wilno",
  TLL: "Tallinn",
  DXB: "Dubaj",
  BKK: "Bangkok",
  HKT: "Phuket",
  SIN: "Singapur",
  NRT: "Tokio Narita",
  HND: "Tokio Haneda",
  KEF: "Reykjavik",
  NAP: "Neapol",
  VCE: "Wenecja",
  BLQ: "Bolonia",
  PSA: "Piza",
  GRO: "Girona",
  REU: "Reus",
  SVQ: "Sewilla",
  BIO: "Bilbao",
  ALC: "Alicante",
};

function formatAirport(code: string): string {
  const name = AIRPORT_NAMES[code.toUpperCase()];
  return name ? `${name} (${code.toUpperCase()})` : code.toUpperCase();
}

const copy = {
  pl: {
    eyebrow: "Loty",
    title: "Konkretne oferty lotów",
    bookNow: "Sprawdź lot",
    perPerson: "/ os.",
    cheapest: "Najtańsza",
    priceFromLabel: "od",
    showMore: "Pokaż więcej lotów",
    empty: "Nie znaleźliśmy lotów dla tej trasy i daty. Zmień dzień wylotu.",
    requestError: "Nie udało się pobrać ofert lotów.",
    deal: "🔥 OKAZJA",
    duration: "Czas",
    sortBest: "Najlepsze",
    sortCheap: "Najtańsze",
    sortFast: "Najszybsze",
    directOnly: "Tylko bezpośrednie",
    nonstopBadge: "Bezpośredni",
    oneStopBadge: "1 przesiadka",
    multiStopBadge: "2+ przesiadki",
    tabOutbound: "Docelowe",
    tabReturn: "Powrotne",
    tabsAriaLabel: "Kierunek lotu",
  },
  en: {
    eyebrow: "Flights",
    title: "Concrete flight offers",
    bookNow: "Check flight",
    perPerson: "/ pers.",
    cheapest: "Cheapest",
    priceFromLabel: "from",
    showMore: "Show more flights",
    empty: "We couldn't find flights for this route and date. Try a different day.",
    requestError: "Could not load flight offers.",
    deal: "🔥 DEAL",
    duration: "Duration",
    sortBest: "Best",
    sortCheap: "Cheapest",
    sortFast: "Fastest",
    directOnly: "Direct only",
    nonstopBadge: "Non-stop",
    oneStopBadge: "1 stop",
    multiStopBadge: "2+ stops",
    tabOutbound: "Outbound",
    tabReturn: "Return",
    tabsAriaLabel: "Flight direction",
  },
} as const;

type Direction = "outbound" | "return";

type FlightSortKey = "best" | "cheap" | "fast";

function rankFlights(offers: NormalizedFlightOffer[], sort: FlightSortKey): NormalizedFlightOffer[] {
  if (offers.length === 0) return offers;
  switch (sort) {
    case "cheap":
      return [...offers].sort((a, b) => a.total_amount - b.total_amount);
    case "fast":
      return [...offers].sort((a, b) => a.total_duration_minutes - b.total_duration_minutes);
    case "best":
    default: {
      // Best-deal score: price + (extra duration over shortest) * 0.5 PLN/min.
      // A 30-hour flight that's 1700 min slower than the 90-min direct will
      // pick up ~850 "virtual zł" — enough to push it well below cheap-fast
      // direct flights but not enough to bury legitimate small-savings stops.
      const shortest = Math.min(...offers.map((o) => o.total_duration_minutes || Infinity));
      const PENALTY_PER_MIN = 0.5;
      return [...offers].sort((a, b) => {
        const scoreA = a.total_amount + Math.max(0, a.total_duration_minutes - shortest) * PENALTY_PER_MIN;
        const scoreB = b.total_amount + Math.max(0, b.total_duration_minutes - shortest) * PENALTY_PER_MIN;
        return scoreA - scoreB;
      });
    }
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Request failed (${response.status}).`);
    }
    return (await response.json()) as T;
  });
}

function formatPrice(value: number, currency: string, locale: "pl" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "pl-PL", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatTime(value: string, locale: "pl" | "en"): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDayShort(value: string, locale: "pl" | "en"): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function aviasalesOneWayUrl(
  originIata: string,
  destIata: string,
  departureDate: string,
  passengers: number,
): string | null {
  if (!departureDate) return null;
  const marker = process.env.NEXT_PUBLIC_TRAVELPAYOUTS_MARKER ?? "";
  const date = new Date(departureDate);
  if (Number.isNaN(date.getTime())) return null;
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const pax = Math.max(1, passengers);
  const base = `https://www.aviasales.com/search/${originIata.toUpperCase()}${dd}${mm}${destIata.toUpperCase()}${pax}1`;
  return marker ? `${base}?marker=${marker}` : base;
}

type Copy = (typeof copy)[keyof typeof copy];

function FlightCard({ offer, locale, t, isDeal, ctaUrl }: {
  offer: NormalizedFlightOffer;
  locale: "pl" | "en";
  t: Copy;
  isDeal: boolean;
  ctaUrl: string | null;
}) {
  const stopsLabel = offer.number_of_stops === 0 ? t.nonstopBadge : offer.number_of_stops === 1 ? t.oneStopBadge : t.multiStopBadge;
  const stopsClasses =
    offer.number_of_stops === 0
      ? "bg-emerald-100 text-emerald-800"
      : offer.number_of_stops === 1
        ? "bg-amber-100 text-amber-800"
        : "bg-neutral-100 text-neutral-700";
  return (
    <article className={`relative flex flex-col items-stretch gap-3 rounded-2xl border bg-white p-4 shadow-[0_4px_16px_rgba(16,84,48,0.05)] transition hover:border-emerald-500/40 hover:shadow-[0_8px_24px_rgba(16,84,48,0.1)] sm:flex-row sm:items-center sm:gap-4 ${
      isDeal ? "border-emerald-500/60 ring-1 ring-emerald-300" : "border-emerald-900/10"
    }`}>
      {isDeal ? (
        <span className="absolute -top-2 left-4 z-10 rounded-full bg-gradient-to-r from-orange-500 to-red-500 px-2 py-1 text-[10px] font-bold tracking-wide text-white shadow">
          {t.deal}
        </span>
      ) : null}

      <div className="hidden w-16 shrink-0 sm:block">
        <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">{offer.airline}</p>
      </div>

      <div className="flex flex-1 flex-col gap-2">
        <FlightLeg
          label={null}
          arrow="→"
          origin={offer.origin}
          destination={offer.destination}
          departureTime={offer.departure_time}
          arrivalTime={offer.arrival_time}
          duration={offer.total_duration}
          stopsLabel={stopsLabel}
          stopsClasses={stopsClasses}
          locale={locale}
          airline={offer.airline}
        />
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">{t.priceFromLabel}</p>
          <p className="whitespace-nowrap text-xl font-bold text-emerald-950">
            {formatPrice(offer.total_amount, offer.currency, locale)}
          </p>
          <p className="text-[10px] text-emerald-900/56">{t.perPerson}</p>
        </div>
        {ctaUrl ? (
          <a
            href={offer.bookingUrl ?? ctaUrl}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white transition hover:bg-emerald-800"
          >
            {t.bookNow}
          </a>
        ) : null}
      </div>
    </article>
  );
}

export function FlightOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  originCity: string;
  departureDate: string;
  returnDate: string;
  passengers: number;
}) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const [direction, setDirection] = useState<Direction>("outbound");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<FlightSearchResponse | null>(null);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  // Per-direction one-way query: outbound = origin → destination on
  // departureDate; return = destination → origin on returnDate. Calling the
  // API one-way (no returnDate) routes through TP /v3/prices_for_dates which
  // returns real per-flight durations and direct flights — round-trip
  // /v3/get_latest_prices only returns paired stopover combos with halved
  // duration estimates (that's why WAW→BER showed as "17h").
  const queryOrigin = direction === "outbound" ? props.originCity : props.destinationCity;
  const queryDestination = direction === "outbound" ? props.destinationCity : props.originCity;
  const queryDate = direction === "outbound" ? props.departureDate : props.returnDate;
  const hasReturnLeg = Boolean(props.returnDate);

  useEffect(() => {
    if (!queryDestination || !queryOrigin || !queryDate) {
      setData(null);
      setError("");
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<FlightSearchResponse>("/api/flights/search", {
            origin: queryOrigin,
            destination: queryDestination,
            departureDate: queryDate,
            passengers: props.passengers,
            cabinClass: "economy",
            sortBy: "cheap",
          });
          if (!cancelled) {
            setData(result);
            setVisible(INITIAL_VISIBLE);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : t.requestError);
            setData(null);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    queryDate,
    queryDestination,
    queryOrigin,
    props.passengers,
    t.requestError,
  ]);

  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const sort: FlightSortKey = (() => {
    const v = sp.get("flightSort");
    return v === "cheap" || v === "fast" ? v : "best";
  })();
  const directOnly = sp.get("directOnly") === "true";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, sp],
  );

  const allOffers = useMemo(() => data?.offers ?? [], [data?.offers]);

  const filteredOffers = useMemo(
    () => (directOnly ? allOffers.filter((o) => o.number_of_stops === 0) : allOffers),
    [allOffers, directOnly],
  );

  const sortedOffers = useMemo(() => rankFlights(filteredOffers, sort), [filteredOffers, sort]);

  // OKAZJA gate: only direct flights priced at or below the median direct
  // price qualify. Previously every result claimed to be a deal — this kills
  // the badge as visual noise and restores its signal value.
  const dealEligibleIds = useMemo(() => {
    const directs = allOffers.filter((o) => o.number_of_stops === 0);
    if (directs.length === 0) return new Set<string>();
    const m = median(directs.map((o) => o.total_amount));
    return new Set(directs.filter((o) => o.total_amount <= m).map((o) => o.offerId));
  }, [allOffers]);

  const shown = sortedOffers.slice(0, Math.min(visible, MAX_VISIBLE));
  const canShowMore = visible < Math.min(sortedOffers.length, MAX_VISIBLE);
  const hasAnyDirect = useMemo(() => allOffers.some((o) => o.number_of_stops === 0), [allOffers]);

  return (
    <section id="planner-flights" className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-5 shadow-[0_12px_32px_rgba(16,84,48,0.06)]">
      <header className="mb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t.eyebrow}</p>
        <h2 className="mt-1 text-xl font-bold text-emerald-950">{t.title}</h2>
      </header>

      {/* Direction tabs (Docelowe / Powrotne) — primary axis. Each tab fires
          its own one-way query so durations + direct-flight availability are
          real (not halved round-trip estimates). */}
      {hasReturnLeg && (
        <div role="tablist" aria-label={t.tabsAriaLabel} className="mb-3 inline-flex gap-1 rounded-full bg-emerald-50 p-1">
          {(["outbound", "return"] as const).map((dir) => {
            const active = direction === dir;
            return (
              <button
                key={dir}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setDirection(dir)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                  active ? "bg-emerald-700 text-white shadow" : "text-emerald-800 hover:bg-white/70"
                }`}
              >
                {dir === "outbound" ? t.tabOutbound : t.tabReturn}
              </button>
            );
          })}
        </div>
      )}

      {/* Sort tabs + direct-only filter */}
      {!loading && allOffers.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div role="tablist" className="inline-flex rounded-full border border-emerald-900/12 bg-emerald-50/60 p-1">
            {([
              { k: "best", label: t.sortBest },
              { k: "cheap", label: t.sortCheap },
              { k: "fast", label: t.sortFast },
            ] as const).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={sort === k}
                onClick={() => setParam("flightSort", k === "best" ? null : k)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  sort === k ? "bg-emerald-700 text-white shadow" : "text-emerald-900/72 hover:bg-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
            directOnly ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-emerald-900/12 bg-white text-emerald-900/72 hover:bg-emerald-50/40"
          } ${!hasAnyDirect ? "opacity-50" : ""}`}>
            <input
              type="checkbox"
              checked={directOnly}
              disabled={!hasAnyDirect}
              onChange={(e) => setParam("directOnly", e.target.checked ? "true" : null)}
              className="h-3.5 w-3.5 accent-emerald-700"
            />
            {t.directOnly}
          </label>
        </div>
      )}

      {loading && shown.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="h-24 animate-pulse rounded-2xl bg-emerald-50" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <>
          <div className="flex flex-col gap-3">
            {shown.map((offer) => (
              <FlightCard
                key={offer.offerId}
                offer={offer}
                locale={locale}
                t={t}
                isDeal={dealEligibleIds.has(offer.offerId)}
                ctaUrl={aviasalesOneWayUrl(
                  offer.origin,
                  offer.destination,
                  queryDate,
                  props.passengers,
                )}
              />
            ))}
          </div>
          {canShowMore ? (
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setVisible((v) => Math.min(MAX_VISIBLE, v + STEP))}
                className="rounded-full border border-emerald-900/12 bg-white px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
              >
                {t.showMore}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-2xl bg-emerald-50/60 p-5 text-sm text-emerald-900/76">
          {error || data?.error || t.empty}
        </div>
      )}
    </section>
  );
}

// Single-leg row used by the card. Re-rendered for both outbound and return
// when round-trip data is present (Sesja C1 FIX 2).
function FlightLeg({
  label,
  arrow,
  origin,
  destination,
  departureTime,
  arrivalTime,
  duration,
  stopsLabel,
  stopsClasses,
  locale,
  airline,
}: {
  label: string | null;
  arrow: "→" | "←";
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stopsLabel: string;
  stopsClasses: string;
  locale: "pl" | "en";
  airline: string;
}) {
  return (
    <div className="flex items-center gap-3">
      {label && (
        <span className="hidden w-12 shrink-0 text-[10px] font-bold uppercase tracking-wider text-emerald-700 sm:block">
          {arrow} {label}
        </span>
      )}
      <div className="flex flex-1 items-center gap-3">
        <div className="text-center">
          <p className="text-base font-bold text-emerald-950">{formatTime(departureTime, locale)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {formatDayShort(departureTime, locale)}
          </p>
          <p className="text-[11px] text-emerald-900/56" title={formatAirport(origin)}>
            {formatAirport(origin)}
          </p>
        </div>
        <div className="flex flex-1 flex-col items-center">
          <p className="text-sm font-semibold text-emerald-950">{duration || "—"}</p>
          <div className="my-1 flex w-full items-center gap-2">
            <span className="h-px flex-1 bg-emerald-200" />
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${stopsClasses}`}>
              {stopsLabel}
            </span>
            <span className="h-px flex-1 bg-emerald-200" />
          </div>
          <p className="text-[10px] text-emerald-900/56 sm:hidden">{airline}</p>
        </div>
        <div className="text-center">
          <p className="text-base font-bold text-emerald-950">{formatTime(arrivalTime, locale)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            {formatDayShort(arrivalTime, locale)}
          </p>
          <p className="text-[11px] text-emerald-900/56" title={formatAirport(destination)}>
            {formatAirport(destination)}
          </p>
        </div>
      </div>
    </div>
  );
}
