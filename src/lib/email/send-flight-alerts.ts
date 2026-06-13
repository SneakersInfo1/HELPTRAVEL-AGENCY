// Maile dla lotów (Faza 1): (1) alert do admina przy manual_review (płatność
// OK, booking failed — brief 1.4.5), (2) potwierdzenie rezerwacji lotu do
// klienta (wołane z webhooka flight.book.confirmed — brief 1.6).
//
// Reużywamy mechanizmu Resend z hoteli (client.ts). NIGDY nie rzuca — callery
// fire-and-forget. Adres admina: EMAIL_ADMIN → EMAIL_BCC → reply-to → kontakt.
// Numery dokumentów nigdy nie trafiają do maili (operujemy na zamaskowanych).

import { notifyWarning } from "@/lib/alerting/notify";
import { getBcc, getDefaultFrom, getReplyTo, getResendClient } from "./client";
import type { FlightContactData } from "@/lib/flights/session";

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
        from: getDefaultFrom(),
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

/** Potwierdzenie rezerwacji lotu do klienta (Faza 1.6; copy doszlifujemy w Fazie 5). */
export async function sendFlightConfirmation(input: {
  bookingId: string;
  to: string;
  pnr?: string;
  ticketingPending?: boolean;
  price?: number;
  currency?: string;
}): Promise<void> {
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
  const ticketLine = input.ticketingPending
    ? "<p>Rezerwacja jest potwierdzona. Status wystawienia biletu zostanie zaktualizowany po otrzymaniu danych od przewoźnika.</p>"
    : "<p>Bilet został wystawiony. Szczegóły znajdziesz w potwierdzeniu rezerwacji.</p>";
  const price = typeof input.price === "number" ? `${input.price.toFixed(2)} ${input.currency ?? "PLN"}` : "";
  const html = `
    <h2>Rezerwacja lotu potwierdzona</h2>
    <p>Numer rezerwacji: <b>${input.bookingId}</b>${input.pnr ? ` · PNR: <b>${input.pnr}</b>` : ""}</p>
    ${price ? `<p>Kwota: <b>${price}</b></p>` : ""}
    ${ticketLine}
    <p>Dziękujemy, że wybrałeś HelpTravel.</p>
  `;
  try {
    const res = await withTimeout(
      client.emails.send({
        from: getDefaultFrom(),
        to,
        ...(getReplyTo() ? { replyTo: getReplyTo()! } : {}),
        ...(getBcc() ? { bcc: getBcc()! } : {}),
        subject: `Potwierdzenie rezerwacji lotu — ${input.bookingId}`,
        html,
        text: `Rezerwacja lotu potwierdzona. Numer: ${input.bookingId}${input.pnr ? ` PNR: ${input.pnr}` : ""}.`,
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
