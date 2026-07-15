// Mapowanie webhooków LiteAPI → zdarzenia sagi (CZYSTE, testowalne) +
// weryfikacja podpisu HMAC. Nazwy eventów potwierdzone w docs (decyzje pkt 3):
// flight.book.pending.confirmation / confirmed / failed / expired oraz
// hotelowe booking.prebook_error / booking.book_error.
//
// TODO:VERIFY (decyzje, „Schemat webhooków"): dokładny kształt payloadu i
// format podpisu nie są potwierdzone realnym eventem prod — mapper jest
// TOLERANCYJNY (kilka możliwych pól), a podpis przyjmuje surowy hex lub
// prefiks "sha256=". Po pierwszym realnym webhooku dokręcić do 1 formatu.

import { createHmac, timingSafeEqual } from "node:crypto";

import type { SagaEvent } from "./sagaTypes";

/** Po czym szukamy sagi w bazie (webhook nie zna naszego id). */
export interface SagaReference {
  flightPrebookId?: string;
  flightBookingId?: string;
  hotelPrebookId?: string;
  hotelBookingId?: string;
}

export interface MappedWebhook {
  event: SagaEvent;
  ref: SagaReference;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function pick(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = str(obj[k]);
    if (v) return v;
  }
  return undefined;
}

/**
 * Webhook → zdarzenie sagi. null = event znany, ale bez przejścia (czysto
 * informacyjny albo dotyczy etapu przed pieniędzmi) — handler odpowiada 200
 * i tylko loguje. Nieznany typ eventu też daje null (forward-compatible).
 */
export function mapLiteApiWebhook(payload: unknown): MappedWebhook | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  const type = str(root.event) ?? str(root.type);
  if (!type) return null;

  const data = (typeof root.data === "object" && root.data ? root.data : root) as Record<string, unknown>;
  const flightBookingId = pick(data, ["bookingId", "booking_id", "id"]);
  const flightPrebookId = pick(data, ["prebookId", "prebook_id"]);
  const reason =
    pick(data, ["reason", "error", "message", "failureReason"]) ?? `webhook ${type}`;

  switch (type) {
    case "flight.book.confirmed":
      return {
        event: { type: "FLIGHT_CONFIRMED" },
        ref: { flightBookingId, flightPrebookId },
      };
    case "flight.book.failed":
      return {
        event: { type: "FLIGHT_BOOK_FAILED_PERMANENT", reason },
        ref: { flightBookingId, flightPrebookId },
      };
    case "flight.book.expired":
      return {
        event: { type: "FLIGHT_EXPIRED", reason },
        ref: { flightBookingId, flightPrebookId },
      };
    case "flight.book.pending.confirmation":
      // Informacyjny: saga i tak jest w FLIGHT_BOOKED po naszym POST.
      return null;
    case "booking.book_error":
      // Hotelowy book po płatności nie wszedł → kompensacja (refund A).
      return {
        event: { type: "HOTEL_BOOK_FAILED", reason },
        ref: {
          hotelBookingId: flightBookingId, // hotelowy payload używa tych samych nazw pól
          hotelPrebookId: flightPrebookId,
        },
      };
    case "booking.prebook_error":
      // Etap przed pieniędzmi — checkout obsługuje to synchronicznie.
      return null;
    default:
      return null;
  }
}

/**
 * Weryfikacja podpisu webhooka: HMAC-SHA256(sekret, surowe body) w hex.
 * Akceptuje nagłówek "abc123…" albo "sha256=abc123…". Timing-safe.
 * Brak nagłówka / zła długość / mismatch → false.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const given = signatureHeader.startsWith("sha256=") ? signatureHeader.slice(7) : signatureHeader;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(given.toLowerCase(), "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
