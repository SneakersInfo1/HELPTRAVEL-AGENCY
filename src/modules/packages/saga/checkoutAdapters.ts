// Adaptery realnych klientów LiteAPI → wąskie porty CheckoutDeps.
// Jedyne miejsce, gdzie route'y checkoutu pakietowego dotykają sieci.
//
// Zasady przeniesione z hotelowego/lotniczego flow (RULE 6):
//  • prebook bez kompletu handli płatności (transactionId+secretKey) = błąd
//    JAWNY (nie udajemy sukcesu — płatność jeszcze nie ruszyła),
//  • book woła się TYLKO po sukcesie płatności w SDK; sam book z
//    payment.method=TRANSACTION_ID jest autorytatywną walidacją transakcji
//    po stronie LiteAPI (zła/nieopłacona transakcja → book failuje),
//  • kwoty trzymamy w minor units; secretKey NIGDY do storage (tylko front).

import { randomUUID } from "node:crypto";

import {
  bookFlight,
  extractBookingId,
  extractVerifiedTotal,
  getFlightBooking,
  prebookFlight,
  verifyFlightOffer,
} from "@/lib/flights/client";
import type { FlightContact, FlightPassenger } from "@/lib/flights/types";
import { bookHotel, prebookHotel } from "@/lib/liteapi";
import type { LiteApiGuest, LiteApiHolder } from "@/lib/liteapi";

import type { CheckoutDeps, CheckoutStore } from "./checkoutService";
import type { EffectSink } from "./orchestrator";

export interface HotelBookContext {
  holder: LiteApiHolder;
  guests: LiteApiGuest[];
}

/**
 * Deps per żądanie: dane lotu (contact+passengers) i hotelu (holder+guests)
 * wstrzykiwane z requestu / zapisanego kontekstu sagi — porty zostają wąskie.
 */
export function buildCheckoutDeps(args: {
  store: CheckoutStore;
  effects: EffectSink;
  flight?: { contact: FlightContact; passengers: FlightPassenger[] };
  hotel?: HotelBookContext;
}): CheckoutDeps {
  return {
    store: args.store,
    effects: args.effects,

    async verifyFlight(offerId) {
      const verify = await verifyFlightOffer(offerId);
      const priceChanged = Boolean(verify.data?.[0]?.priceChanged);
      const { total } = extractVerifiedTotal(verify);
      return { priceChanged, total };
    },

    async prebookFlight({ offerId }) {
      if (!args.flight) throw new Error("prebookFlight: brak contact/passengers w kontekście żądania");
      const pre = await prebookFlight({ offerId, contact: args.flight.contact, passengers: args.flight.passengers });
      if (!pre.prebookId || !pre.transactionId || !pre.secretKey) {
        throw new Error("prebook lotu bez kompletu handli płatności (prebookId/transactionId/secretKey)");
      }
      return {
        prebookId: pre.prebookId,
        transactionId: pre.transactionId,
        secretKey: pre.secretKey,
        // LiteAPI nie zwraca expiresAt (zweryfikowane, BOOKING_AUDIT §8) —
        // deadline sagi policzy cap 25 min od booku hotelu.
        expiresAt: null,
        price: pre.price,
        currency: pre.currency,
      };
    },

    async prebookHotel({ rateId, clientReference }) {
      const pre = await prebookHotel({ rateId, clientReference });
      if (!pre.prebookId || !pre.transactionId || !pre.secretKey) {
        throw new Error("prebook hotelu bez kompletu handli płatności (prebookId/transactionId/secretKey)");
      }
      return {
        prebookId: pre.prebookId,
        transactionId: pre.transactionId,
        secretKey: pre.secretKey,
        price: pre.price,
        currency: pre.currency,
      };
    },

    async bookHotel({ prebookId, transactionId, clientReference }) {
      if (!args.hotel) throw new Error("bookHotel: brak holder/guests w kontekście żądania");
      const booking = await bookHotel({
        prebookId,
        transactionId,
        clientReference,
        holder: args.hotel.holder,
        guests: args.hotel.guests,
      });
      if (!booking.bookingId) throw new Error("book hotelu bez bookingId w odpowiedzi");
      return { bookingId: booking.bookingId };
    },

    async bookFlight({ prebookId, transactionId }) {
      const res = await bookFlight({ prebookId, transactionId });
      const bookingId = extractBookingId(res);
      if (!bookingId) {
        // Book mógł przejść mimo braku id w odpowiedzi — dociągnij po prebookId
        // zanim uznamy porażkę (idempotencja po prebookId — brief 1.2).
        throw new Error("book lotu bez bookingId w odpowiedzi");
      }
      return { bookingId };
    },

    newId: () => `pkg_${randomUUID()}`,
    now: () => new Date(),
  };
}

export { getFlightBooking };
