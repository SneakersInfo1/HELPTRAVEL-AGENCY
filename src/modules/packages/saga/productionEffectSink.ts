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
//  • SEND_*_EMAIL       → Resend, szablony HTML+text z lib/email/templates/
//                         package-saga (fakty z sagi + kontekst oferty),
//  • ALERT_ADMIN        → istniejący webhook alertów (Slack/Discord),
//  • SCHEDULE_DEADLINE  → no-op: deadlineAt siedzi w rekordzie, „zegarem"
//                         jest cron package-deadlines (sweep),
//  • TRACK              → log strukturalny (GA4 server-side Measurement
//                         Protocol = TODO; eventy klienckie idą z UI).

import { notify } from "@/lib/alerting/notify";
import { getBcc, getDefaultFrom, getReplyTo, getResendClient } from "@/lib/email/client";
import {
  renderPackageConfirmationEmail,
  renderPackageRefundEmail,
  renderPackageResumeEmail,
  type PackageEmailData,
  type RenderedEmail,
} from "@/lib/email/templates/package-saga";
import { cancelBooking } from "@/lib/liteapi/cancel";

import type { EffectSink, PackageBookingRecord } from "./orchestrator";
import { createPrismaSagaStore } from "./prismaSagaStore";
import type { SagaEffect } from "./sagaTypes";

/** Kontekst oferty do maili (podzbiór offerJson.offer) — brak = mail bez tych linii. */
export interface OfferEmailContext {
  hotelName?: string | null;
  destination?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

interface SinkDeps {
  cancelHotelBooking(hotelBookingId: string): Promise<unknown>;
  sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void>;
  /** Kontekst oferty z sagi (offerJson) — best-effort, null gdy brak/DB niedostępne. */
  loadOfferContext(sagaId: string): Promise<OfferEmailContext | null>;
  alert(input: { title: string; body?: string; fields?: Record<string, string | number | null | undefined>; level?: "info" | "warning" | "critical"; source?: string }): Promise<void>;
  log(message: string, payload: Record<string, unknown>): void;
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

function toEmailData(b: PackageBookingRecord, ctx: OfferEmailContext | null): PackageEmailData {
  return {
    sagaId: b.id,
    hotelBookingId: b.hotelBookingId,
    flightBookingId: b.flightBookingId,
    deadlineAt: b.deadlineAt,
    hotelName: ctx?.hotelName ?? null,
    destination: ctx?.destination ?? null,
    dateFrom: ctx?.dateFrom ?? null,
    dateTo: ctx?.dateTo ?? null,
  };
}

function renderFor(effect: SagaEffect, data: PackageEmailData): RenderedEmail | null {
  switch (effect.type) {
    case "SEND_RESUME_EMAIL":
      return renderPackageResumeEmail(data);
    case "SEND_REFUND_EMAIL":
      return renderPackageRefundEmail(data);
    case "SEND_CONFIRMATION_EMAIL":
      return renderPackageConfirmationEmail(data);
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
          const ctx = await deps.loadOfferContext(booking.id).catch(() => null);
          const rendered = renderFor(effect, toEmailData(booking, ctx));
          if (!rendered) return;
          await deps.sendEmail({ to: booking.contactEmail, ...rendered });
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
    async sendEmail({ to, subject, text, html }) {
      const resend = getResendClient();
      if (!resend) throw new Error("Resend nieskonfigurowany (RESEND_API_KEY) — e-mail sagi nie wyszedł");
      const bcc = getBcc();
      const replyTo = getReplyTo();
      const { error } = await resend.emails.send({
        from: getDefaultFrom(),
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(bcc ? { bcc } : {}),
        ...(replyTo ? { replyTo } : {}),
      });
      if (error) throw new Error(`Resend: ${error.message ?? String(error)}`);
    },
    async loadOfferContext(sagaId) {
      // Best-effort: mail bez kontekstu oferty jest wciąż poprawny (same fakty
      // z sagi). SagaStoreUnavailable i inne błędy → null, nie fail maila.
      const ctx = await createPrismaSagaStore().loadCheckoutContext(sagaId);
      const offer = (ctx?.offerJson as { offer?: { hotelName?: string; destination?: string; dateFrom?: string; dateTo?: string } } | null)?.offer;
      if (!offer) return null;
      return {
        hotelName: offer.hotelName ?? null,
        destination: offer.destination ?? null,
        dateFrom: offer.dateFrom ?? null,
        dateTo: offer.dateTo ?? null,
      };
    },
    alert: (input) => notify(input),
    log: (message, payload) => console.info(message, payload),
  });
}
