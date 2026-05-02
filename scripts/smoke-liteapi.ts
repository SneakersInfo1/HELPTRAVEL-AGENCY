// scripts/smoke-liteapi.ts
//
// End-to-end LiteAPI sandbox smoke test, runnable with:
//   pnpm dlx tsx scripts/smoke-liteapi.ts
//
// Pipeline (per master spec section 15 / Phase 1):
//   search → rates → prebook(usePaymentSdk:true) → confirm transactionId+secretKey
//   are returned → (pause — Phase 4 will add UserPaymentSDK simulation) → exit.
//
// This script verifies the LiteAPI Payments product is activated on the
// merchant account. If `prebook` returns transactionId + secretKey, the
// account is correctly configured. If only prebookId is returned, the User
// Payment SDK feature is NOT activated → STOP and contact LiteAPI.
//
// Phase 4 will extend this with:
//   • simulate-pay (sandbox card + simulated BLIK)
//   • book(prebookId, transactionId)
//   • retrieve(bookingId)
//   • cancel(bookingId)
// Those steps require sandbox-confirmed payment methods + a webhook listener
// running locally — beyond Phase 1 scope. Stubs are flagged below.

import { fetchHotelsList, getRates, prebook } from "../src/lib/liteapi";

interface ConsoleResult {
  step: string;
  ok: boolean;
  detail: string;
}

async function main(): Promise<number> {
  const results: ConsoleResult[] = [];
  const log = (step: string, ok: boolean, detail: string) => {
    results.push({ step, ok, detail });
    const tag = ok ? "✅" : "❌";
    console.log(`${tag} ${step.padEnd(36)} ${detail}`);
  };

  // 1) hotels list
  let hotelIds: string[] = [];
  try {
    const list = await fetchHotelsList({ city: "Malaga", country: "Spain", limit: 5 });
    hotelIds = list.data.map((h) => h.id).slice(0, 5);
    log("search /data/hotels", hotelIds.length > 0, `${hotelIds.length} hotels`);
  } catch (err) {
    log("search /data/hotels", false, err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (hotelIds.length === 0) {
    log("search /data/hotels", false, "no hotels returned — check LITEAPI_SANDBOX_KEY");
    return 1;
  }

  // 2) rates
  const checkin = isoDate(14);
  const checkout = isoDate(18);
  let rateId: string | null = null;
  try {
    const rates = await getRates({
      hotelIds,
      checkin,
      checkout,
      currency: "PLN",
      occupancies: [{ adults: 2, children: [] }],
    });
    for (const hr of rates.data) {
      for (const room of hr.roomTypes ?? []) {
        for (const r of room.rates ?? []) {
          if (!rateId) rateId = r.rateId;
        }
      }
    }
    log("rates /hotels/rates", Boolean(rateId), rateId ? `picked rateId=${rateId.slice(0, 16)}…` : "no rates returned");
  } catch (err) {
    log("rates /hotels/rates", false, err instanceof Error ? err.message : String(err));
    return 1;
  }
  if (!rateId) return 1;

  // 3) prebook with usePaymentSdk:true — proves Payments activation
  try {
    const pre = await prebook({ rateId, clientReference: `smoke-${Date.now()}` });
    const hasSdkHandle = Boolean(pre.data.transactionId && pre.data.secretKey);
    log(
      "prebook usePaymentSdk:true",
      hasSdkHandle,
      hasSdkHandle
        ? `prebookId=${pre.data.prebookId.slice(0, 12)}…  transactionId=${pre.data.transactionId?.slice(0, 12)}…`
        : "User Payment SDK NOT ACTIVATED on this merchant account — contact LiteAPI",
    );
    if (!hasSdkHandle) return 2;
  } catch (err) {
    log("prebook usePaymentSdk:true", false, err instanceof Error ? err.message : String(err));
    return 1;
  }

  // 4) book / retrieve / cancel — Phase 4 extension
  log("book /rates/book", false, "SKIPPED — Phase 4 extension (requires SDK-completed payment)");
  log("retrieve /bookings/{id}", false, "SKIPPED — Phase 4 extension");
  log("cancel /bookings/{id}", false, "SKIPPED — Phase 4 extension");

  console.log("\nSmoke summary:");
  for (const r of results) {
    console.log(`  ${r.ok ? "✅" : "·"} ${r.step}`);
  }
  return 0;
}

function isoDate(daysAhead: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("smoke crashed:", err);
    process.exit(99);
  });
