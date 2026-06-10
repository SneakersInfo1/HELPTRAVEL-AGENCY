// LiteAPI hotel detail — used by /hotele/[hotelId] page (Phase 3) and the
// /hotele/rezerwacja booking page (display-only hotel name + city).

import { liteApiRequest } from "./client";
import { LiteApiHotelDetailSchema, type LiteApiHotelDetail } from "./types";
import { z } from "zod";

const ResponseSchema = z.object({ data: LiteApiHotelDetailSchema });

// LiteAPI's /data/hotel accepts `language=<ISO-2>` and returns description,
// hotelDescription, policies, amenities, room names in that language WHERE the
// supplier has localized content. Falls back to English when a particular
// field has no Polish translation. We default to "pl" because every consumer
// of getHotelDetail (detail page, booking page, /api/hotels/[hotelId]) is on
// the Polish site — there's no reason to ever ask for English here.
//
// Caveat: language is part of the cache key implicitly (different query →
// different fetch URL → different Next Data Cache entry), so switching
// languages does NOT cross-contaminate cached entries.
async function fetchDetail(hotelId: string, language: string): Promise<LiteApiHotelDetail> {
  const res = await liteApiRequest({
    path: "/data/hotel",
    method: "GET",
    keyMode: "public",
    schema: ResponseSchema,
    query: { hotelId, language },
    // Hotel name / address / amenities / photos are essentially static — they
    // change at the property level, not per-booking. Caching for 24h matches
    // fetchHotelsList (search.ts) and saves 500-900ms on every booking-page
    // load (the previous uncached call blocked the entire /hotele/rezerwacja
    // server render). Tag enables manual revalidation if needed. Language is
    // baked into the URL query so PL and EN cache independently.
    nextCache: { revalidate: 86_400, tags: ["liteapi", "liteapi-hotel-detail", `hotel:${hotelId}`] },
  });
  return res.data;
}

export async function getHotelDetail(
  hotelId: string,
  options: { language?: string } = {},
): Promise<LiteApiHotelDetail> {
  const language = options.language ?? "pl";
  if (language === "en") return fetchDetail(hotelId, "en");

  // PROPER NOUNS ARE NEVER TRANSLATED. With language=pl LiteAPI machine-
  // translates the hotel NAME too — verified live 2026-06-10 on lp27a0d8:
  // pl → "Siedemdziesiąt Barcelona", en → "Seventy Barcelona". That broken
  // name then leaked into the detail H1/title/schema, the checkout, the
  // confirmation e-mail and the bank-facing booking. Fix at the single
  // source every consumer shares: fetch PL content + EN name in parallel
  // (both 24h-cached) and keep ONLY `name` from the EN payload. If the EN
  // call fails we degrade to the PL name rather than failing the page.
  const plPromise = fetchDetail(hotelId, "pl");
  const enName = await fetchDetail(hotelId, "en")
    .then((d) => d.name)
    .catch(() => null);
  const pl = await plPromise;
  return enName ? { ...pl, name: enName } : pl;
}
