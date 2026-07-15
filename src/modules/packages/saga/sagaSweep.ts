// Sweep sagi (cron, co ~5 min) — dwie odpowiedzialności (§3.4):
//  1. DEADLINE'Y: sagi w HOTEL_BOOKED_AWAITING_FLIGHT z minionym deadlineAt
//     → DEADLINE_REACHED (kompensacja: cancel hotelu + refund A + e-mail).
//     Harmonogram NIE jest osobnym jobem per rezerwacja: deadlineAt siedzi
//     w Postgresie (indeks sagaState+deadlineAt), a cron jest „zegarem".
//  2. POLLING potwierdzeń: sagi w FLIGHT_BOOKED bez webhooka → GET
//     /flights/bookings/{id} (źródło prawdy) → FLIGHT_CONFIRMED / FLIGHT_EXPIRED.
//     Webhook = trigger; polling = fallback (oba idą przez applySagaEvent,
//     optimistic lock rozstrzyga wyścig, duplikat = ignored).
//
// I/O wstrzykiwane — testowalne bez bazy i bez LiteAPI.

import type { SagaEvent } from "./sagaTypes";

export type FlightBookingStatus = "confirmed" | "failed" | "expired" | "pending";

export interface SweepDeps {
  /** Sagi z minionym deadline (stan HOTEL_BOOKED_AWAITING_FLIGHT). */
  listDueDeadlines(nowIso: string, limit: number): Promise<{ id: string }[]>;
  /** Sagi w FLIGHT_BOOKED czekające na potwierdzenie ticketingu. */
  listAwaitingFlightConfirmation(limit: number): Promise<{ id: string; flightBookingId: string | null }[]>;
  /** Status rezerwacji lotu z API (źródło prawdy o ticketingu). */
  fetchFlightBookingStatus(flightBookingId: string): Promise<FlightBookingStatus>;
  /** Driver sagi (applySagaEvent z produkcyjnym store/sink). */
  apply(bookingId: string, event: SagaEvent): Promise<{ kind: string }>;
}

export interface SweepSummary {
  deadlinesFired: number;
  confirmed: number;
  expired: number;
  stillPending: number;
  errors: string[];
}

const SWEEP_LIMIT = 50;

/**
 * Tolerancyjny ekstraktor statusu z odpowiedzi GET /flights/bookings/{id}.
 * TODO:VERIFY — dokładny enum statusów potwierdzić pierwszą realną rezerwacją;
 * do tego czasu: nieznany/niejasny status = "pending" (NIGDY nie zgadujemy
 * fail'a — fałszywa kompensacja jest gorsza niż spóźniona).
 */
export function extractFlightBookingStatus(response: unknown): FlightBookingStatus {
  const seen: string[] = [];
  const visit = (node: unknown, depth: number): void => {
    if (!node || typeof node !== "object" || depth > 3) return;
    const obj = node as Record<string, unknown>;
    for (const key of ["status", "bookingStatus", "state"]) {
      const v = obj[key];
      if (typeof v === "string") seen.push(v.toLowerCase());
    }
    if (obj.data) visit(obj.data, depth + 1);
    if (Array.isArray(obj.data) && obj.data[0]) visit(obj.data[0], depth + 1);
  };
  visit(response, 0);

  for (const s of seen) {
    // Kolejność ma znaczenie: „PENDING_CONFIRMATION" zawiera „confirm" —
    // stany przejściowe rozpoznajemy PIERWSZE.
    if (/pending|process|progress|await|hold/.test(s)) return "pending";
    if (/confirm|ticketed|issued|success/.test(s)) return "confirmed";
    if (/expire/.test(s)) return "expired";
    if (/fail|error|reject|cancel/.test(s)) return "failed";
  }
  return "pending";
}

/** Jeden przebieg sweepa. Błędy per saga są zbierane, nie przerywają reszty. */
export async function runPackageSagaSweep(deps: SweepDeps, now: Date = new Date()): Promise<SweepSummary> {
  const summary: SweepSummary = { deadlinesFired: 0, confirmed: 0, expired: 0, stillPending: 0, errors: [] };

  // 1. Deadline'y porzuconych rezerwacji.
  let due: { id: string }[] = [];
  try {
    due = await deps.listDueDeadlines(now.toISOString(), SWEEP_LIMIT);
  } catch (err) {
    summary.errors.push(`listDueDeadlines: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const { id } of due) {
    try {
      const r = await deps.apply(id, { type: "DEADLINE_REACHED" });
      if (r.kind === "applied") summary.deadlinesFired++;
    } catch (err) {
      summary.errors.push(`deadline ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Polling potwierdzeń ticketingu.
  let awaiting: { id: string; flightBookingId: string | null }[] = [];
  try {
    awaiting = await deps.listAwaitingFlightConfirmation(SWEEP_LIMIT);
  } catch (err) {
    summary.errors.push(`listAwaiting: ${err instanceof Error ? err.message : String(err)}`);
  }
  for (const { id, flightBookingId } of awaiting) {
    if (!flightBookingId) {
      summary.errors.push(`saga ${id} w FLIGHT_BOOKED bez flightBookingId — wymaga ręcznego sprawdzenia`);
      continue;
    }
    try {
      const status = await deps.fetchFlightBookingStatus(flightBookingId);
      if (status === "confirmed") {
        const r = await deps.apply(id, { type: "FLIGHT_CONFIRMED" });
        if (r.kind === "applied") summary.confirmed++;
      } else if (status === "expired" || status === "failed") {
        const r = await deps.apply(id, { type: "FLIGHT_EXPIRED", reason: `polling: status ${status}` });
        if (r.kind === "applied") summary.expired++;
      } else {
        summary.stillPending++;
      }
    } catch (err) {
      // Błąd API = spróbujemy w następnym przebiegu; NIE kompensujemy na ślepo.
      summary.errors.push(`polling ${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return summary;
}
