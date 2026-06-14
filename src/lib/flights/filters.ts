// Filtrowanie i sortowanie ofert lotów — czyste funkcje (client-safe), zadanie 2.
//
// Wszystkie oferty są już pobrane (fan-out + scalenie w flight-results), więc
// filtrujemy/sortujemy po stronie klienta. Faceting jest DANYMI-STEROWANY: panel
// pokazuje tylko te filtry, które realnie da się zastosować (np. „lotniska
// wylotu" tylko gdy jest >1 lotnisko — przy grupie „wszystkie lotniska").

import type { Airline, DisplayOffer } from "./display";

export type SortKey = "best" | "price" | "duration" | "earliest" | "latest";
export type TimeBucket = "night" | "morning" | "afternoon" | "evening";
export type BaggageKey = "carry" | "checked";
/** 0 = bezpośredni, 1 = 1 przesiadka, 2 = 2+ przesiadek. */
export type StopBucket = 0 | 1 | 2;

export interface FlightFilters {
  stops: StopBucket[];
  airlines: string[]; // kody IATA przewoźników
  departBuckets: TimeBucket[];
  originAirports: string[]; // kody IATA lotnisk wylotu (outbound)
  baggage: BaggageKey[];
  maxDuration: number | null; // minuty
  maxPrice: number | null;
}

export const EMPTY_FILTERS: FlightFilters = {
  stops: [],
  airlines: [],
  departBuckets: [],
  originAirports: [],
  baggage: [],
  maxDuration: null,
  maxPrice: null,
};

export function hasActiveFilters(f: FlightFilters): boolean {
  return (
    f.stops.length > 0 ||
    f.airlines.length > 0 ||
    f.departBuckets.length > 0 ||
    f.originAirports.length > 0 ||
    f.baggage.length > 0 ||
    f.maxDuration !== null ||
    f.maxPrice !== null
  );
}

export const TIME_BUCKETS: { key: TimeBucket; label: string; range: string }[] = [
  { key: "night", label: "Noc", range: "00–06" },
  { key: "morning", label: "Rano", range: "06–12" },
  { key: "afternoon", label: "Popołudnie", range: "12–18" },
  { key: "evening", label: "Wieczór", range: "18–24" },
];

