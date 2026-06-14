// Typy + schematy zod dla LiteAPI Flights (Faza 1.2/1.3).
//
// Schematy ODPOWIEDZI są LENIENT (passthrough/optional) — jak przy hotelach:
// dostawcy GDS bywają nieprzewidywalni, a my nie chcemy wywracać flow na
// drobnej zmianie kształtu. Schematy WEJŚCIA (search/passenger/contact) są
// ŚCISŁE — to nasza bramka walidacyjna przed dotknięciem produkcyjnego API.
//
// Kształty zweryfikowane empirycznie 2026-06-13 na produkcji LiteAPI
// (docs/liteapi-flights-sample-rates.json, docs/liteapi-flights-sample-prebook.json).

import { z } from "zod";

// ── WEJŚCIE: search (/api/flights/rates) ─────────────────────────────────────

const IATA = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Kod IATA = 3 litery");
const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data w formacie YYYY-MM-DD");

export const FlightLegSchema = z.object({
  origin: IATA,
  destination: IATA,
  date: ISO_DATE,
  direction: z.enum(["OUTBOUND", "INBOUND"]).default("OUTBOUND"),
});

export const FlightSearchInputSchema = z
  .object({
    // 1–2 legs (round-trip = 2; multi-city > 2 świadomie poza zakresem).
    legs: z.array(FlightLegSchema).min(1).max(2),
    adults: z.number().int().min(1).max(9),
    children: z.number().int().min(0).max(8).default(0),
    infants: z.number().int().min(0).max(4).default(0),
    cabinClass: z.enum(["ECONOMY", "PREMIUM_ECONOMY", "BUSINESS", "FIRST"]).default("ECONOMY"),
    // currency/country na sztywno na start (brief 1.2) — ale walidujemy kształt.
    currency: z.literal("PLN").default("PLN"),
    country: z.literal("PL").default("PL"),
  })
  .superRefine((val, ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const [i, leg] of val.legs.entries()) {
      const d = new Date(`${leg.date}T00:00:00`);
      if (Number.isNaN(d.getTime()) || d < today) {
        ctx.addIssue({ code: "custom", message: "Data wylotu musi być w przyszłości", path: ["legs", i, "date"] });
      }
      if (leg.origin === leg.destination) {
        ctx.addIssue({ code: "custom", message: "Wylot i cel muszą się różnić", path: ["legs", i, "destination"] });
      }
    }
    if (val.infants > val.adults) {
      ctx.addIssue({ code: "custom", message: "Liczba niemowląt nie może przekraczać liczby dorosłych", path: ["infants"] });
    }
  });
export type FlightSearchInput = z.infer<typeof FlightSearchInputSchema>;

// ── WEJŚCIE: dane pasażera + kontakt (brief 1.3) ─────────────────────────────

const DOC_TYPE = z.enum(["passport", "id"]); // LiteAPI: małymi literami
const GENDER = z.enum(["M", "F", "X"]); // LiteAPI: M/F/X (zmierzone)

export const FlightPassengerSchema = z
  .object({
    title: z.enum(["MR", "MRS", "MS", "MISS"]).optional(),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().min(1).max(60),
    birthday: ISO_DATE,
    gender: GENDER,
    nationality: z.string().trim().toUpperCase().length(2),
    type: z.enum(["ADT", "CHD", "INF"]).default("ADT"),
    documentType: DOC_TYPE,
    documentNumber: z.string().trim().min(3).max(40),
    documentExpiry: ISO_DATE,
    documentIssueCountry: z.string().trim().toUpperCase().length(2),
  })
  .superRefine((p, ctx) => {
    const birth = new Date(`${p.birthday}T00:00:00`);
    if (Number.isNaN(birth.getTime()) || birth > new Date() || birth.getFullYear() < 1900) {
      ctx.addIssue({ code: "custom", message: "Nieprawidłowa data urodzenia", path: ["birthday"] });
    }
    // Ważność dokumentu sprawdzamy względem daty wylotu na poziomie route'a
    // (tam znamy daty podróży); tu tylko, że to sensowna przyszła data.
    const exp = new Date(`${p.documentExpiry}T00:00:00`);
    if (Number.isNaN(exp.getTime())) {
      ctx.addIssue({ code: "custom", message: "Nieprawidłowa data ważności dokumentu", path: ["documentExpiry"] });
    }
  });
