// Dane przykładowe do PODGLĄDU UI pakietów (krok 1/2) bez żywego API.
// NIE używane w produkcji — wyłącznie strona /pakiety/podglad (za flagą) i testy.
// Ceny realistyczne, ale zmyślone na potrzeby designu (oznaczone jawnie).

import type { PackageOffer } from "./types";

const pln = (amount: number) => ({ amount, currency: "PLN" as const });

export const PREVIEW_OFFERS: PackageOffer[] = [
  {
    hotel: {
      hotelId: "h-arts",
      name: "Hotel Arts Barcelona",
      stars: 5,
      rating: 9.1,
      freeCancellationUntil: "2026-07-28",
      hotelOfferId: "off-arts",
      nights: 3,
    },
    flight: { offerId: "f-arts", direct: true, carrier: "LO", baggageIncluded: { cabin: true, checked: false } },
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
      freeCancellationUntil: "2026-07-25",
      hotelOfferId: "off-barcelo",
      nights: 3,
    },
    flight: { offerId: "f-barcelo", direct: true, carrier: "LO", baggageIncluded: { cabin: true, checked: false } },
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
      freeCancellationUntil: "2026-07-20",
      hotelOfferId: "off-ronda",
      nights: 3,
    },
    flight: { offerId: "f-ronda", direct: false, carrier: "AF", baggageIncluded: { cabin: true, checked: true } },
    pricing: {
      pricePerPerson: pln(2540),
      total: pln(5080),
      breakdown: { hotel: pln(2540), flight: pln(2540) },
    },
  },
];
