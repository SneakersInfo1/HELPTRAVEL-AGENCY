// Cron sagi pakietów (co 5 min): (1) deadline'y porzuconych rezerwacji między
// checkoutami → DEADLINE_REACHED (auto-cancel hotelu + refund + e-mail),
// (2) polling potwierdzeń ticketingu (fallback webhooka) → FLIGHT_CONFIRMED /
// FLIGHT_EXPIRED. Logika w runPackageSagaSweep (czysta, testowana).
//
// Bezpieczeństwo: wymaga `Authorization: Bearer ${CRON_SECRET}` (jak
// warm-rates). Guardy: flaga pakietów off → no-op; baza niepodpięta
// (bramka Fazy 2) → no-op z notatką, nie błąd.

import { NextResponse } from "next/server";

import { getFlightBooking } from "@/lib/flights/client";
import { applySagaEvent } from "@/modules/packages/saga/orchestrator";
import { createPrismaSagaStore, SagaStoreUnavailableError } from "@/modules/packages/saga/prismaSagaStore";
import { createProductionEffectSink } from "@/modules/packages/saga/productionEffectSink";
import { extractFlightBookingStatus, runPackageSagaSweep } from "@/modules/packages/saga/sagaSweep";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/package-deadlines] CRON_SECRET nie ustawiony — odmawiam (ustaw zmienną w Vercel).");
    return NextResponse.json({ error: "cron secret not configured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_FEATURE_PACKAGES !== "true") {
    return NextResponse.json({ skipped: "feature flag off" });
  }

  try {
    const store = createPrismaSagaStore();
    const effects = createProductionEffectSink();
    const summary = await runPackageSagaSweep({
      listDueDeadlines: (nowIso, limit) => store.listDueDeadlines(nowIso, limit),
      listAwaitingFlightConfirmation: (limit) => store.listAwaitingFlightConfirmation(limit),
      async fetchFlightBookingStatus(flightBookingId) {
        const res = await getFlightBooking(flightBookingId);
        return extractFlightBookingStatus(res);
      },
      apply: (id, event) => applySagaEvent({ store, effects }, id, event),
    });
    if (summary.errors.length) console.error("[cron/package-deadlines] błędy sweepa:", summary.errors);
    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof SagaStoreUnavailableError) {
      return NextResponse.json({ skipped: "saga store unavailable (DATABASE_URL = bramka Fazy 2)" });
    }
    console.error("[cron/package-deadlines] błąd:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
