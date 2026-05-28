"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { PriceQuery, SlimRate } from "@/lib/hotels/price-batcher";
import { ensurePrice, getPrice, getVersion, subscribe, type PriceEntry } from "@/lib/hotels/price-store";

import { ResultCard } from "./result-card";
import { PriceView } from "./card-price";
import { HotelPagination } from "./hotel-pagination";
import { applyFiltersAndSort, type FilterableOffer } from "./filters-logic";

export interface MetaOffer {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
}

type PriceCtx = Omit<PriceQuery, "hotelId">;

interface ResultsListProps {
  // FULL pool of hotels for this destination (up to 1000). The client owns
  // sort/filter/paginate so they apply GLOBALLY across the pool, not just
  // within the current page.
  pool: MetaOffer[];
  ctx: PriceCtx;
  nights: number;
  childParams: string;
  baseQuery: string;
  pageFromUrl: number;
  pageSize: number;
  // URL-driven filters & sort (already parsed in page.tsx).
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  minStars?: number;
  minRating?: number;
  cancel?: string;
  q?: string;
  propertyType?: string[];
  board?: string[];
}

interface PricedFilterable extends FilterableOffer {
  // Tag so we can map back to the original MetaOffer + PriceEntry after
  // applyFiltersAndSort returns (the helper is generic and preserves
  // unknown keys on the input objects).
  _hotelId: string;
}

// Type guard: an entry that has resolved to a real SlimRate (not null, not
// "loading", not still undefined). Hotels in this state are confirmed
// AVAILABLE in the requested date range.
function isPriced(entry: PriceEntry | undefined): entry is SlimRate {
  return entry !== undefined && entry !== null && entry !== "loading";
}

// Client-owned results list. It owns the FULL hotel pool for the destination
// (handed down from the server page) and computes the displayed slice from:
//   1. Per-hotel rate availability (drops null = no rate for the dates)
//   2. URL-driven filters (price range, board, refundable, …)
//   3. URL-driven sort (price asc/desc, rating, recommended)
//   4. URL-driven pagination cursor (?strona=N)
//
// Why client-side: with up to 1000 hotels per destination and rates streaming
// in over ~5-8 s, doing this server-side would either block the first paint
// for that whole window OR show stale metadata-order results. Owning it on
// the client lets us:
//   • Paint immediately (initial slice from metadata order, no prices yet).
//   • Stream prices in via the existing price-store + batcher.
//   • Re-sort / re-paginate live as availability lands — so "price ascending"
//     converges on a GLOBAL price ladder (cheapest in the destination first),
//     not just the cheapest among the current 20 cards.
//   • Hide hotels that come back with `entry === null` — confirmed sold-out
//     for the chosen dates.
export function ResultsList(props: ResultsListProps) {
  // Re-render whenever any price lands.
  useSyncExternalStore(subscribe, getVersion, () => 0);

  const {
    pool,
    ctx,
    nights,
    childParams,
    baseQuery,
    pageFromUrl,
    pageSize,
    sort,
    minPrice,
    maxPrice,
    minStars,
    minRating,
    cancel,
    q,
    propertyType,
    board,
  } = props;

  // Stable identity for the price context so the effect doesn't refire on
  // every render.
  const ctxSig = `${ctx.checkin}|${ctx.checkout}|${ctx.adults}|${ctx.children.join(".")}|${ctx.rooms}|${ctx.currency}`;
  // Stable identity for the pool — id list is the natural key, much cheaper
  // than deep-comparing 1000 records on every render.
  const poolIdSig = pool.map((o) => o.hotelId).join(",");

  useEffect(() => {
    for (const o of pool) {
      ensurePrice({ hotelId: o.hotelId, ...ctx });
    }
    // ctxSig + the hotel id list capture every meaningful change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxSig, poolIdSig]);

  const view = useMemo(() => {
    type Row = { offer: MetaOffer; entry: PriceEntry | undefined };
    const rows: Row[] = pool.map((o) => ({
      offer: o,
      entry: getPrice({ hotelId: o.hotelId, ...ctx }),
    }));

    let scanning = 0;
    let unavailable = 0;
    const priced: Row[] = [];
    for (const r of rows) {
      if (r.entry === null) {
        unavailable++;
      } else if (!isPriced(r.entry)) {
        scanning++;
      } else {
        priced.push(r);
      }
    }

    // Build the FilterableOffer view over PRICED rows only — unavailable
    // hotels are already excluded above, and "still loading" rows can't be
    // sorted by price yet (we'd misorder them). They reappear at the bottom
    // of the visible list as a "Sprawdzam jeszcze X obiektów" note (the
    // header below), and the page re-sorts as they land.
    const filterable: PricedFilterable[] = priced.map((r) => {
      const rate = r.entry as SlimRate;
      return {
        _hotelId: r.offer.hotelId,
        name: r.offer.name,
        city: r.offer.city,
        stars: r.offer.stars,
        rating: r.offer.rating,
        cheapestRate: {
          totalAmount: rate.totalAmount,
          refundableTag: rate.refundableTag,
          cancellationDeadline: rate.cancellationDeadline,
          boardName: rate.boardName,
        },
      };
    });

    const passed = applyFiltersAndSort(filterable, {
      minPrice,
      maxPrice,
      minStars,
      minRating,
      cancel,
      sort,
      q,
      propertyType,
      board,
    });

    const byId = new Map(priced.map((r) => [r.offer.hotelId, r]));
    const filteredRows = passed
      .map((p) => byId.get(p._hotelId))
      .filter((r): r is Row => r !== undefined);

    const total = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, pageFromUrl), totalPages);
    const sliceStart = (safePage - 1) * pageSize;
    const slicedPriced = filteredRows.slice(sliceStart, sliceStart + pageSize);

    // Pad with loading rows so the page never paints empty during the scan.
    // Without this, initial SSR (store empty → every row "scanning") would
    // render zero cards and just the subtitle — a regression vs. the
    // previous "show 20 metadata-order cards instantly" behavior. We only
    // pad while scanning > 0 (i.e., something is still in flight) AND
    // there's room left in the current page slot. Loading rows render with
    // a skeleton PriceView; once their rate lands they re-sort into place.
    const displayed: Row[] = [...slicedPriced];
    if (displayed.length < pageSize && scanning > 0) {
      const filledIds = new Set(displayed.map((r) => r.offer.hotelId));
      for (const r of rows) {
        if (displayed.length >= pageSize) break;
        if (r.entry === null) continue; // confirmed unavailable — never show
        if (isPriced(r.entry)) continue; // already part of the priced slice
        if (filledIds.has(r.offer.hotelId)) continue;
        displayed.push(r);
        filledIds.add(r.offer.hotelId);
      }
    }

    return {
      displayed,
      total,
      totalPages,
      safePage,
      scanning,
      unavailable,
      availableCount: priced.length,
    };
    // ctxSig + poolIdSig stand in for `pool` and `ctx`; getVersion()
    // recomputes ordering as prices stream in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    poolIdSig,
    ctxSig,
    pageFromUrl,
    pageSize,
    sort,
    minPrice,
    maxPrice,
    minStars,
    minRating,
    cancel,
    q,
    propertyType?.join(",") ?? "",
    board?.join(",") ?? "",
    getVersion(),
  ]);

  const scanComplete = view.scanning === 0;
  const totalChecked = pool.length - view.scanning;

  return (
    <div className="space-y-4">
      <ResultsSubtitle
        scanComplete={scanComplete}
        availableCount={view.availableCount}
        totalChecked={totalChecked}
        totalPool={pool.length}
        unavailableCount={view.unavailable}
        nights={nights}
        adults={ctx.adults}
        page={view.safePage}
        totalPages={view.totalPages}
        filteredCount={view.total}
      />

      {/* With loading-row padding above, displayed.length is 0 only AFTER
          the scan completes AND nothing matched (either no available hotels
          at all, or filters wiped everything). */}
      {view.displayed.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
          {view.availableCount === 0
            ? "Brak dostępnych hoteli w tym terminie. Spróbuj zmienić daty lub liczbę gości."
            : "Filtry wykluczyły wszystkie dostępne hotele. Zmień lub wyczyść filtry."}
        </p>
      ) : (
        view.displayed.map(({ offer, entry }, index) => (
          <ResultCard
            key={offer.hotelId}
            offer={offer}
            searchQuery={childParams}
            nights={nights}
            imagePriority={index < 6}
            priceSlot={<PriceView entry={entry} nights={nights} />}
          />
        ))
      )}

      <HotelPagination page={view.safePage} totalPages={view.totalPages} baseQuery={baseQuery} />
    </div>
  );
}

