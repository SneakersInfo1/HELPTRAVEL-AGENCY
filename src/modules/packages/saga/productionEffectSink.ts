// Produkcyjny EffectSink — tłumaczy deklaratywne efekty sagi na realną
// infrastrukturę repo. KAŻDA operacja idempotentna lub bezpieczna przy
// powtórce (orkiestrator gwarantuje tylko at-least-once).
//
// Mapa efektów:
//  • CANCEL_HOTEL       → LiteAPI cancelBooking (taryfa z DARMOWĄ anulacją —
//                         warunek pakietowy MVP, więc cancel = 0 zł),
//  • REFUND_HOTEL/FLIGHT→ ZWROTY NIE SĄ AUTOMATYZOWANE w tym kroku:
//                         mechanika refundu płatności LiteAPI = TODO:VERIFY
//                         (decyzje) → CRITICAL alert do admina z kompletem
//                         danych (świadomy, bezpieczny default — lepszy
//                         ręczny zwrot w 30 min niż zły automat na pieniądzach),
//  • SEND_*_EMAIL       → Resend (proste, uczciwe treści; bogate szablony
//                         dojdą w Kroku 2.2-polish),
//  • ALERT_ADMIN        → istniejący webhook alertów (Slack/Discord),
//  • SCHEDULE_DEADLINE  → no-op: deadlineAt siedzi w rekordzie, „zegarem"
//                         jest cron package-deadlines (sweep),
//  • TRACK              → log strukturalny (GA4 server-side Measurement
//                         Protocol = TODO; eventy klienckie idą z UI).

import { notify } from "@/lib/alerting/notify";
import { getBcc, getDefaultFrom, getReplyTo, getResendClient } from "@/lib/email/client";
import { cancelBooking } from "@/lib/liteapi/cancel";
import { getSiteUrl } from "@/lib/mvp/site";

import type { EffectSink, PackageBookingRecord } from "./orchestrator";
import type { SagaEffect } from "./sagaTypes";

interface SinkDeps {
  cancelHotelBooking(hotelBookingId: string): Promise<unknown>;
  sendEmail(input: { to: string; subject: string; text: string }): Promise<void>;
  alert(input: { title: string; body?: string; fields?: Record<string, string | number | null | undefined>; level?: "info" | "warning" | "critical"; source?: string }): Promise<void>;
  log(message: string, payload: Record<string, unknown>): void;
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Warsaw",
  }).format(new Date(iso));
}

function bookingFields(b: PackageBookingRecord): Record<string, string | null> {
  return {
    saga: b.id,
    stan: b.sagaState,
    hotelBookingId: b.hotelBookingId,
    flightBookingId: b.flightBookingId,
    txnHotel: b.txnHotel,
    txnFlight: b.txnFlight,
    kontakt: b.contactEmail ?? null,
  };
}

function emailFor(b: PackageBookingRecord, effect: SagaEffect): { subject: string; text: string } | null {
  const site = getSiteUrl();
  switch (effect.type) {
    case "SEND_RESUME_EMAIL":
      return {
        subject: "Hotel potwierdzony — dokończ rezerwację lotu",
        text: [
          "Twój hotel jest potwierdzony i opłacony.",
          `Została jeszcze płatność za lot — dokończ ją do ${fmtWhen(b.deadlineAt)}, potem rezerwację automatycznie anulujemy i zwrócimy pełną kwotę za hotel.`,
          "",
          `Wróć do rezerwacji: ${site}/pakiety/checkout/${b.id}`,
          "",
          "Zespół helptravel.pl",
        ].join("\n"),
      };
    case "SEND_REFUND_EMAIL":
      return {
        subject: "Rezerwacja anulowana — pełny zwrot w drodze",
        text: [
          "Twoja rezerwacja pakietu została anulowana zgodnie z zasadami (hotel miał bezpłatną anulację).",
          "Pełny zwrot wpłaconej kwoty jest w drodze — na wyciągu zobaczysz go od NUITEE TRAVEL, operatora płatności helptravel.pl.",
          "",
          "Jeśli coś się nie zgadza, po prostu odpisz na tę wiadomość.",
          "",
          "Zespół helptravel.pl",
        ].join("\n"),
      };
    case "SEND_CONFIRMATION_EMAIL":
      return {
        subject: "Potwierdzenie pakietu — hotel + lot",
        text: [
          "Twój pakiet jest potwierdzony. Dwie rezerwacje, dwa numery:",
          `• Hotel: ${b.hotelBookingId ?? "—"}`,
          `• Lot: ${b.flightBookingId ?? "—"}`,
          "",
          `Szczegóły i status: ${site}/pakiety/rezerwacja/${b.id}`,
          "",
          "Zespół helptravel.pl",
        ].join("\n"),
      };
    default:
      return null;
  }
}

