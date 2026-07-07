// Silnik doboru kierunków z motywu + budżetu — CZYSTY (zero I/O).
//
// Uczciwość: kierunek bez świeżego pakietu snapshotu (dstprice:v1, pkg*)
// jest po prostu pomijany — nigdy nie zgadujemy/nie doszacowujemy ceny.
// Snapshot i moods wchodzą jako argumenty; ten moduł nic sam nie czyta
// (żadnego readPriceSnapshot/Redis/fetch).

import {
  pickFreshFlightPrice,
  pickFreshPackage,
  pickFreshPrice,
  type DestinationPriceSnapshot,
} from "@/lib/prices/destination-price-snapshot";
import { getMoodBySlug } from "@/lib/mvp/travel-moods";
import type { BudgetKind, TripCandidate } from "./types";

export interface TripSearchCity {
  cityEn: string;
  countryEn: string;
  cityPl: string;
}

/** Próg budżetu na osobę: „za dwoje" dzieli kwotę na 2 (floor). */
export function budgetPerPerson(budgetPln: number, kind: BudgetKind): number {
  return kind === "total_two" ? Math.floor(budgetPln / 2) : budgetPln;
}

export function rankTripCandidates(
  cities: readonly TripSearchCity[],
  snapshot: DestinationPriceSnapshot,
  budget: { budgetPln: number; budgetKind: BudgetKind },
  now: number = Date.now(),
): TripCandidate[] {
  const threshold = budgetPerPerson(budget.budgetPln, budget.budgetKind);
  const candidates: TripCandidate[] = [];

  for (const city of cities) {
    const pkg = pickFreshPackage(snapshot, city.cityEn, city.countryEn, now);
    if (!pkg) continue; // brak świeżego pakietu → nie zgadujemy, pomijamy kierunek

    if (pkg.perPersonPln > threshold) continue;

    candidates.push({
      cityEn: city.cityEn,
      countryEn: city.countryEn,
      cityPl: city.cityPl,
      perPersonPln: pkg.perPersonPln,
      checkin: pkg.checkin,
      checkout: pkg.checkout,
      hotelFromPlnPerNight: pickFreshPrice(snapshot, city.cityEn, city.countryEn, now),
      flightFromPln: pickFreshFlightPrice(snapshot, city.cityEn, city.countryEn, now),
    });
  }

  candidates.sort((a, b) => a.perPersonPln - b.perPersonPln);
  return candidates;
}

/** Kierunki wchodzące w skład motywu (TRAVEL_MOODS), odduplikowane. [] dla nieznanego sluga. */
export function resolveThemeCities(themeSlug: string): TripSearchCity[] {
  const mood = getMoodBySlug(themeSlug);
  if (!mood) return [];

  const seen = new Set<string>();
  const out: TripSearchCity[] = [];
  for (const pick of mood.picks) {
    const key = `${pick.searchCity}|${pick.country}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ cityEn: pick.searchCity, countryEn: pick.country, cityPl: pick.name });
  }
  return out;
}
