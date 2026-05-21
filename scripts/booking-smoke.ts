// Booking smoke test — exercises the REAL LiteAPI prebook path through the
// production code (fetchHotelsList → getRates → prebookHotel).
//
// SAFETY: this script NEVER calls bookHotel()/POST /rates/book. prebook only
// locks a price + opens a payment session; it does NOT create a reservation or
// charge anything. Calling /rates/book here would be a real €100+ charge.
//
// Run: pnpm booking:smoke   (loads .env.local; needs a working LiteAPI prod
// private key + LITEAPI_ENV=production — see BOOKING_BLOCKERS.md).

import { fetchHotelsList, getRates } from "@/lib/liteapi";
import { prebookHotel } from "@/lib/liteapi/booking";

function mask(v: string | undefined, keep = 6): string {
  if (!v) return "(absent)";
  return `${v.slice(0, keep)}…(${v.length} chars)`;
}

async function main(): Promise<void> {
  const checkin = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const checkout = new Date(Date.now() + 33 * 86_400_000).toISOString().slice(0, 10);
  console.log(`[smoke] Barcelona / ${checkin} → ${checkout} / 2 adults`);

  const hotelsRes = (await fetchHotelsList({
    city: "Barcelona",
    country: "Spain",
    limit: 8,
  })) as unknown;
  const hotels = Array.isArray(hotelsRes)
    ? (hotelsRes as Array<{ id: string }>)
    : ((hotelsRes as { data?: Array<{ id: string }> })?.data ?? []);
  const hotelIds = hotels.map((h) => h.id).filter(Boolean);
  if (hotelIds.length === 0) throw new Error("[smoke] no hotels returned");
  console.log(`[smoke] hotels: ${hotelIds.length} (${hotelIds.slice(0, 3).join(", ")}…)`);

  const ratesRes = (await getRates({
    hotelIds,
    checkin,
    checkout,
    currency: "PLN",
    occupancies: [{ adults: 2, children: [] }],
  })) as unknown;
  const rateHotels = Array.isArray(ratesRes)
    ? (ratesRes as Array<{ roomTypes?: Array<{ offerId: string }> }>)
    : ((ratesRes as { data?: Array<{ roomTypes?: Array<{ offerId: string }> }> })?.data ?? []);
  let offerId = "";
  for (const h of rateHotels) {
    for (const rt of h.roomTypes ?? []) {
      if (rt.offerId) {
        offerId = rt.offerId;
        break;
      }
    }
    if (offerId) break;
  }
  if (!offerId) throw new Error("[smoke] no offerId in rates response");
  console.log(`[smoke] offerId: ${mask(offerId, 10)}`);

  console.log("[smoke] calling prebookHotel (NO book call) …");
  const pre = await prebookHotel({
    rateId: offerId,
    clientReference: `smoke-${Date.now()}`,
  });

  console.log("[smoke] PREBOOK OK:");
  console.log(`  prebookId:     ${mask(pre.prebookId, 8)}`);
  console.log(`  transactionId: ${pre.transactionId ? "PRESENT " + mask(pre.transactionId, 6) : "ABSENT"}`);
  console.log(`  secretKey:     ${pre.secretKey ? "PRESENT (masked) " + mask(pre.secretKey, 4) : "ABSENT"}`);
  console.log(`  expiresAt:     ${pre.expiresAt ?? "(none — not returned by LiteAPI; see Q2)"}`);
  console.log(`  price:         ${pre.price ?? "?"} ${pre.currency ?? ""}`);
  console.log("[smoke] DONE — no reservation created, nothing charged.");
}

main().catch((err) => {
  console.error("[smoke] FAILED:", err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exitCode = 1;
});