export function createEffectSink(deps: SinkDeps): EffectSink {
  return {
    async run(booking, effect) {
      switch (effect.type) {
        case "SCHEDULE_DEADLINE":
          // deadlineAt zapisany w rekordzie; cron package-deadlines to zegar.
          deps.log("[saga] deadline zaplanowany (cron sweep)", { saga: booking.id, at: effect.at });
          return;

        case "CANCEL_HOTEL": {
          if (!booking.hotelBookingId) {
            throw new Error(`CANCEL_HOTEL bez hotelBookingId (saga ${booking.id})`);
          }
          await deps.cancelHotelBooking(booking.hotelBookingId);
          return;
        }

        case "REFUND_HOTEL":
        case "REFUND_FLIGHT": {
          // Świadomie RĘCZNE do czasu TODO:VERIFY mechaniki refundów LiteAPI.
          await deps.alert({
            title: `Zwrot do wykonania: ${effect.type === "REFUND_HOTEL" ? "HOTEL (płatność A)" : "LOT (płatność B')"}`,
            body: "Saga pakietu wymaga zwrotu płatności. Automatyzacja refundów = TODO:VERIFY — wykonaj/zweryfikuj zwrot w panelu LiteAPI i domknij sagę (COMPENSATION_DONE).",
            fields: bookingFields(booking),
            level: "critical",
            source: "package-saga",
          });
          return;
        }

        case "SEND_RESUME_EMAIL":
        case "SEND_REFUND_EMAIL":
        case "SEND_CONFIRMATION_EMAIL": {
          if (!booking.contactEmail) {
            throw new Error(`${effect.type} bez contactEmail (saga ${booking.id})`);
          }
          const content = emailFor(booking, effect);
          if (!content) return;
          await deps.sendEmail({ to: booking.contactEmail, ...content });
          return;
        }

        case "ALERT_ADMIN":
          await deps.alert({
            title: "Saga pakietu wymaga ręcznej akcji",
            body: effect.reason,
            fields: bookingFields(booking),
            level: "critical",
            source: "package-saga",
          });
          return;

        case "TRACK":
          // GA4 Measurement Protocol (server-side) = TODO; na razie ślad w logach
          // (eventy lejka klienckiego i tak lecą z UI przez lib/analytics/track).
          deps.log("[saga] track", { saga: booking.id, event: effect.event, state: booking.sagaState });
          return;
      }
    },
  };
}

/** Sink na produkcyjnej infrastrukturze repo (LiteAPI + Resend + alerty). */
export function createProductionEffectSink(): EffectSink {
  return createEffectSink({
    cancelHotelBooking: (id) => cancelBooking(id),
    async sendEmail({ to, subject, text }) {
      const resend = getResendClient();
      if (!resend) throw new Error("Resend nieskonfigurowany (RESEND_API_KEY) — e-mail sagi nie wyszedł");
      const bcc = getBcc();
      const replyTo = getReplyTo();
      const { error } = await resend.emails.send({
        from: getDefaultFrom(),
        to,
        subject,
        text,
        ...(bcc ? { bcc } : {}),
        ...(replyTo ? { replyTo } : {}),
      });
      if (error) throw new Error(`Resend: ${error.message ?? String(error)}`);
    },
    alert: (input) => notify(input),
    log: (message, payload) => console.info(message, payload),
  });
}
