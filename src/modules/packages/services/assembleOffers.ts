// Składanie ofert pakietowych: kandydaci-hotele × JEDEN lot bazowy → PackageOffer[]
// (§3.2 pkt 3, 5). CZYSTE (zero I/O). Jeden lot bazowy dla całego listingu; cena
// lotu wspólna, różni się tylko część hotelowa → per-hotel wycena. Delty do
// alternatyw liczone client-side od bazowego (patrz packagePricing.priceDelta).

import type { PackageFlightSummary, PackageHotelSummary, PackageMoney, PackageOffer } from "../types";

import { buildPackagePricing } from "./packagePricing";

/** Kandydat-hotel dopuszczony do pakietu: meta + najtańszy ZWROTNY rate + podatki-w-hotelu. */
export interface PackageHotelCandidate {
  hotel: PackageHotelSummary;
  /** „Płatne teraz" — najtańsza taryfa z darmową anulacją (warunek MVP). */
  hotelNow: PackageMoney;
  taxesAtHotel?: PackageMoney;
}

/** Lot bazowy: skrót do karty + cena całkowita (za komplet pasażerów z searcha). */
export interface PackageBaseFlight {
  summary: PackageFlightSummary;
  price: PackageMoney;
}

/** Buduje oferty pakietowe (posortowane rosnąco po cenie/os.) z kandydatów i lotu bazowego. */
export function assemblePackageOffers(
  candidates: PackageHotelCandidate[],
  baseFlight: PackageBaseFlight,
  adults: number,
): PackageOffer[] {
  return candidates
    .map((c) => ({
      hotel: c.hotel,
      flight: baseFlight.summary,
      pricing: buildPackagePricing({
        hotel: c.hotelNow,
        flight: baseFlight.price,
        adults,
        ...(c.taxesAtHotel ? { taxesAtHotel: c.taxesAtHotel } : {}),
      }),
    }))
    .sort((a, b) => a.pricing.pricePerPerson.amount - b.pricing.pricePerPerson.amount);
}