function bucketOf(iso: string): TimeBucket {
  const h = new Date(iso).getHours();
  if (h < 6) return "night";
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/** Liczba przesiadek całej oferty = maksimum po odcinkach (round-trip: oba kierunki). */
export function offerStops(o: DisplayOffer): StopBucket {
  const max = o.legs.reduce((m, l) => Math.max(m, l.stops), 0);
  return (max >= 2 ? 2 : max) as StopBucket;
}

/** Lotnisko wylotu oferty (pierwszy odcinek outbound). */
export function offerOriginCode(o: DisplayOffer): string {
  return o.legs[0]?.originCode ?? "";
}

/** Godzina wylotu (outbound) — do bucketów i sortu „najwcześniejszy/najpóźniejszy". */
export function offerDepartTime(o: DisplayOffer): string {
  return o.legs[0]?.departureTime ?? "";
}

/** Przewoźnicy oferty (kod, nazwa, logo) ze wszystkich segmentów — filtr linii. */
export function offerAirlines(o: DisplayOffer): Airline[] {
  const map = new Map<string, Airline>();
  for (const leg of o.legs) {
    for (const s of leg.segments) {
      const code = s.carrierCode || s.carrierName;
      if (code && !map.has(code)) map.set(code, { code, name: s.carrierName || s.carrierCode || code, logoUrl: s.carrierLogo });
    }
  }
  return [...map.values()];
}

// ── Faceting ──────────────────────────────────────────────────────────────────

export interface Facets {
  stops: { value: StopBucket; count: number }[];
  airlines: { code: string; name: string; logoUrl?: string; count: number }[];
  departBuckets: { key: TimeBucket; count: number }[];
  originAirports: { code: string; count: number }[];
  priceMin: number;
  priceMax: number;
  durationMin: number;
  durationMax: number;
  carryCount: number;
  checkedCount: number;
}

export function computeFacets(offers: DisplayOffer[]): Facets {
  const stopCounts = new Map<StopBucket, number>();
  const airlineCounts = new Map<string, { name: string; logoUrl?: string; count: number }>();
  const bucketCounts = new Map<TimeBucket, number>();
  const originCounts = new Map<string, number>();
  let priceMin = Infinity;
  let priceMax = 0;
  let durationMin = Infinity;
  let durationMax = 0;
  let carryCount = 0;
  let checkedCount = 0;

  for (const o of offers) {
    const st = offerStops(o);
    stopCounts.set(st, (stopCounts.get(st) ?? 0) + 1);

    for (const a of offerAirlines(o)) {
      const cur = airlineCounts.get(a.code) ?? { name: a.name, logoUrl: a.logoUrl, count: 0 };
      cur.count += 1;
      airlineCounts.set(a.code, cur);
    }

    const dep = offerDepartTime(o);
    if (dep) {
      const b = bucketOf(dep);
      bucketCounts.set(b, (bucketCounts.get(b) ?? 0) + 1);
    }

    const oc = offerOriginCode(o);
    if (oc) originCounts.set(oc, (originCounts.get(oc) ?? 0) + 1);

    if (typeof o.total === "number") {
      priceMin = Math.min(priceMin, o.total);
      priceMax = Math.max(priceMax, o.total);
    }
    durationMin = Math.min(durationMin, o.maxDurationMinutes);
    durationMax = Math.max(durationMax, o.maxDurationMinutes);
    if (o.hasCarryOnBag) carryCount += 1;
    if (o.hasCheckedBag) checkedCount += 1;
  }

  return {
    stops: ([0, 1, 2] as StopBucket[]).filter((v) => stopCounts.has(v)).map((v) => ({ value: v, count: stopCounts.get(v)! })),
    airlines: [...airlineCounts.entries()]
      .map(([code, { name, logoUrl, count }]) => ({ code, name, logoUrl, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    departBuckets: TIME_BUCKETS.filter((b) => bucketCounts.has(b.key)).map((b) => ({ key: b.key, count: bucketCounts.get(b.key)! })),
    originAirports: [...originCounts.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    priceMin: priceMin === Infinity ? 0 : Math.floor(priceMin),
    priceMax: Math.ceil(priceMax),
    durationMin: durationMin === Infinity ? 0 : durationMin,
    durationMax,
    carryCount,
    checkedCount,
  };
}

// ── Filtrowanie + sortowanie ──────────────────────────────────────────────────

export function applyFilters(offers: DisplayOffer[], f: FlightFilters): DisplayOffer[] {
  return offers.filter((o) => {
    if (f.stops.length && !f.stops.includes(offerStops(o))) return false;
    if (f.airlines.length) {
      const codes = offerAirlines(o).map((a) => a.code);
      if (!f.airlines.some((c) => codes.includes(c))) return false;
    }
    if (f.departBuckets.length) {
      const dep = offerDepartTime(o);
      if (!dep || !f.departBuckets.includes(bucketOf(dep))) return false;
    }
    if (f.originAirports.length && !f.originAirports.includes(offerOriginCode(o))) return false;
    if (f.maxDuration !== null && o.maxDurationMinutes > f.maxDuration) return false;
    if (f.maxPrice !== null && typeof o.total === "number" && o.total > f.maxPrice) return false;
    if (f.baggage.includes("carry") && !o.hasCarryOnBag) return false;
    if (f.baggage.includes("checked") && !o.hasCheckedBag) return false;
    return true;
  });
}

export function sortOffers(offers: DisplayOffer[], sort: SortKey): DisplayOffer[] {
  const copy = [...offers];
  if (sort === "price") {
    copy.sort((a, b) => (a.total ?? Infinity) - (b.total ?? Infinity));
  } else if (sort === "duration") {
    copy.sort((a, b) => a.maxDurationMinutes - b.maxDurationMinutes);
  } else if (sort === "earliest") {
    copy.sort((a, b) => offerDepartTime(a).localeCompare(offerDepartTime(b)));
  } else if (sort === "latest") {
    copy.sort((a, b) => offerDepartTime(b).localeCompare(offerDepartTime(a)));
  } else {
    // best — ranking łączony: znormalizowana cena + czas (niżej = lepiej).
    const prices = copy.map((o) => o.total ?? 0).filter((v) => v > 0);
    const durs = copy.map((o) => o.maxDurationMinutes);
    const pMin = Math.min(...prices, 0);
    const pMax = Math.max(...prices, 1);
    const dMin = Math.min(...durs, 0);
    const dMax = Math.max(...durs, 1);
    const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0);
    const score = (o: DisplayOffer) =>
      norm(o.total ?? pMax, pMin, pMax) + norm(o.maxDurationMinutes, dMin, dMax);
    copy.sort((a, b) => score(a) - score(b));
  }
  return copy;
}

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "best", label: "Najlepsze" },
  { key: "price", label: "Najtańsze" },
  { key: "duration", label: "Najszybsze" },
  { key: "earliest", label: "Najwcześniejszy wylot" },
  { key: "latest", label: "Najpóźniejszy wylot" },
];
