// Dane przykładowe do PODGLĄDU UI pakietów (krok 1/2) bez żywego API.
// NIE używane w produkcji — wyłącznie strona /pakiety/podglad (za flagą) i testy.
// Ceny/rozkłady realistyczne, ale zmyślone na potrzeby designu. Kształt 1:1 z
// tym, co populuje live searchPackages (rozkład tam/powrót, bagaż, wyżywienie).

import type { PackageOffer } from "./types";

const pln = (amount: number) => ({ amount, currency: "PLN" as const });

export const PREVIEW_OFFERS: PackageOffer[] = [
  {
    hotel: {
      hotelId: "h-arts",
      name: "Hotel Arts Barcelona",
      stars: 5,
      rating: 9.1,
      reviewCount: 1240,
      boardName: "Śniadanie w cenie",
      freeCancellationUntil: "2026-07-28",
      hotelOfferId: "off-arts",
      nights: 3,
    },
    flight: {
      offerId: "f-arts",
      direct: true,
      carrierCode: "LO",
      carrierName: "LOT",
      outbound: { fromCode: "WAW", toCode: "BCN", departISO: "2026-08-10T09:05:00", arriveISO: "2026-08-10T12:20:00", durationMinutes: 195, stops: 0 },
      inbound: { fromCode: "BCN", toCode: "WAW", departISO: "2026-08-13T13:40:00", arriveISO: "2026-08-13T16:50:00", durationMinutes: 190, stops: 0 },
      baggageIncluded: { cabin: true, checked: false },
    },
    pricing: {
      pricePerPerson: pln(1899),
      total: pln(3798),
      breakdown: { hotel: pln(1600), flight: pln(2198) },
    },
  },
  {
    hotel: {
      hotelId: "h-barcelo",
      name: "Barceló Raval",
      stars: 4,
      rating: 8.4,
      reviewCount: 890,
      boardName: "Bez wyżywienia",
      freeCancellationUntil: "2026-07-25",
      hotelOfferId: "off-barcelo",
      nights: 3,
    },
    flight: {
      offerId: "f-barcelo",
      direct: true,
      carrierCode: "LO",
      carrierName: "LOT",
      outbound: { fromCode: "WAW", toCode: "BCN", departISO: "2026-08-10T06:15:00", arriveISO: "2026-08-10T09:30:00", durationMinutes: 195, stops: 0 },
      inbound: { fromCode: "BCN", toCode: "WAW", departISO: "2026-08-13T18:00:00", arriveISO: "2026-08-13T21:15:00", durationMinutes: 195, stops: 0 },
      baggageIncluded: { cabin: true, checked: false },
    },
    pricing: {
      pricePerPerson: pln(2149),
      total: pln(4298),
      taxesAtHotel: pln(120),
      breakdown: { hotel: pln(2100), flight: pln(2198) },
    },
  },
  {
    hotel: {
      hotelId: "h-ronda",
      name: "Catalonia Ronda",
      stars: 3,
      rating: 7.9,
      reviewCount: 430,
      boardName: "Śniadanie w cenie",
      freeCancellationUntil: "2026-07-20",
      hotelOfferId: "off-ronda",
      nights: 3,
    },
    flight: {
      offerId: "f-ronda",
      direct: false,
      carrierCode: "AF",
      carrierName: "Air France",
      outbound: { fromCode: "WAW", toCode: "BCN", departISO: "2026-08-10T07:00:00", arriveISO: "2026-08-10T13:30:00", durationMinutes: 390, stops: 1 },
      inbound: { fromCode: "BCN", toCode: "WAW", departISO: "2026-08-13T15:00:00", arriveISO: "2026-08-13T21:00:00", durationMinutes: 360, stops: 1 },
      baggageIncluded: { cabin: true, checked: true },
    },
    pricing: {
      pricePerPerson: pln(2540),
      total: pln(5080),
      breakdown: { hotel: pln(2540), flight: pln(2540) },
    },
  },
];
