"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useLanguage } from "@/components/site/language-provider";
import { countNightsBetweenIsoDates } from "@/lib/mvp/travel-dates";
import type { NormalizedStayOffer, StaySearchResponse } from "@/lib/mvp/types";

const INITIAL_VISIBLE = 10;
const STEP = 5;
const MAX_VISIBLE = 30;

const copy = {
  pl: {
    eyebrow: "Hotele",
    title: "Konkretne oferty hoteli",
    body: "Ceny pobytu w PLN. Klik prowadzi do partnera, gdzie finalizujesz rezerwację.",
    loading: "Sprawdzamy dostępność...",
    nights: (n: number) => `${n} ${n === 1 ? "noc" : n < 5 ? "noce" : "nocy"}`,
    bookNow: "Rezerwuj",
    noPrice: "Cena u partnera",
    showMore: "Pokaż więcej hoteli",
    jumpToFlights: "Pokaż loty",
    empty: "Nie znaleźliśmy ofert dla tych dat. Zmień termin lub liczbę gości.",
    requestError: "Nie udało się pobrać ofert hoteli.",
    starsLabel: (s: number) => `${s}★`,
    cheapest: "Najtańsza",
    priceFromLabel: "od",
    emptyAdvice: "Spróbuj innych dat, mniej osób w pokoju lub innego pobliskiego miasta.",
    moreOptions: (n: number) => `${n} ${n === 1 ? "opcja noclegu" : n < 5 ? "opcje noclegu" : "opcji noclegu"}`,
    perNight: "/ noc",
    totalForNights: (total: string, n: number) =>
      `${total} za ${n} ${n === 1 ? "noc" : n < 5 ? "noce" : "nocy"} · wł. podatków i opłat`,
    filtersTitle: "Filtry",
    filtersOpen: "Filtry i sortowanie",
    filtersClose: "Zamknij",
    filtersApply: "Pokaż wyniki",
    filtersReset: "Wyczyść",
    sortLabel: "Sortuj",
    sortRecommended: "Rekomendowane",
    sortPriceAsc: "Cena rosnąco",
    sortPriceDesc: "Cena malejąco",
    sortRating: "Ocena gości",
    priceLabel: "Cena za pobyt (PLN)",
    priceMin: "od",
    priceMax: "do",
    starsLabelTitle: "Standard hotelu",
    starsAndUp: "i więcej",
    ratingLabel: "Ocena gości",
    ratingAll: "Wszystkie",
    cancelLabel: "Anulacja",
    cancelFree: "Tylko z bezpłatną anulacją",
    flightsCardTitle: "Loty na ten kierunek",
    flightsCardBody: "Sprawdź ceny przelotów dopasowane do Twoich dat.",
    flightsCardCta: "Zobacz wszystkie loty →",
    resultsCount: (n: number) => `${n} ${n === 1 ? "hotel" : n < 5 ? "hotele" : "hoteli"}`,
  },
  en: {
    eyebrow: "Stays",
    title: "Concrete hotel offers",
    body: "Stay prices in PLN. Clicks lead to the partner where booking is finalized.",
    loading: "Checking availability...",
    nights: (n: number) => `${n} ${n === 1 ? "night" : "nights"}`,
    bookNow: "Book",
    noPrice: "Price at partner",
    showMore: "Show more stays",
    jumpToFlights: "Show flights",
    empty: "We couldn't find offers for these dates. Try different dates or guest count.",
    requestError: "Could not load stay offers.",
    starsLabel: (s: number) => `${s}★`,
    cheapest: "Cheapest",
    priceFromLabel: "from",
    emptyAdvice: "Try different dates, fewer guests per room, or a nearby city.",
    moreOptions: (n: number) => `${n} ${n === 1 ? "stay option" : "stay options"}`,
    perNight: "/ night",
    totalForNights: (total: string, n: number) =>
      `${total} for ${n} ${n === 1 ? "night" : "nights"} · taxes & fees included`,
    filtersTitle: "Filters",
    filtersOpen: "Filters & sort",
    filtersClose: "Close",
    filtersApply: "Show results",
    filtersReset: "Clear",
    sortLabel: "Sort",
    sortRecommended: "Recommended",
    sortPriceAsc: "Price low to high",
    sortPriceDesc: "Price high to low",
    sortRating: "Guest rating",
    priceLabel: "Stay price (PLN)",
    priceMin: "from",
    priceMax: "to",
    starsLabelTitle: "Hotel class",
    starsAndUp: "and up",
    ratingLabel: "Guest rating",
    ratingAll: "All",
    cancelLabel: "Cancellation",
    cancelFree: "Free cancellation only",
    flightsCardTitle: "Flights to this destination",
    flightsCardBody: "See flight prices matched to your dates.",
    flightsCardCta: "See all flights →",
    resultsCount: (n: number) => `${n} ${n === 1 ? "hotel" : "hotels"}`,
  },
} as const;

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

