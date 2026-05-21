"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";

import type { PriceQuery } from "@/lib/hotels/price-batcher";
import { ensurePrice, getPrice, getVersion, subscribe } from "@/lib/hotels/price-store";

import { ResultCard } from "./result-card";
import { PriceView } from "./card-price";

export interface MetaOffer {
  hotelId: string;
  name: string;
  city: string;
  country?: string;
  address?: string;
  stars?: number;
  rating?: number;
  reviewCount?: number;
  thumbnailUrl?: string;
}

type PriceCtx = Omit<PriceQuery, "hotelId">;

// Client-owned results list. It fetches each page hotel's price ONCE
// (via the persistent price-store), then sorting by price and the
// price min/max filter are pure in-memory client operations — instant,
// zero re-fetch, zero navigation. Metadata filters (stars/rating/q/…)
// stay server-side; the flights panel is untouched (it lives outside
// this component).
export function ResultsList({
  offers,
  ctx,
  nights,
  childParams,
  sort,
  minPrice,
  maxPrice,
}: {
  offers: MetaOffer[];
  ctx: PriceCtx;
  nights: number;
  childParams: string;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
}) {
  // Re-render whenever any price lands.
  useSyncExternalStore(subscribe, getVersion, () => 0);

  // Stable identity for the price context (so the effect doesn't refire
  // on every render).
  const ctxSig = `${ctx.checkin}|${ctx.checkout}|${ctx.adults}|${ctx.children.join(".")}|${ctx.rooms}|${ctx.currency}`;

  useEffect(() => {
    for (const o of offers) {
      ensurePrice({ hotelId: o.hotelId, ...ctx });
    }
    // ctxSig + the hotel id list capture every meaningful change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxSig, offers.map((o) => o.hotelId).join(",")]);

  const displayed = useMemo(() => {
    const rows = offers.map((o) => ({ offer: o, entry: getPrice({ hotelId: o.hotelId, ...ctx }) }));

    // Price min/max filter — only excludes hotels whose price is KNOWN
    // and out of range. Still-loading hotels stay until their price
    // settles (avoids flicker / premature hiding).
    const hasPriceFilter = minPrice != null || maxPrice != null;
    const filtered = hasPriceFilter
      ? rows.filter(({ entry }) => {
          if (entry == null || entry === "loading") return entry === "loading";
          const amt = entry.totalAmount;
          if (minPrice != null && amt < minPrice) return false;
          if (maxPrice != null && amt > maxPrice) return false;
          return true;
        })
      : rows;

    const priceOf = (e: (typeof rows)[number]["entry"]): number | null =>
      e && e !== "loading" ? e.totalAmount : null;

    const sorted = [...filtered];
    if (sort === "price_asc" || sort === "price_desc") {
      const dir = sort === "price_asc" ? 1 : -1;
      sorted.sort((a, b) => {
        const pa = priceOf(a.entry);
        const pb = priceOf(b.entry);
        // Unpriced rows (loading/unavailable) sink to the bottom; the
        // list reflows naturally as prices stream in.
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return (pa - pb) * dir;
      });
    } else if (sort === "rating") {
      sorted.sort((a, b) => (b.offer.rating ?? 0) - (a.offer.rating ?? 0));
    }
    // "recommended" / default → keep server (LiteAPI relevance) order.
    return sorted;
    // ctxSig stands in for ctx (stable across renders); getVersion()
    // recomputes ordering as prices stream in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers, ctxSig, sort, minPrice, maxPrice, getVersion()]);

  if (displayed.length === 0) {
    return (
      <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
        Żaden hotel na tej stronie nie pasuje do wybranych filtrów. Zmień filtry
        lub przejdź do innej strony wyników.
      </p>
    );
  }

  return (
    <>
      {displayed.map(({ offer, entry }, index) => (
        <ResultCard
          key={offer.hotelId}
          offer={offer}
          searchQuery={childParams}
          nights={nights}
          imagePriority={index < 6}
          priceSlot={<PriceView entry={entry} nights={nights} />}
        />
      ))}
    </>
  );
}