// Subtitle for the results list — replaces the old server-rendered count.
// Renders three states:
//   1. Scanning: "Sprawdzam dostępność w X obiektach… (Y/Z)"
//   2. Scan complete + filters narrowed it: "12 z 511 dostępnych · …"
//   3. Scan complete + no filters: "511 dostępnych obiektów · …"
function ResultsSubtitle({
  scanComplete,
  availableCount,
  totalChecked,
  totalPool,
  unavailableCount,
  nights,
  adults,
  page,
  totalPages,
  filteredCount,
}: {
  scanComplete: boolean;
  availableCount: number;
  totalChecked: number;
  totalPool: number;
  unavailableCount: number;
  nights: number;
  adults: number;
  page: number;
  totalPages: number;
  filteredCount: number;
}) {
  const filteredOut = availableCount - filteredCount;

  const nightsLabel =
    nights === 1 ? "noc" : nights >= 2 && nights <= 4 ? "noce" : "nocy";
  const adultsLabel = adults === 1 ? "dorosły" : "dorosłych";

  let countLine: React.ReactNode;
  if (!scanComplete) {
    countLine = (
      <>
        <span
          className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500"
          aria-hidden
        />
        Sprawdzam dostępność… {totalChecked}/{totalPool}
        {availableCount > 0 ? (
          <>
            {" "}· dotąd <strong className="font-semibold text-emerald-700">{availableCount}</strong>{" "}
            dostępnych
          </>
        ) : null}
      </>
    );
  } else if (filteredOut > 0) {
    countLine = (
      <>
        <strong className="font-semibold text-neutral-800">{filteredCount}</strong> z{" "}
        {availableCount} dostępnych po filtrach{" "}
        {unavailableCount > 0 ? `· ${unavailableCount} bez miejsc` : ""}
      </>
    );
  } else {
    countLine = (
      <>
        <strong className="font-semibold text-neutral-800">{availableCount}</strong>{" "}
        {availableCount === 1 ? "dostępny obiekt" : "dostępnych obiektów"}
        {unavailableCount > 0 ? ` · ${unavailableCount} bez miejsc` : ""}
      </>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
      <span className="inline-flex items-center gap-1.5">{countLine}</span>
      <span aria-hidden>·</span>
      <span>
        {nights} {nightsLabel}
      </span>
      <span aria-hidden>·</span>
      <span>
        {adults} {adultsLabel}
      </span>
      {totalPages > 1 && (
        <>
          <span aria-hidden>·</span>
          <span>
            Strona {page} z {totalPages}
          </span>
        </>
      )}
    </div>
  );
}