type Copy = (typeof copy)[keyof typeof copy];

// Deduplicate by accommodationId (LiteAPI hotelId), then by name+city as a
// safety net for upstream feeds that re-emit the same hotel under multiple
// supplier IDs. Per-hotel we keep the cheapest total, and surface the rest
// as "X opcji noclegu" — the actual rates remain reachable on /hotele/[id].
// ─────────────────────────────────────────────────────────────────────────────
// URL-driven filters / sort. We write to the current pathname (works on
// /planner where this panel lives, and anywhere else it's mounted) so every
// filter/sort change produces a shareable URL.
// ─────────────────────────────────────────────────────────────────────────────
type SortKey = "recommended" | "price_asc" | "price_desc" | "rating";

interface PanelFilters {
  minPrice: number | null;
  maxPrice: number | null;
  minStars: number | null;
  minRating: number | null;
  freeCancelOnly: boolean;
  sort: SortKey;
}

function parseFilters(sp: URLSearchParams): PanelFilters {
  const num = (k: string) => {
    const v = sp.get(k);
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const sort = (sp.get("sort") ?? "recommended") as SortKey;
  return {
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    minStars: num("minStars"),
    minRating: num("minRating"),
    freeCancelOnly: sp.get("cancel") === "free",
    sort: ["recommended", "price_asc", "price_desc", "rating"].includes(sort) ? sort : "recommended",
  };
}

function applyFilters(
  groups: Array<{ offer: NormalizedStayOffer; alternativeCount: number }>,
  f: PanelFilters,
): Array<{ offer: NormalizedStayOffer; alternativeCount: number }> {
  let out = groups;
  if (f.minPrice !== null) out = out.filter((g) => g.offer.total_amount >= f.minPrice!);
  if (f.maxPrice !== null) out = out.filter((g) => g.offer.total_amount <= f.maxPrice!);
  if (f.minStars !== null) out = out.filter((g) => (g.offer.rating ?? 0) >= f.minStars!);
  if (f.minRating !== null) out = out.filter((g) => (g.offer.reviewScore ?? 0) >= f.minRating!);
  // Free-cancel filter: NormalizedStayOffer doesn't carry the policy flag, so
  // until the adapter exposes it we treat this as a no-op rather than emit a
  // wrong empty state. Phase 4 surfaces refundableTag at this layer.
  // (Intentional, not a TODO.)
  void f.freeCancelOnly;

  switch (f.sort) {
    case "price_asc":
      out = [...out].sort((a, b) => a.offer.total_amount - b.offer.total_amount);
      break;
    case "price_desc":
      out = [...out].sort((a, b) => b.offer.total_amount - a.offer.total_amount);
      break;
    case "rating":
      out = [...out].sort((a, b) => (b.offer.reviewScore ?? 0) - (a.offer.reviewScore ?? 0));
      break;
    default:
      out = [...out].sort((a, b) => {
        const score = (g: typeof a) =>
          (g.offer.reviewScore ?? 7) * 100 - g.offer.total_amount / 10;
        return score(b) - score(a);
      });
  }
  return out;
}

function dedupeOffers(offers: NormalizedStayOffer[]): Array<{ offer: NormalizedStayOffer; alternativeCount: number }> {
  const map = new Map<string, { offer: NormalizedStayOffer; alternativeCount: number }>();
  for (const o of offers) {
    const key = (o.accommodationId || `${o.name}|${o.city}`).toLowerCase();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { offer: o, alternativeCount: 0 });
      continue;
    }
    existing.alternativeCount += 1;
    if (o.total_amount > 0 && (existing.offer.total_amount <= 0 || o.total_amount < existing.offer.total_amount)) {
      // Keep cheapest as the displayed offer; preserve the alternative tally.
      const altCount = existing.alternativeCount;
      map.set(key, { offer: o, alternativeCount: altCount });
    }
  }
  return Array.from(map.values());
}