export type FlightPassenger = z.infer<typeof FlightPassengerSchema>;

export const FlightContactSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(120),
  phoneNumber: z.string().trim().min(5).max(20).regex(/^[0-9 +\-()]+$/, "Nieprawidłowy telefon"),
  phoneCountryCode: z.string().trim().regex(/^\d{1,4}$/).default("48"),
});
export type FlightContact = z.infer<typeof FlightContactSchema>;

// ── WEJŚCIE: prebook / verify (z naszego API) ────────────────────────────────

export const FlightVerifyInputSchema = z.object({ offerId: z.string().min(8) });
export const FlightPrebookInputSchema = z.object({
  offerId: z.string().min(8),
  contact: FlightContactSchema,
  passengers: z.array(FlightPassengerSchema).min(1).max(9),
  /** Daty podróży z wyszukiwania — do walidacji ważności dokumentu i snapshotu. */
  lastTravelDate: ISO_DATE.optional(),
});
export type FlightPrebookInput = z.infer<typeof FlightPrebookInputSchema>;

// ── ODPOWIEDZI LiteAPI (lenient) ─────────────────────────────────────────────

const PricingDisplay = z
  .object({
    total: z.number().optional(),
    currency: z.string().optional(),
    base: z.number().optional(),
    taxes: z.number().optional(),
    fees: z.number().optional(),
  })
  .passthrough();

const FlightOfferSchema = z
  .object({
    offerId: z.string(),
    expiration: z.string().optional(),
    pricing: z.object({ display: PricingDisplay.optional() }).passthrough().optional(),
    provider: z.unknown().optional(),
    baggage: z.unknown().optional(),
    fare: z.unknown().optional(),
  })
  .passthrough();

const FlightSegmentSchema = z
  .object({
    carrier: z.unknown().optional(),
    departureTime: z.string().optional(),
    arrivalTime: z.string().optional(),
    originCode: z.string().optional(),
    destinationCode: z.string().optional(),
    originName: z.string().optional(),
    destinationName: z.string().optional(),
    direction: z.string().optional(),
    duration: z.unknown().optional(),
    flight: z.unknown().optional(),
  })
  .passthrough();

const JourneySchema = z
  .object({
    cheapestOffer: FlightOfferSchema.optional(),
    offers: z.array(FlightOfferSchema).optional(),
    segments: z.array(FlightSegmentSchema).optional(),
    totalDuration: z.unknown().optional(),
    legDurations: z.unknown().optional(),
    journeyKey: z.string().optional(),
    isCheapest: z.boolean().optional(),
  })
  .passthrough();

export const FlightRatesResponseSchema = z
  .object({ data: z.array(z.object({ journeys: z.array(JourneySchema) }).passthrough()) })
  .passthrough();
export type FlightRatesResponse = z.infer<typeof FlightRatesResponseSchema>;

export const FlightVerifyResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            journey: z
              .object({ pricing: z.object({ display: PricingDisplay.optional() }).passthrough().optional(), baggage: z.unknown().optional(), fare: z.unknown().optional() })
              .passthrough()
              .optional(),
            priceChanged: z.boolean().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
export type FlightVerifyResponse = z.infer<typeof FlightVerifyResponseSchema>;

// prebook: data jest TABLICĄ (data[0]); zmierzone klucze: prebookId, booking,
// price, currency, transactionId, secretKey, servicesAttachable, paymentTypes.
export const FlightPrebookResponseSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            prebookId: z.string().optional(),
            transactionId: z.string().optional(),
            secretKey: z.string().optional(),
            price: z.number().optional(),
            currency: z.string().optional(),
            booking: z.unknown().optional(),
            paymentTypes: z.array(z.string()).optional(),
            sandbox: z.boolean().optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();
export type FlightPrebookResponse = z.infer<typeof FlightPrebookResponseSchema>;

export const FlightBookResponseSchema = z
  .object({
    data: z
      .union([
        z.array(z.record(z.string(), z.unknown())),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
  })
  .passthrough();
export type FlightBookResponse = z.infer<typeof FlightBookResponseSchema>;

export const FlightGetBookingResponseSchema = z
  .object({
    data: z
      .union([
        z.array(z.record(z.string(), z.unknown())),
        z.record(z.string(), z.unknown()),
      ])
      .optional(),
  })
  .passthrough();
export type FlightGetBookingResponse = z.infer<typeof FlightGetBookingResponseSchema>;
