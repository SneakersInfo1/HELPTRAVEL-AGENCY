// Maile dla lotów (Faza 1): (1) alert do admina przy manual_review (płatność
// OK, booking failed — brief 1.4.5), (2) potwierdzenie rezerwacji lotu do
// klienta (wołane z webhooka flight.book.confirmed — brief 1.6).
//
// Reużywamy mechanizmu Resend z hoteli (client.ts). NIGDY nie rzuca — callery
// fire-and-forget. Adres admina: EMAIL_ADMIN → EMAIL_BCC → reply-to → kontakt.
// Numery dokumentów nigdy nie trafiają do maili (operujemy na zamaskowanych).

import { notifyWarning } from "@/lib/alerting/notify";
import {
  MISSING_FROM_REASON,
  getBcc,
  getDefaultFrom,
  getReplyTo,
  getResendClient,
} from "./client";
import type { FlightBookingRecord, FlightContactData } from "@/lib/flights/session";
import {
  renderFlightCancellation,
  renderFlightConfirmation,
  type FlightEmailLeg,
} from "./templates/flight-confirmation";

function adminAddress(): string {
  return (
    process.env.EMAIL_ADMIN?.trim() ||
    process.env.EMAIL_BCC?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim() ||
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ||
    "pomoc@helptravel.pl"
  );
}

const SEND_TIMEOUT_MS = 5000;
function withTimeout<T>(p: Promise<T>): Promise<T> {
  const t = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("resend_timeout_5s")), SEND_TIMEOUT_MS));
  return Promise.race([p, t]);
}

/** Alert do admina: płatność przeszła, ale booking lotu wymaga ręcznej weryfikacji. */
export async function sendFlightManualReviewAlert(input: {
  sessionId: string;
  prebookId?: string;
  reason: string;
  contact?: FlightContactData;
}): Promise<void> {
  const client = getResendClient();
  if (!client) {
    console.warn(`[email][flight-manual-review] skipped — RESEND_API_KEY not set sid=${input.sessionId}`);
    return;
  }
  const from = getDefaultFrom();
  if (!from) {
    console.error(`[email][flight-manual-review] SKIPPED sid=${input.sessionId} — ${MISSING_FROM_REASON}`);
    return;
  }
  const to = adminAddress();
  const html = `
    <h2>⚠️ Lot: płatność OK, rezerwacja wymaga ręcznej weryfikacji</h2>
    <p>Klient zapłacił, ale <code>/flights/bookings</code> nie powiodło się po retry.</p>
    <ul>
      <li><b>sessionId:</b> ${input.sessionId}</li>
      <li><b>prebookId:</b> ${input.prebookId ?? "—"}</li>
      <li><b>kontakt klienta:</b> ${input.contact?.email ?? "—"} / ${input.contact?.firstName ?? ""} ${input.contact?.lastName ?? ""}</li>
      <li><b>powód:</b> ${input.reason}</li>
    </ul>
    <p>Zweryfikuj w panelu LiteAPI (po prebookId/transactionId) i skontaktuj się z klientem.</p>
  `;
  try {
    const res = await withTimeout(
      client.emails.send({
        from,
        to,
        ...(getReplyTo() ? { replyTo: getReplyTo()! } : {}),
        subject: `[HelpTravel] Lot manual_review — sid ${input.sessionId.slice(0, 8)}`,
        html,
        text: `Lot manual_review. sessionId=${input.sessionId} prebookId=${input.prebookId ?? "-"} reason=${input.reason} contact=${input.contact?.email ?? "-"}`,
      }),
    );
    if (res.error) {
      console.error(`[email][flight-manual-review] FAILED sid=${input.sessionId} error=${res.error.message}`);
    } else {
      console.log(`[email][flight-manual-review] sent sid=${input.sessionId} messageId=${res.data?.id ?? "?"}`);
    }
  } catch (err) {
    console.error(`[email][flight-manual-review] THREW sid=${input.sessionId} error=${err instanceof Error ? err.message : String(err)}`);
  }
}

function supportEmail(): string {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "pomoc@helptravel.pl";
}

export interface FlightConfirmationInput {
  bookingId: string;
  to: string;
  pnr?: string;
  eTicketNumbers?: string[];
  ticketingPending?: boolean;
  price?: number;
  currency?: string;
  legs?: FlightEmailLeg[];
  fareName?: string;
  hasCarryOnBag?: boolean;
  hasCheckedBag?: boolean;
  passengers?: Array<{ firstName: string; lastName: string; type?: string }>;
}

/**
 * Potwierdzenie rezerwacji lotu do klienta.
 *
 * Treść renderuje `templates/flight-confirmation.ts` — do 2026-08-29 były to
 * cztery linijki HTML-a sklejone tutaj, bez trasy, dat, lotnisk, pasażerów,
 * taryfy i bagażu (czyli bez wszystkiego, czego wymaga brief §11).
 *
 * NIGDY nie rzuca: mail jest side-effectem i nie może wywrócić stanu
 * rezerwacji (brief §11). Awaria idzie w log + `notifyWarning`.
 */
