// One-shot recovery: persist a LiteAPI booking we found via reconciliation
// (GET /v3.0/bookings?clientReference=X) into our Redis `completed` store so
// it shows up in the admin panel and the customer-facing /api/booking/[id]
// confirmation endpoint.
//
// Run: pnpm tsx --env-file=.env.local scripts/persist-recovered-booking.ts
//
// Designed for the 2026-05-24 sid d66b741f case where LiteAPI created the
// booking but our Zod parser rejected the 200 response — so saveCompleted
// was never called. The booking is fine on LiteAPI's side, we just lost
// our local pointer to it.

import { listBookingsByClientReference } from "../src/lib/liteapi/retrieve";
import { saveCompleted, type CompletedRecord } from "../src/lib/booking/session";

// Edit this list with sessionIds (clientReferences) you want to recover.
// Each entry is verified via LiteAPI before persisting — if no booking exists
// for the clientReference, nothing is written and a `MISS` line is logged.
const SESSION_IDS = [
  "d66b741f-2471-4f0d-afdb-1b9534dd4a1f", // easyHotel Sofia, 2026-06-07 → 06-08, 133.57 PLN
];

async function main(): Promise<void> {
  for (const sessionId of SESSION_IDS) {
    console.log(`\n=== ${sessionId} ===`);
    let bookings: Awaited<ReturnType<typeof listBookingsByClientReference>>;
    try {
      bookings = await listBookingsByClientReference(sessionId);
    } catch (err) {
      console.error(`  LiteAPI lookup FAILED: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    if (bookings.length === 0) {
      console.log("  MISS — no LiteAPI booking for this clientReference, skipping");
      continue;
    }
    const b = bookings[0]!;
    console.log(`  HIT — bookingId=${b.bookingId} status=${b.status ?? "unknown"}`);
    const record: CompletedRecord = {
      bookingId: b.bookingId,
      confirmationCode: b.hotelConfirmationCode || undefined,
      status: b.status ?? "CONFIRMED",
      hotelSummary: {
        name: b.hotel?.name ?? "Unknown hotel",
        city: undefined,
      },
      rateSummary: {
        boardName: undefined,
        price: b.price ?? undefined,
        currency: b.currency ?? undefined,
        checkin: b.checkin ?? "",
        checkout: b.checkout ?? "",
      },
      price: b.price ?? undefined,
      currency: b.currency ?? undefined,
      createdAt: Date.now(),
    };
    try {
      await saveCompleted(record);
      console.log(`  ✓ Persisted to Redis (key: booking:v1:completed:${b.bookingId})`);
      console.log(`    Visible at /api/booking/${b.bookingId} and in admin`);
    } catch (err) {
      console.error(`  Redis save FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("[recover] FAILED:", err instanceof Error ? `${err.name}: ${err.message}` : err);
  process.exitCode = 1;
});