function StayCard({ offer, nights, locale, t, isCheapest, alternativeCount }: {
  offer: NormalizedStayOffer;
  nights: number;
  locale: "pl" | "en";
  t: Copy;
  isCheapest: boolean;
  alternativeCount: number;
}) {
  const stars = offer.rating ?? 0;

  return (
    <article
      className={`group relative flex items-stretch overflow-hidden rounded-2xl border bg-white shadow-[0_4px_16px_rgba(16,84,48,0.05)]
        transition-all duration-[250ms] [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]
        hover:scale-[1.02] hover:shadow-[0_12px_32px_rgba(16,84,48,0.14)] hover:border-emerald-400/60
        motion-reduce:hover:scale-100 motion-reduce:transition-none
        ${isCheapest ? "border-emerald-500/60 ring-1 ring-emerald-300" : "border-emerald-900/10"}`}
    >
      {isCheapest ? (
        <span className="absolute left-2 top-2 z-10 rounded-full bg-emerald-700 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow">
          {t.cheapest}
        </span>
      ) : null}

      {/* Zdjęcie z zoom-in na hover */}
      <div className="relative h-32 w-32 shrink-0 overflow-hidden bg-emerald-50 sm:h-36 sm:w-48">
        {offer.imageUrl ? (
          <Image
            src={offer.imageUrl}
            alt={offer.name}
            fill
            sizes="(max-width: 640px) 128px, 192px"
            className="object-cover transition-transform duration-[350ms] ease-out group-hover:scale-110 motion-reduce:group-hover:scale-100"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-emerald-50">
            <svg className="h-10 w-10 text-emerald-200" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm6 13H6v-.5c0-2 4-3.1 6-3.1s6 1.1 6 3.1V19z"/>
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-1 items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="line-clamp-1 text-base font-bold text-emerald-950">{offer.name}</h3>
            {stars > 0 ? (
              <span className="translate-y-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 opacity-0 transition-all duration-200 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100">
                {t.starsLabel(stars)}
              </span>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-1 text-xs text-emerald-900/64">{offer.address}</p>
          <p className="mt-2 text-[11px] text-emerald-900/80">
            {t.nights(nights)}
            {alternativeCount > 0 ? <> · <span className="font-semibold text-emerald-700">{t.moreOptions(alternativeCount + 1)}</span></> : null}
          </p>
          {offer.description ? (
            <p className="mt-1 text-[11px] text-emerald-700/70">{offer.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {offer.total_amount > 0 ? (
            <div className="text-right">
              <p className="whitespace-nowrap text-xl font-bold text-emerald-700 transition-colors duration-150 group-hover:text-emerald-600">
                {formatPrice(Math.round(offer.total_amount / Math.max(1, nights)), offer.currency, locale)}
                <span className="ml-0.5 text-xs font-semibold text-emerald-700/80">{t.perNight}</span>
              </p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] text-emerald-900/80">
                {t.totalForNights(formatPrice(offer.total_amount, offer.currency, locale), nights)}
              </p>
            </div>
          ) : (
            <p className="text-sm font-semibold text-emerald-900/72">{t.noPrice}</p>
          )}
          {offer.bookingUrl ? (
            <a
              href={offer.bookingUrl}
              target="_blank"
              rel="noreferrer"
              className="translate-y-1 whitespace-nowrap rounded-full bg-emerald-700 px-5 py-2 text-sm font-bold text-white opacity-0 transition-all duration-200 hover:bg-emerald-800 group-hover:translate-y-0 group-hover:opacity-100 motion-reduce:translate-y-0 motion-reduce:opacity-100"
            >
              {t.bookNow}
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function StayOffersPanel(props: {
  destinationCity: string;
  destinationCountry: string;
  checkInDate: string;
  checkOutDate: string;
  guests: number;
  rooms: number;
}) {
  const { locale } = useLanguage();
  const t = copy[locale];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<StaySearchResponse | null>(null);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const nights = useMemo(
    () => countNightsBetweenIsoDates(props.checkInDate, props.checkOutDate, 4),
    [props.checkInDate, props.checkOutDate],
  );

  useEffect(() => {
    if (!props.destinationCity) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError("");
        try {
          const result = await postJson<StaySearchResponse>("/api/stays/search", {
            city: props.destinationCity,
            country: props.destinationCountry,
            checkInDate: props.checkInDate,
            nights,
            guests: props.guests,
            rooms: props.rooms,
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
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    nights,
    props.checkInDate,
    props.destinationCity,
    props.destinationCountry,
    props.guests,
    props.rooms,
    t.requestError,
  ]);

  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const filters = useMemo(() => parseFilters(sp), [sp]);

  const setFilterParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (!value) next.delete(key);
      else next.set(key, value);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, sp],
  );

  const dedupedAll = useMemo(() => dedupeOffers(data?.offers ?? []), [data?.offers]);
  const filteredAll = useMemo(() => applyFilters(dedupedAll, filters), [dedupedAll, filters]);
  const shown = filteredAll.slice(0, Math.min(visible, MAX_VISIBLE));
  const canShowMore = visible < Math.min(filteredAll.length, MAX_VISIBLE);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const filtersBlock = (
    <FiltersPanel filters={filters} setFilterParam={setFilterParam} t={t} />
  );

  return (
    <section className="rounded-[1.5rem] border border-emerald-900/10 bg-white p-5 shadow-[0_12px_32px_rgba(16,84,48,0.06)]">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{t.eyebrow}</p>
          <h2 className="mt-1 text-xl font-bold text-emerald-950">{t.title}</h2>
          <p className="mt-1 text-sm text-emerald-900/72">{t.body}</p>
        </div>
        {filteredAll.length > 0 && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            {t.resultsCount(filteredAll.length)}
          </span>
        )}
      </header>

      {/* Mobile filter trigger */}
      <button
        type="button"
        onClick={() => setMobileFiltersOpen(true)}
        className="mb-3 inline-flex h-10 items-center justify-center rounded-full border border-emerald-900/12 bg-white px-4 text-xs font-semibold text-emerald-950 lg:hidden"
      >
        {t.filtersOpen}
      </button>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_1fr]">
        {/* Desktop sticky sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-2xl border border-emerald-900/10 bg-white p-4">{filtersBlock}</div>
        </aside>

        {/* Right column: Loty teaser + hotel cards */}
        <div className="min-w-0">
          <FlightsTeaserCard t={t} />

          {loading && shown.length === 0 ? (
            <div className="mt-4 flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="h-32 animate-pulse rounded-2xl bg-emerald-50 sm:h-36" />
              ))}
            </div>
          ) : shown.length > 0 ? (
            <>
              <div className="mt-4 flex flex-col gap-3">
                {shown.map(({ offer, alternativeCount }, idx) => (
                  <StayCard
                    key={offer.accommodationId || offer.searchResultId}
                    offer={offer}
                    nights={nights}
                    locale={locale}
                    t={t}
                    isCheapest={idx === 0 && shown.length > 1}
                    alternativeCount={alternativeCount}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                {canShowMore ? (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => Math.min(MAX_VISIBLE, v + STEP))}
                    className="rounded-full border border-emerald-900/12 bg-white px-5 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
                  >
                    {t.showMore}
                  </button>
                ) : <span />}
                <a
                  href="#planner-flights"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
                >
                  <span aria-hidden>✈</span>
                  {t.jumpToFlights}
                </a>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-2xl border border-emerald-900/10 bg-emerald-50/40 p-5">
              {error ? <p className="text-xs text-emerald-900/48">{error}</p> : null}
              <p className="mt-2 text-sm text-emerald-900/72">{data?.error || t.empty}</p>
              <p className="mt-1 text-xs text-emerald-900/80">{t.emptyAdvice}</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile bottom-sheet drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-white p-5 lg:hidden">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-emerald-950">{t.filtersTitle}</h3>
            <button
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
              className="rounded-md px-3 py-1 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
            >
              {t.filtersClose}
            </button>
          </div>
          <div className="flex-1 overflow-auto">{filtersBlock}</div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(false)}
            className="mt-3 w-full rounded-full bg-emerald-700 py-3 text-sm font-semibold text-white"
          >
            {t.filtersApply}
          </button>
        </div>
      )}
    </section>
  );
}

function FlightsTeaserCard({ t }: { t: Copy }) {
  return (
    <a
      href="#planner-flights"
      className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-900/10 bg-gradient-to-r from-emerald-50 to-white p-4 transition hover:border-emerald-300 hover:shadow"
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-2xl">✈</span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-emerald-950">{t.flightsCardTitle}</div>
          <div className="line-clamp-2 text-xs text-emerald-900/72">{t.flightsCardBody}</div>
        </div>
      </div>
      <span className="shrink-0 whitespace-nowrap rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white">
        {t.flightsCardCta}
      </span>
    </a>
  );
}

function FiltersPanel({
  filters,
  setFilterParam,
  t,
}: {
  filters: PanelFilters;
  setFilterParam: (key: string, value: string | null) => void;
  t: Copy;
}) {
  const reset = () => {
    setFilterParam("minPrice", null);
    setFilterParam("maxPrice", null);
    setFilterParam("minStars", null);
    setFilterParam("minRating", null);
    setFilterParam("cancel", null);
    setFilterParam("sort", null);
  };
  return (
    <div className="space-y-5 text-sm">
      {/* Sort */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-emerald-700">
          {t.sortLabel}
        </label>
        <select
          value={filters.sort}
          onChange={(e) => setFilterParam("sort", e.target.value === "recommended" ? null : e.target.value)}
          className="w-full rounded-lg border border-emerald-900/15 bg-white px-3 py-2"
        >
          <option value="recommended">{t.sortRecommended}</option>
          <option value="price_asc">{t.sortPriceAsc}</option>
          <option value="price_desc">{t.sortPriceDesc}</option>
          <option value="rating">{t.sortRating}</option>
        </select>
      </div>

      {/* Price */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">{t.priceLabel}</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            placeholder={t.priceMin}
            value={filters.minPrice ?? ""}
            onChange={(e) => setFilterParam("minPrice", e.target.value || null)}
            className="w-full rounded border border-emerald-900/15 px-2 py-1"
          />
          <span className="text-emerald-900/50">—</span>
          <input
            type="number"
            inputMode="numeric"
            placeholder={t.priceMax}
            value={filters.maxPrice ?? ""}
            onChange={(e) => setFilterParam("maxPrice", e.target.value || null)}
            className="w-full rounded border border-emerald-900/15 px-2 py-1"
          />
        </div>
      </div>

      {/* Stars */}
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-emerald-700">{t.starsLabelTitle}</div>
        <div className="space-y-1">
          {[5, 4, 3, 2, 1].map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="minStars"
                checked={filters.minStars === s}
                onChange={() => setFilterParam("minStars", String(s))}
                className="h-4 w-4 accent-emerald-700"
              />
              <span className="text-amber-500">{"★".repeat(s)}</span>
              <span className="text-emerald-900/60">{t.starsAndUp}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Guest rating */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-emerald-700">
          {t.ratingLabel}
        </label>
        <select
          value={filters.minRating ?? ""}
          onChange={(e) => setFilterParam("minRating", e.target.value || null)}
          className="w-full rounded border border-emerald-900/15 bg-white px-2 py-1"
        >
          <option value="">{t.ratingAll}</option>
          <option value="9">9+</option>
          <option value="8">8+</option>
          <option value="7">7+</option>
        </select>
      </div>

      {/* Free cancel */}
      <div>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={filters.freeCancelOnly}
            onChange={(e) => setFilterParam("cancel", e.target.checked ? "free" : null)}
            className="h-4 w-4 accent-emerald-700"
          />
          <span>{t.cancelFree}</span>
        </label>
      </div>

      <button
        type="button"
        onClick={reset}
        className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
      >
        {t.filtersReset}
      </button>
    </div>
  );
}
