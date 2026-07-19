// LiteAPI hotel detail — used by /hotele/[hotelId] page (Phase 3) and the
// /hotele/rezerwacja booking page (display-only hotel name + city).

import { liteApiRequest } from "./client";
import { liteApiErrorFromResponse } from "./errors";
import { LiteApiHotelDetailSchema, type LiteApiHotelDetail } from "./types";
import { z } from "zod";

const ResponseSchema = z.object({ data: LiteApiHotelDetailSchema });

// Format prawdziwego LiteAPI hotelId: "lp" + krótki alfanumeryk (lp27a0d8,
// lp1ff62…). INCYDENT 2026-07-19: crawlery zmieliły /hotele/* i linki
// rezerwacji ze zmutowanymi/martwymi id → 5,5k błędów 400 na /data/hotel
// w 2 dni (80% error rate u dostawcy). Id, które nie może być poprawne,
// odrzucamy LOKALNIE — identycznym błędem, jaki dałoby LiteAPI (400/4002,
// isHotelNotFoundError=true → strona robi czysty 404), ale BEZ wywołania.
const HOTEL_ID_RE = /^lp[0-9a-z]{1,24}$/i;

function invalidHotelIdError(hotelId: string) {
  return liteApiErrorFromResponse(400, {
    error: { code: 4002, description: `hotelId is missing or invalid (local guard: ${hotelId.slice(0, 40)})` },
  });
}

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
  // Guard PRZED jakąkolwiek siecią — patrz komentarz przy HOTEL_ID_RE.
  if (!HOTEL_ID_RE.test(hotelId?.trim() ?? "")) throw invalidHotelIdError(String(hotelId));
  const language = options.language ?? "pl";
  if (language === "en") return fetchDetail(hotelId, "en");

  // PROPER NOUNS ARE NEVER TRANSLATED. With language=pl LiteAPI machine-
  // translates the hotel NAME too — verified live 2026-06-10 on lp27a0d8:
  // pl → "Siedemdziesiąt Barcelona", en → "Seventy Barcelona". That broken
  // name then leaked into the detail H1/title/schema, the checkout, the
  // confirmation e-mail and the bank-facing booking. Fix at the single
  // source every consumer shares: fetch PL content + EN name and keep ONLY
  // `name` from the EN payload; EN failure degrades to the PL name.
  //
  // SEKWENCYJNIE, nie równolegle (incydent 2026-07-19): przy martwym id
  // równoległość podwajała błędy 400 u dostawcy (pl i en padały OBA).
  // EN idzie dopiero PO sukcesie PL — koszt to jeden dodatkowy roundtrip
  // wyłącznie na zimnym cache poprawnego hotelu (oba warianty i tak są
  // cache'owane 24 h), zysk to połowa wywołań mniej dla każdego złego id.
  const pl = await fetchDetail(hotelId, "pl");
  const enName = await fetchDetail(hotelId, "en")
    .then((d) => d.name)
    .catch(() => null);
  return enName ? { ...pl, name: enName } : pl;
}