export async function sendFlightConfirmation(input: FlightConfirmationInput): Promise<void> {
  const to = input.to?.trim();
  if (!to) {
    console.warn(`[email][flight-confirmation] skipped — brak adresu bookingId=${input.bookingId}`);
    return;
  }
  const client = getResendClient();
  if (!client) {
    console.warn(`[email][flight-confirmation] skipped — RESEND_API_KEY not set bookingId=${input.bookingId}`);
    return;
  }
  // Customer-facing: stary fallback resend.dev odpowiadał 403 dla każdego
  // odbiorcy poza właścicielem konta Resend (incydent hotelowy 2026-08-28) —
  // lepiej pominąć głośno niż udawać, że wysłaliśmy.
  const from = getDefaultFrom();
  if (!from) {
    console.error(`[email][flight-confirmation] SKIPPED bookingId=${input.bookingId} — ${MISSING_FROM_REASON}`);
    void notifyWarning({
      source: "email",
      title: "Flight confirmation email skipped — sender not configured",
      body: `Booking ${input.bookingId} jest potwierdzony. ${MISSING_FROM_REASON}`,
      fields: { bookingId: input.bookingId, to, errorCode: "BOOKING_CONFIRMATION_EMAIL_FAILED" },
    }).catch(() => {});
    return;
  }

  const mail = renderFlightConfirmation({
    bookingId: input.bookingId,
    pnr: input.pnr,
    eTicketNumbers: input.eTicketNumbers,
    ticketingPending: input.ticketingPending,
    legs: input.legs,
    fareName: input.fareName,
    hasCarryOnBag: input.hasCarryOnBag,
    hasCheckedBag: input.hasCheckedBag,
    passengers: input.passengers,
    price: input.price,
    currency: input.currency,
    supportEmail: supportEmail(),
  });

  try {
    const res = await withTimeout(
      client.emails.send({
        from,
        to,
        ...(getReplyTo() ? { replyTo: getReplyTo()! } : {}),
        ...(getBcc() ? { bcc: getBcc()! } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: { "X-Entity-Ref-ID": input.bookingId },
      }),
    );
    if (res.error) {
      console.error(`[email][flight-confirmation] FAILED bookingId=${input.bookingId} error=${res.error.message}`);
      void notifyWarning({
        source: "email",
        title: "Flight confirmation email failed",
        body: `Resend odrzucił wysyłkę. Booking ${input.bookingId} potwierdzony; być może potrzebny ręczny mail.`,
        fields: { bookingId: input.bookingId, to, error: res.error.message },
      }).catch(() => {});
    } else {
      console.log(`[email][flight-confirmation] sent bookingId=${input.bookingId} messageId=${res.data?.id ?? "?"}`);
    }
  } catch (err) {
    console.error(`[email][flight-confirmation] THREW bookingId=${input.bookingId} error=${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Mail o ANULOWANIU rezerwacji lotu.
 *
 * Istnieje, bo webhook `flight.book.cancelled` wołał dotąd
 * `sendFlightConfirmation` — czyli klient, któremu przewoźnik anulował lot,
 * dostawał wiadomość zatytułowaną „Potwierdzenie rezerwacji lotu" i zaczynającą
 * się od słów „Rezerwacja lotu potwierdzona". Trudno o gorszy moment na
 * sprzeczny komunikat.
 */
export async function sendFlightCancellation(input: {
  bookingId: string;
  to: string;
  pnr?: string;
  price?: number;
  currency?: string;
}): Promise<void> {
  const to = input.to?.trim();
  if (!to) return;
  const client = getResendClient();
  if (!client) {
    console.warn(`[email][flight-cancellation] skipped — RESEND_API_KEY not set bookingId=${input.bookingId}`);
    return;
  }
  const from = getDefaultFrom();
  if (!from) {
    console.error(`[email][flight-cancellation] SKIPPED bookingId=${input.bookingId} — ${MISSING_FROM_REASON}`);
    return;
  }
  const mail = renderFlightCancellation({
    bookingId: input.bookingId,
    pnr: input.pnr,
    price: input.price,
    currency: input.currency,
    supportEmail: supportEmail(),
  });
  try {
    const res = await withTimeout(
      client.emails.send({
        from,
        to,
        ...(getReplyTo() ? { replyTo: getReplyTo()! } : {}),
        ...(getBcc() ? { bcc: getBcc()! } : {}),
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        headers: { "X-Entity-Ref-ID": `${input.bookingId}-cancelled` },
      }),
    );
    if (res.error) {
      console.error(`[email][flight-cancellation] FAILED bookingId=${input.bookingId} error=${res.error.message}`);
    } else {
      console.log(`[email][flight-cancellation] sent bookingId=${input.bookingId} messageId=${res.data?.id ?? "?"}`);
    }
  } catch (err) {
    console.error(`[email][flight-cancellation] THREW bookingId=${input.bookingId} error=${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Buduje wejście do maila potwierdzającego z rekordu sesji.
 *
 * Jedno miejsce dla obu wywołujących (finalizacja po płatności ORAZ webhook
 * `flight.book.confirmed`) — inaczej ten sam mail wychodziłby z dwóch ścieżek
 * z różną zawartością, zależnie od tego, która zdążyła pierwsza.
 */
export function flightConfirmationInputFromSession(
  session: FlightBookingRecord,
  extra: { bookingId: string; pnr?: string; eTicketNumbers?: string[]; ticketingPending: boolean },
): FlightConfirmationInput | null {
  const to = session.contactData?.email;
  if (!to) return null;
  return {
    bookingId: extra.bookingId,
    to,
    pnr: extra.pnr,
    eTicketNumbers: extra.eTicketNumbers,
    ticketingPending: extra.ticketingPending,
    price: session.price,
    currency: session.currency,
    legs: session.itinerary?.legs,
    fareName: session.itinerary?.fareName,
    hasCarryOnBag: session.itinerary?.hasCarryOnBag,
    hasCheckedBag: session.itinerary?.hasCheckedBag,
    passengers: session.passengerData?.map((p) => ({ firstName: p.firstName, lastName: p.lastName, type: p.type })),
  };
}
